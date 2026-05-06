import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const sql = `
      SELECT 
        nombre_establecimiento,
        COUNT(CASE WHEN LOWER(riesgo) IN ('si', 's') AND fecha_probable_parto >= CURRENT_DATE THEN 1 END) as total_riesgo
      FROM pacientes_gold 
      WHERE nombre_establecimiento IS NOT NULL
        AND nombre_establecimiento != ''
      GROUP BY nombre_establecimiento
      ORDER BY total_riesgo DESC, nombre_establecimiento ASC
    `;
    const result = await query(sql);

    // Devuelve objetos con label (para mostrar) y value (para filtrar)
    const establecimientos = result.rows.map(r => ({
      value: r.nombre_establecimiento,
      label: `${r.nombre_establecimiento} (${r.total_riesgo} riesgo)`
    }));

    return NextResponse.json(establecimientos);
  } catch (error) {
    return NextResponse.json({ error: "Error al cargar filtros" }, { status: 500 });
  }
}