import fs from "node:fs";
import path from "node:path";

const releaseDir = path.resolve("release");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!fs.existsSync(releaseDir)) throw new Error("release/ does not exist. Run the Windows release build first.");

const files = fs.readdirSync(releaseDir);
const exe = files.find((name) => /\.exe$/i.test(name) && !/uninstaller/i.test(name));
const yml = files.find((name) => name === "latest.yml");
const blockmap = files.find((name) => /\.blockmap$/i.test(name));
if (!exe) throw new Error("Missing Windows NSIS .exe installer.");
if (!yml) throw new Error("Missing latest.yml updater metadata.");
if (!blockmap) throw new Error("Missing Windows .blockmap updater metadata.");

const ymlText = fs.readFileSync(path.join(releaseDir, yml), "utf8");
const versionMatch = ymlText.match(/^version:\s*([^\s]+)\s*$/m);
const pathMatches = [...ymlText.matchAll(/^path:\s*([^\s]+)\s*$/gm)].map((m) => m[1].trim());
const manifestVersion = versionMatch?.[1]?.trim();
if (manifestVersion !== pkg.version) {
  throw new Error(`latest.yml version ${manifestVersion ?? "<missing>"} does not match package.json ${pkg.version}.`);
}
if (!pathMatches.includes(exe)) {
  throw new Error(`latest.yml does not reference the generated installer ${exe}.`);
}

console.log(JSON.stringify({ ok: true, version: pkg.version, installer: exe, metadata: yml, blockmap }, null, 2));
