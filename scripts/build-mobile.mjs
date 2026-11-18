import { existsSync, mkdirSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The GitHub Pages app stays at repository root.
// This script copies only deployable public assets into Capacitor's webDir.
// It never copies private data, GitHub metadata, docs, or .env files.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const files = [
  "index.html", "icon.svg", "manifest.webmanifest", "service-worker.js",
  "discovery.js", "community.js", "interactive-map.js",
  "cloud-config.js", "cloud-sync.js", "online-groups.js"
];

const config = readFileSync(join(root, "cloud-config.js"), "utf8");
if (!config.includes("sb_publishable_") || /sb_secret_|service_role\s*[:=]/i.test(config)) {
  throw new Error("Unsafe cloud client configuration: public publishable key required.");
}
for (const name of files) {
  if (!existsSync(join(root, name))) throw new Error("Missing mobile web asset: " + name);
}
if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const name of files) copyFileSync(join(root, name), join(dist, name));
console.log("Created Capacitor web bundle: " + files.length + " public assets.");
console.log("iOS app generation / signing still requires Xcode on a Mac.");
