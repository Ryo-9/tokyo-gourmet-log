import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source=readFileSync(new URL("../native-auth.js",import.meta.url),"utf8");
const valid="tokyogourmetlog://auth/callback";

function harness({launchUrl,native=true,installed=true}={}){
  const statuses=[],ops=[],listeners={};
  const app=installed?{
    async addListener(event,fn){listeners[event]=fn;},
    async getLaunchUrl(){return launchUrl?{url:launchUrl}:undefined;}
  }:null;
  const window={
    Capacitor:{isNativePlatform:()=>native,Plugins:{App:app}},
    dispatchEvent(evt){statuses.push(evt.detail?.message??"");}
  };
  const ctx={window,URL,URLSearchParams,CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts.detail;}}};
  vm.runInNewContext(source,ctx,{filename:"native-auth.js"});
  const client={auth:{
    async setSession(tokens){ops.push({method:"setSession",tokens});return {data:{session:{user:{id:"test"}}},error:null};},
    async exchangeCodeForSession(code){ops.push({method:"exchangeCodeForSession",code});return {data:{session:{user:{id:"test"}}},error:null};}
  }};
  return {bridge:window.TGLNativeAuth,client,ops,statuses,listeners};
}

test("only native installs callback listeners and advertises a fixed redirect",async()=>{
  const h=harness({native:false});
  assert.equal(h.bridge.isNative(),false);
  assert.equal(h.bridge.redirectUrl,valid);
  await h.bridge.register(h.client);
  assert.deepEqual(h.listeners,{});
});

test("native cold-start link establishes a session without logging tokens",async()=>{
  const h=harness({launchUrl:valid+"#access_token=secret-access&refresh_token=secret-refresh&type=magiclink"});
  await h.bridge.register(h.client);
  assert.equal(h.ops.length,1);
  assert.equal(h.ops[0].method,"setSession");
  assert.equal(h.ops[0].tokens.access_token,"secret-access");
  assert.equal(h.ops[0].tokens.refresh_token,"secret-refresh");
  assert.ok(h.statuses[0].includes("完了"));
  assert.ok(!h.statuses.join("").includes("secret-"));
});

test("native PKCE code callback exchanges a code instead of treating it as a token",async()=>{
  const h=harness({launchUrl:valid+"?code=one-time-code"});
  await h.bridge.register(h.client);
  assert.equal(h.ops[0].method,"exchangeCodeForSession");
  assert.equal(h.ops[0].code,"one-time-code");
});

test("ignores spoofed URL origins and unrelated deep links",async()=>{
  const h=harness({launchUrl:"https://attacker.invalid/callback#access_token=fake&refresh_token=fake"});
  await h.bridge.register(h.client);
  h.listeners.appUrlOpen({url:"tokyogourmetlog://evil/callback#access_token=fake&refresh_token=fake"});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.ops.length,0);
  assert.deepEqual(h.statuses,[]);
});

test("error callback never creates a session and emits generic feedback",async()=>{
  const h=harness({launchUrl:valid+"#error=access_denied&error_description=unsafe"});
  await h.bridge.register(h.client);
  assert.equal(h.ops.length,0);
  assert.equal(h.statuses.length,1);
  assert.ok(!h.statuses[0].includes("unsafe"));
});

test("cold-start and event duplicate process authentication only once",async()=>{
  const link=valid+"#access_token=a&refresh_token=b";
  const h=harness({launchUrl:link});
  await h.bridge.register(h.client);
  h.listeners.appUrlOpen({url:link});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.ops.length,1);
  await h.bridge.register(h.client);
  assert.equal(h.ops.length,1);
});

test("fails clearly if the native App plugin is missing",async()=>{
  const h=harness({installed:false});
  await assert.rejects(h.bridge.register(h.client),/Capacitor App/);
});
