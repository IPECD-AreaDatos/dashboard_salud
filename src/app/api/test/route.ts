import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const res = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    // Check contact table structure
    const tables = res.rows.map(r => r.table_name);
    let contactCols = [];
    if (tables.includes('contactos_pacientes') || tables.includes('contactos')) {
      const colRes = await query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'contactos_pacientes' OR table_name = 'contactos'
      `);
      contactCols = colRes.rows;
    }

    return NextResponse.json({ tables, contactCols });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
