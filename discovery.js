/* TOKYO GOURMET LOG: free discovery extensions 2026-11-18
   No scraping of TikTok/Google, no silent geolocation, no invented store data.
   OCR runs locally using a lazily loaded, pinned Tesseract.js library. */
(function(){
  "use strict";
  const probe={link:"",text:"",name:"",hint:"",results:[],message:"",busy:false,photoUrl:"",file:null};
  const nearby={busy:false,error:"",items:[],radius:1000,checkedAt:""};
  const ocrScript="https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
  const safe=(v)=>esc(String(v??""));
  function norm(v){return String(v??"").normalize("NFKC").toLocaleLowerCase("ja").replace(/[\s　.,，。・\-_/()（）#＃「」『』]/g,"");}
  function parseLink(link){
    if(!link.trim())return "";
    try{
      const u=new URL(link.trim()),host=u.hostname.toLowerCase();
      if(!/^https?:$/.test(u.protocol))return "";
      if(host==="google.com"||host==="www.google.com"||host==="maps.google.com"||host.endsWith(".google.co.jp")){
        const query=u.searchParams.get("query")||u.searchParams.get("q")||u.searchParams.get("textQuery");
        if(query)return query.replace(/^東京都\s*/,"").slice(0,140);
        const m=u.pathname.match(/\/maps\/place\/([^/?]+)/);
        if(m)return decodeURIComponent(m[1].replace(/\+/g," ")).slice(0,140);
      }
      if(host==="maps.apple.com"){
        return (u.searchParams.get("q")||u.searchParams.get("name")||"").slice(0,140);
      }
      return "";
    }catch{return "";}
  }
  function findCandidates(raw){
    const text=norm(raw);
    if(!text)return [];
    const shops=getShops();
    return shops.map(s=>{
      const n=norm(s.name);
      let score=0;
      if(n.length>=3&&text.includes(n))score=150+n.length;
      else if(text.length>=3&&n.includes(text))score=90+Math.min(text.length,20);
      else if(text.length>=4){
        const parts=String(s.name).split(/[\s・]+/).map(norm).filter(k=>k.length>=3);
        if(parts.some(k=>text.includes(k)))score=50;
      }
      return {shop:s,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,8).map(x=>x.shop);
  }
  function analyze(){
    const parsed=parseLink(probe.link);
    const body=[probe.text,parsed,probe.name].filter(Boolean).join("\n");
    const label=body.match(/(?:店名|店舗名|お店の名前|shop|restaurant)\s*[:：→=]\s*([^\n#＃。]{2,60})/i);
    probe.hint=probe.name.trim()||(label?label[1].trim():parsed.trim());
    probe.results=findCandidates(body);
    probe.message=probe.results.length?
      "候補が見つかりました。店名と所在地が一致するか、地図で確認してから登録してください。":
      (probe.hint?"候補名を抽出しました。地図で確認してから保存してください。":
      "画像の料理の見た目だけから店を特定する機能ではありません。店名や看板の文字が写った画像、または説明文を入力してください。");
    render();
  }
  function probePanel(){
    return '<section class="panel image-discovery" aria-label="画像やリンクからお店を探す">'+
    '<div class="discovery-eyebrow">NEW / IMAGE & LINK SEARCH</div>'+
    '<h2 class="discovery-title">画像・リンクからお店を探す</h2>'+
    '<p class="muted">店名が写ったスクリーンショットやGoogleマップの共有リンクを読み取り、候補を探します。</p>'+
    '<label class="field"><span>画像を選ぶ（スクショ・看板など）</span>'+
    '<input id="probeImage" type="file" accept="image/*" aria-label="店舗名が写った画像を選択"></label>'+
    (probe.photoUrl?'<div class="probe-preview"><img src="'+safe(probe.photoUrl)+'" alt="選択した画像のプレビュー"></div>':'')+
    '<label class="field"><span>URL（Googleマップ・SNSなど）</span>'+
    '<input id="probeLink" type="url" placeholder="https://..." value="'+safe(probe.link)+'"></label>'+
    '<label class="field"><span>投稿文・画像で読めた文字（任意）</span>'+
    '<textarea id="probeText" rows="3" placeholder="店名・キャプション・場所など">'+safe(probe.text)+'</textarea></label>'+
    '<label class="field"><span>店名が分かる場合は入力</span>'+
    '<input id="probeName" placeholder="例：つけ麺 道" value="'+safe(probe.name)+'" maxlength="140"></label>'+
    '<div class="inline-links"><button class="btn primary" data-action="probeAnalyze">候補を探す</button>'+
    '<button class="btn" data-action="probeClear">クリア</button></div>'+
    (probe.busy?'<p class="status-line" role="status">画像内の文字を読み取っています。初回は日本語データを取得するため時間がかかる場合があります。</p>':'')+
    (probe.message?'<p class="status-line" role="status">'+safe(probe.message)+'</p>':'')+
    (probe.results.length?'<h3 class="discovery-heading">見つかった候補</h3>'+probe.results.map(s=>
      '<div class="found-shop"><div><strong>'+safe(s.name)+'</strong><small>'+safe(s.ward)+' · '+safe(s.genre)+'</small></div>'+
      '<div class="inline-links"><button class="btn tiny primary" data-action="probeSaveExisting" data-id="'+safe(s.id)+'">♡ 保存</button>'+
      '<button class="btn tiny" data-action="probeOpenMap" data-name="'+safe(s.name)+'" data-ward="'+safe(s.ward)+'">地図 ↗</button></div></div>'
      ).join(""):"")+
    '<div class="discovery-heading">リストにない店舗も保存できます</div>'+
    '<p class="hint">東京23区230店舗以外でも、確認できた店名を自分のリストに追加できます。</p>'+
    '<div class="inline-links"><button class="btn" data-action="probeOpenMap" data-name="'+safe(probe.hint||probe.name||probe.text.slice(0,35)||"東京 飲食店")+'">Googleマップで確認 ↗</button>'+
    '<button class="btn primary" data-action="probeSaveNew">店名を確認して保存</button></div>'+
    '<p class="hint" style="margin-top:13px">画像の文字認識は端末内で実行しますが、初回に外部CDNからOCRライブラリ・言語データを取得します。SNSのURLだけから動画内容は読み取れません。</p>'+
    '</section>';
  }
  function osmPanel(){
    return '<section class="panel osm-discovery" aria-label="リストにない店を周辺検索">'+
    '<div class="discovery-eyebrow">NEARBY / OPENSTREETMAP</div>'+
    '<h2 class="discovery-title">230店舗以外も見つける</h2>'+
    '<p class="muted">登録リストにない飲食店も、周辺のOpenStreetMapデータから探せます。表示内容は一部の登録店舗であり、地域の全店を保証しません。</p>'+
    '<div class="inline-links"><select id="osmRadius" aria-label="検索半径" style="max-width:155px">'+
    [500,1000,1500].map(n=>'<option value="'+n+'" '+(nearby.radius===n?'selected':'')+'>'+n+'m以内</option>').join("")+
    '</select><button class="btn primary" data-action="osmSearch" '+(nearby.busy?'disabled':'')+'>'+(nearby.busy?'検索中…':'⌖ 現在地付近の店舗を表示')+'</button></div>'+
    '<p class="hint">ボタンを押したときだけ位置情報の使用を確認します。取得した位置は検索のためOpenStreetMap系サーバーに送信し、保存しません。</p>'+
    (nearby.error?'<p class="status-line">'+safe(nearby.error)+'</p>':'')+
    (nearby.checkedAt?'<p class="hint">周辺検索結果 '+nearby.items.length+'件（表示上限90軒）</p>':'')+
    '<div class="osm-list">'+nearby.items.map((s,i)=>
      '<div class="found-shop"><div><strong>'+safe(s.name)+'</strong><small>'+safe(s.kind)+(s.addr?' · '+safe(s.addr):"")+'</small></div>'+
      '<div class="inline-links"><button class="btn tiny primary" data-action="osmSave" data-index="'+i+'">♡ 保存</button>'+
      '<button class="btn tiny" data-action="osmMap" data-index="'+i+'">地図 ↗</button></div></div>'
    ).join("")+'</div>'+
    '<p class="hint" style="margin-top:12px">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style="text-decoration:underline">OpenStreetMap contributors</a>（ODbL）。店舗名・業態・営業状況は地図や公式情報で必ず確認してください。サーバー混雑時は検索できません。</p>'+
    '</section>';
  }
  const oldSocial=socialPage;
  socialPage=function(){
    const html=oldSocial();
    const target='<div class="panel"><h3>① SNSリンクを貼る</h3>';
    return html.includes(target)?html.replace(target,probePanel()+target):probePanel()+html;
  };
  const oldMap=mapSearchPage;
  mapSearchPage=function(){
    const html=oldMap(),target='<div class="nearby-panel">';
    return html.includes(target)?html.replace(target,osmPanel()+target):osmPanel()+html;
  };
  function updateFields(){
    const a=document.getElementById("probeLink"),b=document.getElementById("probeText"),c=document.getElementById("probeName");
    if(a)probe.link=a.value.trim().slice(0,1800);
    if(b)probe.text=b.value.slice(0,5000);
    if(c)probe.name=c.value.slice(0,160);
  }
  function maps(name,ward=""){
    const q=[ward?"東京都 "+ward:"",name||"飲食店"].filter(Boolean).join(" ");
    window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(q),"_blank","noopener,noreferrer");
  }
  function loadOCRScript(){
    if(window.Tesseract)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src=ocrScript;script.async=true;
      script.onload=()=>window.Tesseract?resolve():reject(new Error("OCRの読み込みに失敗"));
      script.onerror=()=>reject(new Error("OCRライブラリを取得できません"));
      document.head.appendChild(script);
    });
  }
  function downscaleImage(file){
    return new Promise((resolve,reject)=>{
      const image=new Image(),temp=URL.createObjectURL(file);
      image.onload=()=>{
        try{
          const ratio=Math.min(1,1500/Math.max(image.width,image.height));
          const c=document.createElement("canvas");
          c.width=Math.max(1,Math.round(image.width*ratio));
          c.height=Math.max(1,Math.round(image.height*ratio));
          c.getContext("2d").drawImage(image,0,0,c.width,c.height);
          URL.revokeObjectURL(temp);
          resolve(c.toDataURL("image/jpeg",.88));
        }catch(e){URL.revokeObjectURL(temp);reject(e)}
      };
      image.onerror=()=>{URL.revokeObjectURL(temp);reject(new Error("この画像形式は読み取れません。JPEG/PNGを試してください"))};
      image.src=temp;
    });
  }
  async function runOCR(file){
    if(!file||!file.type.startsWith("image/")){toast("画像を選んでください");return;}
    if(file.size>18*1024*1024){toast("18MB以下の画像を選んでください");return;}
    updateFields();probe.busy=true;probe.message="";probe.results=[];render();
    let worker=null;
    try{
      const imageData=await downscaleImage(file);
      if(probe.photoUrl)URL.revokeObjectURL(probe.photoUrl);
      probe.photoUrl=URL.createObjectURL(file);
      await loadOCRScript();
      worker=await window.Tesseract.createWorker(["jpn","eng"]);
      const result=await worker.recognize(imageData);
      const recognized=(result?.data?.text||"").trim().slice(0,3000);
      if(recognized)probe.text=(probe.text?probe.text+"\n":"")+recognized;
      probe.message=recognized?"画像内の文字を読み取りました。候補を確認してください。":"文字を検出できませんでした。店名が読める別の画像を試すか、手入力してください。";
      probe.busy=false;analyze();
    }catch(err){
      probe.busy=false;
      probe.message="画像解析に失敗しました。通信状況や画像形式を確認し、説明文・店名を手入力してください。";
      render();
    }finally{if(worker)await worker.terminate().catch(()=>{});}
  }
  function addNew(name,ward,genre,extra){
    const normalized=norm(name);
    const exists=getShops().find(s=>norm(s.name)===normalized&&(s.ward===ward||ward==="未設定"));
    if(exists){setStatus(exists.id,"wish");return}
    const id="custom-"+Date.now()+"-"+Math.random().toString(36).slice(2);
    const region=SEED.find(s=>s.ward===ward)?.region||"その他";
    const entry={id,name:name.slice(0,140),ward,region,genre,seed:false,...extra};
    store.custom.push(entry);store.mods[id]={status:"wish"};save();render();toast("新しいお店を行きたいリストに追加しました");
  }
  function saveProbeNew(){
    updateFields();
    const suggested=probe.name.trim()||probe.hint.trim();
    const name=window.prompt("地図で確認した正確な店名を入力してください",suggested);
    if(!name?.trim())return;
    const ward=window.prompt("区名（不明なら未設定、東京23区外なら23区外）","未設定");
    if(ward===null)return;
    const w=WARDS.includes(ward.trim())?ward.trim():ward.trim()==="23区外"?"23区外":"未設定";
    const source=probe.link.startsWith("https://")?probe.link:"";
    const sources=source?[{kind:/tiktok/i.test(source)?"TikTok":/instagram/i.test(source)?"Instagram":"共有リンク",url:source,caption:probe.text.slice(0,1000),savedAt:new Date().toISOString()}]:[];
    addNew(name.trim(),w,"未分類",{notes:probe.text.slice(0,700),sources});
  }
  function locate(){
    return new Promise((resolve,reject)=>{
      if(!window.isSecureContext||!navigator.geolocation)return reject(new Error("HTTPS環境または位置情報に対応した端末が必要です"));
      navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude}),()=>reject(new Error("位置情報が許可されませんでした。Googleマップのエリア検索を利用してください。")),{timeout:11000,maximumAge:30000,enableHighAccuracy:false});
    });
  }
  async function queryOSM(){
    const sel=document.getElementById("osmRadius");
    nearby.radius=[500,1000,1500].includes(Number(sel?.value))?Number(sel.value):1000;
    nearby.busy=true;nearby.error="位置情報を確認しています…";nearby.items=[];nearby.checkedAt="";render();
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),28000);
    try{
      const {lat,lon}=await locate();
      nearby.error="OpenStreetMapから周辺の店舗を検索しています…";render();
      const radius=nearby.radius;
      const query='[out:json][timeout:20];(nwr(around:'+radius+','+lat.toFixed(6)+','+lon.toFixed(6)+')["amenity"~"^(restaurant|cafe|fast_food|food_court|pub|bar)$"]["name"];);out center 120;';
      const body=new URLSearchParams({data:query});
      const response=await fetch("https://overpass-api.de/api/interpreter",{method:"POST",body,signal:controller.signal});
      if(!response.ok)throw Error("周辺検索サーバーが利用できません（"+response.status+"）。");
      const data=await response.json();
      if(!Array.isArray(data.elements))throw Error("店舗情報を取得できませんでした");
      nearby.items=data.elements.filter(e=>typeof e.tags?.name==="string").slice(0,90).map(e=>{
        const p=e.type==="node"?e:e.center||{};
        const lat2=Number(p.lat),lon2=Number(p.lon);
        const tag=e.tags;
        return {id:e.type+"/"+e.id,name:tag["name:ja"]||tag.name,kind:tag.amenity,addr:[tag["addr:city"],tag["addr:suburb"],tag["addr:street"]].filter(Boolean).join(" "),ward:WARDS.find(w=>(tag["addr:city"]||"").includes(w)||(tag["addr:suburb"]||"").includes(w))||"未設定",lat:lat2,lon:lon2};
      }).filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon));
      nearby.checkedAt=new Date().toISOString();
      nearby.error=nearby.items.length?"周辺の候補を表示しました。詳細や営業状況を確認してから保存してください。":"周辺に登録された店舗が見つかりませんでした。Googleマップで探してください。";
    }catch(err){nearby.error=err.name==="AbortError"?"検索がタイムアウトしました。検索半径を狭くして再試行してください。":String(err.message||err);}
    finally{clearTimeout(timer);nearby.busy=false;render();}
  }
  function osmMaps(item){
    if(!item)return;
    const q=item.name+" "+item.lat.toFixed(5)+","+item.lon.toFixed(5);
    window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(q),"_blank","noopener,noreferrer");
  }
  document.addEventListener("change",event=>{
    const el=event.target;
    if(el?.id==="probeImage"&&el.files?.[0])runOCR(el.files[0]);
    if(el?.id==="osmRadius")nearby.radius=Number(el.value)||1000;
  });
  document.addEventListener("click",event=>{
    const b=event.target.closest("[data-action]");
    if(!b)return;
    const a=b.dataset.action;
    if(a==="probeAnalyze"){updateFields();analyze();}
    else if(a==="probeClear"){probe.link="";probe.text="";probe.name="";probe.hint="";probe.message="";probe.results=[];if(probe.photoUrl)URL.revokeObjectURL(probe.photoUrl);probe.photoUrl="";render();}
    else if(a==="probeOpenMap"){maps(b.dataset.name,b.dataset.ward||"");}
    else if(a==="probeSaveExisting"){const s=getShop(b.dataset.id);if(!s)return;setStatus(s.id,"wish");}
    else if(a==="probeSaveNew"){saveProbeNew();}
    else if(a==="osmSearch"){queryOSM();}
    else if(a==="osmMap"){osmMaps(nearby.items[Number(b.dataset.index)]);}
    else if(a==="osmSave"){
      const item=nearby.items[Number(b.dataset.index)];if(!item)return;
      if(!window.confirm(item.name+" を「行きたい」に保存しますか？\n地図で同じ店舗か確認してください。"))return;
      addNew(item.name,item.ward,item.kind==="cafe"?"カフェ・スイーツ":/pub|bar/.test(item.kind)?"居酒屋・酒場":"未分類",{osmId:item.id,lat:item.lat,lon:item.lon,address:item.addr,notes:"OpenStreetMapの周辺検索から保存。訪問前に所在地・営業状況の確認が必要。"});
    }
  });
  render();
})();