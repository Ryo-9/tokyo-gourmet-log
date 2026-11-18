import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const src=readFileSync(new URL("../interactive-map.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
function section(a,b){
  const start=src.indexOf(a),end=src.indexOf(b,start+a.length);
  assert.ok(start>=0&&end>start,"Missing map section: "+a);
  return src.slice(start,end);
}
const escapeHTML=x=>String(x??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

test("map is the primary screen, with a search and pinned results overlay",()=>{
  const state={
    cuisine:"all",mode:"nearby",radius:1000,filter:"all",nearby:[],searchTerm:"",
    geocode:[],error:"",loading:false,advancedOpen:false,pinCoords:null,pinShopId:""
  };
  const markup=vm.runInNewContext(section("function mapHeader(){","function loadLeaflet()")+"\nmapHeader()",{
    state,e:escapeHTML,
    cuisines:[{id:"all",label:"すべて"},{id:"cafe",label:"カフェ"}],
    personal:()=>[],noCoords:()=>[],mapOptions:()=>'<option value="all">すべて</option>',
    statusOf:s=>s.status
  });
  assert.match(markup,/<div class="map-stage">/);
  assert.match(markup,/id="tglRealMap"/);
  assert.ok(markup.indexOf('id="tglRealMap"')<markup.indexOf('id="tglMapSearchForm"'));
  assert.match(markup,/id="mapQuery" name="mapQuery"/);
  assert.match(markup,/data-map-action="searchHere"/);
  assert.match(markup,/data-map-action="nearby"/);
  assert.match(markup,/data-map-action="mode" data-mode="mine"/);
  assert.match(markup,/class="map-place-strip"|class="map-result-sheet"/);
  assert.match(markup,/<details class="map-advanced"/);
  assert.ok(html.includes("height:calc(100dvh - 86px - env(safe-area-inset-bottom))"));
  assert.ok(html.includes(".main:has(.map-v4){padding:0!important"));
});

function mapSearchHarness(source){
  const sourceCode=section("async function searchAround(source){","async function searchAreaText()");
  let geoCalls=0,fetchCalls=0;
  const state={
    cuisine:"all",radius:1000,filter:"all",mode:"nearby",nearby:[],
    lastCenter:[35.68124,139.76712],lastZoom:12,coordinates:null,searchCenter:null,
    loading:false,error:"",lastQueryAt:0
  };
  const context={
    state,
    Date,AbortController,URLSearchParams,setTimeout,clearTimeout,
    document:{getElementById:()=>null},
    onGeo:async()=>{geoCalls++;return {lat:35.77,lon:139.75};},
    refresh(){},
    queryForCuisine:()=>"[out:json];node;out;",
    coords:x=>x.lat!=null&&x.lon!=null?[Number(x.lat),Number(x.lon)]:null,
    WARDS:[],distance:()=>200,
    fetch:async()=>{fetchCalls++;return {ok:true,json:async()=>({
      elements:[{type:"node",id:14,lat:35.6813,lon:139.7671,tags:{name:"検索で得た店",amenity:"cafe"}}]
    })};}
  };
  vm.runInNewContext(sourceCode+"\nthis.searchAround=searchAround;",context);
  return {state,context,geoCalls:()=>geoCalls,fetchCalls:()=>fetchCalls};
}

test("searching visible map center never asks for GPS and returns grounded OSM pins",async()=>{
  const h=mapSearchHarness();
  await h.context.searchAround("map");
  assert.equal(h.geoCalls(),0);
  assert.equal(h.fetchCalls(),1);
  assert.equal(h.state.searchCenter.lat,35.68124);
  assert.equal(h.state.searchCenter.lon,139.76712);
  assert.equal(h.state.nearby[0].name,"検索で得た店");
  assert.equal(h.state.coordinates,null);
});

test("location permission is asked only by the explicit current-position path",async()=>{
  const h=mapSearchHarness();
  await h.context.searchAround("gps");
  assert.equal(h.geoCalls(),1);
  assert.equal(h.state.searchCenter.lat,35.77);
  assert.equal(h.state.coordinates.lat,35.77);
});

test("area-text search geocodes without asking GPS, then opens explicit map-center venue search",async()=>{
  const sourceCode=section("async function searchAreaText(){","function showSavedOnMap");
  let source="",query="",geoCalls=0;
  const state={searchAt:0,searchTerm:"",lastCenter:[35.68,139.76],lastZoom:12,nearby:[{id:"old"}],mode:"mine",loading:false,error:""};
  const context={
    state,Date,AbortController,setTimeout,clearTimeout,URL,encodeURIComponent,
    document:{getElementById:id=>id==="mapQuery"?{value:"北千住"}:null},
    coords:x=>x?.lat!=null&&x?.lon!=null?[Number(x.lat),Number(x.lon)]:null,
    fetch:async url=>{query=url;return {ok:true,json:async()=>[{lat:"35.75",lon:"139.80",display_name:"北千住, 東京都"}]};},
    refresh(){},searchAround:async src=>{source=src;}
  };
  vm.runInNewContext(sourceCode+"\nthis.searchAreaText=searchAreaText;",context);
  await context.searchAreaText();
  assert.equal(source,"map");
  assert.match(query,/nominatim.openstreetmap.org/);
  assert.ok(query.includes(encodeURIComponent("北千住")));
  assert.deepEqual([...state.lastCenter],[35.75,139.80]);
  assert.equal(state.mode,"nearby");
  assert.equal(state.searchTerm,"北千住");
  assert.equal(state.nearby.length,0);
  assert.equal(geoCalls,0);
});

test("no fabricated location, passive geolocation or personal data publishing in map",()=>{
  assert.match(src,/coordinates:null/);
  assert.match(src,/if\(source==="gps"\)/);
  assert.match(src,/state\.searchCenter=\{lat:state\.lastCenter\[0\]/);
  assert.ok(src.includes('if(state.mode!=="mine"||!state.pinShopId)return'));
  assert.doesNotMatch(src,/watchPosition\(/);
  assert.doesNotMatch(src,/getCurrentPosition\([^)]*\)\s*;\s*\}\)\(\)/);
});
