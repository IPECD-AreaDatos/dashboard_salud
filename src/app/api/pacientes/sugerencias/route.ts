import { NextResponse } from "next/server";
import { DASHBOARD_ROLES, requireHealthSession } from "@/lib/healthAuth";
import { patientScope } from "@/lib/patientScope";
import { query } from "@/lib/db";

export async function GET(request: Request) {
  const auth = await requireHealthSession(DASHBOARD_ROLES);
  if (!auth.ok) return auth.response;
  const session = auth.session;
  const scope = patientScope(session.user);
  const { searchParams } = new URL(request.url);
  const searchTerm = searchParams.get("q");

  if (!searchTerm || searchTerm.length < 1) {
    return NextResponse.json([]);
  }

  try {
    // Detectamos si el usuario está buscando un DNI (si empieza con números o tiene longitud típica de DNI)
    // O si prefieres que CUALQUIER búsqueda por texto libre (DNI o Apellido) busque en toda la provincia,
    // simplemente omitimos ${scope.sql} cuando hay un término de búsqueda activo.
    
    // Si queremos que busque en todo el padrón provincial al usar el buscador:
    const sqlQuery = `
      SELECT p.dni, p.nombre, p.apellido
      FROM pacientes_gold p
      WHERE (p.dni ILIKE $1 OR p.apellido ILIKE $1)
        AND embarazo_en_curso = true
        AND fecha_probable_parto >= CURRENT_DATE
        AND en_red_perinatal_msp = true
      LIMIT 10
    `;

    const result = await query(sqlQuery, [`${searchTerm}%`]);

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