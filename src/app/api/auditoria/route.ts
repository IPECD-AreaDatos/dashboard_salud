import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

const formatearMotivoAuditoria = (motivo: string | null) => {
  const motivoOriginal = motivo?.trim() || "Edad gestacional inválida (< 2 semanas) o ausente";
  const motivoNormalizado = motivoOriginal
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (motivoNormalizado === "eg_actual_menor_2") {
    return "Edad gestacional menor a 2 semanas";
  }

  if (motivoNormalizado === "sin_fpp") {
    return "Falta registrar la Fecha Probable de Parto (FPP)";
  }

  if (motivoNormalizado.includes("embarazo en curso en pof") && motivoNormalizado.includes("30 dias de diferencia")) {
    return "Existe un embarazo POF en curso con una FPP a más de 30 días de diferencia";
  }

  if (motivoOriginal.includes("_")) {
    return motivoOriginal.replace(/_/g, " ");
  }

  return motivoOriginal;
};

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (
    !session ||
    (session.user?.role !== "Administrador" &&
      session.user?.role !== "Coordinador" &&
      session.user?.role !== "Centro de Salud" &&
      session.user?.role !== "Maternidad" &&
      session.user?.role !== "Supervisora" &&
      session.user?.role?.toLowerCase() !== "lectura" &&
      session.user?.name !== "admin")
  ) {
    return NextResponse.json({ error: "No autorizado para consultar auditoría" }, { status: 403 });
  }

  if (session.user?.role === "Supervisora") {
    return NextResponse.json({ error: "No autorizado para consultar auditoría" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dni = searchParams.get("dni");
  const establecimiento = searchParams.get("establecimiento");

  try {
    const sisa = session.user?.sisa_code;
    const cuie = session.user?.cuie_code;
    const userRole = session.user?.role;

    const params: unknown[] = [];

    // 🛡️ 1. SEGURIDAD RBAC
    let filteringClauses = `WHERE 1=1`;

    if (userRole === "Centro de Salud") {
      if (sisa) {
        params.push(sisa);
        filteringClauses += ` AND uni.centro_salud_raw = $${params.length}`;
      } else if (cuie) {
        params.push(cuie);
        params.push(cuie);
        filteringClauses += ` AND (uni.centro_salud_raw = $${params.length - 1} OR uni.centro_salud_raw IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = $${params.length}))`;
      }
    } else if (userRole === "Maternidad") {
      const matId = session.user?.maternidad_id;
      let localClause = "";
      if (sisa) {
        params.push(sisa);
        localClause = `uni.centro_salud_raw = $${params.length}`;
      } else if (cuie) {
        params.push(cuie);
        params.push(cuie);
        localClause = `(uni.centro_salud_raw = $${params.length - 1} OR uni.centro_salud_raw IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = $${params.length}))`;
      }
      if (localClause && matId) {
        params.push(matId);
        filteringClauses += ` AND (${localClause} OR uni.derivacion_maternidad_id = $${params.length})`;
      }
    }

    // 🔍 2. FILTROS MANUALES
    if (dni) {
      params.push(`${dni}%`);
      filteringClauses += ` AND uni.dni LIKE $${params.length}`;
    }

    if (
      (userRole === "Administrador" || userRole === "Coordinador" || userRole?.toLowerCase() === "lectura") &&
      establecimiento &&
      establecimiento !== "Todos" &&
      establecimiento !== "undefined"
    ) {
      if (establecimiento === "Establecimiento no mapeado") {
        filteringClauses += ` AND s.nombre IS NULL`;
      } else {
        params.push(establecimiento);
        filteringClauses += ` AND s.nombre = $${params.length}`;
      }
    }

    // 📊 3. QUERY CON ÚLTIMA EXTRACCIÓN INDEPENDIENTE POR TABLA + INGESTION_AT
    const sql = `
      WITH ultimo_sin_fpp AS (
        SELECT MAX(ingestion_at::date) AS fecha FROM pacientes_sin_fpp_stage
      ),
      ultimo_sin_fnac AS (
        SELECT MAX(ingestion_at::date) AS fecha FROM pacientes_sin_fnac_stage
      ),
      ultimo_sin_dni AS (
        SELECT MAX(ingestion_at::date) AS fecha FROM pacientes_sin_dni_stage
      ),
      unificado AS (
        -- 1. Casos de pacientes sin FPP
        SELECT 
          COALESCE(dni, data_json::json->>'dni') as dni,
          data_json::json->>'nombre' as nombre,
          data_json::json->>'apellido' as apellido,
          data_json::json->>'telefono' as telefono,
          (data_json::json->>'fecha_probable_parto')::date as fecha_probable_parto,
          (data_json::json->>'fecha_ultimo_control')::date as fecha_ultimo_control,
          (data_json::json->>'fecha_nacimiento')::date as fecha_nacimiento,
          (data_json::json->>'eg_actual')::numeric as eg_actual,
          COALESCE(data_json::json->>'sisa_centro_salud', data_json::json->>'cuie_seguimiento') as centro_salud_raw,
          data_json::json->>'derivacion_maternidad_id' as derivacion_maternidad_id,
          fuente,
          batch_id,
          ingestion_at,
          COALESCE(NULLIF(TRIM(motivo), ''), 'Edad gestacional inválida (< 2 semanas) o ausente') as motivo_auditoria
        FROM pacientes_sin_fpp_stage
        WHERE ingestion_at::date = (SELECT fecha FROM ultimo_sin_fpp)
        
        UNION ALL
        
        -- 2. Casos de pacientes sin fecha de nacimiento
        SELECT 
          COALESCE(dni, data_json::json->>'dni') as dni,
          data_json::json->>'nombre' as nombre,
          data_json::json->>'apellido' as apellido,
          data_json::json->>'telefono' as telefono,
          (data_json::json->>'fecha_probable_parto')::date as fecha_probable_parto,
          (data_json::json->>'fecha_ultimo_control')::date as fecha_ultimo_control,
          (data_json::json->>'fecha_nacimiento')::date as fecha_nacimiento,
          (data_json::json->>'edad_calculada')::numeric as eg_actual,
          COALESCE(data_json::json->>'sisa_centro_salud', data_json::json->>'cuie_seguimiento') as centro_salud_raw,
          data_json::json->>'derivacion_maternidad_id' as derivacion_maternidad_id,
          fuente,
          batch_id,
          ingestion_at,
          'Edad calculada inconsistente (< 10 años) o ausente' as motivo_auditoria
        FROM pacientes_sin_fnac_stage
        WHERE ingestion_at::date = (SELECT fecha FROM ultimo_sin_fnac)
        
        UNION ALL
        
        -- 3. Casos de pacientes sin DNI
        SELECT 
          COALESCE(data_json::json->>'dni', '') as dni,
          data_json::json->>'nombre' as nombre,
          data_json::json->>'apellido' as apellido,
          data_json::json->>'telefono' as telefono,
          (data_json::json->>'fecha_probable_parto')::date as fecha_probable_parto,
          (data_json::json->>'fecha_ultimo_control')::date as fecha_ultimo_control,
          (data_json::json->>'fecha_nacimiento')::date as fecha_nacimiento,
          (data_json::json->>'eg_actual')::numeric as eg_actual,
          COALESCE(data_json::json->>'sisa_centro_salud', data_json::json->>'cuie_seguimiento') as centro_salud_raw,
          data_json::json->>'derivacion_maternidad_id' as derivacion_maternidad_id,
          fuente,
          batch_id,
          ingestion_at,
          'DNI inválido o no informado' as motivo_auditoria
        FROM pacientes_sin_dni_stage
        WHERE ingestion_at::date = (SELECT fecha FROM ultimo_sin_dni)
          AND data_json::json->>'apellido' IS NOT NULL 
          AND data_json::json->>'apellido' != ''
      )
      SELECT 
        ROW_NUMBER() OVER () as id, 
        uni.dni, 
        uni.nombre, 
        uni.apellido, 
        uni.telefono, 
        uni.fecha_probable_parto,
        uni.fecha_ultimo_control,
        uni.fecha_nacimiento, 
        uni.eg_actual,        
        uni.motivo_auditoria,
        uni.fuente,
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, uni.fecha_nacimiento))::int as edad_paciente,
        uni.batch_id,
        uni.ingestion_at,
        s.nombre as nombre_establecimiento_oficial
      FROM unificado uni
      LEFT JOIN efectores_sisa s ON (uni.centro_salud_raw = s.cuie OR uni.centro_salud_raw = s.codigo_sisa)
      ${filteringClauses}
      ORDER BY uni.motivo_auditoria DESC, uni.apellido ASC
    `;

    const result = await query(sql, params);

    const pacientes = result.rows.map((p) => {
      const fuenteFormateada =
        p.fuente === "sumar"
          ? "SUMAR"
          : p.fuente === "v_embarazosdw"
          ? "POF"
          : p.fuente || "S/D";

      return {
        id: parseInt(p.id, 10),
        dni: p.dni || "S/D",
        nombre: p.apellido && p.nombre ? `${p.apellido}, ${p.nombre}` : p.nombre || "Sin Nombre/Apellido",
        telefono: p.telefono || "-",
        fpp: p.fecha_probable_parto,
        fecha_nacimiento: p.fecha_nacimiento,
        eg_actual: p.eg_actual !== null ? parseFloat(p.eg_actual) : null,
        establecimiento: p.nombre_establecimiento_oficial || "Establecimiento no mapeado",
        motivo_auditoria: `[${fuenteFormateada}] — ${formatearMotivoAuditoria(p.motivo_auditoria)}`,
        edad: p.edad_paciente || null,
        fuente_limpia: fuenteFormateada,
        lote: p.batch_id || "S/D",
        fecha_ingesta: p.ingestion_at || null,
        
      };
    });

    const fechaRes = await query(`
      SELECT GREATEST(
        (SELECT MAX(ingestion_at) FROM pacientes_sin_fpp_stage),
        (SELECT MAX(ingestion_at) FROM pacientes_sin_fnac_stage),
        (SELECT MAX(ingestion_at) FROM pacientes_sin_dni_stage)
      ) as ultima_actualizacion
    `);
    const ultimaActualizacion = fechaRes.rows[0]?.ultima_actualizacion ?? null;

    return NextResponse.json({
      data: pacientes,
      totalGlobal: pacientes.length,
      ultimaActualizacion,
    });
  } catch (error) {
    console.error("Error en API Auditoría:", error);
    return NextResponse.json({ error: "Error en la base de datos" }, { status: 500 });
  }
}