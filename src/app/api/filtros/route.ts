import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const sql = `
      SELECT 
        s.nombre as nombre_oficial,
        COUNT(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND p.fecha_probable_parto >= CURRENT_DATE THEN 1 END) as total_riesgo
      FROM pacientes_gold p
      -- Unimos con el maestro de SISA por el CUIE para normalizar nombres
      INNER JOIN efectores_sisa s ON p.cuie_seguimiento = s.cuie
      WHERE s.nombre IS NOT NULL
        AND s.nombre != ''
      GROUP BY s.nombre
      ORDER BY total_riesgo DESC, s.nombre ASC
    `;
    const result = await query(sql);

    // Mapeamos para el componente Select del Frontend
    const establecimientos = result.rows.map(r => ({
      // El value sigue siendo el nombre para que la query de búsqueda funcione
      value: r.nombre_oficial,
      label: `${r.nombre_oficial} (${r.total_riesgo} riesgo)`
    }));

    // Agregamos la opción "Todos" al principio
    return NextResponse.json([
      { value: "Todos", label: "Todos los establecimientos" },
      ...establecimientos
    ]);

  } catch (error) {
    console.error("Error en API Filtros:", error);
    return NextResponse.json({ error: "Error al cargar filtros" }, { status: 500 });
  }
}