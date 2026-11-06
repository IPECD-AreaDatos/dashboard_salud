# Acceso central de administración para Salud

Fecha: 2026-11-05

## Cambio aplicado

- `602934b` permite que el rango central `admin` inicie sesión en Salud como `Administrador`, sin buscar ni crear una fila en `public.usuarios`.
- La pantalla de ingreso de Salud se conserva, pero las cuentas migradas se autentican en la identidad central.
- El rango central `acceso` conserva el vínculo individual de Salud para resolver roles con alcance por centro o maternidad.
- En la base central `imi_identidad` se agregó el rango `admin` al tablero `salud`.
- `asalinas` y `mmarder` quedaron con acceso activo y rango `admin` en Salud. Se incrementó su `version_sesion` para invalidar sesiones previas y se registraron los dos cambios en `identidad.sso_cambios` y `identidad.auditoria`.

## Auditoría del tablero

- Los seguimientos centrales guardan `usuario_id = NULL` y el nombre de usuario en `personal_salud` y `usuario_central`. Los 2.010 seguimientos históricos con ID local quedaron asociados al nombre central en `usuario_central`.
- `logs_actividad_dashboard.usuario_id` es un entero obligatorio sin clave foránea. Para una sesión central sin ID local se guarda `0`, y `usuario_name` conserva el usuario central que realizó la acción.
- A futuro se puede normalizar ese registro para guardar el identificador central en una columna propia.

## Publicación y recuperación

- Build local de producción completado. Next.js mostró el aviso preexistente de que la opción `eslint` en `next.config.ts` ya no se reconoce; no impidió compilar.
- Revisión publicada en el servidor de Salud: `602934b`. Las verificaciones de salud del servicio pasaron.
- Respaldo de la base central, validado con `pg_restore --list`: `/var/backups/imi/identidad/imi_identidad_antes_salud_admin_20261105T114650Z.dump`.
- SHA-256 del respaldo: `ed59470ceb997fb6664f5d2c07ba2622521d6e9dc9c13d0256d5e059bb67edf4`.
- Respaldo de la versión anterior del tablero: `/home/ubuntu/salud-candidatos/respaldo-central-admin-602934b`.
