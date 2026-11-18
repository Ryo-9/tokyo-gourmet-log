/* STAGED ONLY: Private cloud sync client for TOKYO GOURMET LOG
 * Not loaded by production index.html until Auth URL settings + browser tests.
 * Publishable keys only, never service_role/secret keys. No automatic upload.
 * Supabase JS pinned to exact version 2.119.0.
 */
(function(){
  "use strict";
  const conf=window.TGL_CLOUD_CONFIG;
  if(!conf||typeof conf.url!=="string"||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(conf.url)||
      typeof conf.key!=="string"||!conf.key.startsWith("sb_publishable_")){
    console.warn("Cloud beta is not configured; local records remain available.");
    return;
  }
  const sdkSrc="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0";
  let client=null,user=null,sdkPromise=null,busy=false,notice="",importPreview=null,cloudSnapshot=null,initialized=false;
  const safe=x=>esc(String(x??""));
  const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x??""));
  function pickURL(s){
    const raw=(s.sources||[]).map(x=>x.url).find(Boolean)||"";
    try{const u=new URL(raw);return /^https?:$/.test(u.protocol)?u.href.slice(0,1800):null}catch{return null}
  }
  function popup(){return '<section class="panel" style="margin-top:16px" id="tglCloudPanel">'+
    '<div class="eyebrow">PRIVATE CLOUD BETA</div><h3 style="margin-top:8px">自分のグルメ記録をクラウドで管理</h3>'+
    '<p>ログインは任意です。ログインしなくても今までの機能は使えます。クラウド保存は明示操作でのみ行い、写真は対象外です。</p>'+
    (notice?'<p class="status-line" role="status">'+safe(notice)+'</p>':'')+
    (user?'<p><strong>ログイン中：</strong>'+safe(user.email||"アカウント")+'</p>'+
      '<div class="inline-links"><button class="btn primary" data-cloud="upload" '+(busy?'disabled':'')+'>ローカル記録をクラウドへ保存</button>'+
      '<button class="btn" data-cloud="preview" '+(busy?'disabled':'')+'>クラウドから取り込み確認</button>'+
      '<button class="btn" data-cloud="download" '+(busy?'disabled':'')+'>クラウド記録をJSONで取得</button>'+
      '<button class="btn ghost" data-cloud="logout" '+(busy?'disabled':'')+'>ログアウト</button></div>':
      '<form id="tglCloudEmailForm"><label class="field"><span>メールアドレス</span><input name="cloudEmail" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com"></label>'+
      '<button type="submit" class="btn primary" '+(busy?'disabled':'')+'>ログイン用メールを送信</button></form>')+
    (user&&importPreview?'<div class="cloud-import-preview"><strong>クラウドにある記録</strong><p>保存店舗 '+importPreview.places+'件（追加・状態復元 '+importPreview.toAdd+'件）／訪問履歴 '+importPreview.visits+'件（未登録 '+importPreview.newVisits+'件）</p><p class="hint">既存記録は上書きせず、未登録分だけ追加します。事前にJSONバックアップを書き出します。</p><button class="btn primary" data-cloud="merge" '+(busy?'disabled':'')+'>未登録分をこの端末に取り込む</button></div>':'')+
    '<p class="hint" style="margin-top:12px">ログインは任意。保存・取り込みは手動操作のみ。写真・SNSリンク・共有リストは現段階の同期対象外です。ログアウトしても端末内の記録は残ります。</p></section>';
  }
  function show(){const previous=dataPage;return function(){return previous()+popup()}}
  dataPage=show();
  function loadSDK(){
    if(window.supabase?.createClient)return Promise.resolve(window.supabase);
    if(sdkPromise)return sdkPromise;
    sdkPromise=new Promise((resolve,reject)=>{
      const s=document.createElement("script");
      s.src=sdkSrc;s.crossOrigin="anonymous";s.async=true;
      s.onload=()=>window.supabase?.createClient?resolve(window.supabase):reject(Error("SDK未読込"));
      s.onerror=()=>reject(Error("Supabase SDKを取得できません"));
      document.head.appendChild(s);
    });
    return sdkPromise;
  }
  async function setup(){
    try{
      const sdk=await loadSDK();
      client=sdk.createClient(conf.url,conf.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      client.auth.onAuthStateChange(async(_event,session)=>{
        user=session?.user||null;
        if(ui.tab==="data")render();
      });
      const {data,error}=await client.auth.getUser();
      if(error&&error.name!=="AuthSessionMissingError")notice="接続状態："+error.message.slice(0,180);
      user=data?.user||null;
      if(ui.tab==="data")render();
    }catch(err){notice="クラウド接続に失敗しました。通信状態を確認してください。";if(ui.tab==="data")render();}
  }
  function waitClient(){if(!client)throw Error("クラウド接続の準備がまだ完了していません");}
  async function login(email){
    waitClient();
    const redirect=location.origin+location.pathname;
    const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:redirect,shouldCreateUser:true}});
    if(error)throw error;
    notice="ログイン用メールを送信しました。メールのリンクを開いてください。";
  }
  function locationPair(s){
    if(s.lat===null||s.lon===null||s.lat===undefined||s.lon===undefined||s.lat===""||s.lon==="")return [null,null];
    const lat=Number(s.lat),lon=Number(s.lon);
    return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?[lat,lon]:[null,null];
  }
  function exportable(){
    const saved=getShops().filter(s=>!s.seed||statusOf(s)!=="new"||getVisits(s.id).length>0||
      Object.keys(store.mods[s.id]||{}).length>0||(s.sources||[]).length>0);
    const visitIds=new Set(store.visits.map(v=>v.shopId));
    for(const s of getShops())if(visitIds.has(s.id)&&!saved.some(x=>x.id===s.id))saved.push(s);
    return saved;
  }
  function photoNote(){return "写真・共有コレクションは同期されません。既存データは端末に残ります。";}
  async function upload(){
    waitClient();
    const {data,error:authError}=await client.auth.getUser();
    if(authError||!data?.user)throw Error("もう一度ログインしてください");
    const uid=data.user.id;
    const items=exportable();
    const eligibleVisits=store.visits.filter(x=>x?.id&&validDate(x.date)&&items.some(s=>s.id===x.shopId));
    const skipped=store.visits.length-eligibleVisits.length;
    if(!items.length&&!eligibleVisits.length){notice="アップロードする保存店舗・訪問記録はまだありません。";render();return;}
    const msg="端末内にある保存店舗 "+items.length+"件、訪問履歴 "+eligibleVisits.length+
      "件をクラウドへ保存します。\n同一IDのクラウド記録は上書きされ、クラウド側の記録は削除しません。\n"+
      photoNote()+"\n事前に端末のJSONバックアップをダウンロードします。続行しますか？";
    if(!confirm(msg))return;
    exportJson(); // copy local snapshot; does not mutate the source
    const timestamp=new Date().toISOString();
    importPreview=null;cloudSnapshot=null;
    const places=items.map(s=>{
      const pair=locationPair(s),st=statusOf(s);
      return {user_id:uid,client_id:String(s.id).slice(0,160),name:String(s.name).slice(0,180),
        area:String(s.ward||"").slice(0,100),cuisine:String(s.genre||"").slice(0,100),
        status:["new","wish","visited"].includes(st)?st:"new",
        note:String(s.notes||"").slice(0,4000),lat:pair[0],lon:pair[1],source_url:pickURL(s),
        updated_at:timestamp};
    });
    let writtenPlaces=0,writtenVisits=0;
    for(let i=0;i<places.length;i+=75){
      const batch=places.slice(i,i+75);
      const {error}=await client.from("tgl_saved_places").upsert(batch,{onConflict:"user_id,client_id"});
      if(error)throw Error("店舗保存："+error.message);
      writtenPlaces+=batch.length;
    }
    const fetched=[];
    for(let i=0;i<places.length;i+=75){
      const {data:rows,error}=await client.from("tgl_saved_places").select("id,client_id").eq("user_id",uid).in("client_id",places.slice(i,i+75).map(p=>p.client_id));
      if(error)throw Error("店舗ID取得："+error.message);
      fetched.push(...rows);
    }
    const lookup=new Map(fetched.map(r=>[r.client_id,r.id]));
    const visits=eligibleVisits.map(v=>{
      const target=lookup.get(String(v.shopId).slice(0,160));
      if(!target)return null;
      const rate=Number(v.rating),amount=Number(v.amount);
      return {user_id:uid,client_id:String(v.id).slice(0,160),place_id:target,visited_on:String(v.date),
        rating:Number.isInteger(rate)&&rate>=1&&rate<=5?rate:null,
        price_yen:String(v.amount??"").trim()!==""&&Number.isSafeInteger(amount)&&amount>=0&&amount<=2147483647?amount:null,
        dish:String(v.dish||"").slice(0,150),note:String(v.note||"").slice(0,5000),
        revisit:["yes","maybe","no"].includes(v.revisit)?v.revisit:""};
    }).filter(Boolean);
    for(let i=0;i<visits.length;i+=75){
      const batch=visits.slice(i,i+75);
      const {error}=await client.from("tgl_visits").upsert(batch,{onConflict:"user_id,client_id"});
      if(error)throw Error("訪問履歴保存："+error.message);
      writtenVisits+=batch.length;
    }
    notice="クラウドに保存しました：店舗"+writtenPlaces+"件・訪問履歴"+writtenVisits+
      "件。"+(skipped?"形式不備により対象外："+skipped+"件。":"")+"写真は別バックアップです。";
  }
  async function download(){
    waitClient();
    const {data,error:authError}=await client.auth.getUser();
    if(authError||!data?.user)throw Error("ログインが必要です");
    const uid=data.user.id;
    async function allRows(name,orderColumn){
      const result=[];
      for(let offset=0;offset<5000;offset+=500){
        const {data:rows,error}=await client.from(name).select("*").eq("user_id",uid).order(orderColumn,{ascending:true}).range(offset,offset+499);
        if(error)throw Error(name+" の取得に失敗："+error.message);
        result.push(...rows);
        if(rows.length<500)return result;
      }
      throw Error("データが多いため書き出しに失敗しました。サポートに連絡してください。");
    }
    const [places,visits,profiles]=await Promise.all([
      allRows("tgl_saved_places","created_at"),allRows("tgl_visits","created_at"),allRows("tgl_profiles","created_at")
    ]);
    const content={format:"tokyo-gourmet-log-cloud-export",version:1,exportedAt:new Date().toISOString(),
      note:"参照用バックアップです。端末の既存データに自動取り込みしません。",places,visits,profiles};
    const blob=new Blob([JSON.stringify(content,null,2)],{type:"application/json"});
    const blobURL=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=blobURL;a.download="tokyo-gourmet-cloud-"+new Date().toISOString().slice(0,10)+".json";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(blobURL),2500);
    notice="クラウドから店舗"+places.length+"件・訪問履歴"+visits.length+"件をJSONに書き出しました。端末への自動上書きはありません。";
  }

  // Read-only cloud preview; local browser state is not changed until confirmed.
  async function fetchCloudSnapshot(){
    waitClient();
    const {data,error}=await client.auth.getUser();
    if(error||!data?.user)throw Error("もう一度ログインしてください。");
    const uid=data.user.id;
    async function readAll(table){
      const all=[];
      for(let offset=0;offset<5000;offset+=500){
        const {data:batch,error:problem}=await client.from(table)
          .select("*").eq("user_id",uid).order("created_at",{ascending:true}).range(offset,offset+499);
        if(problem)throw Error(table+"："+problem.message);
        all.push(...batch);
        if(batch.length<500)return all;
      }
      throw Error("クラウドの件数が多いため全件を読み取れません。");
    }
    const [places,visits]=await Promise.all([readAll("tgl_saved_places"),readAll("tgl_visits")]);
    return {uid,places,visits};
  }
  function importStats(snapshot){
    const localIds=new Set([...SEED,...store.custom].map(s=>s.id));
    const seenVisitIds=new Set(store.visits.map(v=>v.id));
    return {
      places:snapshot.places.length,visits:snapshot.visits.length,
      toAdd:snapshot.places.filter(p=>p.client_id&&(!localIds.has(p.client_id)||!Object.prototype.hasOwnProperty.call(store.mods,p.client_id))).length,
      newVisits:snapshot.visits.filter(v=>v.client_id&&!seenVisitIds.has(v.client_id)).length
    };
  }
  async function previewMerge(){
    cloudSnapshot=await fetchCloudSnapshot();
    importPreview=importStats(cloudSnapshot);
    notice=(importPreview.places||importPreview.visits)?"クラウドの記録を読み込みました。件数を確認して取り込めます。":
      "クラウドにはまだ記録がありません。まずこの端末の記録をアップロードできます。";
  }
  function validClientPlace(p){
    return typeof p?.client_id==="string"&&p.client_id.length>0&&p.client_id.length<=160&&
      typeof p.name==="string"&&p.name.length>0&&typeof p.area==="string";
  }
  async function mergeCloud(){
    if(!cloudSnapshot||!importPreview)throw Error("先にクラウドのデータを読み込んでください。");
    const {data,error}=await client.auth.getUser();
    if(error||data?.user?.id!==cloudSnapshot.uid)throw Error("ログインユーザーが変わりました。もう一度読み込んでください。");
    if(!confirm("クラウドの未登録の店舗と訪問履歴をこの端末に追加します。\n既存の訪問メモ・店舗は上書きしません。\nまずローカルJSONバックアップをダウンロードします。続けますか？"))return;
    exportJson();
    const originalShops=new Map([...SEED,...store.custom].map(p=>[p.id,p]));
    const alreadyVisited=new Set(store.visits.map(v=>v.id));
    const newShops=[],newMods={},newVisits=[];
    for(const p of cloudSnapshot.places){
      if(!validClientPlace(p))continue;
      const id=p.client_id,original=originalShops.get(id);
      if(!original){
        const area=WARDS.includes(p.area)?p.area:p.area==="23区外"?"23区外":"未設定";
        const region=SEED.find(row=>row.ward===area)?.region||"その他";
        const sh={id,name:p.name.slice(0,160),ward:area,region,genre:String(p.cuisine||"未分類").slice(0,100),
          seed:false,notes:String(p.note||"").slice(0,4000)};
        if(p.lat!==null&&p.lon!==null){
          const lat=Number(p.lat),lon=Number(p.lon);
          if(Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180){
            sh.lat=lat;sh.lon=lon;sh.mapSource="cloud_import";
          }
        }
        originalShops.set(id,sh);newShops.push(sh);
      }
      // Only create missing local status records; existing edits always win.
      if(!Object.prototype.hasOwnProperty.call(store.mods,id)){
        const status=["new","wish","visited"].includes(p.status)?p.status:"new";
        const mod={status};
        if(original&&!original.notes&&p.note)mod.notes=String(p.note).slice(0,4000);
        if(original&&(original.lat===null||original.lat===undefined||original.lat==="")&&p.lat!==null&&p.lon!==null){
          const lat=Number(p.lat),lon=Number(p.lon);
          if(Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180){
            mod.lat=lat;mod.lon=lon;mod.mapSource="cloud_import";
          }
        }
        newMods[id]=mod;
      }
    }
    const cloudPlaceIDs=new Map(cloudSnapshot.places.map(p=>[p.id,p.client_id]));
    for(const v of cloudSnapshot.visits){
      const id=String(v.client_id||"");
      if(!id||alreadyVisited.has(id))continue;
      const localShopId=cloudPlaceIDs.get(v.place_id);
      if(!localShopId||!originalShops.has(localShopId))continue;
      const date=String(v.visited_on||"");
      if(!validDate(date))continue;
      const rating=Number(v.rating);
      newVisits.push({id,shopId:localShopId,date,rating:Number.isInteger(rating)&&rating>=1&&rating<=5?rating:0,
        amount:v.price_yen===null?"":String(v.price_yen),
        dish:String(v.dish||"").slice(0,100),note:String(v.note||"").slice(0,3000),
        revisit:String(v.revisit||"")});
      alreadyVisited.add(id);
      if(newMods[localShopId]?.status==="new")newMods[localShopId].status="visited";
    }
    // Single local mutation after all rows have been converted.
    store.custom.push(...newShops);
    store.mods={...newMods,...store.mods};
    store.visits.push(...newVisits);
    save();
    importPreview=null;cloudSnapshot=null;
    notice="端末への取り込み完了：追加店舗"+newShops.length+"件・状態復元"+Object.keys(newMods).length+"件・訪問記録"+newVisits.length+"件。既存データは残しました。";
  }

  document.addEventListener("submit",async ev=>{
    if(ev.target.id!=="tglCloudEmailForm")return;
    ev.preventDefault();if(busy)return;
    const input=ev.target.elements.cloudEmail;
    if(!input?.value||!input.validity.valid)return;
    busy=true;notice="ログイン用メールを送信しています…";render();
    try{await login(input.value)}catch(err){notice="メール認証を開始できません："+String(err.message||err).slice(0,220);}
    busy=false;render();
  });
  document.addEventListener("click",async ev=>{
    const button=ev.target.closest("[data-cloud]");if(!button||busy)return;
    const mode=button.dataset.cloud;busy=true;notice="処理を実行しています…";render();
    try{
      if(mode==="upload")await upload();
      else if(mode==="download")await download();
      else if(mode==="preview")await previewMerge();
      else if(mode==="merge")await mergeCloud();
      else if(mode==="logout"){importPreview=null;cloudSnapshot=null;waitClient();const {error}=await client.auth.signOut();if(error)throw error;user=null;notice="ログアウトしました。端末の記録はそのままです。";}
    }catch(err){notice="クラウド操作に失敗しました："+String(err.message||err).slice(0,220);}
    busy=false;render();
  });
  // Only initialize Supabase when entering settings or handling a login callback.
  const previousRender=render;
  render=function(){
    previousRender();
    if(ui.tab==="data"&&!initialized){initialized=true;void setup();}
  };
  if(/[?#&](?:access_token|refresh_token|code)=/.test(location.hash+location.search)){
    ui.tab="data";render();
  }else if(ui.tab==="data"){render();}
})();
