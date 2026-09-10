import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const crmDir = path.dirname(fileURLToPath(import.meta.url));
const masterRoot = path.dirname(crmDir);
const backupRoot = path.join(masterRoot, "COPIA MAESTRA");
const reportDir = path.join(crmDir, "data", "migrations");
const now = new Date().toISOString().replaceAll(":", "-").replace(".", "-");

function isExcluded(fullPath) {
  const relative = path.relative(masterRoot, fullPath);
  const first = relative.split(path.sep)[0]?.toLowerCase();
  return first === "crm-bc-soluciones" || first === "copia maestra";
}

function inside(root, candidate) {
  const relative = path.relative(root, path.resolve(candidate));
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function collectFiles() {
  const result = [];
  const queue = [masterRoot];
  while (queue.length) {
    const current = queue.shift();
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (isExcluded(full)) continue;
      if (entry.isDirectory()) queue.push(full);
      else if (entry.isFile()) result.push(full);
    }
  }
  return result;
}

await fs.mkdir(backupRoot, { recursive: true });
await fs.mkdir(reportDir, { recursive: true });
const sources = await collectFiles();
const actions = [];

for (const source of sources) {
  const relative = path.relative(masterRoot, source);
  const destination = path.join(backupRoot, relative);
  const action = { source, destination, relative };
  try {
    if (!inside(masterRoot, source) || !inside(backupRoot, destination)) throw new Error("Ruta fuera de MASTER");
    const sourceStat = await fs.stat(source);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    let destinationStat = null;
    try { destinationStat = await fs.stat(destination); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (destinationStat && destinationStat.size === sourceStat.size) {
      action.status = "existing_verified";
    } else {
      await fs.copyFile(source, destination);
      destinationStat = await fs.stat(destination);
      if (destinationStat.size !== sourceStat.size) throw new Error(`Tamaño distinto: ${sourceStat.size} != ${destinationStat.size}`);
      await fs.utimes(destination, sourceStat.atime, sourceStat.mtime);
      action.status = "copied_verified";
    }
    action.size = sourceStat.size;
  } catch (error) {
    action.status = ["EBUSY", "EPERM"].includes(error.code) ? "locked" : "error";
    action.error = `${error.code || "ERROR"}: ${error.message}`;
  }
  actions.push(action);
}

const counts = actions.reduce((summary, action) => {
  summary[action.status] = (summary[action.status] || 0) + 1;
  return summary;
}, {});
const verifiedBytes = actions.filter(action => ["copied_verified", "existing_verified"].includes(action.status)).reduce((sum, action) => sum + action.size, 0);
const reportPath = path.join(reportDir, `${now}-copia-maestra.json`);
await fs.writeFile(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), masterRoot, backupRoot, total: actions.length, verifiedBytes, counts, actions }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ backupRoot, total: actions.length, verifiedBytes, counts, reportPath }, null, 2));

if (actions.some(action => !["copied_verified", "existing_verified"].includes(action.status))) process.exitCode = 2;
