# Uso compartido del CRM en BC Soluciones

## Puesta en marcha para la prueba interna

1. Elige un computador de la empresa que permanezca encendido durante la jornada.
2. Abre la carpeta `crm-bc-soluciones` y ejecuta `INICIAR-CRM.ps1` con PowerShell.
3. En ese computador abre la dirección local que aparece en pantalla.
4. Cada integrante del equipo abre la dirección de red que muestra el mismo script.
5. Cada persona ingresa con su usuario individual y cambia la contraseña piloto.

La dirección de red depende del computador anfitrión y puede cambiar si cambia la red. Para ocho usuarios conviene reservar una dirección fija en el router o publicar el servicio en un servidor interno.

## Cargar correos exportados

Si el correo se exporta a CSV, detén temporalmente el servidor y usa la plantilla `PLANTILLA-IMPORTAR-CORREOS.csv`. El archivo debe conservar la primera fila con los nombres de columnas. Ejecuta:

`node importar-correos.mjs "C:\ruta\correos.csv"`

El importador crea casos en estado `Recibido`, conserva asunto, remitente y cuerpo como contexto, evita duplicados y crea un respaldo automático de `data/cases.json`. Después vuelve a iniciar el CRM. Para una integración automática se debe conectar la cuenta corporativa mediante su API o proveedor de correo.

## Operación y control

- Cada departamento ve y actualiza únicamente sus casos.
- Dirección General puede revisar todos los departamentos, solicitudes de recuperación y actividad reciente.
- Los documentos se organizan a partir de la ruta de carpeta asociada a cada caso.
- El respaldo central se descarga desde `Respaldo` y debe guardarse en una ubicación con acceso restringido.
- El equipo debe cerrar la sesión al terminar.

## Antes de usar datos reales

Se debe habilitar HTTPS, configurar copias automáticas, restringir el puerto a la red corporativa y reemplazar las credenciales piloto. La integración de correo y WhatsApp requiere autorizar las cuentas y definir qué mensajes pueden convertirse en casos.

No compartas el CRM mediante un enlace público mientras conserve información de clientes.
