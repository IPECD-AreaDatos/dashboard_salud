import { NextResponse } from "next/server";
import { DASHBOARD_ROLES, requireHealthSession } from "@/lib/healthAuth";
import { query } from "@/lib/db";

function jsonNoStore(body: unknown) {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const auth = await requireHealthSession(DASHBOARD_ROLES);
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const rawSearchTerm = searchParams.get("q")?.trim() ?? "";
  const dni = rawSearchTerm.replace(/[\s.-]/g, "");

  if (!/^\d{6,12}$/.test(dni)) {
    return jsonNoStore([]);
  }

  try {
    const sqlQuery = `
      SELECT p.dni, p.nombre, p.apellido
      FROM pacientes_gold p
      WHERE p.dni = $1
        AND embarazo_en_curso = true
        AND fecha_probable_parto >= CURRENT_DATE
        AND en_red_perinatal_msp = true
      LIMIT 1
    `;

    const result = await query(sqlQuery, [dni]);

    const rows = Array.isArray(result) ? result : (result as any).rows;
    if (!rows) return jsonNoStore([]);

    const sugerencias = rows.map((p: any) => ({
      dni: p.dni,
      nombre: `${p.apellido}, ${p.nombre}`
    }));

    return jsonNoStore(sugerencias);
  } catch (error) {
    console.error("Error en API de sugerencias:", error);
    return jsonNoStore({ error: "Error al buscar sugerencias" });
  }
}
