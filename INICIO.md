# Inicio del CRM de BC Soluciones

## Encender el CRM

1. Abre la carpeta `crm-bc-soluciones`.
2. Haz clic en la barra de dirección del Explorador, escribe `powershell` y pulsa Enter.
3. Ejecuta `npm start`.
4. Abre `http://localhost:8787` en el navegador.

Para compartirlo durante la prueba interna, ejecuta `INICIAR-CRM.ps1` y sigue `GUIA-EQUIPO.md`.

El servidor conserva los cambios en `data/cases.json`. Mientras la ventana del servidor permanezca abierta, los usuarios conectados al mismo equipo pueden usar la aplicación.

## Operación diaria

- Cada persona entra con su usuario y contraseña del departamento.
- Cada departamento solo consulta sus casos. Bety Camilo opera como responsable de Departamento General.
- Los datos del servidor se cargan después del inicio de sesión y se filtran por departamento.
- Dirección General puede cambiar el selector para revisar cualquier área.
- Cada caso tiene estado, fecha límite, alerta, carpeta y observaciones.
- Al crear un caso se puede indicar responsable, correo y teléfono opcional.
- En el detalle se actualizan entrega, factura y pago; el reporte CSV incluye estos campos.
- Los documentos faltantes quedan registrados por caso y aparecen en `Gestión documental`.
- Las observaciones quedan asociadas al usuario y a la fecha.
- El botón `Reporte CSV` genera el informe del alcance visible en pantalla.
- El `Resumen` muestra la carga por departamento y los casos que requieren decisión o asignación.
- Usa `Actualizar` para consultar cambios recientes hechos por otros usuarios.
- La pestaña `Gestión documental` permite localizar casos con carpeta o sin carpeta enlazada.
- Dirección General puede revisar solicitudes de recuperación y actividad reciente desde `Administración`.

## Regla de facturación

Un caso no debe pasar a `Facturado` hasta que Recursos humanos haya completado su revisión. La aplicación bloquea ese cambio mientras el caso no tenga la marca de revisión correspondiente.

La regla se aplica en la interfaz y también en el servidor compartido.

## Paso necesario antes de producción

El modo actual es un piloto interno. Antes de usar datos reales desde varios equipos se debe instalarlo en un servidor interno, activar HTTPS, sustituir las credenciales piloto por un proveedor de identidad y conectar correo y WhatsApp mediante sus APIs autorizadas.
