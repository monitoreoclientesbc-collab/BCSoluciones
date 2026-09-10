import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const source = process.argv[2];
const here = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(here, "data", "cases.json");
if (!source) {
  console.error("Uso: node importar-correos.mjs <exportación.csv>");
  process.exit(1);
}

function parseCsv(text) {
  const rows=[]; let row=[], cell="", quoted=false;
  for(let i=0;i<text.length;i++){const ch=text[i], next=text[i+1];if(ch==='"'&&quoted&&next==='"'){cell+='"';i++;continue}if(ch==='"'){quoted=!quoted;continue}if(ch===','&&!quoted){row.push(cell);cell="";continue}if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell="";continue}cell+=ch;}
  if(cell||row.length){row.push(cell);rows.push(row)}
  return rows;
}
function key(value){return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"");}
function value(row, headers, names){for(const name of names){const i=headers.indexOf(key(name));if(i>=0)return String(row[i]??"").trim()}return "";}
function safeDate(value){const v=String(value||"").trim();if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;return "";}
function idFor(received, sender, subject){return `MAIL-${crypto.createHash("sha1").update(`${received}|${sender}|${subject}`).digest("hex").slice(0,10).toUpperCase()}`;}

const input = await fs.readFile(path.resolve(source), "utf8");
const rows = parseCsv(input); if(rows.length<2)throw new Error("El CSV no contiene filas de mensajes");
const headers = rows.shift().map(key);
const imported = rows.map(row=>{
  const received=value(row,headers,["Fecha","Recibido","Received"]), sender=value(row,headers,["Remitente","De","From"]), subject=value(row,headers,["Asunto","Subject"]), body=value(row,headers,["Cuerpo","Contenido","Body"]), email=value(row,headers,["Correo","Email","E-mail"])||sender;
  const client=value(row,headers,["Cliente","Nombre"])||sender||"Cliente de correo";
  return {id:idFor(received,sender,subject),received,client,identification:value(row,headers,["Identificación","Documento"]),contact:email,phone:value(row,headers,["Teléfono","Telefono","Phone"]),email,channel:"Correo",service:value(row,headers,["Servicio","Service"])||subject||"Solicitud recibida por correo",responsible:value(row,headers,["Responsable","Assigned"]),department:value(row,headers,["Departamento","Department"])||"Departamento General",due:safeDate(value(row,headers,["Vencimiento","Fecha límite","Due"])),status:"Recibido",alert:"Pendiente",source:"Correo importado",notes:body.slice(0,4000),observations:body?[{by:"Importación de correo",at:new Date().toLocaleString("es-CO"),text:body.slice(0,4000)}]:[]};
});
const existing=JSON.parse(await fs.readFile(dataFile,"utf8")); const ids=new Set(existing.map(c=>c.id)); const fresh=imported.filter(c=>!ids.has(c.id));
const backup=path.join(path.dirname(dataFile),`cases.before-mail-import-${new Date().toISOString().replace(/[:.]/g,"-")}.json`); await fs.copyFile(dataFile,backup); await fs.writeFile(dataFile,JSON.stringify([...existing,...fresh],null,2),"utf8");
console.log(JSON.stringify({source:path.resolve(source),read:imported.length,added:fresh.length,duplicates:imported.length-fresh.length,backup},null,2));
