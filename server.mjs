import http from "node:http";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const masterRoot = path.dirname(here);
const dataDir = process.env.BC_DATA_DIR ? path.resolve(process.env.BC_DATA_DIR) : path.join(here, "data");
const dataFile = path.join(dataDir, "cases.json");
const tasksFile = path.join(dataDir, "tasks.json");
const recoveryFile = path.join(dataDir, "recovery-requests.json");
const userFile = path.join(dataDir, "users.json");
const activityFile = path.join(dataDir, "activity-log.json");
const localFolderFiles = ["local-cases.js", "base-cases.js", "local-users.js", "cases.json", "users.json"];
const port = Number(process.env.PORT || process.env.BC_CRM_PORT || 8787);
const mime = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8" };
const userSeeds = [
  ["direccion.general","BC_PASSWORD_DIRECCION","Dirección General",true,"Dirección General"],
  ["diego.portocarrero","BC_PASSWORD_CONTABILIDAD","Diego Portocarrero",false,"Contabilidad"],
  ["ronald.ortiz","BC_PASSWORD_MONITOREO","Ronald Ortiz",false,"Monitoreo contable"],
  ["yoleidy.camilo","BC_PASSWORD_RRHH","Yoleidy Camilo",false,"Recursos humanos"],
  ["bety.camilo","BC_PASSWORD_GENERAL","Bety Camilo",false,"Departamento General"],
  ["facturacion","BC_PASSWORD_FACTURACION","Usuario Facturación",false,"Facturación"],
  ["pensiones","BC_PASSWORD_PENSIONES","Usuario Pensiones",false,"Pensiones y seguridad social"],
  ["mercadeo.ventas","BC_PASSWORD_MERCADEO","Usuario Mercadeo",false,"Mercadeo y ventas"]
];
function usersFromEnvironment(){const missing=userSeeds.filter(([,variable])=>!process.env[variable]);if(missing.length)throw new Error(`Faltan variables de contraseña para iniciar una instalación nueva: ${missing.map(([,variable])=>variable).join(", ")}`);return userSeeds.map(([username,variable,name,all,department])=>({username,passwordHash:crypto.scryptSync(process.env[variable],username,32).toString("hex"),name,all,department}))}
const departmentFolders = {
  "Gerencia":"DEPARTAMENTO DE DIRECCIÓN GENERAL",
  "Administración":"DEPARTAMENTO DE ADMINISTRACIÓN",
  "Departamento General":"DEPARTAMENTO DE ADMINISTRACIÓN",
  "Contabilidad":"DEPARTAMENTO DE CONTABILIDAD",
  "Monitoreo contable":"DEPARTAMENTO DE MONITOREO CONTABLE",
  "Impuestos":"DEPARTAMENTO DE IMPUESTOS",
  "Seguridad Social":"DEPARTAMENTO DE SEGURIDAD SOCIAL",
  "Recursos humanos":"DEPARTAMENTO DE RECURSOS HUMANOS Y FACTURACIÓN",
  "RRHH":"DEPARTAMENTO DE RECURSOS HUMANOS Y FACTURACIÓN",
  "Facturación":"DEPARTAMENTO DE RECURSOS HUMANOS Y FACTURACIÓN",
  "Pensiones":"DEPARTAMENTO DE PENSIONES",
  "Pensiones y seguridad social":"DEPARTAMENTO DE PENSIONES",
  "Inmobiliaria":"DEPARTAMENTO DE INMOBILIARIA",
  "Comercial":"DEPARTAMENTO DE COMERCIAL",
  "Marketing":"DEPARTAMENTO DE MERCADEO Y VENTAS",
  "Mercadeo y ventas":"DEPARTAMENTO DE MERCADEO Y VENTAS",
  "Tecnología":"DEPARTAMENTO DE TECNOLOGÍA",
  "Temporales o varios":"DEPARTAMENTO DE TEMPORALES Y VARIOS",
  "Dirección General":"DEPARTAMENTO DE DIRECCIÓN GENERAL"
};
async function loadUsers(){await fs.mkdir(dataDir,{recursive:true});if(fsSync.existsSync(userFile))return JSON.parse(await fs.readFile(userFile,"utf8"));const defaultUsers=usersFromEnvironment();await fs.writeFile(userFile,JSON.stringify(defaultUsers,null,2),"utf8");return defaultUsers;}
let authUsers = await loadUsers();
const sessions = new Map();
const publicUser = (u) => ({ name:u.name, username:u.username, department:u.department, all:u.all });
function cookieValue(req, name) { return String(req.headers.cookie || "").split(";").map(v=>v.trim().split("=")).find(([key])=>key===name)?.[1] || ""; }
function sessionUser(req) { const token=cookieValue(req,"bc_session"); const session=sessions.get(token); if(!session || session.expires<Date.now()){if(token)sessions.delete(token);return null;} return session.user; }
async function logEvent(event){const log=fsSync.existsSync(activityFile)?JSON.parse(await fs.readFile(activityFile,"utf8")):[];log.push({id:crypto.randomUUID(),at:new Date().toISOString(),...event});await fs.writeFile(activityFile,JSON.stringify(log.slice(-500),null,2),"utf8");}
async function readLocalFolderData(){const files=[];for(const name of localFolderFiles){const filePath=path.join(here,name);try{const stat=await fs.stat(filePath);files.push({name,lastModified:stat.mtimeMs,size:stat.size,text:await fs.readFile(filePath,"utf8")});}catch(error){if(error.code!=="ENOENT")throw error;}}return {root:here,files};}
function safeMasterPath(candidate){const resolved=path.isAbsolute(candidate)?path.resolve(candidate):path.resolve(masterRoot,candidate);const relative=path.relative(masterRoot,resolved);return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? resolved : null;}
function normalizedName(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"");}
async function findClientFolder(item){
  const direct=safeMasterPath(item.folderPath||"");
  if(direct&&fsSync.existsSync(direct)&&fsSync.statSync(direct).isDirectory())return direct;
  const target=normalizedName(item.client); if(!target)return null;
  const roots=[];const departmentFolder=departmentFolders[item.department];
  if(departmentFolder){const departmentRoot=safeMasterPath(path.join(masterRoot,departmentFolder));if(departmentRoot&&fsSync.existsSync(departmentRoot))roots.push({dir:departmentRoot,depth:0});}
  roots.push({dir:masterRoot,depth:0});
  const candidates=[];const seen=new Set();
  while(roots.length){const current=roots.shift();const key=path.resolve(current.dir).toLowerCase();if(seen.has(key))continue;seen.add(key);const entries=await fs.readdir(current.dir,{withFileTypes:true});for(const entry of entries){if(!entry.isDirectory()||["crm-bc-soluciones","copia maestra"].includes(entry.name.toLowerCase()))continue;const full=path.join(current.dir,entry.name);const name=normalizedName(entry.name);if(name===target||name.includes(target)||target.includes(name))candidates.push(full);if(current.depth<5)roots.push({dir:full,depth:current.depth+1});}}
  if(!candidates.length)return null;
  let best=candidates[0],bestCount=-1;for(const candidate of candidates){const count=(await listPdfFiles(candidate)).length;if(count>bestCount){best=candidate;bestCount=count;}}return best;
}
async function listPdfFiles(root){const result=[];const queue=[root];while(queue.length){const dir=queue.shift();const entries=await fs.readdir(dir,{withFileTypes:true});for(const entry of entries){const full=path.join(dir,entry.name);if(entry.isDirectory())queue.push(full);else if(path.extname(entry.name).toLowerCase()===".pdf"){const stat=await fs.stat(full);result.push({path:path.relative(masterRoot,full),name:entry.name,size:stat.size,lastModified:stat.mtimeMs});}}}return result.sort((a,b)=>a.name.localeCompare(b.name,"es"));}

async function initialData() {
  await fs.mkdir(dataDir, { recursive: true });
  if (fsSync.existsSync(dataFile)) return JSON.parse(await fs.readFile(dataFile, "utf8"));
  const basePath=path.join(here,"base-cases.js"),pensionesPath=path.join(dataDir,"seed-pensiones.json");
  const base=fsSync.existsSync(basePath)?JSON.parse((await fs.readFile(basePath,"utf8")).replace(/^window\.companyCases\s*=\s*/,"").replace(/;\s*$/, "")):[];
  const pensiones=fsSync.existsSync(pensionesPath)?JSON.parse(await fs.readFile(pensionesPath,"utf8")):[];
  const byId = new Map([...base, ...pensiones].map(c => [c.id, c]));
  const cases = [...byId.values()];
  await fs.writeFile(dataFile, JSON.stringify(cases, null, 2), "utf8");
  return cases;
}

let cases = await initialData();
async function initialTasks() {
  await fs.mkdir(dataDir, { recursive: true });
  if (fsSync.existsSync(tasksFile)) return JSON.parse(await fs.readFile(tasksFile, "utf8"));
  await fs.writeFile(tasksFile, "[]", "utf8");
  return [];
}
let tasks = await initialTasks();
function json(res, status, value) { res.writeHead(status, { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "x-content-type-options":"nosniff", "access-control-allow-origin":"*" }); res.end(JSON.stringify(value)); }
async function body(req) { let text=""; for await (const chunk of req) text += chunk; return text ? JSON.parse(text) : null; }
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin":"*", "access-control-allow-methods":"GET,PUT,OPTIONS", "access-control-allow-headers":"content-type" }); return res.end(); }
    if (url.pathname === "/api/health") return json(res, 200, { ok:true, cases:cases.length });
    if (url.pathname === "/api/backup" && req.method === "GET") { const user=sessionUser(req); if(!user || !user.all)return json(res,403,{error:"Solo Dirección General puede descargar el respaldo central"}); res.writeHead(200,{"content-type":"application/json; charset=utf-8","content-disposition":`attachment; filename=bc-soluciones-backup-${new Date().toISOString().slice(0,10)}.json`}); return res.end(JSON.stringify({generatedAt:new Date().toISOString(),cases},null,2)); }
    if (url.pathname === "/api/users" && req.method === "GET") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); return json(res, 200, authUsers.map(publicUser)); }
    if (url.pathname === "/api/session" && req.method === "GET") { const user=sessionUser(req); return user ? json(res, 200, publicUser(user)) : json(res, 401, { error:"Sesión no iniciada" }); }
    if (url.pathname === "/api/login" && req.method === "POST") { const input=await body(req); const user=authUsers.find(u=>u.username===input?.username); const hash=user?crypto.scryptSync(String(input.password||""), user.username, 32).toString("hex"):""; if(!user || hash!==user.passwordHash){await logEvent({type:"login_failed",username:String(input?.username||"").slice(0,120)});return json(res,401,{error:"Usuario o contraseña incorrectos"});} const token=crypto.randomUUID(); sessions.set(token,{user,expires:Date.now()+8*60*60*1000}); await logEvent({type:"login",username:user.username,department:user.department}); const secureCookie=process.env.NODE_ENV==="production"||Boolean(process.env.RAILWAY_ENVIRONMENT);res.setHeader("set-cookie",`bc_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secureCookie?"; Secure":""}`); return json(res,200,publicUser(user)); }
    if (url.pathname === "/api/logout" && req.method === "POST") { const user=sessionUser(req); const token=cookieValue(req,"bc_session"); if(token)sessions.delete(token); if(user)await logEvent({type:"logout",username:user.username,department:user.department}); res.setHeader("set-cookie","bc_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"); return json(res,200,{ok:true}); }
    if (url.pathname === "/api/change-password" && req.method === "POST") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); const input=await body(req); const currentHash=crypto.scryptSync(String(input?.currentPassword||""),user.username,32).toString("hex"); if(currentHash!==user.passwordHash)return json(res,400,{error:"La contraseña actual no coincide"}); const next=String(input?.newPassword||""); if(next.length<10)return json(res,400,{error:"La nueva contraseña debe tener al menos 10 caracteres"}); const replacement={...user,passwordHash:crypto.scryptSync(next,user.username,32).toString("hex")}; authUsers=authUsers.map(u=>u.username===user.username?replacement:u); await fs.writeFile(userFile,JSON.stringify(authUsers,null,2),"utf8"); sessions.forEach((session,token)=>{if(session.user.username===user.username)session.user=replacement;}); await logEvent({type:"password_changed",username:user.username,department:user.department}); return json(res,200,{ok:true,message:"Contraseña actualizada"}); }
    if (url.pathname === "/api/recovery-request" && req.method === "POST") { const input=await body(req); const username=String(input?.username||"").slice(0,120); const requests=fsSync.existsSync(recoveryFile)?JSON.parse(await fs.readFile(recoveryFile,"utf8")):[]; requests.push({id:crypto.randomUUID(),username,requestedAt:new Date().toISOString(),status:"Pendiente de validación por Dirección General"}); await fs.writeFile(recoveryFile,JSON.stringify(requests,null,2),"utf8"); await logEvent({type:"recovery_request",username}); return json(res,200,{message:"Solicitud registrada. Dirección General validará tu identidad y entregará un enlace o clave temporal por el canal corporativo."}); }
    if (url.pathname === "/api/recovery-requests" && req.method === "GET") { const user=sessionUser(req); if(!user || !user.all)return json(res,403,{error:"Solo Dirección General puede consultar solicitudes"}); const requests=fsSync.existsSync(recoveryFile)?JSON.parse(await fs.readFile(recoveryFile,"utf8")):[]; return json(res,200,requests); }
    if (url.pathname === "/api/activity" && req.method === "GET") { const user=sessionUser(req); if(!user || !user.all)return json(res,403,{error:"Solo Dirección General puede consultar actividad"}); const log=fsSync.existsSync(activityFile)?JSON.parse(await fs.readFile(activityFile,"utf8")):[]; return json(res,200,log.slice(-100).reverse()); }
    if (url.pathname === "/api/tasks" && req.method === "GET") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); return json(res,200,user.all?tasks:tasks.filter(task=>task.department===user.department)); }
    if (url.pathname === "/api/tasks" && req.method === "POST") { const user=sessionUser(req); if(!user || !user.all)return json(res,403,{error:"Solo Dirección General puede asignar tareas"}); const input=await body(req); const department=String(input?.department||"").trim(); const responsible=String(input?.responsible||"").trim(); const title=String(input?.title||"").trim(); if(!department||!responsible||!title)return json(res,400,{error:"La tarea requiere título, departamento y responsable"}); const task={id:`TASK-${Date.now().toString().slice(-8)}`,title:title.slice(0,180),description:String(input?.description||"").trim().slice(0,4000),department,responsible,due:String(input?.due||"").slice(0,10),priority:["Alta","Media","Baja"].includes(input?.priority)?input.priority:"Media",status:"Pendiente",createdBy:user.name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; tasks.unshift(task); await fs.writeFile(tasksFile,JSON.stringify(tasks,null,2),"utf8"); await logEvent({type:"task_created",username:user.username,department,responsible,taskId:task.id}); return json(res,201,task); }
    if (url.pathname.startsWith("/api/tasks/") && req.method === "PUT") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); const taskId=decodeURIComponent(url.pathname.slice("/api/tasks/".length)); const current=tasks.find(task=>task.id===taskId); if(!current)return json(res,404,{error:"Tarea no encontrada"}); if(!user.all&&current.department!==user.department)return json(res,403,{error:"Esta tarea no pertenece a tu departamento"}); const input=await body(req); const nextStatus=["Pendiente","En proceso","Completada","Bloqueada"].includes(input?.status)?input.status:current.status; const next={...current,status:nextStatus,updatedAt:new Date().toISOString(),completedAt:nextStatus==="Completada"?(current.completedAt||new Date().toISOString()):""}; tasks=tasks.map(task=>task.id===taskId?next:task); await fs.writeFile(tasksFile,JSON.stringify(tasks,null,2),"utf8"); await logEvent({type:"task_updated",username:user.username,department:user.department,taskId,status:nextStatus}); return json(res,200,next); }
    if (url.pathname === "/api/local-folder/data" && req.method === "GET") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); return json(res,200,await readLocalFolderData()); }
    if (url.pathname === "/api/local-folder/documents" && req.method === "GET") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); const item=cases.find(c=>c.id===url.searchParams.get("caseId")); if(!item)return json(res,404,{error:"Caso no encontrado"}); if(!user.all&&item.department!==user.department)return json(res,403,{error:"Este departamento no puede consultar el caso"}); const folder=await findClientFolder(item); return json(res,200,{folder:folder?path.relative(masterRoot,folder):null,files:folder?await listPdfFiles(folder):[]}); }
    if (url.pathname === "/api/local-folder/pdf" && req.method === "GET") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); const caseId=url.searchParams.get("caseId"); const owningCase=cases.find(c=>c.id===caseId); if(!owningCase)return json(res,404,{error:"Caso no encontrado"}); if(!user.all&&owningCase.department!==user.department)return json(res,403,{error:"Este departamento no puede consultar el documento"}); const filePath=safeMasterPath(url.searchParams.get("path")||""); if(!filePath||path.extname(filePath).toLowerCase()!==".pdf"||!fsSync.existsSync(filePath))return json(res,404,{error:"PDF no encontrado"}); const folder=await findClientFolder(owningCase);if(!folder||!path.resolve(filePath).toLowerCase().startsWith(path.resolve(folder).toLowerCase()+path.sep))return json(res,403,{error:"El documento no pertenece a la carpeta del caso"}); res.writeHead(200,{"content-type":"application/pdf","cache-control":"no-store","x-content-type-options":"nosniff"}); return res.end(await fs.readFile(filePath)); }
    if (url.pathname === "/api/admin/reset-password" && req.method === "POST") { const user=sessionUser(req); if(!user || !user.all)return json(res,403,{error:"Solo Dirección General puede restablecer contraseñas"}); const input=await body(req); const target=authUsers.find(u=>u.username===input?.username); const next=String(input?.newPassword||""); if(!target)return json(res,404,{error:"Usuario no encontrado"}); if(next.length<10)return json(res,400,{error:"La nueva contraseña debe tener al menos 10 caracteres"}); const replacement={...target,passwordHash:crypto.scryptSync(next,target.username,32).toString("hex")}; authUsers=authUsers.map(u=>u.username===target.username?replacement:u); await fs.writeFile(userFile,JSON.stringify(authUsers,null,2),"utf8"); sessions.forEach((session,token)=>{if(session.user.username===target.username)sessions.delete(token)}); await logEvent({type:"password_reset_by_admin",username:target.username,by:user.username}); return json(res,200,{ok:true,message:"Contraseña temporal asignada"}); }
    if (url.pathname === "/api/cases" && (req.method === "GET" || req.method === "PUT")) { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); if(req.method==="GET")return json(res,200,user.all?cases:cases.filter(c=>c.department===user.department)); const next=await body(req); if(!Array.isArray(next))return json(res,400,{error:"cases debe ser una lista"}); if(next.some(c=>c.status==="Facturado"&&c.department!=="Recursos humanos"&&!c.hrApproved))return json(res,400,{error:"Un caso de otro departamento debe tener revisión de Recursos humanos antes de facturarse"}); if(user.all){cases=next;}else{const incoming=next.filter(c=>c.department===user.department);const byId=new Map(cases.map(c=>[c.id,c]));for(const item of incoming){const current=byId.get(item.id);if(!current||current.department===user.department)byId.set(item.id,item);}cases=[...byId.values()];} await fs.writeFile(dataFile,JSON.stringify(cases,null,2),"utf8"); await logEvent({type:"cases_updated",username:user.username,department:user.department,count:cases.length}); return json(res,200,{ok:true,cases:cases.length}); }
    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path.resolve(here, relative);
    const relativeCheck = path.relative(here, file);
    const normalizedRelative = relativeCheck.replaceAll("\\", "/").toLowerCase();
    if (normalizedRelative === "base-cases.js") { res.writeHead(200, { "content-type":"text/javascript; charset=utf-8", "cache-control":"no-store" }); return res.end("window.companyCases = [];\n"); }
    if (normalizedRelative === "local-users.js") { res.writeHead(200, { "content-type":"text/javascript; charset=utf-8", "cache-control":"no-store" }); return res.end("window.localPasswords = {};\n"); }
    if (normalizedRelative === "local-cases.js") { res.writeHead(200, { "content-type":"text/javascript; charset=utf-8", "cache-control":"no-store" }); return res.end("window.localCases = [];\n"); }
    const blockedExtension = [".json",".md",".mjs",".ps1",".csv"].includes(path.extname(normalizedRelative));
    const protectedStatic = normalizedRelative === "data" || normalizedRelative.startsWith("data/") || blockedExtension;
    if (protectedStatic || relativeCheck.startsWith("..") || path.isAbsolute(relativeCheck) || !fsSync.existsSync(file)) return json(res, 404, { error:"No encontrado" });
    res.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream", "cache-control":"no-store", "x-content-type-options":"nosniff" }); res.end(await fs.readFile(file));
  } catch (error) { json(res, 500, { error:String(error.message || error) }); }
});
server.listen(port, "0.0.0.0", () => console.log(`BC Soluciones CRM disponible en http://localhost:${port}`));
