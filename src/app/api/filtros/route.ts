/*src/app/api/filtros/route.ts*/ 
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const sql = `
      SELECT 
        s.cuie,
        s.codigo_sisa,
        s.nombre as nombre_oficial,
        COUNT(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND p.fecha_probable_parto >= CURRENT_DATE THEN 1 END) as total_riesgo
      FROM pacientes_gold p
      -- Unimos con el maestro de SISA por el CUIE para normalizar nombres
      INNER JOIN efectores_sisa s ON p.cuie_seguimiento = s.cuie
      WHERE s.nombre IS NOT NULL
        AND s.nombre != ''
      GROUP BY s.cuie, s.codigo_sisa, s.nombre
      ORDER BY total_riesgo DESC, s.nombre ASC
    `;
    const result = await query(sql);

    // Mapeamos para el componente Select del Frontend
    const establecimientos = result.rows.map(r => ({
      value: r.cuie, // <--- Mandamos el CUIE como valor
      sisa: r.codigo_sisa,
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