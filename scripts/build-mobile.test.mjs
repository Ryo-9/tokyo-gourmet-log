import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const assets = [
  "index.html", "icon.svg", "manifest.webmanifest", "service-worker.js",
  "discovery.js", "community.js", "interactive-map.js",
  "cloud-config.js", "cloud-sync.js", "online-groups.js", "native-auth.js"
];

test("build copies only the expected public files and preserves their contents", () => {
  execFileSync(process.execPath, [join(root, "scripts/build-mobile.mjs")], { cwd: root });
  assert.deepEqual(readdirSync(dist).sort(), assets.slice().sort());
  for (const name of assets) {
    if(name==="index.html")continue; // Native-only script is intentionally injected.
    assert.deepEqual(readFileSync(join(dist, name)), readFileSync(join(root, name)), name + " must remain unchanged");
  }
  const publicIndex=readFileSync(join(root,"index.html"),"utf8");
  const nativeIndex=readFileSync(join(dist,"index.html"),"utf8");
  assert.ok(!publicIndex.includes("native-auth.js"),"Public PWA must not load a native callback");
  assert.ok(nativeIndex.includes('<script src="./native-auth.js"></script>'),"Native callback must be bundled");
  assert.ok(nativeIndex.indexOf("native-auth.js")<nativeIndex.indexOf("cloud-sync.js"),"Native auth must load before cloud sync");
  assert.equal(existsSync(join(dist, ".env")), false);
  assert.equal(existsSync(join(dist, "docs")), false);
  assert.equal(existsSync(join(dist, ".github")), false);
});

test("mobile config uses local packaged HTML, not a remote hosted shell", () => {
  const config = JSON.parse(readFileSync(join(root, "capacitor.config.json"), "utf8"));
  assert.equal(config.webDir, "dist");
  assert.equal(config.server, undefined, "Do not set a production server.url");
  assert.ok(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2,}$/i.test(config.appId));
  const index = readFileSync(join(dist, "index.html"), "utf8");
  for (const name of ["discovery.js","community.js","interactive-map.js","cloud-config.js","cloud-sync.js","online-groups.js"]) {
    assert.ok(index.includes('<script src="./' + name + '"></script>'), name + " must load in native bundle");
  }
});

test("iOS shell is not incorrectly claimed to have complete native email login", () => {
  const docs = readFileSync(join(root, "docs/IOS_PROTOTYPE.md"), "utf8");
  assert.match(docs, /メール認証|メールログイン/);
  assert.match(docs, /未検証|未対応/);
});
