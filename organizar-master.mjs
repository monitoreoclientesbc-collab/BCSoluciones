import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const crmDir = path.dirname(fileURLToPath(import.meta.url));
const masterRoot = path.dirname(crmDir);
const apply = process.argv.includes("--apply");
const now = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
const reportDir = path.join(crmDir, "data", "migrations");

const departmentTargets = {
  "Gerencia": "DEPARTAMENTO DE DIRECCIÓN GENERAL",
  "Dirección General": "DEPARTAMENTO DE DIRECCIÓN GENERAL",
  "Departamento General": "DEPARTAMENTO DE ADMINISTRACIÓN",
  "Administración": "DEPARTAMENTO DE ADMINISTRACIÓN",
  "Contabilidad": "DEPARTAMENTO DE CONTABILIDAD",
  "Monitoreo contable": "DEPARTAMENTO DE MONITOREO CONTABLE",
  "Impuestos": "DEPARTAMENTO DE IMPUESTOS",
  "Seguridad Social": "DEPARTAMENTO DE SEGURIDAD SOCIAL",
  "Recursos humanos": "DEPARTAMENTO DE RECURSOS HUMANOS Y FACTURACIÓN",
  "RRHH": "DEPARTAMENTO DE RECURSOS HUMANOS Y FACTURACIÓN",
  "Facturación": "DEPARTAMENTO DE RECURSOS HUMANOS Y FACTURACIÓN",
  "Pensiones": "DEPARTAMENTO DE PENSIONES",
  "Pensiones y seguridad social": "DEPARTAMENTO DE PENSIONES",
  "Inmobiliaria": "DEPARTAMENTO DE INMOBILIARIA",
  "Comercial": "DEPARTAMENTO DE COMERCIAL",
  "Marketing": "DEPARTAMENTO DE MERCADEO Y VENTAS",
  "Mercadeo y ventas": "DEPARTAMENTO DE MERCADEO Y VENTAS",
  "Tecnología": "DEPARTAMENTO DE TECNOLOGÍA",
  "Temporales o varios": "DEPARTAMENTO DE TEMPORALES Y VARIOS"
};

const canonicalDepartmentFolders = new Set(Object.values(departmentTargets).map(value => value.toLowerCase()));
const clean = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const safeSegment = value => String(value || "SIN CLIENTE").replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "SIN CLIENTE";
const withinRoot = candidate => {
  const resolved = path.resolve(candidate);
  const relative = path.relative(masterRoot, resolved);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const baseText = await fs.readFile(path.join(crmDir, "base-cases.js"), "utf8");
const baseCases = JSON.parse(baseText.replace(/^window\.companyCases\s*=\s*/, "").replace(/;\s*$/, ""));
const storedCases = JSON.parse(await fs.readFile(path.join(crmDir, "data", "cases.json"), "utf8"));
const byId = new Map([...baseCases, ...storedCases].map(item => [item.id, item]));
const cases = [...byId.values()];
const clientEntries = cases
  .filter(item => item.client && departmentTargets[item.department])
  .map(item => ({ item, key: clean(item.client) }))
  .filter(entry => entry.key)
  .sort((a, b) => b.key.length - a.key.length);

function findClient(relativeParts) {
  for (let index = 0; index < relativeParts.length - 1; index += 1) {
    const segment = clean(relativeParts[index]);
    const exact = clientEntries.find(entry => entry.key === segment);
    if (exact) return { ...exact, index };
  }
  for (let index = 0; index < relativeParts.length - 1; index += 1) {
    const segment = clean(relativeParts[index]);
    const partial = clientEntries.find(entry => entry.key.length >= 5 && (segment.startsWith(entry.key) || segment.endsWith(entry.key)));
    if (partial) return { ...partial, index };
  }
  return null;
}

const keywordRules = [
  ["DEPARTAMENTO DE PENSIONES", /pension|colpensiones|porvenir|historia laboral|invalidez|vejez/i],
  ["DEPARTAMENTO DE SEGURIDAD SOCIAL", /seguridad social|eps|arl|afp|ugpp|pila|incapacidad|licencia maternidad/i],
  ["DEPARTAMENTO DE RECURSOS HUMANOS Y FACTURACIÓN", /nomina|contrato laboral|empleado|trabajador|vacaciones|liquidacion laboral|prestaciones sociales|factura|facturacion/i],
  ["DEPARTAMENTO DE IMPUESTOS", /\bdian\b|dmuisca|\brentas?\b|\brta pn\b|\biva\b|\bica\b|industria y c|retefuente|retencion|exogena|\bmedios\b|informacion exogena|\brut\b|declaracion|impuesto|formulario[-_ ]?(110|210|2516)|vencimientos tributarios/i],
  ["DEPARTAMENTO DE INMOBILIARIA", /inmobili|arrendamiento|arriendo|predial|propiedad horizontal/i],
  ["DEPARTAMENTO DE MERCADEO Y VENTAS", /mercadeo|marketing|publicidad|campana|redes sociales/i],
  ["DEPARTAMENTO DE COMERCIAL", /cotizacion|propuesta comercial|venta|cliente potencial/i],
  ["DEPARTAMENTO DE TECNOLOGÍA", /software|sistema|tecnologia|tecnologico|backup|servidor|dominio|hosting/i],
  ["DEPARTAMENTO DE CONTABILIDAD", /contab|balance|estado financiero|\beeff\b|banco|extracto|cartera|conciliacion|costos|compras|gastos|cuentas por cobrar|\bcxc\b/i],
  ["DEPARTAMENTO DE ADMINISTRACIÓN", /\badmon\b|camara de comercio|certificado|poder|acta|estatuto|administrativo|directorio|escritura|\brub\b|matricula/i],
  ["DEPARTAMENTO DE DIRECCIÓN GENERAL", /gerencia|direccion general|informe de gestion|planeacion|estrategia/i]
];

function classify(relativeParts) {
  const wholePath = relativeParts.join(" ");
  if (relativeParts[0].toLowerCase() === "outputs" || /base de seguimiento_clientes_servicios_por_departamento/i.test(wholePath)) {
    return { departmentFolder: "DEPARTAMENTO DE DIRECCIÓN GENERAL", client: "CONTROL CRM", matchedIndex: -1, reason: "archivo de control del CRM" };
  }
  const client = findClient(relativeParts);
  if (client) {
    return {
      departmentFolder: departmentTargets[client.item.department],
      client: safeSegment(client.item.client),
      matchedIndex: client.index,
      reason: `cliente CRM: ${client.item.client} / ${client.item.department}`
    };
  }
  const searchable = wholePath.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const rule = keywordRules.find(([, pattern]) => pattern.test(searchable));
  return {
    departmentFolder: rule?.[0] || "DEPARTAMENTO DE TEMPORALES Y VARIOS",
    client: rule ? "DOCUMENTOS GENERALES" : "POR CLASIFICAR",
    matchedIndex: -1,
    reason: rule ? `regla documental: ${rule[1]}` : "sin coincidencia suficiente"
  };
}

async function collectFiles(directory) {
  const files = [];
  const queue = [directory];
  while (queue.length) {
    const current = queue.shift();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  return files;
}

async function uniqueDestination(destination) {
  if (!fsSync.existsSync(destination)) return destination;
  const extension = path.extname(destination);
  const base = destination.slice(0, destination.length - extension.length);
  let counter = 2;
  while (fsSync.existsSync(`${base}__duplicado_${counter}${extension}`)) counter += 1;
  return `${base}__duplicado_${counter}${extension}`;
}

const topEntries = await fs.readdir(masterRoot, { withFileTypes: true });
const sourceRoots = topEntries.filter(entry => {
  if (entry.name.toLowerCase() === "crm-bc-soluciones") return false;
  if (entry.name.toLowerCase() === "copia maestra") return false;
  if (entry.isDirectory() && canonicalDepartmentFolders.has(entry.name.toLowerCase())) return false;
  return true;
});

const allFiles = [];
for (const entry of sourceRoots) {
  const full = path.join(masterRoot, entry.name);
  if (entry.isFile()) allFiles.push(full);
  else if (entry.isDirectory()) allFiles.push(...await collectFiles(full));
}

const actions = [];
for (const source of allFiles) {
  const relative = path.relative(masterRoot, source);
  const parts = relative.split(path.sep);
  const classification = classify(parts);
  const sourceGroup = parts[0];
  const tail = classification.matchedIndex >= 0 ? parts.slice(classification.matchedIndex + 1) : parts.slice(1);
  const destinationBase = path.join(masterRoot, classification.departmentFolder, classification.client, sourceGroup, ...tail);
  if (!withinRoot(source) || !withinRoot(destinationBase)) throw new Error(`Ruta fuera de MASTER: ${source} -> ${destinationBase}`);
  actions.push({ source, destination: destinationBase, ...classification });
}

const summary = Object.values(departmentTargets).filter((value, index, values) => values.indexOf(value) === index).map(folder => ({
  departmentFolder: folder,
  files: actions.filter(action => action.departmentFolder === folder).length,
  clientMatched: actions.filter(action => action.departmentFolder === folder && action.matchedIndex >= 0).length
})).filter(row => row.files).sort((a, b) => b.files - a.files);

await fs.mkdir(reportDir, { recursive: true });
const planPath = path.join(reportDir, `${now}-${apply ? "aplicado" : "plan"}.json`);

if (apply) {
  for (const folder of new Set(Object.values(departmentTargets))) await fs.mkdir(path.join(masterRoot, folder), { recursive: true });
  for (const action of actions) {
    const destination = await uniqueDestination(action.destination);
    try {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.rename(action.source, destination);
      action.destination = destination;
      action.status = "moved";
    } catch (error) {
      action.destination = destination;
      action.status = error.code === "EBUSY" || error.code === "EPERM" ? "locked" : "error";
      action.error = `${error.code || "ERROR"}: ${error.message}`;
    }
  }

  const movedByClient = new Map();
  for (const item of [...baseCases, ...storedCases]) {
    const departmentFolder = departmentTargets[item.department];
    if (!departmentFolder || !item.client) continue;
    const expected = path.join(masterRoot, departmentFolder, safeSegment(item.client));
    if (fsSync.existsSync(expected)) movedByClient.set(`${item.department}|${clean(item.client)}`, expected);
  }
  for (const action of actions.filter(action => action.matchedIndex >= 0 && action.status === "moved")) {
    const matching = clientEntries.find(entry => clean(entry.item.client) === clean(action.client) && departmentTargets[entry.item.department] === action.departmentFolder);
    if (matching) movedByClient.set(`${matching.item.department}|${clean(action.client)}`, path.join(masterRoot, action.departmentFolder, action.client));
  }
  const updatePaths = list => {
    return list.map(item => {
      const key = `${item.department}|${clean(item.client)}`;
      return movedByClient.has(key) ? { ...item, folderPath: movedByClient.get(key) } : item;
    });
  };
  const updatedBase = updatePaths(baseCases);
  const updatedStored = updatePaths(storedCases);
  await fs.writeFile(path.join(crmDir, "base-cases.js"), `window.companyCases = ${JSON.stringify(updatedBase, null, 2)};\n`, "utf8");
  await fs.writeFile(path.join(crmDir, "data", "cases.json"), `${JSON.stringify(updatedStored, null, 2)}\n`, "utf8");
}

await fs.writeFile(planPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), mode: apply ? "apply" : "dry-run", masterRoot, excluded: [...canonicalDepartmentFolders, "crm-bc-soluciones", "COPIA MAESTRA"], totalFiles: actions.length, summary, actions }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", totalFiles: actions.length, summary, planPath }, null, 2));
