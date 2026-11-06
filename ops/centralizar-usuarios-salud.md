# Usuarios de Salud en la identidad central

## Comportamiento vigente — 2026-11-06

- Se conserva la pantalla y la URL de ingreso de Salud. Usuario y contraseña se validan contra la base central IMI.
- El portal muestra a cada persona únicamente los tableros y rangos asignados. Las cuentas con solo Salud pueden entrar al portal y ver Salud.
- Salud obtiene rangos y alcances desde la sesión central. No hay autenticación ni asignación de permisos desde una tabla local.
- `public.usuarios` y `public.imi_sso_vinculos` fueron retiradas de la base `salud`.

## Cuentas migradas

- Se centralizaron 56 cuentas, rangos y 93 alcances SISA/CUIE/maternidad.
- 55 cuentas están activas con contraseña y acceso a Salud. Sus hashes heredados se conservan como bcrypt hasta que un ingreso correcto los actualiza a scrypt.
- Una cuenta (`caps13`) conserva rango y acceso central, pero queda inactiva hasta que establezca contraseña: el hash local ya estaba incompleto.
- Los accesos centrales respetan los roles originales: 45 Centro de Salud, 4 Coordinador, 2 Administrador, 2 Lectura, 1 Maternidad, 1 Supervisora y 1 Primeros Latidos.

## Historial de seguimientos

- `seguimientos.usuario_central` identifica al operador. Los 2.028 seguimientos existentes tienen ese dato.
- Los 2.010 registros que referenciaban un ID local se asociaron a su usuario central antes de retirar `usuario_id`.
- Los 18 registros creados desde sesiones sin ID local también quedaron identificados por su usuario central.
- `contactos_audit` estaba vacío; se retiró la referencia a usuarios. No quedan claves foráneas a `public.usuarios`.

## Respaldo y comprobaciones

- Respaldo completo PostgreSQL creado antes de retirar las tablas: `/var/backups/imi/salud/salud_pre_central_user_drop_20261106T121532Z.dump`.
- `pg_restore --list` validó el archivo. SHA-256: `caad0738c8a3f6b2bfcf5c13cdd7eb1eafae324a754db39b67511fed3d6e8197`. Permisos del archivo: `0600`.
- El proceso `salud-dashboard` está activo, el ingreso central fue confirmado con una cuenta real y la URL pública de Salud responde HTTP 200.
- El proveedor de NextAuth de Salud es solo `imi-central`; el usuario local ya no participa en el ingreso.
- `ops/migrar_usuarios_central.py` es el importador histórico de una sola vez; no volver a ejecutarlo porque la tabla fuente ya no existe.

## Incidente resuelto

- La primera versión rechazaba el origen público del login detrás de Nginx. Después, `/sso/me` devolvía 503 porque `imi_sso_production_login` no tenía permiso de lectura sobre `identidad.alcances`.
- Se corrigió el origen, se concedió únicamente `SELECT` sobre esa tabla y se verificó el ingreso central antes de retirar la fuente local.
