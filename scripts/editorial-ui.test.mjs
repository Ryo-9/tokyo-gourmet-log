import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
function between(from,to) {
  const start=html.indexOf(from),end=html.indexOf(to,start+from.length);
  assert.ok(start>=0&&end>start,"Expected section: "+from);
  return html.slice(start,end);
}

test("editorial color scheme supports light and dark contrast without a synthetic gradient hero",()=>{
  assert.ok(html.includes("--bg:#f8f7f3"));
  assert.ok(html.includes("--fg:#232521"));
  assert.ok(html.includes("--bg:#191b1a"));
  assert.ok(html.includes("--fg:#f5f3ed"));
  assert.ok(html.includes(".home-hero{position:relative;isolation:isolate"));
  assert.ok(html.includes("background:var(--panel);color:var(--fg)"));
  assert.ok(!html.includes('class="home-plate"'));
  assert.ok(!html.includes(".home-plate{"));
});

test("home cuisine shortcuts use a consistent set of outline SVG symbols rather than emoji",()=>{
  const home=between("function explore(){","function savedView");
  const icons=between("function navIcon(name){","const defaultState=");
  for(const n of ["ramen","coffee","burger","meat","curry","cake","utensils"]){
    assert.ok(icons.includes(n+":"),"Missing consistent SVG icon: "+n);
  }
  assert.ok(home.includes("navIcon(icon)"));
  assert.ok(home.includes("home-cuisine-icon"));
  assert.ok(home.includes("料理から探す"));
  assert.ok(!home.includes("🍜")&&!home.includes("🍔")&&!home.includes("🥩"));
  assert.ok(home.includes("今日、<br>何食べる？"));
  assert.ok(html.includes(".home-search input{background:transparent!important"));
});

test("restaurant photo placeholders use neutral icon art while real saved photos are unchanged",()=>{
  const fn=between("function photoVisual(shop,variant='card')","function photoGallery");
  const ui={photoItems:new Map(),photoObjects:new Map()};
  const setup={...ui,navIcon:n=>'<svg data-icon="'+n+'"></svg>',esc:s=>String(s)};
  const empty=vm.runInNewContext(fn+"\nphotoVisual({id:'1',name:'テスト',genre:'麺・ラーメン'})",setup);
  assert.match(empty,/class="food-icon"/);
  assert.match(empty,/data-icon="ramen"/);
  assert.match(empty,/写真なし/);
  assert.ok(!empty.includes("🍜"));
  ui.photoItems.set("1",[{id:"photo-1"}]);
  ui.photoObjects.set("photo-1","blob:photo");
  const saved=vm.runInNewContext(fn+"\nphotoVisual({id:'1',name:'テスト',genre:'麺・ラーメン'})",setup);
  assert.match(saved,/blob:photo/);
  assert.match(saved,/登録した写真/);
});

test("touch targets remain legible on iPhone widths",()=>{
  assert.ok(html.includes("grid-template-columns:repeat(5,minmax(0,1fr))!important"));
  assert.ok(html.includes("min-height:70px!important"));
  assert.ok(html.includes(".home-action-map{grid-column:1/-1"));
  assert.ok(html.includes("@media(max-width:430px)"));
  assert.ok(html.includes(".list-grid{grid-template-columns:1fr!important"));
  assert.ok(html.includes(".home-action small{font-size:12px"));
  assert.ok(html.includes("env(safe-area-inset-bottom)"));
});

test("local records and login scope are not changed in a visual-only redesign",()=>{
  assert.ok(html.includes("const KEY='tokyo-gourmet-log-v1'"));
  assert.ok(html.includes('type="button" data-tab="wishlist"'));
  assert.ok(html.includes('type="button" data-tab="visited"'));
  assert.ok(html.includes('id="homeSearchForm" class="home-search"'));
  assert.ok(html.includes("function readStore()"));
});
