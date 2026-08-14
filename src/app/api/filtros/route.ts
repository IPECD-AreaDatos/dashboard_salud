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
        COALESCE(NULLIF(TRIM(s.localidad), ''), s.departamento, '') AS localidad,
        COUNT(CASE 
          WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') 
               AND p.fecha_probable_parto >= CURRENT_DATE 
               AND p.embarazo_en_curso = true -- 👈 Control sanitario de embarazo activo
          THEN 1 
        END) as total_riesgo
      FROM pacientes_gold p
      -- 👈 CORREGIDO: INNER JOIN usando sisa_centro_salud para normalizar por SISA
      INNER JOIN efectores_sisa s ON p.sisa_centro_salud = s.codigo_sisa
      WHERE s.nombre IS NOT NULL
        AND s.nombre != ''
      GROUP BY s.cuie, s.codigo_sisa, s.nombre, s.localidad, s.departamento
      ORDER BY total_riesgo DESC, s.nombre ASC
    `;
    const result = await query(sql);

    // Mapeamos enviando las propiedades separadas y un label completo para búsquedas
    const establecimientos = result.rows.map((r: any) => {
      const loc = r.localidad ? r.localidad.trim() : '';
      const locLabel = loc ? ` - ${loc}` : '';
      const cantRiesgo = parseInt(r.total_riesgo) || 0;

      return {
        value: r.codigo_sisa,
        cuie: r.cuie,
        nombre: r.nombre_oficial,
        localidad: loc,
        totalRiesgo: cantRiesgo,
        // Label plano de fallback (útil para el input o búsquedas)
        label: `${(r.nombre_oficial || '').trim()}${locLabel} (${cantRiesgo} riesgo)`
      };
    });

    return NextResponse.json([
      { 
        value: "Todos", 
        label: "Todos los establecimientos",
        nombre: "Todos los establecimientos",
        localidad: "",
        totalRiesgo: 0
      },
      ...establecimientos
    ]);

  } catch (error) {
    console.error("Error en API Filtros:", error);
    return NextResponse.json({ error: "Error al cargar filtros" }, { status: 500 });
  }
}