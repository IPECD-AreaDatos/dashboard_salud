/*src/app/api/auditoria/route.ts*/
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  
  // Solo permitimos Admin y Coord
  const allowedRoles = ['Administrador', 'Coordinador'];
  if (!session || (!allowedRoles.includes(session.user?.role) && session.user?.name !== 'admin')) {
    return NextResponse.json({ error: "No autorizado para auditoría" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dni = searchParams.get("dni");
  const establecimiento = searchParams.get("establecimiento");

  try {
    const params: any[] = [];
    let filteringClauses = `WHERE 1=1`;

    if (dni) {
        params.push(`${dni}%`);
        filteringClauses += ` AND uni.dni LIKE $${params.length}`;
    }

    if (establecimiento && establecimiento !== "Todos" && establecimiento !== "undefined") {
      // 👈 NUEVO: Si seleccionan el fallback, filtramos las que quedaron sin join exitoso
      if (establecimiento === "Establecimiento no mapeado") {
        filteringClauses += ` AND s.nombre IS NULL`;
      } else {
        params.push(establecimiento);
        filteringClauses += ` AND s.nombre = $${params.length}`;
      }
    }

    // Unificados con filtros por el DÍA de la última ingesta, incluyendo fecha_nacimiento y eg_actual
    const sql = `
      WITH unificado AS (
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
          fuente,
          batch_id, /* 👈 CLAVE: Extraer el batch_id de la tabla stage */
          'Edad gestacional inválida (< 2 semanas) o ausente' as motivo_auditoria
        FROM pacientes_sin_fpp_stage
        WHERE ingestion_at::date = (SELECT MAX(ingestion_at)::date FROM pacientes_sin_fpp_stage)
        
        UNION ALL
        
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
          fuente,
          batch_id, /* 👈 CLAVE */
          'Edad calculada inconsistente (< 10 años) o ausente' as motivo_auditoria
        FROM pacientes_sin_fnac_stage
        WHERE ingestion_at::date = (SELECT MAX(ingestion_at)::date FROM pacientes_sin_fnac_stage)
        
        UNION ALL
        
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
          fuente,
          batch_id, /* 👈 CLAVE */
          'DNI inválido o no informado' as motivo_auditoria
        FROM pacientes_sin_dni_stage
        WHERE ingestion_at::date = (SELECT MAX(ingestion_at)::date FROM pacientes_sin_dni_stage)
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
        uni.batch_id, /* 👈 Retornar al SELECT final externo */
        s.nombre as nombre_establecimiento_oficial
      FROM unificado uni
      LEFT JOIN efectores_sisa s ON (uni.centro_salud_raw = s.cuie OR uni.centro_salud_raw = s.codigo_sisa)
      ${filteringClauses}
      ORDER BY uni.motivo_auditoria DESC, uni.apellido ASC
    `;

    const result = await query(sql, params);
    
    const pacientes = result.rows.map(p => {
      const fuenteFormateada = p.fuente === 'sumar' 
        ? 'SUMAR' 
        : (p.fuente === 'v_embarazosdw' ? 'POF' : p.fuente || 'S/D');

      return {
        id: parseInt(p.id, 10),
        dni: p.dni || "S/D",
        nombre: p.apellido && p.nombre ? `${p.apellido}, ${p.nombre}` : (p.nombre || "Sin Nombre/Apellido"),
        telefono: p.telefono || "-",
        fpp: p.fecha_probable_parto,
        fecha_nacimiento: p.fecha_nacimiento,
        eg_actual: p.eg_actual !== null ? parseFloat(p.eg_actual) : null,
        establecimiento: p.nombre_establecimiento_oficial || "Establecimiento no mapeado",
        motivo_auditoria: `[${fuenteFormateada}] — ${p.motivo_auditoria}`,
        
        /* 👈 NUEVOS CAMPOS EXPUESTOS */
        edad: p.edad_paciente || null,
        fuente_limpia: fuenteFormateada,
        lote: p.batch_id || "S/D"
      };
    });

    // 👈 NUEVO: Obtenemos el techo de la última fecha de sincronización del set de datos
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
      ultimaActualizacion // 👈 NUEVO: Retornamos la fecha para que el Front la renderice al lado del botón
    });
  } catch (error) {
    console.error("Error en API Auditoría:", error);
    return NextResponse.json({ error: "Error en la base de datos" }, { status: 500 });
  }
}