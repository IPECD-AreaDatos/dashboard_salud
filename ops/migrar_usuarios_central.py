#!/usr/bin/env python3
"""Migración de una sola vez de usuarios, hashes, rangos y alcances de Salud.

Por defecto hace una simulación transaccional y termina con ROLLBACK. Usar
--apply únicamente para confirmar la misma operación en la base central.
No imprime usuarios ni hashes. No ejecutar después de retirar public.usuarios.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import shlex
import sys
import uuid
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[3]
SERVERS_CONFIG = ROOT / "servidores" / "config" / "servers.json"
HEALTH_ROOT = "/home/ubuntu/ipecd-infra/apps/front/dashboard_salud"
CENTRAL_RELEASE = "/opt/imi-identidad/current"
CENTRAL_NODE = "/opt/imi-identidad/runtime/bin/node"
CENTRAL_DB = "imi_identidad"

ROLE_MAP = {
    "Administrador": "admin",
    "Coordinador": "coordinador",
    "Centro de Salud": "centro-salud",
    "Maternidad": "maternidad",
    "Lectura": "lectura",
    "Supervisora": "supervisora",
    "Primeros Latidos": "primeros-latidos",
}

SOURCE_SCRIPT = r"""
const fs=require('fs'),path=require('path');
const root='/home/ubuntu/ipecd-infra/apps/front/dashboard_salud';
function parseEnv(file){const values={};for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const match=line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);if(!match)continue;let value=match[2].trim();if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);values[match[1]]=value;}return values;}
const env=parseEnv(path.join(root,'.env'));
const {Pool}=require(path.join(root,'node_modules/pg'));
const db=new Pool({host:env.HOST_DBB2,port:Number(env.PORT_DBB2||5432),user:env.USER_DBB2,password:env.PASSWORD_DBB2,database:env.DB_NAME_SALUD,ssl:{rejectUnauthorized:false}});
(async()=>{try{const result=await db.query(`SELECT id::text,username,role,btrim(password_hash) password_hash,sisa_code,cuie_code,maternidad_id::text FROM public.usuarios ORDER BY id`);process.stdout.write(JSON.stringify(result.rows));}finally{await db.end();}})().catch(()=>{console.error('source_read_failed');process.exitCode=1});
"""

MARKER_SCRIPT = r"""
const fs=require('fs'),path=require('path'),root='/home/ubuntu/ipecd-infra/apps/front/dashboard_salud';
function parseEnv(file){const values={};for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const match=line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);if(!match)continue;let value=match[2].trim();if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);values[match[1]]=value;}return values;}
const env=parseEnv(path.join(root,'.env')),{Pool}=require(path.join(root,'node_modules/pg'));
const db=new Pool({host:env.HOST_DBB2,port:Number(env.PORT_DBB2||5432),user:env.USER_DBB2,password:env.PASSWORD_DBB2,database:env.DB_NAME_SALUD,ssl:{rejectUnauthorized:false}});
(async()=>{const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const names=rows.map(x=>x.usuario),ids=rows.map(x=>Number(x.id)),apply=process.argv[3]==='apply';const tx=await db.connect();try{await tx.query('BEGIN');const {rows:[check]}=await tx.query(`SELECT count(*) FILTER(WHERE u.id IS NULL OR lower(btrim(u.username))<>src.usuario OR (named.usuario_salud_id IS NOT NULL AND named.usuario_salud_id<>src.id) OR (numbered.usuario_central IS NOT NULL AND numbered.usuario_central<>src.usuario))::int conflicts,count(*) FILTER(WHERE named.usuario_central IS NULL OR NOT COALESCE(named.activo,false))::int links_to_add FROM unnest($1::text[],$2::int[]) AS src(usuario,id) LEFT JOIN public.usuarios u ON u.id=src.id LEFT JOIN public.imi_sso_vinculos named ON named.usuario_central=src.usuario LEFT JOIN public.imi_sso_vinculos numbered ON numbered.usuario_salud_id=src.id`,[names,ids]);if(check.conflicts){await tx.query('ROLLBACK');process.stdout.write(JSON.stringify({conflicts:check.conflicts}));return;}if(apply){await tx.query(`INSERT INTO public.imi_sso_vinculos(usuario_central,usuario_salud_id,activo) SELECT src.usuario,src.id,true FROM unnest($1::text[],$2::int[]) AS src(usuario,id) ON CONFLICT(usuario_central) DO UPDATE SET activo=true WHERE public.imi_sso_vinculos.usuario_salud_id=EXCLUDED.usuario_salud_id`,[names,ids]);await tx.query('COMMIT');}else await tx.query('ROLLBACK');process.stdout.write(JSON.stringify({conflicts:0,links_to_add:check.links_to_add,applied:apply}));}catch{await tx.query('ROLLBACK').catch(()=>{});console.error('marker_sync_failed');process.exitCode=1;}finally{tx.release();await db.end();}})().catch(()=>{console.error('marker_sync_failed');process.exitCode=1});
"""

MIGRATION_SQL = r"""
BEGIN;
SET LOCAL statement_timeout = '90s';
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtext('imi-salud-central-import-v1'));
CREATE TEMP TABLE _salud_import (
  source_id text NOT NULL,
  usuario text NOT NULL,
  rol_local text NOT NULL,
  password_hash text,
  sisa_code text,
  cuie_code text,
  maternidad_id text,
  rango_central text NOT NULL
) ON COMMIT DROP;
COPY _salud_import FROM STDIN WITH (FORMAT csv);
"""  # CSV rows are streamed here, followed by the psql COPY terminator.

AFTER_COPY_SQL = r"""
CREATE TEMP TABLE _salud_scopes ON COMMIT DROP AS
SELECT usuario,tipo,btrim(valor) valor
FROM _salud_import
CROSS JOIN LATERAL (VALUES ('sisa',sisa_code),('cuie',cuie_code),('maternidad',maternidad_id)) AS scope(tipo,valor)
WHERE NULLIF(btrim(valor),'') IS NOT NULL;

DO $validar$
BEGIN
  IF EXISTS (SELECT 1 FROM _salud_import GROUP BY lower(btrim(usuario)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'La fuente contiene usuarios duplicados';
  END IF;
  IF EXISTS (SELECT 1 FROM _salud_import WHERE rango_central NOT IN ('admin','coordinador','centro-salud','maternidad','lectura','supervisora','primeros-latidos')) THEN
    RAISE EXCEPTION 'Hay un rol de Salud sin correspondencia central';
  END IF;
  IF EXISTS (SELECT 1 FROM _salud_import WHERE COALESCE(password_hash,'')<>'' AND password_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$') THEN
    RAISE EXCEPTION 'Hay una credencial heredada que no es bcrypt';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identidad.tableros WHERE codigo='salud' AND modalidad='restringido' AND activo) THEN
    RAISE EXCEPTION 'No está disponible el tablero privado Salud';
  END IF;
  IF to_regclass('identidad.identidades_origen') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla de trazabilidad de identidades de origen';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _salud_import i JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
    WHERE NOT u.activo
  ) THEN RAISE EXCEPTION 'Hay una cuenta central existente inactiva'; END IF;
  IF EXISTS (
    SELECT 1 FROM _salud_import i
    JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario)) AND u.activo
    LEFT JOIN identidad.credenciales c ON c.usuario_id=u.id
    WHERE COALESCE(i.password_hash,'')='' AND c.usuario_id IS NULL
  ) THEN RAISE EXCEPTION 'Una cuenta central activa no tiene credencial y Salud no puede recuperarla'; END IF;
  IF EXISTS (
    SELECT 1 FROM _salud_import i
    JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario)) AND NOT u.es_admin_global
    JOIN identidad.tableros t ON t.codigo='salud'
    JOIN identidad.accesos a ON a.usuario_id=u.id AND a.tablero_id=t.id
    WHERE NOT a.activo
  ) THEN RAISE EXCEPTION 'Hay un acceso central a Salud que está desactivado'; END IF;
  IF EXISTS (
    SELECT 1 FROM _salud_import i
    JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario)) AND NOT u.es_admin_global
    JOIN identidad.tableros t ON t.codigo='salud'
    JOIN identidad.accesos a ON a.usuario_id=u.id AND a.tablero_id=t.id AND a.activo
    JOIN identidad.rangos r ON r.id=a.rango_id
    WHERE r.codigo NOT IN ('admin','acceso',i.rango_central)
  ) THEN RAISE EXCEPTION 'Hay rangos de Salud existentes que requieren revisión'; END IF;
  IF EXISTS (
    SELECT 1 FROM _salud_import i
    JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario)) AND NOT u.es_admin_global
    JOIN identidad.tableros t ON t.codigo='salud'
    JOIN identidad.accesos a ON a.usuario_id=u.id AND a.tablero_id=t.id AND a.activo
    JOIN identidad.rangos r ON r.id=a.rango_id AND r.codigo<>'admin'
    WHERE EXISTS (
      SELECT 1 FROM identidad.alcances current_scope
      WHERE current_scope.acceso_id=a.id
        AND NOT EXISTS (SELECT 1 FROM _salud_scopes expected WHERE expected.usuario=lower(btrim(i.usuario)) AND expected.tipo=current_scope.tipo AND expected.valor=current_scope.valor)
    ) OR EXISTS (
      SELECT 1 FROM _salud_scopes expected
      WHERE expected.usuario=lower(btrim(i.usuario))
        AND NOT EXISTS (SELECT 1 FROM identidad.alcances current_scope WHERE current_scope.acceso_id=a.id AND current_scope.tipo=expected.tipo AND current_scope.valor=expected.valor)
    )
  ) THEN RAISE EXCEPTION 'Los alcances existentes de Salud difieren de la fuente'; END IF;
  IF EXISTS (
    SELECT 1 FROM _salud_import i
    LEFT JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
    JOIN identidad.identidades_origen src ON src.sistema='salud' AND src.entidad='usuarios' AND src.id_origen=i.source_id
    WHERE src.usuario_id IS DISTINCT FROM u.id
  ) THEN RAISE EXCEPTION 'Hay una referencia de origen vinculada a otra cuenta'; END IF;
END
$validar$;

CREATE TEMP TABLE _salud_plan ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM _salud_import i LEFT JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario)) WHERE u.id IS NULL) AS usuarios_nuevos,
  (SELECT count(*) FROM _salud_import i LEFT JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario)) LEFT JOIN identidad.credenciales c ON c.usuario_id=u.id WHERE COALESCE(i.password_hash,'')<>'' AND c.usuario_id IS NULL) AS credenciales_nuevas,
  (SELECT count(*) FROM _salud_import WHERE COALESCE(password_hash,'')='') AS cuentas_pendientes_clave,
  (SELECT count(*) FROM _salud_import i LEFT JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario)) LEFT JOIN identidad.tableros t ON t.codigo='salud' LEFT JOIN identidad.accesos a ON a.usuario_id=u.id AND a.tablero_id=t.id WHERE NOT COALESCE(u.es_admin_global,false) AND a.id IS NULL) AS accesos_nuevos,
  (SELECT count(*) FROM _salud_import i JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario)) JOIN identidad.tableros t ON t.codigo='salud' JOIN identidad.accesos a ON a.usuario_id=u.id AND a.tablero_id=t.id JOIN identidad.rangos r ON r.id=a.rango_id WHERE NOT u.es_admin_global AND r.codigo='acceso' AND r.codigo<>i.rango_central) AS rangos_a_migrar,
  (SELECT count(*) FROM (VALUES ('admin'),('coordinador'),('centro-salud'),('maternidad'),('lectura'),('supervisora'),('primeros-latidos')) expected(codigo) CROSS JOIN identidad.tableros t LEFT JOIN identidad.rangos r ON r.tablero_id=t.id AND r.codigo=expected.codigo WHERE t.codigo='salud' AND r.id IS NULL) AS rangos_nuevos,
  (SELECT count(*) FROM _salud_scopes s JOIN _salud_import i ON i.usuario=s.usuario LEFT JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario)) LEFT JOIN identidad.tableros t ON t.codigo='salud' LEFT JOIN identidad.accesos a ON a.usuario_id=u.id AND a.tablero_id=t.id LEFT JOIN identidad.rangos prior_rank ON prior_rank.id=a.rango_id WHERE NOT COALESCE(u.es_admin_global,false) AND COALESCE(prior_rank.codigo,i.rango_central)<>'admin' AND NOT EXISTS (SELECT 1 FROM identidad.alcances existing WHERE existing.acceso_id=a.id AND existing.tipo=s.tipo AND existing.valor=s.valor)) AS alcances_nuevos,
  (SELECT count(*) FROM _salud_import i LEFT JOIN identidad.identidades_origen src ON src.sistema='salud' AND src.entidad='usuarios' AND src.id_origen=i.source_id WHERE src.id IS NULL) AS vinculos_origen_nuevos;

INSERT INTO identidad.rangos(tablero_id,codigo,descripcion)
SELECT t.id,r.codigo,r.descripcion
FROM identidad.tableros t
CROSS JOIN (VALUES
 ('admin','Administrador'),
 ('coordinador','Coordinador'),
 ('centro-salud','Centro de Salud'),
 ('maternidad','Maternidad'),
 ('lectura','Solo lectura'),
 ('supervisora','Supervisora'),
 ('primeros-latidos','Primeros Latidos')
) AS r(codigo,descripcion)
WHERE t.codigo='salud'
ON CONFLICT (tablero_id,codigo) DO NOTHING;

INSERT INTO identidad.usuarios(usuario,activo,es_admin_global,version_sesion)
SELECT lower(btrim(i.usuario)),(COALESCE(i.password_hash,'')<>''),false,1
FROM _salud_import i
WHERE NOT EXISTS (SELECT 1 FROM identidad.usuarios u WHERE lower(btrim(u.usuario))=lower(btrim(i.usuario)));

INSERT INTO identidad.credenciales(usuario_id,password_hash,algoritmo)
SELECT u.id,i.password_hash,'bcrypt-legacy'
FROM _salud_import i
JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
LEFT JOIN identidad.credenciales c ON c.usuario_id=u.id
WHERE c.usuario_id IS NULL AND COALESCE(i.password_hash,'')<>''
ON CONFLICT (usuario_id) DO NOTHING;

INSERT INTO identidad.accesos(usuario_id,tablero_id,rango_id,activo)
SELECT u.id,t.id,r.id,true
FROM _salud_import i
JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
JOIN identidad.tableros t ON t.codigo='salud'
LEFT JOIN identidad.accesos prior ON prior.usuario_id=u.id AND prior.tablero_id=t.id
LEFT JOIN identidad.rangos prior_rank ON prior_rank.id=prior.rango_id
JOIN identidad.rangos r ON r.tablero_id=t.id AND r.codigo=CASE WHEN prior_rank.codigo='admin' THEN 'admin' ELSE i.rango_central END
WHERE NOT u.es_admin_global
ON CONFLICT (usuario_id,tablero_id) DO UPDATE SET rango_id=EXCLUDED.rango_id,activo=true,actualizado_en=now();

INSERT INTO identidad.alcances(acceso_id,tipo,valor)
SELECT a.id,s.tipo,s.valor
FROM _salud_scopes s
JOIN identidad.usuarios u ON lower(btrim(u.usuario))=s.usuario
JOIN identidad.tableros t ON t.codigo='salud'
JOIN identidad.accesos a ON a.usuario_id=u.id AND a.tablero_id=t.id AND a.activo
JOIN identidad.rangos r ON r.id=a.rango_id AND r.tablero_id=t.id AND r.codigo<>'admin'
WHERE NOT u.es_admin_global
ON CONFLICT (acceso_id,tipo,valor) DO NOTHING;

-- El servicio de identidad consulta estos alcances al responder /sso/me.
GRANT SELECT ON TABLE identidad.alcances TO imi_sso_production_login;

INSERT INTO identidad.identidades_origen(usuario_id,sistema,entidad,id_origen)
SELECT u.id,'salud','usuarios',i.source_id
FROM _salud_import i
JOIN identidad.usuarios u ON lower(btrim(u.usuario))=lower(btrim(i.usuario))
ON CONFLICT (sistema,entidad,id_origen) DO NOTHING;

SELECT 'source_users|'||(SELECT count(*) FROM _salud_import)
UNION ALL SELECT 'new_users|'||usuarios_nuevos FROM _salud_plan
UNION ALL SELECT 'new_credentials|'||credenciales_nuevas FROM _salud_plan
UNION ALL SELECT 'password_setup_required|'||cuentas_pendientes_clave FROM _salud_plan
UNION ALL SELECT 'new_accesses|'||accesos_nuevos FROM _salud_plan
UNION ALL SELECT 'generic_ranges_to_upgrade|'||rangos_a_migrar FROM _salud_plan
UNION ALL SELECT 'health_ranges_to_add|'||rangos_nuevos FROM _salud_plan
UNION ALL SELECT 'scopes_to_add|'||alcances_nuevos FROM _salud_plan
UNION ALL SELECT 'origin_links_to_add|'||vinculos_origen_nuevos FROM _salud_plan;
"""


def load_server_config() -> tuple[dict, dict]:
    data = json.loads(SERVERS_CONFIG.read_text(encoding="utf-8"))
    aws = next(item for item in data["aws"] if item.get("user") == "ubuntu" and item.get("key_path"))
    donweb = data["donweb"][0]
    return aws, donweb


def connect_verified(server: dict, key_path: Path | None = None) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    kwargs = dict(hostname=server["ip"], port=int(server["port"]), username=server["user"], timeout=20)
    if key_path:
        try:
            pkey = paramiko.RSAKey.from_private_key_file(str(key_path))
        except paramiko.SSHException:
            pkey = paramiko.Ed25519Key.from_private_key_file(str(key_path))
        kwargs["pkey"] = pkey
        kwargs["look_for_keys"] = False
        kwargs["allow_agent"] = False
    else:
        kwargs["password"] = server["password"]
        kwargs["look_for_keys"] = False
        kwargs["allow_agent"] = False
    client.connect(**kwargs)
    return client


def get_health_users(ssh: paramiko.SSHClient) -> list[dict]:
    temp_name = f"/tmp/imi-salud-source-{uuid.uuid4().hex}.cjs"
    sftp = ssh.open_sftp()
    try:
        with sftp.file(temp_name, "w") as remote_file:
            remote_file.write(SOURCE_SCRIPT)
        command = f"sudo -n -u ubuntu bash -lc 'node {shlex.quote(temp_name)}'"
        _, stdout, _ = ssh.exec_command(command, timeout=90)
        output = stdout.read().decode("utf-8")
        status = stdout.channel.recv_exit_status()
        if status:
            raise RuntimeError("No se pudo leer la lista de usuarios de Salud")
        rows = json.loads(output)
        if not isinstance(rows, list):
            raise RuntimeError("La fuente de usuarios no devolvió una lista válida")
        return rows
    finally:
        try:
            sftp.remove(temp_name)
        except OSError:
            pass
        sftp.close()


def prepare_source(rows: list[dict]) -> list[tuple[str, ...]]:
    prepared: list[tuple[str, ...]] = []
    usernames: set[str] = set()
    username_pattern = re.compile(r"^[a-z][a-z0-9_.-]{2,49}$")
    bcrypt_pattern = re.compile(r"^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$")
    for row in rows:
        username = str(row.get("username") or "").strip().lower()
        role = str(row.get("role") or "")
        password_hash = str(row.get("password_hash") or "").strip()
        if not username_pattern.fullmatch(username) or username in usernames:
            raise RuntimeError("La fuente contiene un usuario vacío, inválido o duplicado")
        if role not in ROLE_MAP:
            raise RuntimeError("Hay un rol de Salud sin rango central definido")
        if not bcrypt_pattern.fullmatch(password_hash):
            password_hash = ""
        usernames.add(username)
        values = [row.get("sisa_code"), row.get("cuie_code"), row.get("maternidad_id")]
        values = [str(value).strip() if value is not None else "" for value in values]
        prepared.append((str(row["id"]), username, role, password_hash, *values, ROLE_MAP[role]))
    if not prepared:
        raise RuntimeError("La fuente no contiene usuarios")
    return prepared


def make_psql_input(rows: list[tuple[str, ...]], apply: bool) -> str:
    csv_buffer = io.StringIO(newline="")
    writer = csv.writer(csv_buffer, lineterminator="\n")
    writer.writerows(rows)
    commit = "COMMIT;" if apply else "ROLLBACK;"
    return MIGRATION_SQL + csv_buffer.getvalue() + "\\.\n" + AFTER_COPY_SQL + commit + "\n"


def apply_or_plan(ssh: paramiko.SSHClient, payload: str) -> list[str]:
    command = f"sudo -n -u postgres psql -X -q -A -t -v ON_ERROR_STOP=1 -d {CENTRAL_DB}"
    stdin, stdout, stderr = ssh.exec_command(command, timeout=120)
    stdin.write(payload)
    stdin.flush()
    stdin.channel.shutdown_write()
    output = stdout.read().decode("utf-8", "replace").strip()
    status = stdout.channel.recv_exit_status()
    if status:
        # Keep diagnostics generic: psql errors must never print credential data.
        error = stderr.read().decode("utf-8", "replace")
        first_line = next((line for line in error.splitlines() if line.startswith("ERROR:")), "")
        raise RuntimeError(first_line[:180] or "La transacción central fue cancelada")
    return [line.strip() for line in output.splitlines() if line.strip()]


def synchronize_local_markers(ssh: paramiko.SSHClient, rows: list[tuple[str, ...]], apply: bool) -> dict:
    local_users = [{"id": row[0], "usuario": row[1]} for row in rows]
    temp_data = f"/tmp/imi-salud-markers-{uuid.uuid4().hex}.json"
    temp_script = f"/tmp/imi-salud-markers-{uuid.uuid4().hex}.cjs"
    sftp = ssh.open_sftp()
    try:
        with sftp.file(temp_data, "w") as target:
            target.write(json.dumps(local_users, ensure_ascii=False))
        sftp.chmod(temp_data, 0o600)
        with sftp.file(temp_script, "w") as target:
            target.write(MARKER_SCRIPT)
        command = "sudo -n -u ubuntu bash -lc " + shlex.quote(f"node {temp_script} {temp_data} {'apply' if apply else 'plan'}")
        _, stdout, _ = ssh.exec_command(command, timeout=90)
        result = stdout.read().decode("utf-8")
        status = stdout.channel.recv_exit_status()
        if status:
            raise RuntimeError("No se pudieron marcar las cuentas centralizadas en Salud")
        value = json.loads(result)
        if value.get("conflicts"):
            raise RuntimeError("Los vínculos locales existentes no coinciden con las cuentas de Salud")
        return value
    finally:
        for path in (temp_data, temp_script):
            try:
                sftp.remove(path)
            except OSError:
                pass
        sftp.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Confirma la migración en la base central")
    args = parser.parse_args()
    aws, donweb = load_server_config()
    aws_key_path = (SERVERS_CONFIG.parent.parent / aws["key_path"]).resolve()
    aws_ssh = connect_verified(aws, aws_key_path)
    donweb_ssh = None
    try:
        source = prepare_source(get_health_users(aws_ssh))
        donweb_ssh = connect_verified(donweb)
        results = apply_or_plan(donweb_ssh, make_psql_input(source, args.apply))
        try:
            markers = synchronize_local_markers(aws_ssh, source, args.apply)
        except Exception as marker_error:
            if args.apply:
                raise RuntimeError("La migración central ya quedó aplicada, pero faltan los marcadores locales. No desplegar Salud hasta reintentar esta etapa.") from marker_error
            raise
        action = "Migración aplicada" if args.apply else "Simulación completada; no se guardaron cambios"
        print(action)
        print(f"Cuentas procesadas: {len(source)}")
        pending_passwords = [row[1] for row in source if not row[3]]
        if pending_passwords:
            print("Requieren configurar una contraseña desde el enlace de alta: " + ", ".join(pending_passwords))
        for result in results:
            key, _, value = result.partition("|")
            print(f"{key}: {value}")
        print(f"local_migration_markers_to_add: {markers.get('links_to_add', 0)}")
        return 0
    except Exception as error:
        print(f"No se pudo completar la operación: {error}", file=sys.stderr)
        return 1
    finally:
        if donweb_ssh:
            donweb_ssh.close()
        aws_ssh.close()


if __name__ == "__main__":
    raise SystemExit(main())
