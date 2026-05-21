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
      params.push(establecimiento);
      filteringClauses += ` AND uni.cuie_seguimiento = $${params.length}`;
    }

    // Unificamos extrayendo los datos tipados desde el campo data_json
    const sql = `
      WITH unificado AS (
        SELECT 
          COALESCE(dni, data_json::json->>'dni') as dni,
          data_json::json->>'nombre' as nombre,
          data_json::json->>'apellido' as apellido,
          data_json::json->>'telefono' as telefono,
          (data_json::json->>'fecha_probable_parto')::date as fecha_probable_parto,
          (data_json::json->>'fecha_ultimo_control')::date as fecha_ultimo_control,
          data_json::json->>'cuie_seguimiento' as cuie_seguimiento,
          fuente,
          'Falta Fecha Probable de Parto (FPP)' as motivo_auditoria
        FROM pacientes_sin_fpp_stage
        
        UNION ALL
        
        SELECT 
          COALESCE(dni, data_json::json->>'dni') as dni,
          data_json::json->>'nombre' as nombre,
          data_json::json->>'apellido' as apellido,
          data_json::json->>'telefono' as telefono,
          (data_json::json->>'fecha_probable_parto')::date as fecha_probable_parto,
          (data_json::json->>'fecha_ultimo_control')::date as fecha_ultimo_control,
          data_json::json->>'cuie_seguimiento' as cuie_seguimiento,
          fuente,
          'Falta Fecha de Nacimiento' as motivo_auditoria
        FROM pacientes_sin_fnac_stage
        
        UNION ALL
        
        SELECT 
          COALESCE(data_json::json->>'dni', '') as dni,
          data_json::json->>'nombre' as nombre,
          data_json::json->>'apellido' as apellido,
          data_json::json->>'telefono' as telefono,
          (data_json::json->>'fecha_probable_parto')::date as fecha_probable_parto,
          (data_json::json->>'fecha_ultimo_control')::date as fecha_ultimo_control,
          data_json::json->>'cuie_seguimiento' as cuie_seguimiento,
          fuente,
          'DNI Inválido o Faltante' as motivo_auditoria
        FROM pacientes_sin_dni_stage
      )
      SELECT 
        ROW_NUMBER() OVER () as id, 
        uni.dni, 
        uni.nombre, 
        uni.apellido, 
        uni.telefono, 
        uni.fecha_probable_parto,
        uni.fecha_ultimo_control,
        uni.motivo_auditoria,
        uni.fuente,
        s.nombre as nombre_establecimiento_oficial,
        (CURRENT_DATE - uni.fecha_ultimo_control) as dias_atraso
      FROM unificado uni
      LEFT JOIN efectores_sisa s ON uni.cuie_seguimiento = s.cuie
      ${filteringClauses}
      ORDER BY uni.motivo_auditoria DESC, uni.apellido ASC
    `;

    const result = await query(sql, params);
    
    const pacientes = result.rows.map(p => {
      // Formatear procedencia de la fuente
      const fuenteFormateada = p.fuente === 'sumar' 
        ? 'SUMAR' 
        : (p.fuente === 'v_embarazosdw' ? 'POF' : p.fuente || 'S/D');

      return {
        id: parseInt(p.id, 10),
        dni: p.dni || "S/D",
        nombre: p.apellido && p.nombre ? `${p.apellido}, ${p.nombre}` : (p.nombre || "Sin Nombre/Apellido"),
        telefono: p.telefono || "-",
        fpp: p.fecha_probable_parto,
        ult_control: p.fecha_ultimo_control,
        establecimiento: p.nombre_establecimiento_oficial || "Establecimiento no mapeado",
        dias: p.dias_atraso !== null ? p.dias_atraso : 999,
        fecha_ultimo_contacto: null, 
        dias_sin_contacto: 999,
        // Agregamos el motivo extendido con la fuente original
        motivo_auditoria: `[${fuenteFormateada}] — ${p.motivo_auditoria}`
      };
    });

    return NextResponse.json({
      data: pacientes,
      totalGlobal: pacientes.length
    });
  } catch (error) {
    console.error("Error en API Auditoría:", error);
    return NextResponse.json({ error: "Error en la base de datos" }, { status: 500 });
  }
}