# CRM BC Soluciones — contexto técnico, funcional y operativo

**Documento:** contexto integral del aplicativo  
**Organización:** BC SOLUCIONES EMPRESARIALES SAS — NIT 901629636  
**Sede:** Cali, Colombia  
**Versión documentada:** 25 de septiembre de 2026  
**Estado:** piloto controlado publicado en Railway  
**URL productiva:** <https://bcsoluciones-production.up.railway.app/>  
**Repositorio:** <https://github.com/monitoreoclientesbc-collab/BCSoluciones>

> Describe el estado real del código y su relación con el Manual operativo BCSoluciones v2.5. No sustituye el manual aprobado, las políticas de tratamiento de datos, los contratos ni las validaciones profesionales.

## 1. Propósito y alcance

El CRM es una aplicación web interna para centralizar casos, clientes, prospectos, tareas, alertas, mensajes, documentos y seguimiento de servicios. Busca asegurar trazabilidad: área, responsable, estado, vencimiento, evidencias, observaciones y decisiones.

La adaptación prioritaria incorpora el control de vencimiento de resoluciones de facturación de la DIAN:

- Facturación y Dirección General registran cliente, NIT, resolución y fecha exacta de vencimiento.
- Se programan avisos a 30, 15 y 5 días antes, además del evento del vencimiento.
- Se omiten fechas ya transcurridas y se evita duplicar la misma resolución por NIT, número y fecha.
- Dirección General puede monitorear y crear tareas, reuniones o eventos generales.
- Las actividades se enlazan con Google Calendar y los vencimientos generan un correo desde Facturación hacia Dirección General mediante Gmail.
- La descripción exige verificar la vigencia y el agotamiento del rango autorizado; el CRM no afirma que el recordatorio sea una renovación efectivamente realizada.

La cuenta corporativa autorizada es `monitoreoclientesbc@gmail.com`, utilizada para Calendar/Gmail y como dirección de facturación y dirección general.

## 2. Páginas y módulos

| Módulo | Función | Acceso |
|---|---|---|
| Resumen | Indicadores de casos, estados, alertas, vencidos y carga por departamento. | Todos; Dirección General ve el consolidado. |
| Casos y servicios | Expediente, responsable, estado, vencimiento, entrega, factura, pago, procedencia y observaciones. | Departamento; Dirección General transversal. |
| Alertas | Casos vencidos, próximos a vencer, mora, falta de información y críticos. | Alcance del usuario. |
| Clientes | Consulta agrupada de clientes y casos. | Alcance del usuario. |
| Prospectos QR | Lectura de hoja CSV, clasificación por servicio y conversión controlada a caso. | Perfiles autorizados. |
| Gestión documental | Carpetas y PDF del expediente, con validación de ruta y permisos. | Casos autorizados. |
| Diagnóstico pensional | Datos, cálculo preliminar, requisitos, observaciones y reporte de apoyo. | Pensiones y Dirección General. |
| Tareas | Responsable, área, prioridad, vencimiento y estado. | Área; Dirección General asigna. |
| Mensajes | Comunicación interdepartamental y adjuntos permitidos. | Usuarios autorizados. |
| Agenda y alertas | Agenda DIAN, tareas, reuniones, eventos, monitoreo y enlace Google. | Facturación y Dirección General. |
| Perfil de BCSoluciones | Información institucional, equipo, modalidades, proveedores y cargos. | Consulta; edición de Dirección General. |
| Asistente de control | Consultas operativas sobre alertas, cartera, carga y documentos. | Dirección General. |
| Administración | Usuarios, departamentos, recuperación y bitácora. | Dirección General. |

### Flujo de caso

1. Registrar cliente, servicio, área, responsable, canal y fecha límite.
2. Actualizar estado, faltantes, entrega, factura, pago y observaciones.
3. El servidor valida visibilidad y registra la actividad.
4. Dirección General revisa el tablero y escala compromisos.
5. Cerrar con evidencias, control de calidad y datos de facturación/pago, según corresponda.

La regla actual impide marcar `Facturado` un caso de otro departamento sin revisión de Recursos Humanos, salvo intervención autorizada de Dirección General.

## 3. Arquitectura

```text
Navegador: index.html + app.js + CSS
        │ Fetch/JSON + cookie HttpOnly
        ▼
Node.js: server.mjs (API, sesiones, autorización y persistencia)
        ├── JSON en BC_DATA_DIR
        ├── Google OAuth → Calendar API y Gmail API
        └── Google Sheets publicado como CSV → Prospectos
```

### Capas

- **Presentación:** HTML5, JavaScript ES2022+ y CSS propio; no se usa framework frontend.
- **Aplicación:** servidor HTTP nativo de Node.js; no depende de Express.
- **Persistencia:** JSON para casos, tareas, usuarios, departamentos, mensajes, calendario, perfil, actividad y diagnósticos.
- **Integración:** `calendar-integration.mjs` concentra OAuth, cifrado de token, Calendar, Gmail y fechas colombianas.
- **Despliegue:** Dockerfile Node 20 sobre Railway, con `npm start`, healthcheck y reinicio automático.

## 4. Stack

| Capa | Tecnología / decisión |
|---|---|
| Runtime | Node.js >= 20, módulos ES. |
| Backend | `node:http`, `fs/promises`, `crypto`, `path`. |
| Frontend | HTML5, JavaScript, CSS3, Fetch y `localStorage` en modo local. |
| Datos | Archivos JSON operacionales. |
| Identidad | Usuarios internos, hash `scrypt`, sesión en memoria y cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción. |
| Google | OAuth 2.0; scopes `openid`, `email`, `calendar.events`, `gmail.send`. |
| Prospectos | Google Sheets exportado como CSV, con caché de 30 segundos. |
| Archivos | PDF locales autorizados y adjuntos privados de mensajes. |
| Empaquetado | Docker y `railway.json`. |
| Control de cambios | GitHub, rama `main`. |

No hay dependencias externas declaradas en `package.json`; esto simplifica el despliegue, pero deja pendientes capacidades que una base de datos, identidad corporativa o almacenamiento de objetos ofrecerían de forma más robusta.

## 5. Archivos principales

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Shell, navegación, modales y recursos. |
| `app.js` | Estado, vistas, formularios, filtros, reportes y llamadas API. |
| `server.mjs` | HTTP, API, sesiones, autorización, persistencia, documentos y cola. |
| `calendar-integration.mjs` | OAuth, token cifrado, Calendar, Gmail y calendario DIAN. |
| `styles*.css`, `messages.css`, `*scroll.css` | Sistema visual, mensajes y desplazamiento. |
| `local-sync.js` | Modo local y sincronización de prueba. |
| `base-cases.js`, `local-cases.js`, `local-users.js` | Fuentes compatibles de datos iniciales; datos reales quedan fuera del repositorio. |
| `importar-correos.mjs` | Importación CSV, deduplicación y respaldo. |
| `exportar_base_crm.mjs` | Regeneración de base inicial. |
| `INICIO.md`, `GUIA-EQUIPO.md` | Operación local, compartida y controles previos. |
| `Dockerfile`, `railway.json`, `.env.example` | Construcción, despliegue y configuración. |

## 6. API disponible

### Identidad y administración

`/api/health`, `/api/login-options`, `/api/session`, `/api/login`, `/api/logout`, `/api/change-password`, `/api/recovery-request`, `/api/recovery-requests`, `/api/activity`, `/api/admin/users`, `/api/admin/departments` y `/api/admin/reset-password`.

### Operación

`/api/cases`, `/api/tasks`, `/api/messages`, `/api/messages/:id/read`, `/api/messages/:id/attachments/:attachmentId`, `/api/prospects`, `/api/prospects/convert`, `/api/company-profile`, `/api/calendar`, `/api/calendar/resolution`, `/api/calendar/:id` y `/api/pension-diagnostics`.

### Documentos

`/api/local-folder/data`, `/api/local-folder/documents?caseId=...` y `/api/local-folder/pdf?caseId=...&path=...`. Las rutas validan sesión, visibilidad del caso, normalización de path y pertenencia del PDF a la carpeta del expediente.

### Google

- `GET /api/calendar/config`: informa si Calendar y correo están listos.
- `GET /api/google/connect`: crea un estado OAuth de un solo uso y solo lo permite a Dirección General.
- `GET /api/google/callback`: intercambia el código, verifica identidad, scopes y correo, cifra el refresh token y retorna al CRM.

## 7. Integración Google y vencimientos DIAN

`resolutionSchedule()` trabaja con zona `America/Bogota` y produce `expiry - 30`, `expiry - 15`, `expiry - 5` y `expiry`. El servidor procesa la cola al iniciar y cada cinco minutos.

Para cada actividad sin enlace, obtiene un access token, crea un evento de día completo en el calendario principal (o `BC_GOOGLE_CALENDAR_ID`) y guarda el enlace devuelto. Para una actividad DIAN cuya fecha llega, envía el correo, incluye cliente, NIT, resolución, fechas y enlace, y solo marca `emailSentAt` tras la confirmación de Gmail. Los fallos quedan en `googleSyncError` o `emailError` para seguimiento.

El refresh token se cifra con AES-256-GCM y se guarda en el volumen como `google-oauth.enc.json`. Nunca se deben guardar secretos en GitHub.

## 8. Seguridad y marco jurídico colombiano

El sistema puede tratar datos de contacto, expedientes, información laboral, pensional y eventualmente de salud. Deben observarse, según la finalidad y el tipo de tratamiento:

- **Ley 1581 de 2012** y **Decreto 1074 de 2015:** autorización, finalidad, circulación restringida, seguridad, confidencialidad y derechos de titulares.
- **Ley 527 de 1999:** mensajes de datos, integridad y conservación de evidencia electrónica.
- **Ley 594 de 2000:** organización, conservación y disposición documental cuando resulte aplicable.
- **Obligaciones contables y tributarias:** conservación de soportes de acuerdo con el documento y la obligación correspondiente.
- **Regulación DIAN vigente:** la resolución concreta y su rango determinan la actuación; el CRM solo gestiona recordatorios y evidencia.
- **Datos sensibles:** historias laborales, diagnósticos pensionales y salud requieren necesidad, finalidad específica, acceso mínimo y medidas reforzadas.

### Controles implementados

- Contraseñas no se sirven al navegador y se almacenan como `scrypt`.
- Sesión individual con cookie `HttpOnly`; `Secure` en producción.
- Respuestas sin caché para datos operativos.
- Separación por departamento y acceso transversal de Dirección General.
- Bitácora de accesos, fallos, cambios, recuperación, agenda y actualizaciones.
- Validación de rutas y pertenencia del documento al expediente.
- Lista de extensiones y límites para adjuntos.
- Secretos OAuth y contraseñas en variables privadas de Railway.

## 9. Despliegue actual

Railway ejecuta Docker con `npm start`, `BC_DATA_DIR=/app/data`, `PORT` provisto por la plataforma, healthcheck `/api/health` y política `ON_FAILURE` hasta cinco reintentos. El dominio es `bcsoluciones-production.up.railway.app`.

Variables funcionales:

```text
BC_PUBLIC_ORIGIN
BC_DATA_DIR
BC_PASSWORD_*
BC_GOOGLE_CLIENT_ID
BC_GOOGLE_CLIENT_SECRET
BC_GOOGLE_TOKEN_KEY
BC_GOOGLE_REFRESH_TOKEN             # opcional
BC_GOOGLE_CALENDAR_ID               # por defecto: primary
BC_BILLING_EMAIL
BC_GENERAL_EMAIL
BC_PROSPECTS_SHEET_ID
BC_PROSPECTS_SHEET_GID
BC_PROSPECTS_CSV_URL                # opcional
```

URI OAuth productiva:

```text
https://bcsoluciones-production.up.railway.app/api/google/callback
```

## 10. Relación con el Manual operativo v2.5

El manual establece confianza, rigor metodológico, trazabilidad, necesidad de conocer, calidad antes del envío, conocimiento institucional y experiencia del cliente. El CRM soporta parte sustancial de esos principios con casos, responsables, observaciones, documentos, alertas, tareas, mensajes, bitácora y perfiles.

| Manual | Soporte actual |
|---|---|
| Clientes y expedientes | Casos, clientes, rutas y PDF. |
| Comercial | Prospectos QR, procedencia y conversión. |
| Proyectos | Tareas, agenda, responsables y fechas. |
| Información | Bitácora, permisos, respaldos y filtros. |
| Facturación | Entrega, factura, pago y módulo DIAN. |
| Gobierno | Dirección General, administración y monitoreo. |

El manual también contempla calidad, conocimiento, experiencia, personal y proyectos con RACI formal. Estos elementos deben profundizarse como módulos dedicados o ampliarse sobre las entidades actuales.

## 11. Mejoras priorizadas

### Críticas antes de escalar

1. Migrar JSON a PostgreSQL u otra base transaccional con concurrencia, índices y auditoría.
2. Adoptar identidad corporativa, MFA, RBAC/ABAC, expiración persistente y revocación de sesiones.
3. Implementar copias cifradas automáticas, restauración probada y plan de continuidad.
4. Migrar documentos a almacenamiento privado con versionado, antivirus, permisos y enlaces temporales.
5. Formalizar inventario de tratamientos, autorizaciones, matriz de acceso, atención de titulares e incidentes conforme a Ley 1581.
6. Crear pruebas automatizadas para autorización, DIAN, duplicados, cola y concurrencia.

### Operativas

1. Convertir el checklist de calidad en requisito antes de `Enviado`.
2. Implementar RACI, delegaciones, suplencias y vigencias de acceso.
3. Medir margen, horas, entregas a tiempo, QA, conocimiento, NPS y cierre de acciones.
4. Incorporar radicado, clasificación, elaboración, revisión, aprobación y expediente en comunicaciones.
5. Añadir alertas para contratos, propuestas, tareas vencidas, accesos temporales y entregables sin QA.
6. Registrar historial por campo con auditoría resistente a alteraciones.

### Productividad e integración

1. Integrar correo corporativo y reglas de conversión a caso.
2. Integrar WhatsApp Business con consentimiento y trazabilidad.
3. Añadir filtros avanzados, reportes gerenciales y panel de capacidad.
4. Desarrollar módulos de conocimiento, personal, calidad, experiencia y proyectos.
5. Añadir monitoreo, pruebas E2E y seguimiento de errores de sincronización.

## 12. Criterios de aceptación sugeridos

- Ningún usuario consulta expedientes fuera de su autorización.
- Dirección General consulta estado consolidado y actividad.
- Tareas, reuniones, decisiones, documentos y cambios críticos son trazables.
- El módulo DIAN crea fechas válidas, no duplica resoluciones y conserva enlaces.
- Cada vencimiento procesado genera un correo verificable y no duplicado.
- Una indisponibilidad temporal de Google no elimina la actividad; la cola reintenta.
- El piloto cumple QA, registro de tareas/horas, transición sin campos críticos, lección aprendida y vacíos con responsable y fecha.

## 13. Ejecución local

```bash
npm install
npm start
```

Abrir `http://localhost:8787`. Para producción no reutilizar contraseñas piloto ni colocar secretos en archivos versionados. Los datos locales deben permanecer fuera del repositorio y respaldarse con acceso restringido.

## 14. Vigencia del documento

Esta fotografía técnica corresponde al 25 de septiembre de 2026. Debe actualizarse cuando cambien el manual, la estructura organizacional, la regulación, los permisos, las integraciones o la arquitectura de persistencia.

