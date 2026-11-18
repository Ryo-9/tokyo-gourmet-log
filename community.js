/* TOKYO GOURMET LOG — private-first sharing & moments
   GitHub Pages has no server. Share links are snapshots, votes are local replies.
   This local list-sharing mode needs no login; online invite-only groups use Supabase. */
(function () {
  "use strict";
  const KEY="tgl-sharing-v1";
  const state={collections:[], ballots:{}, received:[]};
  let draft={title:"",description:"",selected:[],lookup:""};
  let incoming=null, momentFile=null, momentPreview=null, sharedStatus="", hubView="lists";
  const CATEGORIES={};
  const clean=v=>String(v??"").trim().slice(0,600);
  const e=v=>esc(String(v??""));
  const id=()=>((typeof crypto!=="undefined"&&crypto.randomUUID)?crypto.randomUUID():"list-"+Date.now()+"-"+Math.random().toString(36).slice(2));
  function read(){
    try{
      const x=JSON.parse(localStorage.getItem(KEY)||"{}");
      state.collections=Array.isArray(x.collections)?x.collections.filter(a=>a&&a.id&&a.title).slice(0,200):[];
      state.ballots=(x.ballots&&typeof x.ballots==="object"&&!Array.isArray(x.ballots))?x.ballots:{};
      state.received=Array.isArray(x.received)?x.received.filter(a=>a?.id).slice(0,100):[];
    }catch{}
  }
  function persist(){
    try{localStorage.setItem(KEY,JSON.stringify(state));}catch{toast("共有リストの保存領域が不足しています");}
  }
  read();
  const snapShop=s=>({id:String(s.id||"").slice(0,100),name:clean(s.name).slice(0,100),ward:clean(s.ward).slice(0,45),genre:clean(s.genre).slice(0,55)});
  function compactList(list){
    const shops=(list.shops||[]).slice(0,12).map(s=>snapShop(s)).filter(s=>s.name);
    return {v:1,id:String(list.id||id()).slice(0,100),title:clean(list.title).slice(0,80),description:clean(list.description).slice(0,220),shops};
  }
  function encode(data){
    const bytes=new TextEncoder().encode(JSON.stringify(data));
    if(bytes.length>7000)throw Error("共有する内容が大きすぎます。店舗数を減らしてください。");
    let binary="";for(const b of bytes)binary+=String.fromCharCode(b);
    return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  }
  function decode(raw){
    if(!raw||raw.length>12000)throw Error("共有リンクが長すぎます");
    const fixed=raw.replace(/-/g,"+").replace(/_/g,"/");
    const bin=atob(fixed);
    const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
    const obj=JSON.parse(new TextDecoder().decode(bytes));
    if(obj?.v!==1||!obj.title||!Array.isArray(obj.shops))throw Error("対応していない共有リストです");
    if(obj.shops.length>12)throw Error("店舗数が多すぎます");
    return compactList(obj);
  }
  function linkOf(list){return location.origin+location.pathname+"#list="+encode(compactList(list));}
  async function deliver({title,text,url,files}){
    const options={title,text,url};
    if(files?.length)options.files=files;
    try{
      if(navigator.share&&(!files?.length||!navigator.canShare||navigator.canShare({files}))){
        await navigator.share(options);return true;
      }
    }catch(err){if(err?.name==="AbortError")return false;}
    const copy=(url?[text,url].filter(Boolean).join("\n"):text)||"";
    try{await navigator.clipboard.writeText(copy);toast("共有用テキストをコピーしました");return true}
    catch{window.prompt("コピーして共有してください",copy);return false}
  }
  function receiveHash(){
    const hash=location.hash||"";
    if(!hash.startsWith("#list="))return;
    try{incoming=decode(hash.slice(6));sharedStatus="共有リストを受信しました。保存はまだされていません。";}
    catch{incoming=null;sharedStatus="共有リンクを読み込めませんでした。";}
    try{if(typeof ui!=="undefined"){ui.tab="sns";hubView="lists"}}catch{}
  }
  receiveHash();
  window.addEventListener("hashchange",()=>{receiveHash();render();});
  const selectedSet=()=>new Set(draft.selected);
  function candidates(){
    const selected=selectedSet();
    const q=draft.lookup.normalize("NFKC").toLowerCase();
    let shops=getShops().filter(s=>!selected.has(s.id));
    if(q)shops=shops.filter(s=>[s.name,s.ward,s.genre].join(" ").normalize("NFKC").toLowerCase().includes(q));
    else shops.sort((a,b)=>(statusOf(a)==="wish"?-1:0)-(statusOf(b)==="wish"?-1:0));
    return shops.slice(0,8);
  }
  function collectionCard(list){
    return '<div class="share-list-card">'+
      '<div class="share-list-card-head"><div><strong>'+e(list.title)+'</strong><small>'+list.shops.length+'店舗</small></div>'+
      '<button class="btn tiny danger" data-action="hubDelete" data-id="'+e(list.id)+'">削除</button></div>'+
      (list.description?'<p>'+e(list.description)+'</p>':"")+
      '<div class="share-list-shopnames">'+list.shops.slice(0,5).map(s=>'<span>'+e(s.name)+'</span>').join("")+
      (list.shops.length>5?'<span>ほか'+(list.shops.length-5)+'店</span>':"")+'</div>'+
      '<div class="inline-links"><button class="btn primary" data-action="hubShare" data-id="'+e(list.id)+'">友達・グループに送る</button>'+
      '<button class="btn" data-action="hubCopy" data-id="'+e(list.id)+'">リンクをコピー</button></div></div>';
  }
  function receiverCard(list,source){
    if(!list)return "";
    const key=list.id, votes=state.ballots[key]||{};
    return '<div class="share-received"><div class="share-received-head"><strong>'+e(list.title)+'</strong>'+
      '<span class="chip">共有リスト・'+list.shops.length+'店舗</span></div>'+
      (list.description?'<p class="muted">'+e(list.description)+'</p>':"")+
      '<p class="hint">それぞれの「行きたい」に保存できます。投票は自分の端末内のメモで、友達には自動反映されません。</p>'+
      list.shops.map((s,i)=>{
        const v=!!votes[i], local=getShops().find(x=>x.id===s.id)||getShops().find(x=>x.name===s.name&&x.ward===s.ward);
        return '<div class="share-received-row"><div><strong>'+e(s.name)+'</strong><small>'+e(s.ward)+' · '+e(s.genre)+'</small></div>'+
        '<div class="inline-links"><button class="btn tiny '+(v?'primary':'')+'" data-action="hubVote" data-id="'+e(key)+'" data-index="'+i+'">'+(v?'✓ いいね済':'♡ いいね')+'</button>'+
        '<button class="btn tiny" data-action="hubSaveShop" data-id="'+e(key)+'" data-index="'+i+'">行きたい</button>'+
        '<button class="btn tiny ghost" data-action="hubMap" data-id="'+e(key)+'" data-index="'+i+'">地図 ↗</button></div></div>';
      }).join("")+
      '<div class="inline-links" style="margin-top:12px">'+
      '<button class="btn primary" data-action="hubReply" data-id="'+e(key)+'">投票結果を送る</button>'+
      (source==="incoming"?'<button class="btn" data-action="hubKeep">受け取ったリストを保存</button>':"")+
      '</div></div>';
  }
  function hubHtml(){
    const selected=draft.selected.map(x=>getShop(x)).filter(Boolean).slice(0,12);
    const picks=candidates();
    return '<section class="share-hub" id="shareHub">'+
    '<div class="share-head"><div class="share-eyebrow">YOUR PEOPLE, YOUR PLACES</div>'+
    '<h2>友達と、おいしいを共有。</h2><p>自分だけの行きたいリストから、2人やグループの店決めまで。リンクを送って気軽に共有しよう。</p></div>'+
    '<div class="share-scope"><span>自分だけの記録</span><span>友達・グループで相談</span><span>リンクをSNSに公開</span></div>'+
    '<div class="share-note">公開範囲はリンクを誰に送るかで決まります。URLを知る人は内容を見られるため、個人情報や自宅付近の行動記録は含めないでください。</div>'+
    (sharedStatus?'<p class="status-line">'+e(sharedStatus)+'</p>':"")+
    (incoming?'<div class="section-title"><h2>届いたリスト</h2></div>'+receiverCard(incoming,"incoming"):"")+
    '<div class="share-panel"><div class="share-panel-heading"><h3>新しいリストを作る</h3><small>最大12店舗</small></div>'+
    '<label class="field"><span>リスト名</span><input id="hubTitle" maxlength="80" value="'+e(draft.title)+'" placeholder="例：みんなで行きたい渋谷ごはん"></label>'+
    '<label class="field"><span>ひとこと（任意）</span><input id="hubDescription" maxlength="220" value="'+e(draft.description)+'" placeholder="週末の候補、初デートで行きたい店など"></label>'+
    '<label class="field"><span>お店を探して追加する</span><input id="hubLookup" value="'+e(draft.lookup)+'" placeholder="店名・区・ジャンルで検索" autocomplete="off"></label>'+
    '<div class="share-picks" id="hubPickerResults">'+pickerHtml(picks)+'</div>'+
    '<h4>選択中 '+selected.length+' / 12店舗</h4>'+
    '<div id="hubSelected">'+selectedHtml(selected)+'</div>'+
    '<button class="btn primary" data-action="hubCreate" '+(!selected.length?'disabled':'')+'>このリストを作る</button>'+
    '</div>'+
    (state.collections.length?'<div class="section-title"><h2>マイコレクション <small>'+state.collections.length+'件</small></h2></div>'+
      state.collections.slice().reverse().map(collectionCard).join(""):'<p class="hint">まだコレクションがありません。最初のリストを作って共有しましょう。</p>')+
    (state.received.length?'<div class="section-title"><h2>受け取って保存したリスト</h2></div>'+
      state.received.slice(-4).reverse().map(s=>receiverCard(s,"saved")).join(""):"")+
    '<div class="share-panel"><h3>共有リンクを受け取ったら</h3>'+
    '<p class="muted">友達が送ってきたこのアプリのリストURLを開くと、相手の候補が表示されます。手動で貼ることもできます。</p>'+
    '<div class="inline-links"><input id="hubLinkIn" inputmode="url" placeholder="https://ryo-9.github.io/.../#list=..." aria-label="共有リストURL" style="flex:1;min-width:170px">'+
    '<button class="btn" data-action="hubReadLink">リンクを表示</button></div></div>'+
    '<div class="share-note"><strong>公開フィードについて：</strong>この画面はログイン不要のリンク共有です。オンラインの招待制グループは上の「グループ」から利用できます。全国のユーザー投稿・公開フィード・リアルタイムチャットはまだ未実装です。</div>'+
    '</section>';
  }
  function pickerHtml(shops){
    return shops.length?shops.map(s=>'<div class="share-pick"><div><strong>'+e(s.name)+'</strong><small>'+e(s.ward)+' · '+e(s.genre)+'</small></div><button class="btn tiny" data-action="hubAdd" data-id="'+e(s.id)+'">＋ 追加</button></div>').join(""):'<p class="hint">一致するお店はありません。</p>';
  }
  function selectedHtml(shops){
    return shops.length?shops.map(s=>'<div class="share-pick selected"><div><strong>'+e(s.name)+'</strong><small>'+e(s.ward)+'</small></div><button class="btn tiny" data-action="hubRemove" data-id="'+e(s.id)+'">外す</button></div>').join(""):'<p class="hint">保存済み店舗や、検索で見つけた店を選択してください。</p>';
  }
  function syncDraft(){
    draft.title=document.getElementById("hubTitle")?.value.slice(0,80)??draft.title;
    draft.description=document.getElementById("hubDescription")?.value.slice(0,220)??draft.description;
    draft.lookup=document.getElementById("hubLookup")?.value.slice(0,100)??draft.lookup;
  }
  function updatePicker(){
    const el=document.getElementById("hubPickerResults");
    if(el)el.innerHTML=pickerHtml(candidates());
  }
  async function shareList(list){
    const url=linkOf(list);
    await deliver({title:list.title,text:"TOKYO GOURMET LOGでお店をまとめたよ。\n"+list.title+"\n候補を見て、行きたいお店に投票してね。",url});
  }
  function readUrl(value){
    try{
      const u=new URL(value.trim(),location.href);
      if(u.origin!==location.origin||u.pathname!==location.pathname)throw Error("このアプリの共有リンクを入力してください");
      const hash=u.hash;
      if(!hash.startsWith("#list="))throw Error("共有リストが付いたURLではありません");
      incoming=decode(hash.slice(6));
      sharedStatus="共有リストを受け取りました。保存するか内容を選んでください。";
      ui.tab="sns";hubView="lists";render();
    }catch(err){toast(err.message||"URLを読み取れませんでした");}
  }
  function resolveList(key){
    if(incoming?.id===key)return incoming;
    return state.received.find(x=>x.id===key)||state.collections.find(x=>x.id===key);
  }
  function saveIncoming(){
    if(!incoming)return;
    if(!state.received.some(x=>x.id===incoming.id))state.received.push(incoming);
    state.received=state.received.slice(-60);persist();sharedStatus="受信リストを端末に保存しました。";render();
  }
  function saveShopFrom(list,index){
    const s=list.shops[index];if(!s)return;
    const known=getShops().find(x=>x.id===s.id)||getShops().find(x=>x.name===s.name&&x.ward===s.ward);
    if(known){setStatus(known.id,"wish");return;}
    if(!confirm("リスト外のお店「"+s.name+"」を行きたいに追加しますか？\n同名店の所在地を確認してください。"))return;
    const newId="share-"+Date.now()+"-"+Math.random().toString(36).slice(2);
    const region=SEED.find(x=>x.ward===s.ward)?.region||"その他";
    store.custom.push({...snapShop(s),id:newId,region,seed:false,notes:"共有リストから取り込み。店舗所在地を要確認。"});
    store.mods[newId]={status:"wish"};save();render();toast("行きたいリストに追加しました");
  }
  function voteReply(list){
    const votes=state.ballots[list.id]||{};
    const chosen=list.shops.filter((_,i)=>votes[i]).map(s=>"・"+s.name).join("\n");
    const text="「"+list.title+"」の候補で行きたいお店\n"+(chosen||"まだ選んでいません")+"\n※アプリ内でリアルタイム集計はされません。";
    deliver({title:"お店選びの返事",text});
  }
  function exportLists(){
    const data={format:"tokyo-gourmet-log-social",version:1,exportedAt:new Date().toISOString(),collections:state.collections,received:state.received,ballots:state.ballots};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="gourmet-sharing-backup-"+new Date().toISOString().slice(0,10)+".json";document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  async function importLists(file){
    if(!file||file.size>2e6){toast("2MB以下のJSONを選んでください");return;}
    try{
      const data=JSON.parse(await file.text());
      if(data?.format!=="tokyo-gourmet-log-social"||!Array.isArray(data.collections))throw Error("共有リストのバックアップではありません");
      if(!confirm(data.collections.length+"件のリストを取り込みます。既存リストは残し、同じIDのリストは上書きしません。よろしいですか？"))return;
      const prevIds=new Set(state.collections.map(x=>x.id));
      for(const x of data.collections.slice(0,200)){
        const p=compactList(x);if(p.title&&!prevIds.has(p.id)){state.collections.push(p);prevIds.add(p.id);}
      }
      persist();render();toast("コレクションを取り込みました");
    }catch(err){toast(err.message||"取り込みに失敗しました");}
  }
  const originalSocialPage=socialPage;
  function hubTabs(){
    const items=[["lists","友達と共有"],["groups","グループ"],["moment","今日のひと皿"],["clips","SNSクリップ"]];
    return '<div class="hub-tabs" role="group" aria-label="つながる機能">'+
      items.map(x=>'<button class="'+(hubView===x[0]?'active':'')+'" data-action="hubView" data-view="'+x[0]+'">'+x[1]+'</button>').join("")+'</div>';
  }
  socialPage=function(){return hubTabs()+(hubView==="groups"?(window.TGLGroups?.renderPanel?.()||'<section class="panel">グループ機能を準備しています。</section>'):hubView==="moment"?momentCard():hubView==="clips"?originalSocialPage():hubHtml());};
  const originalExplore=explore;
  explore=function(){
    const original=originalExplore().replace('class="action-tile coral" data-tab="sns"','class="action-tile coral" data-tab="sns" data-action="hubShowClips"');
    return original.replace('<h2 class="home-title">','<div class="share-home-cta"><div><strong>友達と、次のお店を決めよう。</strong><small>気になる店を集めて、グループにシェア</small></div><button class="btn primary" data-tab="sns" data-action="hubShowLists">リストを共有 ↗</button></div><h2 class="home-title">');
  };
  const originalDataPage=dataPage;
  dataPage=function(){return originalDataPage()+'<div class="panel" style="margin-top:16px"><h3>共有コレクションのバックアップ</h3><p>店舗・訪問記録のJSONとは別の保存領域です。グループで作ったリストの引き継ぎに利用します。</p><div class="inline-links"><button class="btn" data-action="hubExport">コレクションを書き出す</button><label class="btn" style="position:relative;cursor:pointer">コレクションを取り込む<input id="hubImportFile" type="file" accept=".json,application/json" hidden></label></div></div>';};
  const nav= NAV.find(x=>x[0]==="sns");if(nav)nav[2]="つながる";
  // "今日のひと皿" – one intentional photo share, no cloud upload.
  function momentCard(){
    const options=getShops().slice().sort((a,b)=>statusOf(a)==="visited"?-1:statusOf(b)==="visited"?1:statusOf(a)==="wish"?-1:1).slice(0,260);
    return '<section class="moment-panel"><div class="share-eyebrow">MY REAL FOOD MOMENT</div><h3>今日のひと皿をシェア</h3>'+
      '<p class="muted">今食べた一皿を、自分の写真とひとことで。画像カードを作ってLINEやSNSに送れます。勝手に公開されることはありません。</p>'+
      '<label class="field"><span>お店</span><select id="hubMomentShop"><option value="">店名を選択</option>'+
      options.map(s=>'<option value="'+e(s.id)+'">'+e(s.name)+'（'+e(s.ward)+'）</option>').join("")+'</select></label>'+
      '<label class="field"><span>ひとこと</span><input id="hubMomentNote" maxlength="55" placeholder="今日のおすすめ、どんな味だった？"></label>'+
      '<label class="field"><span>写真（任意）</span><input id="hubMomentPhoto" type="file" accept="image/*"></label>'+
      (momentPreview?'<img class="moment-photo" src="'+e(momentPreview)+'" alt="共有する写真プレビュー">':"")+
      '<button class="btn primary" data-action="hubMomentShare">シェア画像を作る</button>'+
      '<p class="hint">写真の自動アップロードはありません。画像を実際に送信するかどうかは自分で選べます。</p></section>';
  }
  async function shareMoment(){
    const shop=getShop(document.getElementById("hubMomentShop")?.value||"");
    if(!shop){toast("お店を選んでください");return;}
    const note=clean(document.getElementById("hubMomentNote")?.value||"").slice(0,55);
    const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");canvas.width=900;canvas.height=1200;
    ctx.fillStyle="#111318";ctx.fillRect(0,0,900,1200);
    let photo=momentFile;
    if(photo){
      try{
        const image=await createImageBitmap(photo),w=image.width,h=image.height,scale=Math.max(900/w,900/h);
        ctx.drawImage(image,(900-w*scale)/2,(900-h*scale)/2,w*scale,h*scale);image.close?.();
      }catch{}
    }
    const gradient=ctx.createLinearGradient(0,780,0,1200);
    gradient.addColorStop(0,"rgba(0,0,0,0)");gradient.addColorStop(.3,"rgba(0,0,0,.7)");gradient.addColorStop(1,"rgba(0,0,0,.96)");
    ctx.fillStyle=gradient;ctx.fillRect(0,720,900,480);
    ctx.fillStyle="#fff";ctx.font="bold 25px sans-serif";ctx.fillText("TODAY'S FOOD LOG",48,950);
    ctx.font="bold 50px sans-serif";
    const title=shop.name.length>19?shop.name.slice(0,18)+"…":shop.name;
    ctx.fillText(title,48,1015);
    ctx.font="30px sans-serif";ctx.fillStyle="#e1e1e6";
    ctx.fillText((note||shop.ward).slice(0,26),48,1076);
    ctx.font="22px sans-serif";ctx.fillStyle="#ff789a";ctx.fillText("TOKYO GOURMET LOG",48,1142);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
    if(!blob){toast("画像を作成できませんでした");return;}
    const filename="gourmet-moment-"+Date.now()+".png";
    const file=new File([blob],filename,{type:"image/png"});
    if(navigator.share&&navigator.canShare?.({files:[file]})){
      try{await navigator.share({files:[file],title:"今日のひと皿",text:shop.name+" "+note});return}
      catch(err){if(err?.name==="AbortError")return}
    }
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
    toast("画像を保存しました。SNSで共有できます");
  }
  document.addEventListener("input",event=>{
    if(event.target?.id==="hubLookup"){draft.lookup=event.target.value.slice(0,100);updatePicker();}
  });
  document.addEventListener("change",event=>{
    if(event.target?.id==="hubImportFile"){importLists(event.target.files?.[0]);event.target.value="";}
    if(event.target?.id==="hubMomentPhoto"){
      momentFile=event.target.files?.[0]||null;
      if(momentPreview)URL.revokeObjectURL(momentPreview);
      momentPreview=momentFile?URL.createObjectURL(momentFile):null;
      const panel=document.querySelector(".moment-panel");
      if(panel&&momentPreview){
        let img=panel.querySelector(".moment-photo");
        if(!img){img=document.createElement("img");img.className="moment-photo";img.alt="共有する写真プレビュー";event.target.closest(".field")?.after(img);}
        img.src=momentPreview;
      }
    }
  });
  document.addEventListener("click",async event=>{
    const b=event.target.closest("[data-action]");if(!b)return;
    const a=b.dataset.action;
    if(a==="hubView"){hubView=b.dataset.view||"lists";render();return;}
    if(a==="hubShowClips"){hubView="clips";render();return;}
    if(a==="hubShowLists"){hubView="lists";render();return;}
    if(a==="hubAdd"){
      syncDraft();if(draft.selected.length>=12)return toast("共有リストは12店舗までです");
      if(!draft.selected.includes(b.dataset.id))draft.selected.push(b.dataset.id);
      render();
    }else if(a==="hubRemove"){syncDraft();draft.selected=draft.selected.filter(x=>x!==b.dataset.id);render();}
    else if(a==="hubCreate"){
      syncDraft();if(!draft.selected.length)return toast("お店を選択してください");
      const items=draft.selected.map(x=>getShop(x)).filter(Boolean).map(snapShop);
      const list=compactList({id:id(),title:draft.title.trim()||"行きたいお店リスト",description:draft.description,shops:items});
      state.collections.push(list);persist();draft={title:"",description:"",selected:[],lookup:""};render();toast("リストを作成しました。友達に共有できます");
    }else if(a==="hubDelete"){
      if(!confirm("このコレクションを削除しますか？"))return;
      state.collections=state.collections.filter(x=>x.id!==b.dataset.id);persist();render();
    }else if(a==="hubShare"||a==="hubCopy"){
      const list=state.collections.find(x=>x.id===b.dataset.id);if(!list)return;
      try{
        if(a==="hubCopy"){const link=linkOf(list);await navigator.clipboard.writeText(link);toast("共有リンクをコピーしました");}
        else await shareList(list);
      }catch(err){window.prompt("共有リンクをコピーしてください",linkOf(list));}
    }else if(a==="hubReadLink"){readUrl(document.getElementById("hubLinkIn")?.value||"");}
    else if(a==="hubKeep"){saveIncoming();}
    else if(a==="hubVote"){
      const idx=Number(b.dataset.index),key=b.dataset.id,list=resolveList(key);if(!list?.shops[idx])return;
      const votes=state.ballots[key]||{};votes[idx]=!votes[idx];state.ballots[key]=votes;persist();render();
    }else if(a==="hubReply"){const list=resolveList(b.dataset.id);if(list)voteReply(list);}
    else if(a==="hubSaveShop"){const list=resolveList(b.dataset.id);if(list)saveShopFrom(list,Number(b.dataset.index));}
    else if(a==="hubMap"){
      const list=resolveList(b.dataset.id),shop=list?.shops[Number(b.dataset.index)];if(!shop)return;
      const q="東京都 "+shop.ward+" "+shop.name;
      window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(q),"_blank","noopener,noreferrer");
    }else if(a==="hubExport"){exportLists();}
    else if(a==="hubMomentShare"){shareMoment();}
  });
  render();
})();