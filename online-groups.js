/* TOKYO GOURMET LOG — invite-only cloud groups (beta)
 * Uses Supabase Auth + row-level security, opt-in, no location tracking,
 * no public feed, no personal visit history shared.
 */
(function(){
  "use strict";
  const state={
    started:false,loading:false,busy:false,ready:false,authSubscribed:false,me:null,
    groups:[],invites:[],sentInvites:[],selected:"",places:[],votes:[],
    error:"",notice:"",loadVersion:0
  };
  const safe=x=>esc(String(x??""));
  const short=x=>String(x??"").trim();
  const validID=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const activeGroup=()=>state.groups.find(g=>g.id===state.selected);
  const isOwner=g=>!!g&&g.owner_id===state.me?.id;
  function from(){const c=window.TGLCloud?.getClient?.();if(!c)throw Error("クラウド接続が利用できません。設定からログインしてください。");return c;}
  function buttons(){
    return '<div class="group-header"><div><div class="share-eyebrow">PRIVATE GROUPS BETA</div>'+
      '<h2>みんなで、次の一軒を。</h2><p>候補を出して、行きたいお店に投票。招待承認した友達だけが参加できるグループです。</p></div>'+
      '<button class="btn" data-group="refresh" '+(state.busy?'disabled':'')+'>更新</button></div>';
  }
  function groupCard(g){
    const selected=state.selected===g.id;
    return '<button class="tgl-group-card '+(selected?'selected':'')+'" data-group="choose" data-id="'+safe(g.id)+'">'+
      '<span><strong>'+safe(g.title)+'</strong><small>'+(isOwner(g)?'作成者':'参加中')+'</small></span>'+
      '<span aria-hidden="true">›</span></button>';
  }
  function inviteCard(inv){
    const g=state.groups.find(x=>x.id===inv.group_id);
    return '<div class="tgl-group-invite"><div><strong>'+(g?safe(g.title):'招待されたグループ')+'</strong>'+
      '<small>'+(inv.status==='accepted'?'参加を確定してください':'招待を受け取りました')+' · 招待者コード '+safe(inv.invited_by.slice(0,8))+'…</small></div>'+
      '<button class="btn primary" data-group="join" data-id="'+safe(inv.group_id)+'">'+(inv.status==='accepted'?'参加を確定':'参加する')+'</button>'+
      (inv.status==='pending'?'<button class="btn" data-group="decline" data-id="'+safe(inv.group_id)+'">辞退</button>':'')+
      '</div>';
  }
  function placesMarkup(){
    const g=activeGroup();if(!g)return "";
    const own=isOwner(g),pendingInvites=own?state.sentInvites.filter(i=>i.group_id===g.id&&i.status==="pending"):[],votedById=new Map();
    for(const vote of state.votes){
      if(!vote.choice)continue;
      let a=votedById.get(vote.place_id);
      if(!a){a={count:0,mine:false};votedById.set(vote.place_id,a);}
      a.count++;
      if(vote.user_id===state.me?.id)a.mine=true;
    }
    return '<div class="tgl-group-detail">'+
      '<h3>'+safe(g.title)+'</h3>'+(g.description?'<p>'+safe(g.description)+'</p>':'')+
      '<div class="group-subheading"><strong>みんなの候補</strong><span>'+state.places.length+'軒</span></div>'+
      (state.places.length?state.places.map(place=>{
        const vote=votedById.get(place.id)||{count:0,mine:false};
        return '<div class="group-place"><div class="group-place-content"><strong>'+safe(place.name)+'</strong>'+
          '<small>'+safe(place.area)+(place.cuisine?' · '+safe(place.cuisine):'')+'</small></div>'+
          '<div class="group-place-actions"><button class="btn '+(vote.mine?'primary':'')+'" data-group="vote" data-id="'+safe(place.id)+'">'+
          (vote.mine?'✓ 投票済み':'♡ 投票')+' · '+vote.count+'</button>'+
          '<button class="btn" data-group="maps" data-id="'+safe(place.id)+'">地図 ↗</button></div></div>';
      }).join(""):'<p class="hint">候補はまだありません。最初のお店を登録しましょう。</p>')+
      '<form class="tgl-group-form" id="tglGroupCandidateForm" data-id="'+safe(g.id)+'">'+
      '<div class="group-subheading"><strong>お店を候補に追加</strong></div>'+
      '<label class="field"><span>店名</span><input name="placeName" required maxlength="160" placeholder="例：つけ麺 道"></label>'+
      '<div class="group-form-pair"><label class="field"><span>区・エリア</span><input name="placeArea" maxlength="100" placeholder="例：葛飾区"></label>'+
      '<label class="field"><span>料理ジャンル</span><input name="placeCuisine" maxlength="80" placeholder="例：ラーメン"></label></div>'+
      '<button class="btn primary" type="submit" '+(state.busy?'disabled':'')+'>候補を追加する</button></form>'+
      (own?'<form class="tgl-group-form" id="tglGroupInviteForm" data-id="'+safe(g.id)+'">'+
        '<div class="group-subheading"><strong>友達を招待</strong></div>'+
        '<p class="hint">相手から受け取った「ユーザーコード」を入力してください。メールアドレスから勝手に検索はしません。</p>'+
        '<label class="field"><span>友達のユーザーコード</span><input name="inviteId" autocapitalize="off" required maxlength="36" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></label>'+
        '<button class="btn" type="submit" '+(state.busy?'disabled':'')+'>招待を送る</button></form>':'')+
      (own&&pendingInvites.length?'<div class="group-pending-invites"><div class="group-subheading"><strong>未承認の招待</strong><span>'+pendingInvites.length+'件</span></div>'+pendingInvites.map(i=>'<div class="group-place"><div class="group-place-content"><small>ユーザーコード '+safe(i.invited_user_id.slice(0,8))+'…</small></div><button type="button" class="btn tiny danger" data-group="cancelInvite" data-id="'+safe(i.invited_user_id)+'" data-group-id="'+safe(g.id)+'">招待を取り消す</button></div>').join("")+'</div>':"")+
      '<div class="group-manage-actions">'+
      (own?'<button type="button" class="btn danger" data-group="deleteGroup" data-id="'+safe(g.id)+'">グループを削除</button>':
      '<button type="button" class="btn danger" data-group="leaveGroup" data-id="'+safe(g.id)+'">グループを抜ける</button>')+
      '</div></div>';
  }
  function renderPanel(){
    const logged=!!state.me;
    const myInv=state.invites.filter(i=>i.invited_user_id===state.me?.id);
    const pending=myInv.filter(i=>i.status==='pending'||(i.status==='accepted'&&!state.groups.some(g=>g.id===i.group_id)));
    return '<section class="tgl-groups" id="tglGroupsPanel">'+buttons()+
      '<p class="group-privacy-note"><strong>公開範囲：</strong>このグループは招待制です。個人の訪問日・訪問メモ・現在地・写真は他の人に共有しません。グループ内の候補と投票のみを参加者で共有します。</p>'+
      (state.error?'<p class="status-line" role="alert">'+safe(state.error)+'</p>':'')+
      (state.notice?'<p class="status-line" role="status">'+safe(state.notice)+'</p>':'')+
      (state.loading?'<p class="hint">グループ情報を読み込んでいます…</p>':'')+
      (!logged?'<div class="group-guest"><h3>ログインしてグループを使う</h3>'+
      '<p>メールログインは無料です。ログインなしでも従来の個人リスト・リンク共有は使えます。</p>'+
      '<button class="btn primary" data-tab="data">設定でログインする</button></div>':
      '<div class="group-user-code"><div><small>自分のユーザーコード</small><strong>'+safe(state.me.id)+'</strong>'+
      '<p>友達から招待してもらう場合は、このコードを相手に送ってください。メールや位置情報は含みません。</p></div>'+
      '<button class="btn" data-group="copyId">コピー</button></div>'+
      (pending.length?'<div class="group-panel"><h3>届いた招待</h3>'+pending.map(inviteCard).join("")+'</div>':'')+
      '<div class="group-panel"><h3>参加しているグループ</h3>'+
      (state.groups.length?state.groups.map(groupCard).join(""):'<p class="hint">まだグループがありません。新しく作成できます。</p>')+'</div>'+
      placesMarkup()+
      '<div class="group-panel"><h3>新しいグループを作成</h3>'+
      '<form id="tglGroupCreateForm" class="tgl-group-form">'+
      '<label class="field"><span>グループ名</span><input name="groupTitle" maxlength="80" required placeholder="例：金曜グルメ部"></label>'+
      '<label class="field"><span>説明（任意）</span><input name="groupDescription" maxlength="350" placeholder="おすすめのお店を持ち寄ろう"></label>'+
      '<button type="submit" class="btn primary" '+(state.busy?'disabled':'')+'>グループを作る</button></form></div>')+
      '<p class="hint">β版：相手のユーザーコードを使った招待です。一般公開の投稿フィードや自動すれ違い検知には対応していません。</p>'+
      '</section>';
  }
  function view(){if(ui.tab==='sns'&&document.getElementById('tglGroupsPanel'))render();}
  async function ensureAuth(){
    const c=await window.TGLCloud?.ready?.();
    if(!c)throw Error("Supabase接続を利用できません。設定からログインしてください。");
    if(!state.authSubscribed){
      state.authSubscribed=true;
      c.auth.onAuthStateChange((event,session)=>{
        if(event!=="SIGNED_IN"&&event!=="SIGNED_OUT")return;
        const nextId=session?.user?.id||null,oldId=state.me?.id||null;
        if(nextId===oldId)return;
        state.me=session?.user||null;
        state.groups=[];state.invites=[];state.sentInvites=[];state.selected="";state.places=[];state.votes=[];
        state.ready=false;state.started=false;state.error="";state.notice="";
        if(document.getElementById("tglGroupsPanel"))queueMicrotask(()=>view());
      });
    }
    const {data,error}=await c.auth.getUser();
    if(error&&error.name!=='AuthSessionMissingError')throw Error("認証状態を取得できません："+error.message);
    state.me=data?.user||null;return c;
  }
  async function loadAll(){
    if(state.loading||state.busy)return;
    state.loading=true;state.error="";state.notice="";view();
    try{
      const c=await ensureAuth();
      if(!state.me){state.groups=[];state.invites=[];state.sentInvites=[];state.selected="";state.places=[];state.votes=[];state.ready=true;return;}
      const [groupsRes,invRes]=await Promise.all([
        c.from("tgl_groups").select("id,title,description,owner_id,created_at").order("created_at",{ascending:false}).limit(100),
        c.from("tgl_group_invitations").select("group_id,invited_user_id,invited_by,status,created_at")
         .eq("invited_user_id",state.me.id).in("status",["pending","accepted"]).limit(100)
      ]);
      if(groupsRes.error)throw Error("グループ取得："+groupsRes.error.message);
      if(invRes.error)throw Error("招待の取得："+invRes.error.message);
      state.groups=groupsRes.data||[];state.invites=invRes.data||[];
      if(!state.groups.some(g=>g.id===state.selected))state.selected=state.groups[0]?.id||"";
      state.ready=true;
      await loadSentInvites(c);
      await loadDetails(c);
    }catch(err){state.error=String(err.message||err);state.ready=false;}
    finally{state.loading=false;view();}
  }
  async function loadSentInvites(c){
    const owned=state.groups.filter(g=>g.owner_id===state.me?.id).map(g=>g.id);
    if(!owned.length){state.sentInvites=[];return;}
    const {data,error}=await c.from("tgl_group_invitations")
      .select("group_id,invited_user_id,status,created_at").in("group_id",owned)
      .eq("status","pending").order("created_at",{ascending:false}).limit(100);
    if(error)throw Error("送信済み招待の取得："+error.message);
    state.sentInvites=data||[];
  }
  async function loadDetails(c){
    if(!state.selected){state.places=[];state.votes=[];return;}
    const [placesRes,votesRes]=await Promise.all([
      c.from("tgl_group_places").select("id,name,area,cuisine,group_id,added_by,created_at").eq("group_id",state.selected).order("created_at",{ascending:true}).limit(150),
      c.from("tgl_group_votes").select("place_id,group_id,user_id,choice").eq("group_id",state.selected).limit(1000)
    ]);
    if(placesRes.error)throw Error("候補取得："+placesRes.error.message);
    if(votesRes.error)throw Error("投票取得："+votesRes.error.message);
    state.places=placesRes.data||[];state.votes=votesRes.data||[];
  }
  async function run(job,message){
    if(state.busy)return;
    state.busy=true;state.error="";state.notice="";view();
    try{
      const c=await ensureAuth();
      if(!state.me)throw Error("先にメールログインしてください。");
      const m=await job(c);
      if(m)state.notice=m;
    }catch(e){state.error=String(e.message||e);}
    finally{state.busy=false;view();}
  }
  async function create(form){
    const title=short(form.elements.groupTitle.value),description=short(form.elements.groupDescription.value);
    if(title.length<1||title.length>80||description.length>350)throw Error("グループ名または説明が長すぎます");
    await run(async c=>{
      const {data,error}=await c.from("tgl_groups").insert({owner_id:state.me.id,title,description}).select("id").single();
      if(error)throw Error(error.message);
      state.selected=data.id;
      await loadAllAfterAction(c);
      return "新しいグループを作成しました。";
    });
  }
  async function loadAllAfterAction(c){
    const groupResult=await c.from("tgl_groups").select("id,title,description,owner_id,created_at").order("created_at",{ascending:false}).limit(100);
    if(groupResult.error)throw Error(groupResult.error.message);
    state.groups=groupResult.data||[];
    const invitations=await c.from("tgl_group_invitations").select("group_id,invited_user_id,invited_by,status,created_at").eq("invited_user_id",state.me.id).in("status",["pending","accepted"]).limit(100);
    if(!invitations.error)state.invites=invitations.data||[];
    await loadSentInvites(c);
    await loadDetails(c);
  }
  async function invite(form){
    const groupId=form.dataset.id,inviteId=short(form.elements.inviteId.value).toLowerCase();
    if(!validID(inviteId))throw Error("有効なユーザーコードを入力してください。");
    if(inviteId===state.me?.id)throw Error("自分自身は招待できません。");
    if(!state.groups.some(g=>g.id===groupId&&g.owner_id===state.me?.id))throw Error("作成者のみ招待できます。");
    await run(async c=>{
      const {error}=await c.from("tgl_group_invitations").insert({group_id:groupId,invited_user_id:inviteId,invited_by:state.me.id});
      if(error)throw Error("招待を送れません："+error.message);
      await loadSentInvites(c);
      return "招待を作成しました。相手が「グループ」画面を開くと表示されます。";
    });
  }
  async function cancelInvite(groupId,inviteId){
    if(!state.groups.some(g=>g.id===groupId&&isOwner(g)))return;
    if(!state.sentInvites.some(i=>i.group_id===groupId&&i.invited_user_id===inviteId&&i.status==="pending"))return;
    if(!confirm("まだ承認されていない招待を取り消しますか？"))return;
    await run(async c=>{
      const {data,error}=await c.from("tgl_group_invitations").delete()
        .eq("group_id",groupId).eq("invited_user_id",inviteId).eq("status","pending")
        .select("invited_user_id");
      if(error)throw Error("招待取消："+error.message);
      if(!data?.length)throw Error("既に承認または取り消し済みです。画面を更新してください。");
      await loadSentInvites(c);
      return "未承認の招待を取り消しました。";
    });
  }
  async function join(groupId){
    const inv=state.invites.find(i=>i.group_id===groupId&&i.invited_user_id===state.me?.id);
    if(!inv)throw Error("招待を確認できません。");
    await run(async c=>{
      if(inv.status==="pending"){
        const {error}=await c.from("tgl_group_invitations").update({status:"accepted"}).eq("group_id",groupId)
         .eq("invited_user_id",state.me.id).eq("status","pending");
        if(error)throw Error("招待の承認："+error.message);
      }
      const {error:memberError}=await c.from("tgl_group_members").insert({group_id:groupId,user_id:state.me.id});
      if(memberError&&memberError.code!=="23505")throw Error("グループ参加："+memberError.message);
      state.selected=groupId;await loadAllAfterAction(c);
      return "グループに参加しました。";
    });
  }
  async function decline(groupId){
    await run(async c=>{
      const {error}=await c.from("tgl_group_invitations").update({status:"declined"})
        .eq("group_id",groupId).eq("invited_user_id",state.me.id).eq("status","pending");
      if(error)throw Error(error.message);
      state.invites=state.invites.filter(i=>i.group_id!==groupId);
      return "招待を辞退しました。";
    });
  }
  async function nominate(form){
    const groupId=form.dataset.id,name=short(form.elements.placeName.value);
    const area=short(form.elements.placeArea.value),cuisine=short(form.elements.placeCuisine.value);
    if(!name||name.length>160||area.length>100||cuisine.length>80)throw Error("店名・エリア・ジャンルを確認してください。");
    await run(async c=>{
      const {error}=await c.from("tgl_group_places").insert({group_id:groupId,added_by:state.me.id,name,area,cuisine});
      if(error)throw Error("候補の登録："+error.message);
      await loadDetails(c);return "候補に追加しました。";
    });
  }
  async function vote(placeId){
    if(!state.places.some(x=>x.id===placeId))return;
    await run(async c=>{
      const own=state.votes.find(x=>x.place_id===placeId&&x.user_id===state.me.id);
      if(own){
        const {error}=await c.from("tgl_group_votes").delete().eq("place_id",placeId).eq("user_id",state.me.id);
        if(error)throw Error("投票の取り消し："+error.message);
      }else{
        const {error}=await c.from("tgl_group_votes").insert({place_id:placeId,group_id:state.selected,user_id:state.me.id,choice:true});
        if(error)throw Error("投票："+error.message);
      }
      await loadDetails(c);
      return own?"投票を取り消しました。":"投票しました。";
    });
  }
  async function leaveGroup(groupId){
    if(!state.groups.some(g=>g.id===groupId&&!isOwner(g)))return;
    if(!confirm("このグループから退会しますか？\n候補や投票を閲覧できなくなります。"))return;
    await run(async c=>{
      const {error}=await c.from("tgl_group_members").delete().eq("group_id",groupId).eq("user_id",state.me.id);
      if(error)throw Error("退会に失敗しました："+error.message);
      const {error:invError}=await c.from("tgl_group_invitations").delete().eq("group_id",groupId).eq("invited_user_id",state.me.id);
      if(invError)throw Error("退会は完了しましたが、招待の削除に失敗しました："+invError.message);
      state.selected="";state.places=[];state.votes=[];
      await loadAllAfterAction(c);return "グループから退会しました。";
    });
  }
  async function deleteGroup(groupId){
    if(!state.groups.some(g=>g.id===groupId&&isOwner(g)))return;
    if(!confirm("本当にこのグループを削除しますか？\n招待・候補店・投票が全て削除され、元に戻せません。"))return;
    await run(async c=>{
      const {error}=await c.from("tgl_groups").delete().eq("id",groupId).eq("owner_id",state.me.id);
      if(error)throw Error("削除できません："+error.message);
      state.selected="";state.places=[];state.votes=[];
      await loadAllAfterAction(c);return "グループを削除しました。";
    });
  }
  document.addEventListener("submit",ev=>{
    const form=ev.target;
    if(!["tglGroupCreateForm","tglGroupInviteForm","tglGroupCandidateForm"].includes(form?.id))return;
    ev.preventDefault();
    if(state.busy)return;
    const runner=form.id==="tglGroupCreateForm"?()=>create(form):form.id==="tglGroupInviteForm"?()=>invite(form):()=>nominate(form);
    void runner().catch(e=>{state.error=String(e.message||e);view();});
  });
  document.addEventListener("click",ev=>{
    const b=ev.target.closest("[data-group]");if(!b)return;
    const action=b.dataset.group,groupId=b.dataset.id;
    if(action==="copyId"){
      if(!state.me)return;
      navigator.clipboard.writeText(state.me.id).then(()=>toast("ユーザーコードをコピーしました"))
        .catch(()=>window.prompt("コードをコピーしてください",state.me.id));return;
    }
    if(action==="maps"){
      const place=state.places.find(p=>p.id===groupId);if(!place)return;
      window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent([place.area,place.name].filter(Boolean).join(" ")),"_blank","noopener,noreferrer");return;
    }
    if(action==="choose"){
      state.selected=groupId;state.error="";state.places=[];state.votes=[];view();
      void run(async c=>{await loadDetails(c);return "";});return;
    }
    if(action==="refresh"){void loadAll();return;}
    if(action==="join"){void join(groupId).catch(e=>{state.error=String(e.message||e);view();});return;}
    if(action==="cancelInvite"){void cancelInvite(b.dataset.groupId,groupId).catch(e=>{state.error=String(e.message||e);view();});return;}
    if(action==="decline"){void decline(groupId).catch(e=>{state.error=String(e.message||e);view();});return;}
    if(action==="vote"){void vote(groupId);return;}
    if(action==="leaveGroup"){void leaveGroup(groupId);return;}
    if(action==="deleteGroup"){void deleteGroup(groupId);return;}
  });
  window.TGLGroups={renderPanel};
  const previousRender=render;
  render=function(){
    previousRender();
    if(document.getElementById("tglGroupsPanel")&&!state.started){
      state.started=true;void loadAll();
    }
  };
})();
