/* TOKYO GOURMET LOG interactive map
 * User-controlled location search and verified visit pins; no friend tracking.
 * Leaflet + OpenStreetMap. OSM map data is incomplete and must be verified.
 */
(function(){
  "use strict";
  const ORIGIN_VIEW=[35.68124,139.76712];
  const cuisines=[
    {id:"all",label:"すべて",q:'["amenity"~"^(restaurant|cafe|fast_food|food_court|pub|bar)$"]',term:"飲食店"},
    {id:"ramen",label:"ラーメン・麺",q:'["cuisine"~"ramen|noodle|udon|soba",i]',term:"ラーメン"},
    {id:"cafe",label:"カフェ",q:'["amenity"="cafe"]',term:"カフェ"},
    {id:"yakiniku",label:"焼肉・肉",q:'["cuisine"~"yakiniku|bbq|barbecue|steak|korean",i]',term:"焼肉"},
    {id:"sushi",label:"寿司",q:'["cuisine"~"sushi",i]',term:"寿司"},
    {id:"sweets",label:"スイーツ",q:'["shop"~"^(bakery|confectionery|pastry)$"]',term:"スイーツ"},
    {id:"curry",label:"カレー",q:'["cuisine"~"curry|indian|nepalese|thai",i]',term:"カレー"},
    {id:"bar",label:"酒場・バー",q:'["amenity"~"^(bar|pub)$"]',term:"居酒屋"}
  ];
  const state={
    cuisine:"all",radius:1000,filter:"all",mode:"nearby",nearby:[],searchTerm:"",searchAt:0,searchCenter:null,
    lastCenter:ORIGIN_VIEW,lastZoom:12,coordinates:null,
    loading:false,error:"",geocode:[],geocodeShopId:null,
    pinShopId:"",pinCoords:null,lastQueryAt:0,geocodeAt:0,advancedOpen:false,initialNearbyRequested:false
  };
  let leafletPromise=null,map=null,pinLayer=null,ownMarker=null,createdMapFor=null;
  const e=x=>esc(String(x??""));
  function coords(item){
    if(!item||item.lat===undefined||item.lon===undefined||item.lat===null||item.lon===null||item.lat===""||item.lon==="")return null;
    const lat=Number(item.lat),lon=Number(item.lon);
    return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?[lat,lon]:null;
  }
  function isVisited(shop){return statusOf(shop)==="visited";}
  function latestVisit(shop){return getVisits(shop.id)[0]?.date||"";}
  function personal(){
    return getShops().filter(s=>["visited","wish"].includes(statusOf(s))&&coords(s));
  }
  function noCoords(){return getShops().filter(s=>["visited","wish"].includes(statusOf(s))&&!coords(s));}
  function mapOptions(){
    const v=state.filter,opts=[["all","すべて"],["visited","訪問済み"],["wish","行きたい"]];
    return opts.map(x=>'<option value="'+x[0]+'" '+(v===x[0]?'selected':'')+'>'+x[1]+'</option>').join("");
  }
  function mapHeader(){
      const geos=state.geocode.length?'<div class="map-geocodes"><strong>候補の場所を確認してください</strong>'+
        state.geocode.map((x,i)=>'<div class="map-geo-option"><span>'+e(x.display_name).slice(0,230)+'</span><button class="btn tiny" data-geo="select" data-index="'+i+'">地図に表示</button></div>').join("")+
        '<p class="hint">位置を確認してから「この場所で登録」を押してください。</p></div>':"";
      const mine=personal().filter(s=>state.filter==="all"||statusOf(s)===state.filter);
      const nearbyCards=state.nearby.slice(0,30).map((s,i)=>'<div class="map-place-card"><div class="map-place-text"><strong>'+e(s.name)+'</strong><span>'+e(s.kind)+' · '+s.distance+'m（直線距離）</span></div>'+
        '<div class="map-card-actions"><button data-map-action="focusNearby" data-index="'+i+'">ピンを見る</button><button data-map-action="saveNearby" data-index="'+i+'">＋ 保存</button></div></div>').join("");
      const mineCards=mine.slice(0,25).map(s=>'<div class="map-place-card"><div class="map-place-text"><strong>'+e(s.name)+'</strong><span>'+e(s.ward)+' · '+e(statusOf(s)==="visited"?"行った":"行きたい")+'</span></div>'+
        '<button data-map-action="focusShop" data-id="'+e(s.id)+'">ピンを見る</button></div>').join("");
      const content=state.mode==="nearby"?nearbyCards:mineCards;
      const count=state.mode==="nearby"?state.nearby.length:mine.length;
      const message=state.error||(
        state.mode==="nearby"
          ?"地図を動かして「この範囲で探す」を押すと店舗のピンが表示されます。"
          :count?"ピンをタップすると、記録や店舗詳細を確認できます。":"保存店の位置がまだありません。ここから周辺のお店を探せます。"
      );
      return '<section class="map-v4" aria-label="飲食店を地図から探す">'+
        '<div class="map-stage">'+
          '<div id="tglRealMap" role="region" aria-label="店舗ピンと飲食店を探す地図"></div>'+
          '<div class="map-overlay-top">'+
            '<div class="map-search-surface"><form id="tglMapSearchForm" role="search" class="map-search-form">'+
              '<label class="sr-only" for="mapQuery">駅名・エリア・店名を地図で検索</label>'+
              '<input id="mapQuery" name="mapQuery" type="search" maxlength="120" autocomplete="off" value="'+e(state.searchTerm||"")+'" placeholder="駅・エリア・お店を検索" />'+
              '<button type="submit" '+(state.loading?'disabled':'')+'>探す</button></form>'+
            '<div class="map-chip-row" role="group" aria-label="料理ジャンル">'+cuisines.map(c=>
              '<button type="button" data-map-action="cuisine" data-cuisine="'+c.id+'" class="'+(state.cuisine===c.id?'active':'')+'" aria-pressed="'+(state.cuisine===c.id)+'">'+e(c.label)+'</button>').join("")+'</div>'+
            '<div class="map-top-actions"><div class="map-tabs" role="group" aria-label="地図の表示">'+
              '<button data-map-action="mode" data-mode="nearby" class="'+(state.mode==="nearby"?"active":"")+'">お店を探す</button>'+
              '<button data-map-action="mode" data-mode="mine" class="'+(state.mode==="mine"?"active":"")+'">マイマップ</button></div>'+
              '<select id="mapRadius" aria-label="検索範囲">'+[500,1000,1500].map(n=>'<option value="'+n+'" '+(state.radius===n?'selected':'')+'>'+n+'m</option>').join("")+'</select></div>'+
            '</div>'+
          '</div>'+
          '<div class="map-overlay-bottom">'+
            '<div class="map-floating-actions"><button type="button" data-map-action="searchHere" class="map-search-area" '+(state.loading?'disabled':'')+'>'+(state.loading?'検索中…':'この範囲で探す')+'</button>'+
            '<button type="button" data-map-action="nearby" class="map-locate-action" '+(state.loading?'disabled':'')+' aria-label="現在地を許可して近くのお店を探す">現在地</button></div>'+
            '<div class="map-result-sheet"><div class="map-result-topline"><strong>'+(state.mode==="nearby"?"見つかったお店":"自分の保存店")+'</strong><span>'+count+'軒</span></div>'+
              '<p class="map-result-message" role="status">'+e(message)+'</p>'+
              (content?'<div class="map-place-strip">'+content+'</div>':'')+
              (state.mode==="mine"?'<div class="map-map-hint">位置未登録：'+noCoords().length+'軒。下の「保存店の位置を登録」から設定できます。</div>':'')+
            '</div>'+
          '</div>'+
        '</div>'+
        '<details class="map-advanced" '+(state.advancedOpen?'open':'')+'><summary>保存したお店の位置を登録・管理</summary>'+
          '<div class="map-legend"><span><i class="visited"></i>行った</span><span><i class="wish"></i>行きたい</span><span><i class="nearby"></i>周辺のお店</span>'+
            '<select id="mapStatusFilter" aria-label="保存店の状態で絞り込む">'+mapOptions()+'</select></div>'+
          '<div class="map-pin-register"><h2>保存店の位置を登録</h2><p>位置が未登録の店舗を選び、地図上で正しい場所をタップするか、住所候補から確認してください。初期登録店に座標を推測して追加しません。</p>'+
            '<div class="map-control-buttons"><select id="mapShopSelect" aria-label="位置を登録する店舗"><option value="">店舗を選ぶ</option>'+
            noCoords().slice(0,300).map(s=>'<option value="'+e(s.id)+'" '+(state.pinShopId===s.id?'selected':'')+'>'+e(s.name)+'（'+e(s.ward)+'）</option>').join("")+'</select>'+
            '<button class="btn" data-map-action="geocode" '+(state.loading?'disabled':'')+'>住所候補を探す</button></div>'+
            '<p class="map-tiny">候補が表示されない場合も、地図上で位置を指定できます。</p>'+geos+
            (state.pinCoords?'<div class="map-pending"><strong>位置を確認</strong><span>緯度 '+state.pinCoords[0].toFixed(5)+' / 経度 '+state.pinCoords[1].toFixed(5)+'</span>'+
              '<button class="btn primary" data-map-action="confirmPin">この場所で登録</button><button class="btn" data-map-action="cancelPin">キャンセル</button></div>':"")+
          '</div>'+
        '</details>'+
        '<details class="map-fallback"><summary>地図が利用できない場合</summary>'+
          '<p class="hint">外部のGoogleマップで料理・エリアを検索できます。結果は自動でアプリに保存されません。</p>'+
          '<div class="map-control-buttons"><input id="mapFallbackArea" placeholder="例：北千住、新宿" aria-label="探したいエリア">'+
          '<button class="btn" data-map-action="searchArea">Googleマップで探す</button></div>'+
        '</details>'+
        '<p class="map-credit">地図 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>。店舗ピンは地図上の位置が確認できた保存店、または明示検索で取得したOpenStreetMapの候補です。位置の正確性や営業状況は保証しません。現在地はボタンを押した時だけ取得します。</p>'+
        '</section>';
  }
  function loadLeaflet(){
    if(window.L)return Promise.resolve(window.L);
    if(leafletPromise)return leafletPromise;
    leafletPromise=new Promise((resolve,reject)=>{
      if(!document.querySelector('link[data-tgl-leaflet]')){
        const css=document.createElement("link");css.rel="stylesheet";css.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";css.dataset.tglLeaflet="";document.head.appendChild(css);
      }
      const script=document.createElement("script");
      script.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload=()=>window.L?resolve(window.L):reject(new Error("地図を読み込めませんでした"));
      script.onerror=()=>reject(new Error("地図ライブラリを取得できませんでした"));
      document.head.appendChild(script);
    }).catch(err=>{leafletPromise=null;throw err});
    return leafletPromise;
  }
  function iconFor(type){
    const cls=type==="visited"?"visited":type==="wish"?"wish":"nearby";
    return L.divIcon({className:"tgl-pin-anchor",html:'<span class="tgl-pin-dot '+cls+'"></span>',iconSize:[27,31],iconAnchor:[14,27]});
  }
  function popShop(shop){
    const date=latestVisit(shop);
    const logs=getVisits(shop.id).length;
    const note=date?'直近の訪問日：'+date:logs?"訪問記録あり":"訪問日は未登録";
    return '<div class="tgl-map-popup"><b>'+e(shop.name)+'</b><small>'+e(shop.ward)+' · '+e(shop.genre)+'</small>'+
      '<p>'+e(isVisited(shop)?note:"行きたい")+(logs>1?'（'+logs+'回の訪問記録）':"")+'</p>'+
      '<button class="btn tiny primary" data-map-action="detailShop" data-id="'+e(shop.id)+'">店舗・訪問記録を見る</button></div>';
  }
  function popNear(item,index){
    return '<div class="tgl-map-popup"><b>'+e(item.name)+'</b>'+
      '<small>'+e(item.kind)+' · '+item.distance+'m（直線距離）</small>'+
      '<div class="inline-links"><button class="btn tiny primary" data-map-action="saveNearby" data-index="'+index+'">♡ 行きたいに保存</button>'+
      '<button class="btn tiny" data-map-action="googlePlace" data-index="'+index+'">地図で確認 ↗</button></div></div>';
  }
  async function mountMap(){
    const el=document.getElementById("tglRealMap");if(!el)return;
    try{
      await loadLeaflet();
      if(!el.isConnected||ui.tab!=="mapsearch")return;
      if(map){map.remove();map=null;}
      map=L.map(el,{zoomControl:true,scrollWheelZoom:false}).setView(state.lastCenter,state.lastZoom);
      createdMapFor=el;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
        maxZoom:18,minZoom:3,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
      }).addTo(map);
      pinLayer=L.layerGroup().addTo(map);
      if(state.mode==="nearby"&&state.nearby.length){
        const pointList=[];
        state.nearby.forEach((p,i)=>{
          const latlon=[p.lat,p.lon];
          pointList.push(latlon);
          L.marker(latlon,{icon:iconFor("nearby")}).bindPopup(popNear(p,i)).addTo(pinLayer);
        });
        if(state.coordinates)pointList.push([state.coordinates.lat,state.coordinates.lon]);
        if(pointList.length)map.fitBounds(pointList,{padding:[28,28],maxZoom:15});
      }else if(state.mode==="mine"){
        const shops=personal().filter(s=>state.filter==="all"||statusOf(s)===state.filter);
        const p=shops.map(coords);
        shops.forEach(s=>{
          L.marker(coords(s),{icon:iconFor(statusOf(s))}).bindPopup(popShop(s)).addTo(pinLayer);
        });
        if(p.length)map.fitBounds(p,{padding:[24,24],maxZoom:14});
      }
      if(state.coordinates){
        L.circleMarker([state.coordinates.lat,state.coordinates.lon],{
          radius:8,weight:3,color:"#ffffff",fillColor:"#377de7",fillOpacity:.95
        }).bindPopup("検索した位置（あなたの現在地）。アプリ内には保存しません。").addTo(pinLayer);
      }
      if(state.pinCoords){
        L.circleMarker(state.pinCoords,{radius:9,color:"#ffffff",fillColor:"#42b9a2",fillOpacity:1}).addTo(pinLayer);
        map.setView(state.pinCoords,16);
      }
      map.on("moveend",()=>{
        const c=map.getCenter();
        if(!state.pinCoords){state.lastCenter=[c.lat,c.lng];state.lastZoom=map.getZoom();}
      });
      map.on("click",ev=>{
        if(state.mode!=="mine"||!state.pinShopId)return;
        state.pinCoords=[ev.latlng.lat,ev.latlng.lng];
        const point=document.querySelector(".map-pending");
        if(point)point.innerHTML='<strong>位置を確認</strong><span>緯度 '+state.pinCoords[0].toFixed(5)+' / 経度 '+state.pinCoords[1].toFixed(5)+'</span>'+
          '<button class="btn primary" data-map-action="confirmPin">この場所で登録</button><button class="btn" data-map-action="cancelPin">キャンセル</button>';
        else{
          const panel=document.querySelector(".map-pin-register");
          if(panel)panel.insertAdjacentHTML("beforeend",'<div class="map-pending"><strong>位置を確認</strong><span>緯度 '+state.pinCoords[0].toFixed(5)+' / 経度 '+state.pinCoords[1].toFixed(5)+'</span><button class="btn primary" data-map-action="confirmPin">この場所で登録</button><button class="btn" data-map-action="cancelPin">キャンセル</button></div>');
        }
        L.popup().setLatLng(ev.latlng).setContent("この位置を店舗として保存しますか？ 下の「この場所で登録」を確認してください。").openOn(map);
      });
      setTimeout(()=>{if(map&&el.isConnected)map.invalidateSize()},80);
    }catch(err){
      if(el.isConnected)el.innerHTML='<div class="map-unavailable">地図を読み込めませんでした。通信状況を確認するか、下のGoogleマップ検索を利用してください。</div>';
      state.error=String(err.message||err);
    }
  }
  function refresh(){render();}
  function onGeo(){
    return new Promise((resolve,reject)=>{
      if(!isSecureContext||!navigator.geolocation)return reject(Error("HTTPSと位置情報に対応した端末が必要です。"));
      navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude}),
        ()=>reject(Error("位置情報を利用できませんでした。Safariで位置情報の許可を確認するか、エリア検索をご利用ください。")),
        {maximumAge:30000,timeout:12000,enableHighAccuracy:false});
    });
  }
  function queryForCuisine(){
    const tag=cuisines.find(x=>x.id===state.cuisine)?.q||cuisines[0].q;
    const base=(radius,lat,lon,tagStr)=>'nwr(around:'+radius+','+lat.toFixed(6)+','+lon.toFixed(6)+')'+tagStr+'["name"];';
    const radius=state.radius,lat=state.searchCenter.lat,lon=state.searchCenter.lon;
    const query=base(radius,lat,lon,tag);
    if(state.cuisine==="sweets"){
      return '[out:json][timeout:20];('+query+base(radius,lat,lon,'["amenity"="ice_cream"]')+');out center 90;';
    }
    return '[out:json][timeout:20];('+query+');out center 90;';
  }
  function distance(lat1,lon1,lat2,lon2){
    const dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return Math.round(6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
  }
  async function searchAround(source){
    const radiusEl=document.getElementById("mapRadius");
    if(radiusEl)state.radius=Number(radiusEl.value)||1000;
    if(Date.now()-state.lastQueryAt<15000){state.error="検索の連続実行は避けてください。前回の結果を確認してからもう一度お試しください。";refresh();return;}
    state.lastQueryAt=Date.now();
    state.loading=true;state.error=source==="gps"?"位置情報を確認しています…":"選んだ範囲のお店を検索しています…";state.mode="nearby";state.nearby=[];refresh();
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),28000);
    try{
      if(source==="gps"){
        state.coordinates=await onGeo();
        state.lastCenter=[state.coordinates.lat,state.coordinates.lon];state.lastZoom=14;
      }
      state.searchCenter={lat:state.lastCenter[0],lon:state.lastCenter[1]};
      state.error="選んだジャンルの店舗を検索しています…";refresh();
      const query=queryForCuisine(),body=new URLSearchParams({data:query});
      const response=await fetch("https://overpass-api.de/api/interpreter",{method:"POST",body,signal:controller.signal});
      if(!response.ok)throw Error("周辺検索サーバーが混雑しています（"+response.status+"）。しばらくしてから試してください。");
      const data=await response.json();
      state.nearby=(Array.isArray(data.elements)?data.elements:[])
        .filter(x=>x.tags?.name&&coords(x.type==="node"?x:x.center))
        .slice(0,90)
        .map(x=>{
          const p=coords(x.type==="node"?x:x.center),tag=x.tags;
          return {id:x.type+"/"+x.id,name:tag["name:ja"]||tag.name,kind:tag.cuisine||tag.shop||tag.amenity||"飲食店",lat:p[0],lon:p[1],
            ward:[tag["addr:city"],tag["addr:suburb"]].find(t=>t&&WARDS.some(w=>t.includes(w)))||"未設定",
            distance:distance(state.searchCenter.lat,state.searchCenter.lon,p[0],p[1])};
        }).sort((a,b)=>a.distance-b.distance);
      state.error=state.nearby.length?"周辺から"+state.nearby.length+"軒を見つけました。店舗名や営業状況を確認してから保存してください。":"指定ジャンルの登録店は見つかりませんでした。範囲やジャンルを変えて試してください。";
    }catch(err){state.error=err.name==="AbortError"?"検索がタイムアウトしました。":String(err.message||err);}
    finally{clearTimeout(timer);state.loading=false;refresh();}
  }
  async function searchAreaText(){
    const field=document.getElementById("mapQuery");
    const term=String(field?.value||"").trim().slice(0,120);
    state.searchTerm=term;
    if(!term){state.error="駅名・地域・店名を入力してください。";refresh();return;}
    if(Date.now()-state.searchAt<1700){state.error="検索は少し間隔を空けてお試しください。";refresh();return;}
    state.searchAt=Date.now();state.loading=true;state.error="地図上の候補を確認しています…";refresh();
    try{
      // This lookup only runs when a person submits the search field.
      // No private visit notes, photo data or personal positions are transmitted.
      const url="https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q="+encodeURIComponent(term);
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      let response;
      try{response=await fetch(url,{headers:{"Accept":"application/json"},signal:controller.signal});}
      finally{clearTimeout(timer);}
      if(!response.ok)throw Error("地図検索サービスを利用できません（"+response.status+"）。");
      const data=await response.json(),point=Array.isArray(data)?data.find(x=>coords(x)):null;
      if(!point){state.error="一致する場所が見つかりませんでした。別の駅名や地名で試してください。";return;}
      state.lastCenter=coords(point);state.lastZoom=15;
      state.error="検索した場所へ移動しました。店舗は地図上のピンから確認できます。";
      state.mode="nearby";
      state.nearby=[];
    }catch(err){state.error=err.name==="AbortError"?"地図検索がタイムアウトしました。":String(err.message||err);}
    finally{state.loading=false;refresh();}
    // Search local OSM venues near the geocoded center on explicit submission.
    if(state.error.startsWith("検索した場所へ移動"))void searchAround("map");
  }
  function showSavedOnMap(shopId){
    const item=personal().find(s=>s.id===shopId),p=coords(item);
    if(!p||!map)return;
    map.setView(p,16);
    pinLayer?.eachLayer(layer=>{
      const pt=layer.getLatLng?.();
      if(pt&&Math.abs(pt.lat-p[0])<.00001&&Math.abs(pt.lng-p[1])<.00001)layer.openPopup?.();
    });
  }
  async function geocode(){
    const el=document.getElementById("mapShopSelect");
    state.pinShopId=el?.value||state.pinShopId;
    const shop=getShop(state.pinShopId);
    if(!shop){state.error="まず位置を登録したいお店を選んでください。";refresh();return;}
    if(Date.now()-state.geocodeAt<1500){state.error="住所の検索は少し間隔を空けてください。";refresh();return;}
    state.geocodeAt=Date.now();state.loading=true;state.error="住所の候補を確認しています…";state.geocode=[];refresh();
    try{
      const q=[shop.name,shop.ward==="未設定"?"":shop.ward,shop.ward==="未設定"?"":"東京都","日本"].filter(Boolean).join(" ");
      const endpoint="https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&addressdetails=1&q="+encodeURIComponent(q);
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      let res;
      try{res=await fetch(endpoint,{headers:{"Accept":"application/json"},signal:controller.signal})}finally{clearTimeout(timer);}
      if(!res.ok)throw Error("住所候補サービスが利用できません（"+res.status+"）。地図で直接位置を指定してください。");
      const data=await res.json();
      state.geocode=Array.isArray(data)?data.filter(x=>coords(x)).slice(0,3):[];
      state.error=state.geocode.length?"候補を表示しました。同名のお店に注意して正しい位置を選んでください。":"一致する位置候補がありません。地図を拡大して手動でピンを置いてください。";
    }catch(err){state.error=String(err.message||err);}
    finally{state.loading=false;refresh();}
  }
  function selectGeo(i){
    const x=state.geocode[i],p=coords(x);if(!p)return;
    state.pinCoords=p;state.lastCenter=p;state.lastZoom=16;refresh();
  }
  function confirmPin(){
    const shop=getShop(state.pinShopId);
    if(!shop||!state.pinCoords)return;
    if(!confirm("「"+shop.name+"」の位置として登録しますか？\n同じ名前の別店舗ではないか確認してください。"))return;
    store.mods[shop.id]={...(store.mods[shop.id]||{}),lat:state.pinCoords[0],lon:state.pinCoords[1],mapSource:"user_confirmed"};
    save();
    state.pinCoords=null;state.pinShopId="";state.geocode=[];state.error="位置を登録しました。ピンを押すと訪問日を確認できます。";refresh();
  }
  function openGoogle(type){
    let query=cuisines.find(x=>x.id===state.cuisine)?.term||"飲食店";
    if(type==="area"){
      query=[document.getElementById("mapFallbackArea")?.value.trim(),query].filter(Boolean).join(" ")||"飲食店";
    }else if(state.coordinates){
      query=state.coordinates.lat.toFixed(5)+","+state.coordinates.lon.toFixed(5)+" "+query;
    }
    window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(query),"_blank","noopener,noreferrer");
  }
  function showNearbyOnMap(i){
    const item=state.nearby[i];
    if(!item||!map)return;
    map.setView([item.lat,item.lon],17);
    pinLayer?.eachLayer(layer=>{
      if(layer.getLatLng&&Math.abs(layer.getLatLng().lat-item.lat)<.00001&&Math.abs(layer.getLatLng().lng-item.lon)<.00001)layer.openPopup?.();
    });
  }
  function saveNearby(i){
    const s=state.nearby[i];if(!s)return;
    const duplicate=getShops().find(x=>x.osmId===s.id||x.name===s.name&&Math.abs(Number(x.lat)-s.lat)<.0001&&Math.abs(Number(x.lon)-s.lon)<.0001);
    if(duplicate){setStatus(duplicate.id,"wish");state.error="保存済みのお店を「行きたい」にしました。";return;}
    if(!confirm("「"+s.name+"」を行きたいリストに保存しますか？\n位置と店名を確認してください。"))return;
    const uid="map-"+Date.now()+"-"+Math.random().toString(36).slice(2);
    const w=WARDS.find(w=>s.ward.includes(w))||"未設定";
    const genre=state.cuisine==="cafe"?"カフェ・スイーツ":state.cuisine==="ramen"?"麺・ラーメン":state.cuisine==="yakiniku"?"焼肉・肉料理":state.cuisine==="sushi"?"和食・寿司":state.cuisine==="sweets"?"カフェ・スイーツ":state.cuisine==="bar"?"居酒屋・酒場":"未分類";
    const region=SEED.find(x=>x.ward===w)?.region||"その他";
    store.custom.push({id:uid,name:s.name.slice(0,140),ward:w,region,genre,seed:false,osmId:s.id,lat:s.lat,lon:s.lon,notes:"地図の近くの店舗検索から保存。訪問前に営業状況を要確認。"});
    store.mods[uid]={status:"wish"};save();
    state.error="「"+s.name+"」を行きたいリストに保存しました。";refresh();
  }
  // Map is only created when this tab is visible, avoiding background location requests.
  const previousPage=mapSearchPage;
  mapSearchPage=function(){return mapHeader();};
  const previousRender=render;
  render=function(){
    if(map){map.remove();map=null;createdMapFor=null;}
    previousRender();
    if(ui.tab==="mapsearch")requestAnimationFrame(()=>{
      if(ui.tab!=="mapsearch")return;
      void mountMap();
      if(!state.initialNearbyRequested){
        state.initialNearbyRequested=true;
        // The first map visit explores only the fixed Tokyo Station map center.
        // It never requests the user's actual GPS position automatically.
        setTimeout(()=>{if(ui.tab==="mapsearch")void searchAround("map");},280);
      }
    });
  };
  document.addEventListener("change",event=>{
    if(event.target?.id==="mapStatusFilter"){state.filter=event.target.value;refresh();}
    if(event.target?.id==="mapShopSelect"){state.pinShopId=event.target.value;state.pinCoords=null;state.geocode=[];state.mode="mine";state.advancedOpen=true;refresh();}
    if(event.target?.id==="mapRadius"){state.radius=Number(event.target.value)||1000;}
  });
  document.addEventListener("submit",event=>{
    if(event.target?.id!=="tglMapSearchForm")return;
    event.preventDefault();void searchAreaText();
  });
  document.addEventListener("click",event=>{
    if(event.target?.matches?.(".map-advanced > summary"))state.advancedOpen=!event.target.parentElement.open;
    const btn=event.target.closest("[data-map-action],[data-geo]");
    if(!btn)return;
    if(btn.dataset.geo==="select"){selectGeo(Number(btn.dataset.index));return;}
    switch(btn.dataset.mapAction){
      case "cuisine":state.cuisine=btn.dataset.cuisine||"all";state.error="";refresh();break;
      case "mode":state.mode=btn.dataset.mode||"mine";state.error="";refresh();break;
      case "nearby":void searchAround("gps");break;
      case "searchHere":void searchAround("map");break;
      case "focusShop":showSavedOnMap(btn.dataset.id);break;
      case "google":openGoogle("nearby");break;
      case "searchArea":openGoogle("area");break;
      case "geocode":geocode();break;
      case "confirmPin":confirmPin();break;
      case "cancelPin":state.pinCoords=null;state.geocode=[];refresh();break;
      case "focusNearby":showNearbyOnMap(Number(btn.dataset.index));break;
      case "saveNearby":saveNearby(Number(btn.dataset.index));break;
      case "detailShop":detail(btn.dataset.id);break;
      case "googlePlace":{
        const item=state.nearby[Number(btn.dataset.index)];if(item)window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(item.name+" "+item.lat+","+item.lon),"_blank","noopener,noreferrer");break;}
    }
  });
  // The map tab is reachable from home; map plots only visited/wishlist shops
  // with user-confirmed coordinates, never fabricated positions.
  render();
})();