/* TOKYO GOURMET LOG — Capacitor-only Supabase magic-link callback.
 * Packaged into the iOS build only. GitHub Pages still uses its original web login.
 * Requires @capacitor/app and a registered URL scheme + Supabase redirect allowlist.
 */
(function(){
  "use strict";
  const RETURN_URL="tokyogourmetlog://auth/callback";
  let registered=false;

  function isNative(){
    return !!window.Capacitor?.isNativePlatform?.();
  }
  function parseReturn(raw){
    if(typeof raw!=="string"||raw.length>8192)return null;
    let u;
    try{u=new URL(raw);}catch{return null;}
    if(u.protocol!=="tokyogourmetlog:"||u.hostname!=="auth"||u.pathname!=="/callback")return null;
    const params=new URLSearchParams(u.search);
    for(const [key,value] of new URLSearchParams(u.hash.replace(/^#/,""))){
      if(!params.has(key))params.set(key,value);
    }
    if(params.has("error")||params.has("error_description"))return {error:true};
    const access=params.get("access_token"),refresh=params.get("refresh_token"),code=params.get("code");
    if(access&&refresh)return {access_token:access,refresh_token:refresh};
    if(code)return {code};
    return {error:true};
  }
  function report(ok){
    // Never include credentials or raw auth URLs in messages, logs or DOM.
    window.dispatchEvent(new CustomEvent("tgl-native-auth-status",{detail:{
      message:ok?"iPhoneアプリへのログインが完了しました。":"ログイン用リンクを確認できませんでした。もう一度ログイン用メールを送信してください。"
    }}));
  }
  async function register(client){
    if(!isNative())return;
    const app=window.Capacitor?.Plugins?.App;
    if(!app?.addListener||!app?.getLaunchUrl)throw Error("Capacitor Appプラグインがありません。iOSアプリを同期し直してください。");
    if(registered)return;
    registered=true;
    const recent=new Set();
    async function receive(raw){
      const callback=parseReturn(raw);
      if(!callback)return;
      // Duplicate appUrlOpen/getLaunchUrl events should never consume the same token twice.
      if(recent.has(raw))return;
      recent.add(raw);
      if(recent.size>5)recent.clear();
      if(callback.error){report(false);return;}
      try{
        const result=callback.code?
          await client.auth.exchangeCodeForSession(callback.code):
          await client.auth.setSession({access_token:callback.access_token,refresh_token:callback.refresh_token});
        report(!result.error&&!!result.data?.session);
      }catch{
        report(false);
      }
    }
    await app.addListener("appUrlOpen",event=>{void receive(event?.url);});
    const launched=await app.getLaunchUrl();
    if(launched?.url)await receive(launched.url);
  }
  window.TGLNativeAuth=Object.freeze({isNative,redirectUrl:RETURN_URL,register});
})();
