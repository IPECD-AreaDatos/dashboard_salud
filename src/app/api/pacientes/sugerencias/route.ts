/*src/app/api/pacientes/sugerencias/route.ts*/
import { NextResponse } from "next/server";
import { requireHealthSession } from "@/lib/healthAuth";
import { patientScope } from "@/lib/patientScope";
// Cambiamos 'pool' por 'query' porque es lo que realmente exporta tu lib/db.ts
import { query } from "@/lib/db";

export async function GET(request: Request) {
  const auth = await requireHealthSession();
  if (!auth.ok) return auth.response;
  const session = auth.session;
  const scope = patientScope(session.user);
  const { searchParams } = new URL(request.url);
  const searchTerm = searchParams.get("q");

  // Si no hay búsqueda o es muy corta, devolvemos vacío para no saturar
  if (!searchTerm || searchTerm.length < 1) {
    return NextResponse.json([]);
  }

  try {
    // Usamos 'query' que es una función directa en tu proyecto[cite: 2]
    // Buscamos por DNI o por Apellido en la Capa Gold consolidada[cite: 2]
    const result = await query(
      `SELECT p.dni, p.nombre, p.apellido
       FROM pacientes_gold p
       WHERE (p.dni LIKE $1 OR p.apellido ILIKE $1)
         AND embarazo_en_curso = true
         AND fecha_probable_parto >= CURRENT_DATE
         AND en_red_perinatal_msp = true
         AND ${scope.sql}
       LIMIT 10`,
      [`${searchTerm}%`, ...scope.params]
    );

    // Dependiendo de cómo esté configurado tu db.ts, 'result' puede ser
    // directamente el array de filas o un objeto con la propiedad .rows
    const rows = Array.isArray(result) ? result : (result as any).rows;

    if (!rows) return NextResponse.json([]);

    const sugerencias = rows.map((p: any) => ({
      dni: p.dni,
      nombre: `${p.apellido}, ${p.nombre}`
    }));

    return NextResponse.json(sugerencias);
  } catch (error) {
    console.error("Error en API de sugerencias:", error);
    return NextResponse.json({ error: "Error al buscar sugerencias" }, { status: 500 });
  }
}
