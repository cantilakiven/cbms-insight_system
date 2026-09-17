import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const releaseDir = path.resolve("release");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!fs.existsSync(releaseDir)) {
  throw new Error("release/ does not exist. Run the Windows release build first.");
}

const files = fs.readdirSync(releaseDir);
const exe = files.find((name) => /\.exe$/i.test(name) && !/uninstaller/i.test(name));
const yml = files.find((name) => name.toLowerCase() === "latest.yml");
const blockmap = files.find((name) => /\.blockmap$/i.test(name));

if (!exe) throw new Error("Missing Windows NSIS .exe installer.");
if (!yml) throw new Error("Missing latest.yml updater metadata.");
if (!blockmap) throw new Error("Missing Windows .blockmap updater metadata.");

const ymlText = fs.readFileSync(path.join(releaseDir, yml), "utf8");
const versionMatch = ymlText.match(/^version:\s*([^\s]+)\s*$/m);
const manifestVersion = versionMatch?.[1]?.trim();
if (manifestVersion !== pkg.version) {
  throw new Error(`latest.yml version ${manifestVersion ?? "<missing>"} does not match package.json ${pkg.version}.`);
}

// electron-builder 27+ emits modern `files:` metadata and may omit the
// legacy top-level `path:` field. Older manifests can still contain `path:`.
// Accept both formats and URL-decode artifact names before comparing.
const candidateNames = new Set();
for (const match of ymlText.matchAll(/^path:\s*["']?([^\n"']+?)["']?\s*$/gm)) {
  candidateNames.add(match[1].trim());
}
for (const match of ymlText.matchAll(/^\s*-?\s*url:\s*["']?([^\n"']+?)["']?\s*$/gm)) {
  candidateNames.add(match[1].trim());
}
for (const match of ymlText.matchAll(/^\s*url:\s*["']?([^\n"']+?)["']?\s*$/gm)) {
  candidateNames.add(match[1].trim());
}

const decodedCandidates = [...candidateNames].map((value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
});

if (!decodedCandidates.includes(exe) && !candidateNames.has(exe)) {
  throw new Error(
    `latest.yml does not reference the generated installer ${exe}. ` +
    `Manifest candidates: ${decodedCandidates.join(", ") || "<none>"}`
  );
}

// Ensure the blockmap is the same release version when its filename carries a version.
if (!new RegExp(`(?:^|[^0-9])${pkg.version.replaceAll(".", "\\.")}(?:[^0-9]|$)`).test(blockmap)) {
  throw new Error(`Generated blockmap ${blockmap} does not appear to match release version ${pkg.version}.`);
}

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  installer: exe,
  metadata: yml,
  blockmap,
  manifestInstallerReferences: decodedCandidates,
}, null, 2));
