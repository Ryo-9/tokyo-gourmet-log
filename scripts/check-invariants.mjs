import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const index = read("index.html");
const worker = read("service-worker.js");
const cloudConfig = read("cloud-config.js");
const groups = read("online-groups.js");
const cloud = read("cloud-sync.js");
const sql = read("docs/supabase-groups-foundation.sql");

const browserScripts = [
  "discovery.js", "community.js", "interactive-map.js",
  "cloud-config.js", "cloud-sync.js", "online-groups.js"
];
for (const file of browserScripts) {
  assert.ok(existsSync(file), "Missing app script: " + file);
  assert.ok(index.includes('<script src="./' + file + '"></script>'), "index.html does not load " + file);
  assert.ok(worker.includes("'./" + file + "'"), "Offline cache does not include " + file);
}

assert.match(cloudConfig, /sb_publishable_/, "Only a publishable Supabase key is expected");
assert.doesNotMatch(cloudConfig, /sb_secret_|service_role\s*:/i, "Never ship secret keys");
assert.match(cloud, /onAuthStateChange/, "Cloud login must have an auth-state listener");
assert.match(cloud, /exportJson\(\)/, "Keep non-destructive backup before sync");
assert.match(groups, /state\.sentInvites=\[\]/, "Clear pending invite UI on sign-out/account switch");
assert.match(groups, /async function cancelInvite\(/, "Group owner must be able to cancel pending invitations");
assert.match(groups, /\.eq\("status","pending"\)/, "Only pending invitations can be cancelled");
assert.match(groups, /\.eq\("invited_user_id",inviteId\)/, "Cancel the selected recipient's invitation");
for (const name of ["tgl_groups","tgl_group_invitations","tgl_group_members","tgl_group_places","tgl_group_votes"]) {
  assert.ok(sql.includes("alter table public." + name + " enable row level security;"), "RLS must be enabled for " + name);
}
assert.match(sql, /create policy tgl_members_join_self[\s\S]*?i\.status='accepted'/, "Joining requires accepted invitation");
assert.ok(existsSync("docs/HANDOFF_2026-11-18.md"), "Keep the project handoff");
console.log("PASS: app assets, privacy invariants, private group foundation, pending-invite cancellation.");
console.log("NOTE: Static checks do not replace Supabase RLS or 2-device end-to-end tests.");
