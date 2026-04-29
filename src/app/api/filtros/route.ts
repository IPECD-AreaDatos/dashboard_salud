import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    // Traemos los establecimientos que tienen pacientes asignados para no llenar el combo de más
    const sql = `
      SELECT DISTINCT nombre_establecimiento 
      FROM pacientes_gold 
      WHERE nombre_establecimiento IS NOT NULL 
      ORDER BY nombre_establecimiento ASC
    `;
    const result = await query(sql);
    return NextResponse.json(result.rows.map(r => r.nombre_establecimiento));
  } catch (error) {
    return NextResponse.json({ error: "Error al cargar filtros" }, { status: 500 });
  }
}