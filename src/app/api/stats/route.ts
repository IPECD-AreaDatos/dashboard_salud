// src/app/api/stats/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const establecimiento = searchParams.get('establecimiento');

  try {
    // Base de la query
    let whereClause = "WHERE fecha_probable_parto >= CURRENT_DATE";
    let params: any[] = [];

    if (establecimiento && establecimiento !== 'Todos') {
      whereClause += " AND nombre_establecimiento = $1";
      params.push(establecimiento);
    }

    // Queries dinámicas
    const totalRes = await query(`SELECT COUNT(*) FROM pacientes_gold ${whereClause}`, params);
    const alertsRes = await query(`SELECT COUNT(*) FROM pacientes_gold ${whereClause} AND (riesgo = 'Si' OR riesgo = 'S')`, params);
    
    // Lista de establecimientos para el filtro del Front
    const estRes = await query(`
      SELECT nombre_establecimiento as name, COUNT(*) as value 
      FROM pacientes_gold 
      WHERE riesgo IN ('Si', 'S') 
      GROUP BY nombre_establecimiento 
      ORDER BY value DESC
    `);

    return NextResponse.json({
      totalPatients: parseInt(totalRes.rows[0].count),
      activeAlerts: parseInt(alertsRes.rows[0].count),
      establecimientos: estRes.rows,
      trends: estRes.rows.slice(0, 6) // Los 6 con más riesgo para el gráfico
    });
  } catch (error) {
    return NextResponse.json({ error: "Error en DB" }, { status: 500 });
  }
}