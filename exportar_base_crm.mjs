import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const root = "C:\\Users\\Maximizando sas\\Desktop\\MASTER";
const organizedSource = path.join(root, "DEPARTAMENTO DE DIRECCIÓN GENERAL", "CONTROL CRM", "outputs", "01a06d77-9d45-78d1-8c0f-73f71a9706ca", "seguimiento_clientes_servicios_devoluciones_iva.xlsx");
const legacySource = path.join(root, "outputs", "01a06d77-9d45-78d1-8c0f-73f71a9706ca", "seguimiento_clientes_servicios_devoluciones_iva.xlsx");
const source = fsSync.existsSync(organizedSource) ? organizedSource : legacySource;
const target = path.join(root, "crm-bc-soluciones", "base-cases.js");
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
const rows = wb.worksheets.getItem("Seguimiento").getRange("A6:U205").values.filter((row) => row[0]);
const cases = rows.map((r) => ({
  id: r[0] ?? "", received: r[1] ?? "", client: r[2] ?? "", identification: r[3] ?? "", contact: r[4] ?? "", channel: r[5] ?? "", service: r[6] ?? "", responsible: r[7] ?? "", priority: r[8] ?? "", due: r[9] ?? "", status: r[10] ?? "", delivery: r[11] ?? "", value: r[12] ?? "", invoice: r[13] ?? "", invoiceStatus: r[14] ?? "", invoiceDate: r[15] ?? "", paymentDate: r[16] ?? "", daysOpen: r[17] ?? "", alert: r[18] ?? "", department: r[19] ?? "", pending: r[20] ?? "", folderPath: fsSync.existsSync(path.join(root, String(r[2] ?? ""))) ? path.join(root, String(r[2] ?? "")) : ""
}));
await fs.writeFile(target, `window.companyCases = ${JSON.stringify(cases, null, 2)};\n`, "utf8");
console.log(JSON.stringify({ target, count: cases.length }));
