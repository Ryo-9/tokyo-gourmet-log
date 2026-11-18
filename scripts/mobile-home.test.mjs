import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const scriptBlocks=[...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
function section(begin,end) {
  const start=html.indexOf(begin);
  const finish=html.indexOf(end,start+begin.length);
  assert.ok(start!==-1&&finish>start,"Missing JavaScript function section: "+begin);
  return html.slice(start,finish);
}

test("all inline application scripts are valid JavaScript",()=>{
  assert.ok(scriptBlocks.length>=2);
  for(const block of scriptBlocks)if(block.trim())assert.doesNotThrow(()=>new vm.Script(block));
});

test("bottom bar uses five accessible icon tabs with an active-page indicator",()=>{
  assert.match(html,/const NAV=\[\['explore','home','ホーム'\]/);
  assert.match(html,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
  assert.match(html,/env\(safe-area-inset-bottom\)/);
  assert.match(html,/min-height:70px!important/);
  const navFn=section("function renderNav(){","function pageHeader");
  const elems={sideNav:{innerHTML:""},bottomNav:{innerHTML:""}};
  const nav=[
    ["explore","home","ホーム"],["sns","users","つながる"],["mapsearch","map","地図"],
    ["wishlist","heart","行きたい"],["visited","check","行った"]
  ];
  vm.runInNewContext(navFn+"\nrenderNav();",{
    NAV:nav,ui:{tab:"mapsearch"},
    document:{getElementById:id=>elems[id]},navIcon:icon=>'<svg data-name="'+icon+'"></svg>'
  });
  const bottom=elems.bottomNav.innerHTML;
  assert.equal((bottom.match(/<button/g)||[]).length,5);
  assert.equal((elems.sideNav.innerHTML.match(/<button/g)||[]).length,6);
  assert.equal((bottom.match(/aria-current="page"/g)||[]).length,1);
  assert.ok(bottom.includes('aria-label="地図"'));
  assert.ok(bottom.includes('class="bottom-nav-item active"'));
  assert.ok(bottom.includes('<svg data-name="map">'));
});

function renderHome({keyword="",genre="all",filtersOpen=false}={}){
  const fn=section("function explore(){","function savedView");
  const shops=[
    {id:"one",name:"老舗の寿司店",ward:"中央区",genre:"和食・寿司",status:"new"},
    {id:"wish",name:"行きたいカフェ",ward:"台東区",genre:"カフェ・甘味",status:"wish"},
    {id:"visit",name:"訪問した店",ward:"渋谷区",genre:"焼肉",status:"visited"}
  ];
  const visits=[{shopId:"visit",date:"2026-10-10"}];
  return vm.runInNewContext(fn+"\nexplore();",{
    stats:()=>({wish:12,visited:7}),ui:{keyword,genre,filtersOpen},store:{visits},
    getShops:()=>shops,getShop:id=>shops.find(x=>x.id===id),
    statusOf:shop=>shop.status,
    photoVisual:(shop,variant)=>'<div class="food-photo '+variant+'">NO PHOTO</div>',
    GENRES:["麺・ラーメン","カフェ・甘味","洋食・バーガー","焼肉","カレー・エスニック","スイーツ・甘味"],
    esc:s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"),
    navIcon:name=>'<svg data-icon="'+name+'"></svg>',
    filters:()=>'<div id="testAdvancedFilters">advanced</div>',
    resultsView:()=>'<div id="results">LIST</div>'
  });
}

test("home begins with an accessible visual search and three primary actions",()=>{
  const home=renderHome();
  assert.match(home,/<h1 id="homeTitle">/);
  assert.match(home,/<form id="homeSearchForm" class="home-search" role="search">/);
  assert.match(home,/<label class="sr-only" for="homeKeyword">/);
  assert.match(home,/data-tab="mapsearch"/);
  assert.match(home,/data-tab="sns"/);
  assert.match(home,/data-action="discover"/);
  assert.match(home,/class="feed-feature"/);
  assert.match(home,/class="feed-card-strip"/);
  assert.match(home,/あなたの食べた記録/);
  assert.match(home,/行ってみたいお店/);
  assert.ok(home.indexOf("home-search")<home.indexOf("home-action-grid"));
  assert.match(home,/12<small>軒<\/small>/);
  assert.match(home,/7<small>軒<\/small>/);
});

test("home genre tiles are interactive and use the true underlying genre",()=>{
  const home=renderHome({genre:"焼肉"});
  assert.equal((home.match(/class="home-cuisine-item/g)||[]).length,6);
  assert.match(home,/class="home-cuisine-item selected" data-action="genreChip" data-genre="焼肉" aria-pressed="true"/);
  assert.match(home,/data-genre="all"/);
  assert.ok(home.includes('<div id="homeExtraFilters" hidden>'));
});

test("advanced filters can stay expanded through subsequent renders",()=>{
  const home=renderHome({filtersOpen:true,keyword:'東京'});
  assert.match(home,/aria-expanded="true" aria-controls="homeExtraFilters"/);
  assert.match(home,/id="testAdvancedFilters"/);
  assert.match(home,/name="homeKeyword" type="search" value="東京"/);
  assert.match(html,/if\(e.target.id==='homeSearchForm'\)/);
  assert.match(html,/if\(a==='toggleFilters'\)/);
  assert.ok(html.includes("ui.region='all';ui.ward='all';ui.status='all';ui.genre='all';ui.page=1;render();"));
  assert.ok(html.includes("ui.keyword='';ui.region='all';ui.ward='all';ui.status='all';ui.filtersOpen=false;"));
});

test("search output escapes untrusted text and preserves manual-only private data",()=>{
  const home=renderHome({keyword:'<img src=x onerror=alert(1)>'});
  assert.ok(!home.includes('value="<img'));
  assert.ok(home.includes('&lt;img'));
  assert.match(html,/const KEY='tokyo-gourmet-log-v1'/);
  assert.doesNotMatch(home,/data-action="upload"|自動的にアップロード/);
});
