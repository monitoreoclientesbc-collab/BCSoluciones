import fs from "node:fs/promises";
import crypto from "node:crypto";

const zone = "America/Bogota";
const defaultEmail = "monitoreoclientesbc@gmail.com";
let storedRefreshToken = "";
let credentialFile = "";
let encryptionKey = null;

export async function configureGoogleTokenStorage(file) {
  credentialFile=file;
  const key=process.env.BC_GOOGLE_TOKEN_KEY || "";
  if(!/^[a-f0-9]{64}$/i.test(key))return;
  encryptionKey=Buffer.from(key,"hex");
  try{
    const saved=JSON.parse(await fs.readFile(file,"utf8"));
    const decipher=crypto.createDecipheriv("aes-256-gcm",encryptionKey,Buffer.from(saved.iv,"base64"));
    decipher.setAuthTag(Buffer.from(saved.tag,"base64"));
    storedRefreshToken=Buffer.concat([decipher.update(Buffer.from(saved.data,"base64")),decipher.final()]).toString("utf8");
  }catch(error){if(error.code!=="ENOENT")console.error("No fue posible recuperar la vinculación de Google:",error.message)}
}

export async function saveGoogleRefreshToken(token) {
  if(!encryptionKey)throw new Error("Falta la clave de cifrado BC_GOOGLE_TOKEN_KEY");
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",encryptionKey,iv);
  const data=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
  await fs.writeFile(credentialFile,JSON.stringify({iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),data:data.toString("base64")}),{mode:0o600});
  storedRefreshToken=token;
}

export function googleConnectReady(){return Boolean(process.env.BC_GOOGLE_CLIENT_ID&&process.env.BC_GOOGLE_CLIENT_SECRET&&encryptionKey)}
export function googleAuthorizationUrl(state,redirectUri){
  const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search=new URLSearchParams({client_id:process.env.BC_GOOGLE_CLIENT_ID,redirect_uri:redirectUri,response_type:"code",scope:"openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.send",access_type:"offline",prompt:"consent",state,login_hint:defaultEmail}).toString();
  return url.toString();
}
export async function exchangeGoogleCode(code,redirectUri){
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:process.env.BC_GOOGLE_CLIENT_ID,client_secret:process.env.BC_GOOGLE_CLIENT_SECRET,redirect_uri:redirectUri,grant_type:"authorization_code"})});
  if(!response.ok)throw new Error(`No fue posible completar la autorización de Google (${response.status})`);
  const tokens=await response.json();
  const granted=new Set(String(tokens.scope||"").split(/\s+/));
  if(!granted.has("https://www.googleapis.com/auth/calendar.events")||!granted.has("https://www.googleapis.com/auth/gmail.send"))throw new Error("Autoriza tanto Calendar como el envío de Gmail para completar la vinculación");
  const identity=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{authorization:`Bearer ${tokens.access_token}`}});
  if(!identity.ok)throw new Error("No fue posible comprobar la identidad de Google");
  const profile=await identity.json();
  if(profile.email?.toLowerCase()!==defaultEmail||profile.email_verified!==true)throw new Error("La cuenta autorizada no coincide con el correo corporativo confirmado");
  if(!tokens.refresh_token)throw new Error("Google no entregó autorización para el acceso programado");
  await saveGoogleRefreshToken(tokens.refresh_token);
  return profile.email;
}

export function colombiaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function moveDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function resolutionSchedule(expiry, today = colombiaToday()) {
  if (!validDate(expiry) || expiry < today) throw new Error("La fecha de vencimiento debe ser válida y no haber transcurrido");
  return [30, 15, 5, 0].map(days => ({days, date: moveDays(expiry, -days)})).filter(item => item.date >= today);
}

export function googleReady() {
  return Boolean(process.env.BC_GOOGLE_CLIENT_ID && process.env.BC_GOOGLE_CLIENT_SECRET && (storedRefreshToken||process.env.BC_GOOGLE_REFRESH_TOKEN));
}

export function mailReady() {
  return googleReady();
}

async function accessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:process.env.BC_GOOGLE_CLIENT_ID,client_secret:process.env.BC_GOOGLE_CLIENT_SECRET,refresh_token:storedRefreshToken||process.env.BC_GOOGLE_REFRESH_TOKEN,grant_type:"refresh_token"})});
  if (!response.ok) throw new Error(`No fue posible autenticar Google (${response.status})`);
  return (await response.json()).access_token;
}

async function googleRequest(url, options) {
  const response = await fetch(url,{...options,headers:{authorization:`Bearer ${await accessToken()}`,...options.headers}});
  if (response.status === 409) return {conflict:true};
  if (!response.ok) throw new Error(`Google rechazó la operación (${response.status})`);
  return response.json();
}

export async function createGoogleEvent(item) {
  if (!googleReady()) return null;
  const calendarId = encodeURIComponent(process.env.BC_GOOGLE_CALENDAR_ID || "primary");
  const id = `bcs${item.id.replace(/[^a-f0-9]/g, "").slice(0, 30)}`;
  const event = {id,summary:item.title,description:`${item.description || ""}\nReferencia CRM: ${item.id}`.trim(),start:{date:item.date},end:{date:moveDays(item.date,1)},reminders:{useDefault:true}};
  const base=`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
  const result=await googleRequest(base,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(event)});
  if (result.conflict) {
    const existing=await googleRequest(`${base}/${id}`,{method:"GET",headers:{}});
    return existing.htmlLink;
  }
  return result.htmlLink;
}

function encodedHeader(value) { return `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`; }

export async function sendDueEmail(item) {
  if (!mailReady()) throw new Error("Falta configurar la cuenta de Facturación o el correo de Dirección General");
  const from=process.env.BC_BILLING_EMAIL||defaultEmail,to=process.env.BC_GENERAL_EMAIL||defaultEmail;
  if (![from,to].every(value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) throw new Error("Las direcciones corporativas configuradas no son válidas");
  const subject=`Aviso programado: ${item.title}`;
  const text=`Dirección General:\n\nFacturación informa la programación del vencimiento de la resolución de numeración de facturación en el calendario institucional.\n\nCliente: ${item.resolution?.client || "No aplica"}\nNIT: ${item.resolution?.nit || "No aplica"}\nResolución: ${item.resolution?.number || "No aplica"}\nFecha programada: ${item.date}\nFecha de vencimiento: ${item.resolution?.expiry || item.date}\nActividad: ${item.title}\nEnlace de Google Calendar: ${item.googleEventUrl || "Pendiente de sincronización"}\n\nVerifique la vigencia y el agotamiento del rango autorizado. Si el rango no se ha agotado, evalúe su habilitación; si se requiere otro rango, tramite una nueva autorización ante la DIAN.\n\nDepartamento de Facturación\nBC Soluciones Empresariales SAS`;
  const raw=`From: ${from}\r\nTo: ${to}\r\nSubject: ${encodedHeader(subject)}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(text).toString("base64")}`;
  const result=await googleRequest("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({raw:Buffer.from(raw).toString("base64url")})});
  return result.id;
}
