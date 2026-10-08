import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";

const normalizeSource = (source: string | null) => {
  const normalized = source?.trim().toLowerCase();
  if (normalized === "sumar") return "SUMAR";
  if (normalized === "v_embarazosdw" || normalized === "pof") return "POF";
  return source?.trim() || "S/D";
};

const normalizeDate = (value: string | null) => value || null;

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  
  const role = session?.user?.role;
  const isLegacyAdmin = session?.user?.name === "admin";
  const allowedRoles = ["administrador", "coordinador", "centro de salud", "maternidad", "lectura"];
  const isAllowedRole = role ? allowedRoles.includes(role.toLowerCase()) : false;

  if (!session || (!isAllowedRole && !isLegacyAdmin) || role === "Supervisora") {
    return NextResponse.json(
      { error: "No autorizado para consultar la auditoría de Red Perinatal" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const dni = searchParams.get("dni")?.trim();
  const establecimiento = searchParams.get("establecimiento")?.trim();

  try {
    const params: unknown[] = [];
    let filteringClauses = "WHERE 1=1";

    // 🛡️ 1. Filtros según Rol (RBAC)
    if (role === "Centro de Salud") {
      if (session.user?.sisa_code) {
        params.push(session.user.sisa_code);
        filteringClauses += ` AND enriched.centro_salud_raw = $${params.length}`;
      } else if (session.user?.cuie_code) {
        params.push(session.user.cuie_code);
        params.push(session.user.cuie_code);
        filteringClauses += ` AND (enriched.centro_salud_raw = $${params.length - 1} OR enriched.centro_salud_raw IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = $${params.length}))`;
      }
    } else if (role === "Maternidad") {
      const maternityId = session.user?.maternidad_id;
      let localClause = "";

      if (session.user?.sisa_code) {
        params.push(session.user.sisa_code);
        localClause = `enriched.centro_salud_raw = $${params.length}`;
      } else if (session.user?.cuie_code) {
        params.push(session.user.cuie_code);
        params.push(session.user.cuie_code);
        localClause = `(enriched.centro_salud_raw = $${params.length - 1} OR enriched.centro_salud_raw IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = $${params.length}))`;
      }

      if (localClause && maternityId) {
        params.push(maternityId);
        filteringClauses += ` AND (${localClause} OR enriched.derivacion_maternidad_id = $${params.length})`;
      }
    }

    // 🔍 2. Filtros manuales
    if (dni) {
      params.push(`${dni}%`);
      filteringClauses += ` AND enriched.dni LIKE $${params.length}`;
    }

    if (
      (role === "Administrador" || role === "Coordinador" || role?.toLowerCase() === "lectura" || isLegacyAdmin) &&
      establecimiento &&
      establecimiento !== "Todos" &&
      establecimiento !== "undefined"
    ) {
      if (establecimiento === "Establecimiento no mapeado") {
        filteringClauses += " AND enriched.nombre_establecimiento_oficial IS NULL";
      } else {
        params.push(establecimiento);
        filteringClauses += ` AND enriched.nombre_establecimiento_oficial = $${params.length}`;
      }
    }

    // 📊 3. Query Principal
    const sql = `
      WITH latest_batch AS (
        SELECT MAX(ingestion_at) AS ingestion_at
        FROM public.pacientes_fuera_red_perinatal_msp_stage
      ),
      red_perinatal AS (
        SELECT
          p.id,
          p.paciente_gold_id,
          COALESCE(p.dni, p.data_json::json->>'dni', '') AS dni,
          COALESCE(p.nombre, p.data_json::json->>'nombre', '') AS nombre,
          COALESCE(p.apellido, p.data_json::json->>'apellido', '') AS apellido,
          COALESCE(p.data_json::json->>'telefono', '') AS telefono,
          COALESCE(p.fecha_nacimiento::text, p.data_json::json->>'fecha_nacimiento', '') AS fecha_nacimiento,
          COALESCE(p.fecha_probable_parto::text, p.data_json::json->>'fecha_probable_parto', '') AS fecha_probable_parto,
          COALESCE(p.fecha_ultimo_control::text, p.data_json::json->>'fecha_ultimo_control', '') AS fecha_ultimo_control,
          p.data_json::json->>'eg_actual' AS eg_actual,
          COALESCE(p.sisa_centro_salud, p.data_json::json->>'sisa_centro_salud', p.data_json::json->>'cuie_seguimiento') AS centro_salud_raw,
          COALESCE(p.sisa_centro_derivado, p.data_json::json->>'derivacion_maternidad_id', '') AS derivacion_maternidad_id,
          COALESCE(p.motivo_derivacion, p.data_json::json->>'motivo_derivacion', p.data_json::json->>'motivo') AS motivo_derivacion,
          COALESCE(p.motivo_revision, p.data_json::json->>'motivo_revision', '') AS motivo_revision,
          COALESCE(p.fuente, p.data_json::json->>'fuente', '') AS fuente,
          p.batch_id,
          p.ingestion_at
        FROM public.pacientes_fuera_red_perinatal_msp_stage p
        WHERE p.ingestion_at::date = (SELECT ingestion_at::date FROM latest_batch)
      ),
      enriched AS (
        SELECT
          rp.*,
          COALESCE(e.nombre, rp.centro_salud_raw) AS nombre_establecimiento_oficial
        FROM red_perinatal rp
        LEFT JOIN public.efectores_sisa e
          ON (rp.centro_salud_raw = e.cuie OR rp.centro_salud_raw = e.codigo_sisa)
      )
      SELECT
        ROW_NUMBER() OVER (ORDER BY apellido ASC, nombre ASC) AS id,
        dni,
        nombre,
        apellido,
        telefono,
        fecha_nacimiento,
        fecha_probable_parto,
        fecha_ultimo_control,
        eg_actual,
        centro_salud_raw,
        derivacion_maternidad_id,
        motivo_derivacion,
        motivo_revision,
        fuente,
        batch_id,
        ingestion_at,
        nombre_establecimiento_oficial
      FROM enriched
      ${filteringClauses}
      ORDER BY apellido ASC, nombre ASC
    `;

    const result = await query(sql, params);

    const pacientes = result.rows.map((row) => ({
      id: Number(row.id),
      dni: row.dni || "S/D",
      nombre: row.apellido && row.nombre ? `${row.apellido}, ${row.nombre}` : row.nombre || "Sin nombre",
      telefono: row.telefono || "-",
      fecha_nacimiento: normalizeDate(row.fecha_nacimiento),
      fpp: normalizeDate(row.fecha_probable_parto),
      fecha_ultimo_control: normalizeDate(row.fecha_ultimo_control),
      eg_actual: row.eg_actual ? Number(row.eg_actual) : null,
      establecimiento: row.nombre_establecimiento_oficial || "Establecimiento no mapeado",
      motivo_derivacion: row.motivo_derivacion || "Sin motivo informado",
      motivo_revision: row.motivo_revision || "Sin revisión registrada",
      fuente: normalizeSource(row.fuente),
      batch_id: row.batch_id || "S/D",
      ingestion_at: row.ingestion_at,
    }));

    // 📈 4. Consulta de Metadatos corregida (sin error de GROUP BY)
    const metadata = await query(`
      SELECT
        MAX(ingestion_at) AS ultima_actualizacion,
        MAX(batch_id) AS batch_id,
        COUNT(*) AS total
      FROM public.pacientes_fuera_red_perinatal_msp_stage
      WHERE ingestion_at::date = (
        SELECT MAX(ingestion_at)::date
        FROM public.pacientes_fuera_red_perinatal_msp_stage
      )
    `);

    const summary = metadata.rows[0];

    return NextResponse.json({
      data: pacientes,
      totalGlobal: Number(summary?.total || 0),
      ultimaActualizacion: summary?.ultima_actualizacion ?? null,
      batch_id: summary?.batch_id ?? null,
    });
  } catch (error) {
    console.error("Error en API Auditoría Red Perinatal:", error);
    return NextResponse.json({ error: "Error en la base de datos" }, { status: 500 });
  }
}