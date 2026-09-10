# BC Soluciones · CRM interno

Primera versión funcional de un CRM web interno para organizar clientes, casos y alertas por departamento.

## Incluye

- Perfiles de Dirección General y usuarios por departamento.
- Vista restringida al departamento del usuario; Dirección General puede consultar todos.
- Departamentos: Departamento General, Contabilidad, Monitoreo contable, Recursos humanos, Facturación, Pensiones y seguridad social, Temporales o varios y Mercadeo y ventas. Dirección General tiene acceso transversal.
- Bandeja separada de alertas.
- Tablero de decisión con distribución por departamento, estados, vencidos, casos sin responsable y datos de contacto incompletos.
- Estados: Recibido, En proceso, Terminado y Facturado.
- Seguimiento de entrega, factura y fecha de pago por caso.
- Control explícito de documentos faltantes, carpetas enlazadas y observaciones.
- Copia rápida de la ruta de carpeta desde el índice documental.
- Actualización manual de datos para sincronizar cambios realizados por otros usuarios.
- Confirmación de guardado contra el servidor; los rechazos muestran el motivo y revierten el cambio local.
- Bloqueo del estado Facturado hasta que el caso haya pasado por Recursos humanos.
- Registro opcional de teléfono para una futura integración con WhatsApp.
- Persistencia local en el navegador mediante `localStorage`.
- Base inicial cargada desde la hoja de seguimiento: 140 casos y referencias a las carpetas encontradas.
- Casos recientes de Pensiones y Seguridad Social incorporados como registros de trabajo.
- Observaciones por caso, con usuario y fecha, disponibles para cada departamento y para Dirección General.
- Asignación de responsable al crear un caso, con los responsables configurados por departamento.
- Importación controlada de correos exportados a CSV, con deduplicación y respaldo automático.
- Acceso piloto individual con usuario y contraseña.
- Contraseñas almacenadas como hash en el servidor y sesiones con cookie HttpOnly.
- Los archivos de datos no se sirven directamente por HTTP; la base inicial expuesta al navegador está vacía y los casos reales se entregan según el departamento después del inicio de sesión.
- Las contraseñas piloto no están incluidas en el JavaScript servido por el CRM; la autenticación compartida se realiza con hashes del servidor.
- Las respuestas del servidor se sirven sin caché para evitar que el equipo conserve una versión antigua de la aplicación.
- Recuperación de acceso con validación por Dirección General y contraseña temporal.
- Registro de actividad de accesos, recuperación, cambios de contraseña y actualizaciones de casos.
- Logo oficial de BC Soluciones integrado en el acceso y la navegación.

## Uso

Abre `index.html` en un navegador moderno. Esta versión es un prototipo local; para uso real multiusuario se debe conectar a una base de datos, autenticación y un servidor seguro. Las integraciones de correo y WhatsApp requieren sus credenciales, permisos y proveedor elegido. La base importada queda en `base-cases.js` y puede regenerarse ejecutando `exportar_base_crm.mjs` desde la carpeta del proyecto cuando se actualice la hoja.

## Modo compartido de prueba

Para iniciar el modo compartido en Windows puedes ejecutar `INICIAR-CRM.ps1`. También puedes abrir una terminal ubicada en esta carpeta y ejecutar `node server.mjs`, después abrir `http://localhost:8787`. La guía de conexión del equipo está en `GUIA-EQUIPO.md`. El servidor crea `data/cases.json` con la base inicial y guarda allí los cambios del CRM. La versión piloto ya aplica sesión individual, filtros por departamento y validación de la regla de facturación en el servidor. Para usar información real desde varios equipos todavía se requiere alojarlo en un servidor interno con HTTPS, copias de seguridad y control de acceso corporativo.

En una instalación nueva, las contraseñas iniciales se reciben mediante variables privadas del servidor. Consulta `.env.example` para conocer los nombres requeridos. Nunca publiques valores reales en GitHub.

## Despliegue en Railway

1. Mantén el repositorio de GitHub como privado.
2. Conecta el repositorio como fuente del servicio en Railway.
3. Configura las variables indicadas en `.env.example` y usa contraseñas nuevas.
4. Añade un volumen persistente montado en `/app/data`.
5. Genera el dominio público desde la sección Networking del servicio.

El servidor utiliza automáticamente la variable `PORT` de Railway y activa cookies seguras en producción. Los archivos JSON, credenciales, casos reales y datos operativos están excluidos del repositorio.

Los documentos encontrados en las carpetas locales de Windows no están disponibles automáticamente en Railway. Deben migrarse a almacenamiento privado antes de habilitar su consulta remota.

Dirección General puede consultar la actividad reciente en `Administración`. El registro no almacena contraseñas.

## Recuperación de acceso

En la pantalla de inicio selecciona “¿Olvidaste tu contraseña?” e ingresa el usuario corporativo. La solicitud queda guardada en `data/recovery-requests.json` sin confirmar si el usuario existe. Dirección General valida la identidad y entrega una clave temporal por el canal corporativo. Para producción se debe conectar este flujo al correo corporativo o a un proveedor de identidad con restablecimiento mediante enlace de un solo uso.
