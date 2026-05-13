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
    let whereClause = `WHERE 1=1`;
    const params: any[] = [];

    // Filtros por parámetros
    if (dni) {
        params.push(`${dni}%`);
        whereClause += ` AND p.dni LIKE $${params.length}`;
    }

    if (establecimiento && establecimiento !== "Todos" && establecimiento !== "undefined") {
      params.push(establecimiento);
      whereClause += ` AND p.cuie_seguimiento = $${params.length}`;
    }

    // Condición base de anomalía para Auditoría
    whereClause += ` AND (
      p.fecha_nacimiento IS NULL
      OR (p.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - p.fecha_ultimo_control) > 200)
      OR (p.fecha_ultimo_control IS NULL AND p.fecha_registro IS NOT NULL AND (CURRENT_DATE - p.fecha_registro::date) > 200)
      OR p.fecha_probable_parto < (CURRENT_DATE - INTERVAL '30 days')
    )`;

    const sql = `
      SELECT 
        p.id, 
        p.dni, 
        p.nombre, 
        p.apellido, 
        p.telefono, 
        p.fecha_probable_parto,
        p.fecha_ultimo_control,
        s.nombre as nombre_establecimiento_oficial,
        (CURRENT_DATE - p.fecha_ultimo_control) as dias_atraso,
        (SELECT MAX(sec.fecha_contacto) 
         FROM seguimientos sec 
         WHERE sec.paciente_id = p.id) as fecha_ultimo_contacto,
        CASE 
          WHEN p.fecha_nacimiento IS NULL THEN 'Falta fecha de nacimiento'
          WHEN p.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - p.fecha_ultimo_control) > 200 THEN 'Control atrasado (>200 días)'
          WHEN p.fecha_ultimo_control IS NULL AND p.fecha_registro IS NOT NULL AND (CURRENT_DATE - p.fecha_registro::date) > 200 THEN 'Sin controles desde registro (>200 días)'
          WHEN p.fecha_probable_parto < (CURRENT_DATE - INTERVAL '30 days') THEN 'FPP vencida (>30 días)'
          ELSE 'Inconsistencia detectada'
        END as motivo_auditoria
      FROM pacientes_gold p
      LEFT JOIN efectores_sisa s ON p.cuie_seguimiento = s.cuie
      ${whereClause}
      ORDER BY dias_atraso DESC NULLS LAST
    `;

    const result = await query(sql, params);
    
    const pacientes = result.rows.map(p => {
      const hoy = new Date();
      const ultContacto = p.fecha_ultimo_contacto ? new Date(p.fecha_ultimo_contacto) : null;
      const diasSContacto = ultContacto 
          ? Math.floor((hoy.getTime() - ultContacto.getTime()) / (1000 * 60 * 60 * 24))
          : 999;

      return {
        id: p.id,
        dni: p.dni,
        nombre: `${p.apellido}, ${p.nombre}`,
        telefono: p.telefono || "-",
        fpp: p.fecha_probable_parto,
        ult_control: p.fecha_ultimo_control,
        establecimiento: p.nombre_establecimiento_oficial || "No asignado",
        dias: p.dias_atraso !== null ? p.dias_atraso : 999,
        fecha_ultimo_contacto: p.fecha_ultimo_contacto, 
        dias_sin_contacto: diasSContacto,
        motivo_auditoria: p.motivo_auditoria
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
