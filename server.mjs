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
const pensionDiagnosticsFile = path.join(dataDir, "pension-diagnostics.json");
const messagesFile = path.join(dataDir, "messages.json");
const companyProfileFile = path.join(dataDir, "company-profile.json");
const calendarFile = path.join(dataDir, "calendar.json");
const messageAttachmentsDir = path.join(dataDir, "message-attachments");
const localFolderFiles = ["local-cases.js", "base-cases.js", "local-users.js", "cases.json", "users.json"];
const port = Number(process.env.PORT || process.env.BC_CRM_PORT || 8787);
const mime = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8" };
const userSeeds = [
  ["direccion.general","BC_PASSWORD_DIRECCION","Dirección General",true,"Dirección General"],
  ["diego.portocarrero","BC_PASSWORD_CONTABILIDAD","Diego Portocarrero",false,"Contabilidad"],
  ["ronald.ortiz","BC_PASSWORD_MONITOREO","Ronald Ortiz",false,"Contabilidad"],
  ["yoleidy.camilo","BC_PASSWORD_RRHH","Yoleidy Camilo",false,"Recursos humanos"],
  ["sgsst.rrhh","BC_PASSWORD_SGSST_RRHH","BCSoluciones SG-SST y Recursos Humanos",false,"SG-SST y Recursos Humanos"],
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
  "Monitoreo contable":"DEPARTAMENTO DE CONTABILIDAD",
  "Impuestos":"DEPARTAMENTO DE IMPUESTOS",
  "Seguridad Social":"DEPARTAMENTO DE SEGURIDAD SOCIAL",
  "Recursos humanos":"DEPARTAMENTO DE RECURSOS HUMANOS Y FACTURACIÓN",
  "RRHH":"DEPARTAMENTO DE RECURSOS HUMANOS Y FACTURACIÓN",
  "SG-SST y Recursos Humanos":"DEPARTAMENTO DE RECURSOS HUMANOS Y FACTURACIÓN",
  "Gestión Humana y SG-SST":"DEPARTAMENTO DE RECURSOS HUMANOS Y FACTURACIÓN",
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
const departmentGroups = {
  "Contabilidad":["Monitoreo contable"],
  "Pensiones y Seguridad Social":["Pensiones","Seguridad Social","Pensiones y seguridad social"],
  "Dirección General, Gerencia y Administración":["Dirección General","Gerencia","Administración","Departamento General"],
  "Mercadeo, Marketing, Ventas y Comercial":["Mercadeo y ventas","Marketing","Comercial"],
  "Gestión Humana y SG-SST":["RRHH","Recursos humanos","SG-SST y Recursos Humanos","Gestión Humana y SG-SST"]
};
function departmentGroup(value){const name=String(value||"").trim();for(const [group,aliases] of Object.entries(departmentGroups)){if(name===group||aliases.includes(name))return group}return name}
function sameDepartment(first,second){return departmentGroup(first)===departmentGroup(second)}
function caseVisibleTo(item,user){return Boolean(user&&(user.all||sameDepartment(item.department,user.department)||item.createdByUsername===user.username||(Array.isArray(item.visibilityDepartments)&&item.visibilityDepartments.some(department=>sameDepartment(department,user.department)))))}
async function loadUsers(){await fs.mkdir(dataDir,{recursive:true});if(fsSync.existsSync(userFile)){const existing=JSON.parse(await fs.readFile(userFile,"utf8"));const missingSeeds=userSeeds.filter(([username])=>!existing.some(user=>user.username===username));if(missingSeeds.length){const additions=missingSeeds.map(([username,variable,name,all,department])=>({username,passwordHash:crypto.scryptSync(String(process.env[variable]||"BC-SGSST-RRHH-2026!"),username,32).toString("hex"),name,all,department}));const merged=[...existing,...additions];await fs.writeFile(userFile,JSON.stringify(merged,null,2),"utf8");return merged;}const migrated=existing.map(user=>user.username==="direccion.general"?{...user,all:true,department:"Dirección General"}:user);if(JSON.stringify(migrated)!==JSON.stringify(existing))await fs.writeFile(userFile,JSON.stringify(migrated,null,2),"utf8");return migrated;}const defaultUsers=usersFromEnvironment();await fs.writeFile(userFile,JSON.stringify(defaultUsers,null,2),"utf8");return defaultUsers;}
let authUsers = await loadUsers();
const sessions = new Map();
const publicUser = (u) => ({ name:u.name, username:u.username, department:u.department, departmentGroup:departmentGroup(u.department), all:u.all });
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
async function initialMessages(){
  await fs.mkdir(messageAttachmentsDir,{recursive:true});
  if(fsSync.existsSync(messagesFile))return JSON.parse(await fs.readFile(messagesFile,"utf8"));
  await fs.writeFile(messagesFile,"[]","utf8");return [];
}
let messages = await initialMessages();
const defaultCompanyProfile = {
  legalName: "BCSoluciones",
  economicActivity: "Servicios empresariales de apoyo administrativo, contable, tributario, laboral, pensional y gestión documental",
  sites: 1,
  workers: 1,
  contractors: 4,
  workModes: ["Presencial", "Remoto", "En campo"],
  positions: ["Director General", "Profesional Contable y Tributario", "Profesional de Seguridad Social y Nómina", "Profesional Pensional", "Profesional de SG-SST y Recursos Humanos", "Profesional Comercial, Mercadeo y Ventas"],
  jobProfiles: [
    {title:"Director General",department:"Dirección General",contractType:"Trabajador",purpose:"Dirigir BCSoluciones, aprobar decisiones y asegurar la calidad y sostenibilidad del servicio.",functions:["Definir objetivos, presupuesto, portafolio y prioridades.","Aprobar propuestas, contratos, políticas, tarifas y planes anuales.","Supervisar clientes, riesgos, indicadores, facturación y cumplimiento.","Asignar tareas, convocar reuniones y controlar compromisos en el CRM.","Resolver escalaciones comerciales, operativas y técnicas.","Revisar resultados y aprobar acciones de mejora."]},
    {title:"Profesional Contable y Tributario",department:"Contabilidad",contractType:"Contratista",purpose:"Prestar servicios contables y tributarios con soporte documental y revisión técnica.",functions:["Analizar información contable, financiera y tributaria.","Preparar declaraciones, informes, conciliaciones y respuestas a requerimientos.","Solicitar, organizar y verificar documentos de clientes.","Controlar vencimientos, obligaciones y documentos faltantes.","Registrar avances, alertas, entregables y horas o hitos facturables en el CRM.","Escalar riesgos técnicos o vencimientos a Dirección General."]},
    {title:"Profesional de Seguridad Social y Nómina",department:"Seguridad Social",contractType:"Contratista",purpose:"Gestionar trámites y obligaciones de seguridad social con trazabilidad.",functions:["Revisar afiliaciones, novedades, bases de cotización y soportes.","Gestionar liquidaciones, pagos, correcciones y conciliaciones según el alcance contratado.","Controlar fechas límite, documentos faltantes y estados de cada trámite.","Actualizar casos, evidencias, alertas y bloqueos en el CRM.","Preparar informes de gestión y soportes para facturación.","Conservar evidencias y escalar inconsistencias a Dirección General."]},
    {title:"Profesional Pensional",department:"Pensiones y seguridad social",contractType:"Contratista",purpose:"Realizar análisis y acompañamiento pensional con revisión profesional.",functions:["Revisar historias laborales, semanas, cotizaciones y documentos.","Elaborar diagnósticos preliminares, solicitudes y hojas de ruta.","Identificar requisitos, inconsistencias, riesgos y documentos pendientes.","Registrar consultas, cálculos, entregables y estado en el CRM.","Comunicar avances al cliente y documentar compromisos.","Advertir cuando se requiera concepto jurídico o revisión especializada."]},
    {title:"Profesional de SG-SST y Recursos Humanos",department:"SG-SST y Recursos Humanos",contractType:"Contrato a terceros · MAXIMIZANDO Y RECURSOS HUMANOS",purpose:"Prestar a BCSoluciones el servicio tercerizado de SG-SST, Recursos Humanos y apoyo a la facturación asociada.",functions:["Administrar el SG-SST, la política, objetivos, matriz legal y matriz de peligros.","Diseñar, ejecutar y hacer seguimiento al plan anual de trabajo, capacitaciones y simulacros.","Gestionar COPASST o Vigía, Comité de Convivencia, inspecciones, reportes, investigaciones y acciones de mejora.","Administrar selección, inducción, reinducción, expedientes, evaluaciones, permisos y retiros.","Coordinar proveedores de medicina laboral, ARL, capacitaciones y mediciones cuando aplique.","Controlar evidencias, indicadores, vencimientos, reuniones, tareas y alertas en el CRM.","Preparar informes de gestión, soportes de servicio y novedades para facturación.","Escalar riesgos críticos, incumplimientos o decisiones que correspondan a la gerencia."]},
    {title:"Profesional Comercial, Mercadeo y Ventas",department:"Comercial",contractType:"Contratista",purpose:"Generar oportunidades, posicionar los servicios de BCSoluciones y convertir prospectos en clientes.",functions:["Definir segmentos, perfiles de cliente y prioridades comerciales.","Construir y actualizar bases de prospectos, aliados y clientes en el CRM.","Diseñar campañas, contenidos, propuestas y acciones de mercadeo.","Contactar prospectos, calificar oportunidades y agendar reuniones comerciales.","Preparar propuestas económicas y coordinar la información técnica con cada área.","Registrar actividades, oportunidades, etapas, responsables y próximos pasos.","Hacer seguimiento a cotizaciones, renovaciones, referidos y satisfacción del cliente.","Entregar a Dirección General reportes de pipeline, conversión, ventas y facturación proyectada."]}
  ],
  equipment: "Computadores portátiles y de escritorio, teléfonos móviles, impresora, escáner, almacenamiento digital y herramientas ofimáticas.",
  activities: "Atención y seguimiento de clientes, análisis documental, elaboración de informes, trámites administrativos, asesoría contable, tributaria, laboral, pensional y gestión de expedientes.",
  accidents: "No se reportan accidentes ni incidentes en la línea base inicial.",
  absenteeism: "Sin información reportada en la línea base inicial.",
  affiliations: "Pendiente de completar por entidad y trabajador.",
  providers: "ARL, IPS de medicina laboral, proveedor de mediciones o capacitación especializada y soporte tecnológico.",
  occupationalHealth: "Pendiente de seleccionar o confirmar IPS habilitada para evaluaciones médicas ocupacionales.",
  hiring: "Proceso en construcción: solicitud, perfil, selección, validación documental, contrato y afiliaciones.",
  payroll: "Proceso en construcción y sujeto a confirmación del responsable interno.",
  permissions: "Solicitud al responsable, aprobación y registro de la novedad.",
  retirement: "Lista de chequeo de retiro, devolución de activos, novedades, entrevista y evaluación de egreso cuando aplique.",
  internalPolicies: "Política SG-SST, tratamiento de datos personales, convivencia laboral, desconexión y uso de herramientas digitales: pendientes de aprobación formal."
};
async function loadJsonFile(file, fallback){await fs.mkdir(dataDir,{recursive:true});if(fsSync.existsSync(file))return JSON.parse(await fs.readFile(file,"utf8"));await fs.writeFile(file,JSON.stringify(fallback,null,2),"utf8");return fallback;}
let companyProfile = await loadJsonFile(companyProfileFile, defaultCompanyProfile);
let calendarItems = await loadJsonFile(calendarFile, []);
function json(res, status, value) {
  if (res.headersSent || res.writableEnded) return false;
  res.writeHead(status, { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "x-content-type-options":"nosniff", "access-control-allow-origin":"*" });
  res.end(JSON.stringify(value));
  return true;
}
async function body(req) { let text=""; for await (const chunk of req) text += chunk; return text ? JSON.parse(text) : null; }
async function rawBody(req,limit=25*1024*1024){const chunks=[];let total=0;for await(const chunk of req){total+=chunk.length;if(total>limit)throw new Error("El mensaje supera el límite de 25 MB");chunks.push(chunk)}return Buffer.concat(chunks)}
function safeAttachmentName(name){return path.basename(String(name||"archivo")).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ._ ()-]/g,"_").slice(0,140)||"archivo"}
function parseMultipart(buffer,contentType){const match=String(contentType||"").match(/boundary=(?:"([^"]+)"|([^;]+))/i);if(!match)throw new Error("Formato de adjuntos no válido");const boundary=Buffer.from(`--${match[1]||match[2]}`);const parts=[];let cursor=buffer.indexOf(boundary);while(cursor!==-1){const start=cursor+boundary.length;if(buffer[start]===45)break;const headerStart=start+2;const separator=buffer.indexOf(Buffer.from("\r\n\r\n"),headerStart);if(separator===-1)break;const end=buffer.indexOf(boundary,separator+4);if(end===-1)break;const headers=buffer.subarray(headerStart,separator).toString("utf8");const content=buffer.subarray(separator+4,end-2);const disposition=headers.match(/name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);if(disposition)parts.push({name:disposition[1],filename:disposition[2]||"",type:(headers.match(/content-type:\s*([^\r\n]+)/i)||[])[1]||"application/octet-stream",content});cursor=end}return parts}
function messageVisible(message,user){return Boolean(user&& (user.all||message.fromUsername===user.username||message.toUsername===user.username||sameDepartment(message.toDepartment,user.department)||message.toDepartment==="Todos"))}
function publicMessage(message){return {...message,body:String(message.body||"").slice(0,10000),attachments:(message.attachments||[]).map(({id,name,size,type})=>({id,name,size,type}))}}
function attachmentAllowed(name,type){const ext=path.extname(name).toLowerCase();return [".pdf",".png",".jpg",".jpeg",".doc",".docx",".xls",".xlsx",".csv",".txt"].includes(ext)&&!/^application\/x-msdownload$/i.test(type)}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin":"*", "access-control-allow-methods":"GET,PUT,OPTIONS", "access-control-allow-headers":"content-type" }); return res.end(); }
    if (url.pathname === "/api/health") return json(res, 200, { ok:true, cases:cases.length });
    if (url.pathname === "/api/backup" && req.method === "GET") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); const backupCases=user.all?cases:cases.filter(c=>caseVisibleTo(c,user)); const scope=user.all?"Todos los departamentos":departmentGroup(user.department); const suffix=user.all?"general":normalizedText(scope).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); res.writeHead(200,{"content-type":"application/json; charset=utf-8","content-disposition":`attachment; filename=bc-soluciones-backup-${suffix}-${new Date().toISOString().slice(0,10)}.json`}); return res.end(JSON.stringify({generatedAt:new Date().toISOString(),scope,cases:backupCases},null,2)); }
    if (url.pathname === "/api/users" && req.method === "GET") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); return json(res, 200, authUsers.map(publicUser)); }
    if (url.pathname === "/api/session" && req.method === "GET") { const user=sessionUser(req); return user ? json(res, 200, publicUser(user)) : json(res, 401, { error:"Sesión no iniciada" }); }
    if (url.pathname === "/api/login" && req.method === "POST") { const input=await body(req); const user=authUsers.find(u=>u.username===input?.username); const hash=user?crypto.scryptSync(String(input.password||""), user.username, 32).toString("hex"):""; if(!user || hash!==user.passwordHash){await logEvent({type:"login_failed",username:String(input?.username||"").slice(0,120)});return json(res,401,{error:"Usuario o contraseña incorrectos"});} const token=crypto.randomUUID(); sessions.set(token,{user,expires:Date.now()+8*60*60*1000}); await logEvent({type:"login",username:user.username,department:user.department}); const secureCookie=process.env.NODE_ENV==="production"||Boolean(process.env.RAILWAY_ENVIRONMENT);res.setHeader("set-cookie",`bc_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secureCookie?"; Secure":""}`); return json(res,200,publicUser(user)); }
    if (url.pathname === "/api/logout" && req.method === "POST") { const user=sessionUser(req); const token=cookieValue(req,"bc_session"); if(token)sessions.delete(token); if(user)await logEvent({type:"logout",username:user.username,department:user.department}); res.setHeader("set-cookie","bc_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"); return json(res,200,{ok:true}); }
    if (url.pathname === "/api/change-password" && req.method === "POST") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); const input=await body(req); const currentHash=crypto.scryptSync(String(input?.currentPassword||""),user.username,32).toString("hex"); if(currentHash!==user.passwordHash)return json(res,400,{error:"La contraseña actual no coincide"}); const next=String(input?.newPassword||""); if(next.length<10)return json(res,400,{error:"La nueva contraseña debe tener al menos 10 caracteres"}); const replacement={...user,passwordHash:crypto.scryptSync(next,user.username,32).toString("hex")}; authUsers=authUsers.map(u=>u.username===user.username?replacement:u); await fs.writeFile(userFile,JSON.stringify(authUsers,null,2),"utf8"); sessions.forEach((session,token)=>{if(session.user.username===user.username)session.user=replacement;}); await logEvent({type:"password_changed",username:user.username,department:user.department}); return json(res,200,{ok:true,message:"Contraseña actualizada"}); }
    if (url.pathname === "/api/recovery-request" && req.method === "POST") { const input=await body(req); const username=String(input?.username||"").slice(0,120); const requests=fsSync.existsSync(recoveryFile)?JSON.parse(await fs.readFile(recoveryFile,"utf8")):[]; requests.push({id:crypto.randomUUID(),username,requestedAt:new Date().toISOString(),status:"Pendiente de validación por Dirección General"}); await fs.writeFile(recoveryFile,JSON.stringify(requests,null,2),"utf8"); await logEvent({type:"recovery_request",username}); return json(res,200,{message:"Solicitud registrada. Dirección General validará tu identidad y entregará un enlace o clave temporal por el canal corporativo."}); }
    if (url.pathname === "/api/recovery-requests" && req.method === "GET") { const user=sessionUser(req); if(!user || !user.all)return json(res,403,{error:"Solo Dirección General puede consultar solicitudes"}); const requests=fsSync.existsSync(recoveryFile)?JSON.parse(await fs.readFile(recoveryFile,"utf8")):[]; return json(res,200,requests); }
    if (url.pathname === "/api/activity" && req.method === "GET") { const user=sessionUser(req); if(!user || !user.all)return json(res,403,{error:"Solo Dirección General puede consultar actividad"}); const log=fsSync.existsSync(activityFile)?JSON.parse(await fs.readFile(activityFile,"utf8")):[]; return json(res,200,log.slice(-100).reverse()); }
    if (url.pathname === "/api/company-profile" && req.method === "GET") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); return json(res,200,companyProfile); }
    if (url.pathname === "/api/company-profile" && req.method === "PUT") { const user=sessionUser(req); if(!user || !user.all)return json(res,403,{error:"Solo Dirección General puede editar el perfil de la empresa"}); const input=await body(req); companyProfile={...defaultCompanyProfile,...companyProfile,...(input||{}),updatedAt:new Date().toISOString(),updatedBy:user.username}; await fs.writeFile(companyProfileFile,JSON.stringify(companyProfile,null,2),"utf8"); await logEvent({type:"company_profile_updated",username:user.username}); return json(res,200,companyProfile); }
    if (url.pathname === "/api/calendar" && req.method === "GET") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); const visible=calendarItems.filter(item=>user.all||item.department==="Todos"||sameDepartment(item.department,user.department)||item.username===user.username); return json(res,200,visible.sort((a,b)=>`${a.date} ${a.time||""}`.localeCompare(`${b.date} ${b.time||""}`))); }
    if (url.pathname === "/api/calendar" && req.method === "POST") { const user=sessionUser(req); if(!user || !user.all)return json(res,403,{error:"Solo Dirección General puede programar tareas y reuniones"}); const input=await body(req); const title=String(input?.title||"").trim(), date=String(input?.date||"").slice(0,10), department=String(input?.department||"").trim(); if(!title||!date||!department)return json(res,400,{error:"La actividad requiere título, fecha y departamento"}); const item={id:`CAL-${Date.now().toString().slice(-8)}`,type:["Tarea","Reunión"].includes(input?.type)?input.type:"Tarea",title:title.slice(0,180),description:String(input?.description||"").trim().slice(0,4000),date,time:String(input?.time||"").slice(0,5),department,username:String(input?.username||"").trim(),priority:["Alta","Media","Baja"].includes(input?.priority)?input.priority:"Media",status:"Pendiente",createdBy:user.name,createdAt:new Date().toISOString()}; calendarItems.push(item); await fs.writeFile(calendarFile,JSON.stringify(calendarItems,null,2),"utf8"); await logEvent({type:"calendar_created",username:user.username,calendarId:item.id,department:item.department}); return json(res,201,item); }
    if (url.pathname.startsWith("/api/calendar/") && req.method === "PUT") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); const id=decodeURIComponent(url.pathname.slice("/api/calendar/".length)); const current=calendarItems.find(item=>item.id===id); if(!current)return json(res,404,{error:"Actividad no encontrada"}); if(!user.all&&!sameDepartment(current.department,user.department)&&current.username!==user.username)return json(res,403,{error:"No puedes actualizar esta actividad"}); const input=await body(req); const next={...current,status:["Pendiente","En proceso","Completada","Cancelada"].includes(input?.status)?input.status:current.status,updatedAt:new Date().toISOString()}; calendarItems=calendarItems.map(item=>item.id===id?next:item); await fs.writeFile(calendarFile,JSON.stringify(calendarItems,null,2),"utf8"); await logEvent({type:"calendar_updated",username:user.username,calendarId:id,status:next.status}); return json(res,200,next); }
    if (url.pathname === "/api/messages" && req.method === "GET") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); return json(res,200,messages.filter(message=>messageVisible(message,user)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(publicMessage)); }
    if (url.pathname === "/api/messages" && req.method === "POST") {
      const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"});
      const parts=parseMultipart(await rawBody(req),req.headers["content-type"]); const fields=Object.fromEntries(parts.filter(part=>!part.filename).map(part=>[part.name,part.content.toString("utf8")]));
      const toDepartment=String(fields.toDepartment||"").trim(), subject=String(fields.subject||"").trim(), text=String(fields.body||"").trim();
      if(!toDepartment||!subject||!text)return json(res,400,{error:"El mensaje requiere departamento, asunto y contenido"});
      if(toDepartment==="Todos"&&!user.all)return json(res,403,{error:"Solo Dirección General puede enviar mensajes a todos los departamentos"});
      const files=parts.filter(part=>part.filename); if(files.length>5)return json(res,400,{error:"Puedes adjuntar hasta 5 archivos por mensaje"});
      if(files.some(part=>!attachmentAllowed(part.filename,part.type)))return json(res,400,{error:"Hay un tipo de archivo no permitido"});
      if(files.some(part=>part.content.length>10*1024*1024))return json(res,400,{error:"Cada archivo adjunto debe pesar máximo 10 MB"});
      const id=`MSG-${Date.now().toString().slice(-8)}`;const folder=path.join(messageAttachmentsDir,id);await fs.mkdir(folder,{recursive:true});const attachments=[];
      for(const part of files){const name=safeAttachmentName(part.filename);const attachmentId=crypto.randomUUID();const stored=`${attachmentId}-${name}`;await fs.writeFile(path.join(folder,stored),part.content);attachments.push({id:attachmentId,name,size:part.content.length,type:part.type,stored});}
      const message={id,fromUsername:user.username,fromName:user.name,fromDepartment:user.department,toDepartment,subject:subject.slice(0,180),body:text.slice(0,10000),createdAt:new Date().toISOString(),readBy:[],attachments};messages.unshift(message);await fs.writeFile(messagesFile,JSON.stringify(messages.slice(0,1000),null,2),"utf8");await logEvent({type:"message_sent",username:user.username,department:user.department,messageId:id,toDepartment});return json(res,201,publicMessage(message));
    }
    if (url.pathname.startsWith("/api/messages/") && url.pathname.endsWith("/read") && req.method === "PUT") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); const id=decodeURIComponent(url.pathname.slice("/api/messages/".length,-5));const message=messages.find(item=>item.id===id);if(!message)return json(res,404,{error:"Mensaje no encontrado"});if(!messageVisible(message,user))return json(res,403,{error:"No puedes consultar este mensaje"});if(!message.readBy.includes(user.username))message.readBy.push(user.username);await fs.writeFile(messagesFile,JSON.stringify(messages.slice(0,1000),null,2),"utf8");return json(res,200,{ok:true}); }
    if (url.pathname.startsWith("/api/messages/") && url.pathname.includes("/attachments/") && req.method === "GET") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); const pieces=url.pathname.split("/");const id=decodeURIComponent(pieces[3]||"");const attachmentId=decodeURIComponent(pieces[5]||"");const message=messages.find(item=>item.id===id);if(!message)return json(res,404,{error:"Mensaje no encontrado"});if(!messageVisible(message,user))return json(res,403,{error:"No puedes consultar este adjunto"});const attachment=(message.attachments||[]).find(item=>item.id===attachmentId);if(!attachment)return json(res,404,{error:"Adjunto no encontrado"});const filePath=path.join(messageAttachmentsDir,id,attachment.stored);if(!fsSync.existsSync(filePath))return json(res,404,{error:"Archivo no encontrado"});res.writeHead(200,{"content-type":attachment.type||"application/octet-stream","content-disposition":`inline; filename="${attachment.name.replace(/"/g,"")}"`,"cache-control":"no-store","x-content-type-options":"nosniff"});return res.end(await fs.readFile(filePath)); }
    if (url.pathname === "/api/tasks" && req.method === "GET") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); return json(res,200,user.all?tasks:tasks.filter(task=>sameDepartment(task.department,user.department))); }
    if (url.pathname === "/api/tasks" && req.method === "POST") { const user=sessionUser(req); if(!user || !user.all)return json(res,403,{error:"Solo Dirección General puede asignar tareas"}); const input=await body(req); const department=String(input?.department||"").trim(); const responsible=String(input?.responsible||"").trim(); const title=String(input?.title||"").trim(); if(!department||!responsible||!title)return json(res,400,{error:"La tarea requiere título, departamento y responsable"}); const task={id:`TASK-${Date.now().toString().slice(-8)}`,title:title.slice(0,180),description:String(input?.description||"").trim().slice(0,4000),department,responsible,due:String(input?.due||"").slice(0,10),priority:["Alta","Media","Baja"].includes(input?.priority)?input.priority:"Media",status:"Pendiente",createdBy:user.name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; tasks.unshift(task); await fs.writeFile(tasksFile,JSON.stringify(tasks,null,2),"utf8"); await logEvent({type:"task_created",username:user.username,department,responsible,taskId:task.id}); return json(res,201,task); }
    if (url.pathname.startsWith("/api/tasks/") && req.method === "PUT") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); const taskId=decodeURIComponent(url.pathname.slice("/api/tasks/".length)); const current=tasks.find(task=>task.id===taskId); if(!current)return json(res,404,{error:"Tarea no encontrada"}); if(!user.all&&!sameDepartment(current.department,user.department))return json(res,403,{error:"Esta tarea no pertenece a tu departamento"}); const input=await body(req); const nextStatus=["Pendiente","En proceso","Completada","Bloqueada"].includes(input?.status)?input.status:current.status; const next={...current,status:nextStatus,updatedAt:new Date().toISOString(),completedAt:nextStatus==="Completada"?(current.completedAt||new Date().toISOString()):""}; tasks=tasks.map(task=>task.id===taskId?next:task); await fs.writeFile(tasksFile,JSON.stringify(tasks,null,2),"utf8"); await logEvent({type:"task_updated",username:user.username,department:user.department,taskId,status:nextStatus}); return json(res,200,next); }
    if (url.pathname === "/api/local-folder/data" && req.method === "GET") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); return json(res,200,await readLocalFolderData()); }
    if (url.pathname === "/api/local-folder/documents" && req.method === "GET") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); const item=cases.find(c=>c.id===url.searchParams.get("caseId")); if(!item)return json(res,404,{error:"Caso no encontrado"}); if(!caseVisibleTo(item,user))return json(res,403,{error:"Este departamento no puede consultar el caso"}); const folder=await findClientFolder(item); return json(res,200,{folder:folder?path.relative(masterRoot,folder):null,files:folder?await listPdfFiles(folder):[]}); }
    if (url.pathname === "/api/local-folder/pdf" && req.method === "GET") { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); const caseId=url.searchParams.get("caseId"); const owningCase=cases.find(c=>c.id===caseId); if(!owningCase)return json(res,404,{error:"Caso no encontrado"}); if(!caseVisibleTo(owningCase,user))return json(res,403,{error:"Este departamento no puede consultar el documento"}); const filePath=safeMasterPath(url.searchParams.get("path")||""); if(!filePath||path.extname(filePath).toLowerCase()!==".pdf"||!fsSync.existsSync(filePath))return json(res,404,{error:"PDF no encontrado"}); const folder=await findClientFolder(owningCase);if(!folder||!path.resolve(filePath).toLowerCase().startsWith(path.resolve(folder).toLowerCase()+path.sep))return json(res,403,{error:"El documento no pertenece a la carpeta del caso"}); res.writeHead(200,{"content-type":"application/pdf","cache-control":"no-store","x-content-type-options":"nosniff"}); return res.end(await fs.readFile(filePath)); }
    if (url.pathname === "/api/admin/reset-password" && req.method === "POST") { const user=sessionUser(req); if(!user || !user.all)return json(res,403,{error:"Solo Dirección General puede restablecer contraseñas"}); const input=await body(req); const target=authUsers.find(u=>u.username===input?.username); const next=String(input?.newPassword||""); if(!target)return json(res,404,{error:"Usuario no encontrado"}); if(next.length<10)return json(res,400,{error:"La nueva contraseña debe tener al menos 10 caracteres"}); const replacement={...target,passwordHash:crypto.scryptSync(next,target.username,32).toString("hex")}; authUsers=authUsers.map(u=>u.username===target.username?replacement:u); await fs.writeFile(userFile,JSON.stringify(authUsers,null,2),"utf8"); sessions.forEach((session,token)=>{if(session.user.username===target.username)sessions.delete(token)}); await logEvent({type:"password_reset_by_admin",username:target.username,by:user.username}); return json(res,200,{ok:true,message:"Contraseña temporal asignada"}); }
    if (url.pathname === "/api/pension-diagnostics" && (req.method === "GET" || req.method === "POST")) { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); if(!user.all && !/pension/i.test(user.department))return json(res,403,{error:"Este módulo pertenece al Departamento de Pensiones"}); const list=fsSync.existsSync(pensionDiagnosticsFile)?JSON.parse(await fs.readFile(pensionDiagnosticsFile,"utf8")):[]; if(req.method==="GET")return json(res,200,user.all?list:list.filter(x=>x.ownerDepartment===user.department)); const input=await body(req); const item={...input,id:input?.id||`PEN-${Date.now().toString().slice(-8)}`,createdAt:new Date().toISOString(),createdBy:user.name,ownerDepartment:user.department}; list.unshift(item); await fs.writeFile(pensionDiagnosticsFile,JSON.stringify(list.slice(0,500),null,2),"utf8"); await logEvent({type:"pension_diagnostic_created",username:user.username,diagnosticId:item.id}); return json(res,201,item); }
    if (url.pathname === "/api/cases" && (req.method === "GET" || req.method === "PUT")) { const user=sessionUser(req); if(!user)return json(res,401,{error:"Sesión no iniciada"}); if(req.method==="GET")return json(res,200,user.all?cases:cases.filter(c=>caseVisibleTo(c,user))); const next=await body(req); if(!Array.isArray(next))return json(res,400,{error:"cases debe ser una lista"}); if(next.some(c=>c.status==="Facturado"&&c.department!=="Recursos humanos"&&!c.hrApproved))return json(res,400,{error:"Un caso de otro departamento debe tener revisión de Recursos humanos antes de facturarse"}); if(user.all){cases=next;}else{const incoming=next.filter(c=>sameDepartment(c.department,user.department)||c.createdByUsername===user.username);const byId=new Map(cases.map(c=>[c.id,c]));for(const item of incoming){const current=byId.get(item.id);if(!current||sameDepartment(current.department,user.department)||current.createdByUsername===user.username)byId.set(item.id,item);}cases=[...byId.values()];} await fs.writeFile(dataFile,JSON.stringify(cases,null,2),"utf8"); await logEvent({type:"cases_updated",username:user.username,department:user.department,count:cases.length}); return json(res,200,{ok:true,cases:cases.length}); }
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
    const content = await fs.readFile(file);
    if (res.writableEnded) return;
    res.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream", "cache-control":"no-store", "x-content-type-options":"nosniff" });
    res.end(content);
  } catch (error) {
    if (!json(res, 500, { error:String(error.message || error) }) && !res.writableEnded) res.destroy(error);
  }
});
server.listen(port, "0.0.0.0", () => console.log(`BC Soluciones CRM disponible en http://localhost:${port}`));
