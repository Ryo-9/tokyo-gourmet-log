import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source=readFileSync(new URL("../online-groups.js",import.meta.url),"utf8");
const userId="11111111-2222-3333-4444-555555555555";
const shops=[
  {id:"shop-wish",name:"浅草寿司",ward:"台東区",genre:"寿司",status:"wish",notes:"PRIVATE MEMO",visitDate:"2026-01-01"},
  {id:"shop-visit",name:"上野珈琲",ward:"台東区",genre:"カフェ",status:"visited",personalPhoto:"PRIVATE PHOTO"},
  {id:"shop-new",name:"まだ保存していないお店",ward:"渋谷区",genre:"洋食",status:"new"},
  {id:"shop-html",name:"<script>alert(1)</script>",ward:"港区",genre:"フレンチ",status:"wish"}
];
const escapeHTML=value=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");

function createHarness({share,writeText}={}){
  const handlers={},messages=[],shares=[],copies=[],prompts=[];
  const window={
    prompt(...args){prompts.push(args);}
  };
  const navigator={
    clipboard:writeText===false?undefined:{writeText:async text=>{copies.push(text);}},
    ...(share===false?{}:{share:async value=>{shares.push(value);if(typeof share==="function")return share(value);}})
  };
  const document={addEventListener(type,handler){handlers[type]=handler;},getElementById(){return null;}};
  // Test-only instrument: inspect private state without exporting it in production.
  const instrumented=source.replace("  window.TGLGroups={renderPanel};",
    "  window.__testState=state; window.TGLGroups={renderPanel};");
  assert.notEqual(instrumented,source,"Test harness needs a stable insertion point");
  vm.runInNewContext(instrumented,{
    window,navigator,document,ui:{tab:"sns"},render(){},
    getShops:()=>shops,statusOf:shop=>shop.status,esc:escapeHTML,
    toast:message=>messages.push(message),console,URL
  },{filename:"online-groups.js"});
  window.__testState.me={id:userId};
  window.__testState.groups=[{id:"group-1",title:"グルメ部",owner_id:userId,description:""}];
  window.__testState.selected="group-1";
  return {window,navigator,handlers,messages,shares,copies,prompts};
}

test("selected group offers only personally saved restaurants, no private logs",()=>{
  const h=createHarness();
  const html=h.window.TGLGroups.renderPanel();
  assert.match(html,/id="tglGroupSavedShop"/);
  assert.match(html,/shop-wish/);
  assert.match(html,/shop-visit/);
  assert.doesNotMatch(html,/shop-new/);
  assert.doesNotMatch(html,/PRIVATE MEMO|PRIVATE PHOTO|2026-01-01/);
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.match(html,/data-group="shareId"/);
  assert.match(html,/「候補を追加」を押すまでグループに公開されません/);
});

test("selecting a saved restaurant prefills only public candidate fields; does not submit",()=>{
  const h=createHarness();
  const form={id:"tglGroupCandidateForm",elements:{
    placeName:{value:""},placeArea:{value:""},placeCuisine:{value:""}
  }};
  h.handlers.change({target:{
    id:"tglGroupSavedShop",value:"shop-wish",closest:()=>form
  }});
  assert.equal(form.elements.placeName.value,"浅草寿司");
  assert.equal(form.elements.placeArea.value,"台東区");
  assert.equal(form.elements.placeCuisine.value,"寿司");
  assert.ok(h.messages.some(m=>m.includes("内容を確認")));
  assert.equal(h.copies.length,0);
  assert.equal(h.shares.length,0);
});

test("unlisted restaurant IDs cannot prefill group candidate fields",()=>{
  const h=createHarness();
  const form={id:"tglGroupCandidateForm",elements:{
    placeName:{value:"old"},placeArea:{value:"area"},placeCuisine:{value:"genre"}
  }};
  h.handlers.change({target:{id:"tglGroupSavedShop",value:"shop-new",closest:()=>form}});
  assert.deepEqual(Object.values(form.elements).map(x=>x.value),["old","area","genre"]);
});

test("share button invokes native share sheet with user code but no personal logs",async()=>{
  const h=createHarness();
  h.handlers.click({target:{closest:()=>({dataset:{group:"shareId"}})}});
  assert.equal(h.shares.length,1);
  assert.ok(h.shares[0].text.includes(userId));
  assert.ok(!h.shares[0].text.includes("PRIVATE MEMO"));
  assert.equal(h.copies.length,0);
});

test("when Web Share is unavailable, user code is copied with no automatic network upload",async()=>{
  const h=createHarness({share:false});
  h.handlers.click({target:{closest:()=>({dataset:{group:"shareId"}})}});
  await Promise.resolve();
  assert.equal(h.copies.length,1);
  assert.equal(h.copies[0],userId);
});

test("cancelling the share sheet never copies the code behind the user's back",async()=>{
  const h=createHarness({share:()=>Promise.reject({name:"AbortError"})});
  h.handlers.click({target:{closest:()=>({dataset:{group:"shareId"}})}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.copies.length,0);
  assert.equal(h.prompts.length,0);
});

test("code copy fallback remains available without Clipboard API",()=>{
  const h=createHarness({share:false,writeText:false});
  h.handlers.click({target:{closest:()=>({dataset:{group:"copyId"}})}});
  assert.equal(h.prompts.length,1);
  assert.equal(h.prompts[0][1],userId);
});
