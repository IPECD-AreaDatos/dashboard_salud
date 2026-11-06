# Migración gradual de usuarios de Salud a identidad central

## Comportamiento esperado

- La pantalla y la URL de ingreso de Salud se conservan.
- Se conserva la pantalla y la URL de ingreso de Salud, pero las credenciales se validan en la base central de IMI.
- Las cuentas que solo tienen Salud pueden ingresar desde el portal y ven únicamente los tableros que tengan asignados.
- Los rangos y alcances de Salud se leen desde la base central; el login en la página de Salud no implica acceso a otros tableros.
- La tabla local se conserva solo durante la migración de referencias históricas; no interviene en el ingreso normal.

## Rangos y alcances

Los rangos del tablero `salud` son `admin`, `coordinador`, `centro-salud`, `maternidad`, `lectura`, `supervisora` y `primeros-latidos`. Los alcances se copian como `sisa`, `cuie` y `maternidad` a `identidad.alcances`. Salud obtiene el rol y los alcances de la sesión central; ya no necesita una segunda cuenta local para esas asignaciones.

Las contraseñas bcrypt existentes se importan como `bcrypt-legacy` y se cambian a scrypt cuando la persona inicia sesión correctamente. Si una cuenta local tiene un hash incompleto, se crea como pendiente de contraseña y se activa con el enlace de alta de contraseña del portal.

## Procedimiento

1. Actualizar y verificar el servicio de identidad central con soporte `bcrypt-legacy`, entrega de alcances en `/sso/me` y permiso `SELECT` sobre `identidad.alcances` para `imi_sso_production_login`.
2. Ejecutar `python ops/migrar_usuarios_central.py` para simular la migración. La operación termina con `ROLLBACK` y no guarda usuarios ni permisos.
3. Si la simulación no detecta conflictos, ejecutar `python ops/migrar_usuarios_central.py --apply`. El programa agrega usuarios, credenciales válidas, rangos, accesos, alcances y vínculos de origen.
4. Desplegar Salud. No desplegar si el script informa que aplicó la base central pero no pudo registrar los marcadores locales.
5. Confirmar el acceso con cuentas de distintos rangos. Para las cuentas pendientes, generar `alta con contraseña` desde Administración de usuarios y entregar el enlace por el canal acordado.

## Inventario de origen, 2026-11-05

- 56 usuarios con nombre normalizado único.
- 55 hashes bcrypt válidos y una cuenta, `caps13`, con un hash incompleto de 59 caracteres. La migración no importa ese hash; la cuenta queda pendiente para establecer una contraseña mediante el flujo normal de alta.
- 45 cuentas `Centro de Salud`, 4 `Coordinador`, 2 `Administrador`, 2 `Lectura`, 1 `Maternidad`, 1 `Supervisora` y 1 `Primeros Latidos`.
- Hay 93 valores de alcance para transferir: códigos SISA/CUIE y maternidad.

La primera etapa no borra `public.usuarios`, hashes locales, ni los datos de actividad del tablero.

## Estado de implementación — 2026-11-05

- La carga central se aplicó después de validar un respaldo PostgreSQL con `pg_restore --list`: `/var/backups/imi/imi_identidad_pre_salud_20261105.dump`.
- Se procesaron 56 cuentas: 55 identidades nuevas, 54 credenciales bcrypt válidas y una cuenta pendiente de contraseña (`caps13`). No se sobrescribieron credenciales centrales existentes.
- Se registraron los 56 vínculos de origen, 55 accesos individuales nuevos y 93 alcances. La base contiene 57 accesos activos a Salud contando dos accesos administrativos que ya existían.
- Los 56 vínculos de origen central corresponden a las cuentas de la tabla local. No borrar usuarios, hashes locales ni datos de actividad hasta completar el traslado de referencias históricas.
- `caps13` debe recibir un enlace de «alta con contraseña» desde Administración de usuarios; el enlace se comparte con la persona por el canal habitual.

## Recuperación del ingreso — 2026-11-05

- La primera versión publicada rechazaba las peticiones del formulario de Salud con HTTP 403 porque comparaba el origen público del navegador con la URL interna que Next.js veía detrás de Nginx.
- Se corrigió la validación para aceptar el origen público fijo de IMI en producción y el origen local de desarrollo. Una solicitud pública válida con cuerpo vacío debe devolver HTTP 400, nunca HTTP 403.
- El servicio central devolvía HTTP 503 al consultar `/sso/me`: su usuario PostgreSQL `imi_sso_production_login` carecía de `SELECT` sobre `identidad.alcances`. Se concedió únicamente ese permiso y se verificó la misma consulta con el rol del servicio.
- Se confirmó el ingreso con una cuenta real. Hay 55 cuentas centrales activas con contraseña y permiso de Salud; la cuenta restante está pendiente porque su contraseña heredada estaba incompleta.
- Se activaron los vínculos de origen de las 55 cuentas listas. El código de Salud ya no ofrece autenticación ni asignación de rangos desde `public.usuarios`; la cuenta pendiente requiere establecer una contraseña central.
- Para volver atrás, desplegar el commit anterior y dejar inactivos los vínculos centrales locales. Las contraseñas y usuarios locales se conservan hasta retirar las relaciones históricas.

## Retiro de `public.usuarios`

- El código de autenticación y permisos de Salud consulta la identidad central. Los seguimientos nuevos guardan el nombre central en `seguimientos.usuario_central`.
- Se identificaron los seguimientos históricos vinculados a la tabla local y los registros sin ID local, y se creó un respaldo completo verificable antes de retirar la tabla.
