import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const pacienteId = searchParams.get("pacienteId");

  if (!pacienteId) return NextResponse.json({ error: "Falta pacienteId" }, { status: 400 });

  try {
    const res = await query(
      "SELECT * FROM seguimientos WHERE paciente_id = $1 ORDER BY created_at DESC",
      [parseInt(pacienteId)]
    );
    return NextResponse.json(res.rows);
  } catch (error) {
    console.error("Error obteniendo seguimientos:", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await request.json();
    const {
      paciente_id,
      contacto_logrado,
      medio_contacto,
      persona_contactada,
      telefono_contactado,
      observaciones,
      proxima_cita,
      personal_salud
    } = body;

    const sql = `
      INSERT INTO seguimientos (
        paciente_id,
        fecha_contacto,
        contacto_logrado,
        medio_contacto,
        persona_contactada,
        telefono_contactado,
        observaciones,
        proxima_cita,
        personal_salud,
        usuario_id,
        created_at,
        updated_at
      ) VALUES (
        $1, CURRENT_TIMESTAMP, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ) RETURNING id
    `;

    // next-auth defaults to placing user email or name. We'll leave usuario_id as null if not readily available
    // and rely on personal_salud string.
    const usuario_id = null;
    const cita = proxima_cita ? proxima_cita : null;

    const params = [
      paciente_id,
      contacto_logrado,
      medio_contacto,
      persona_contactada,
      telefono_contactado,
      observaciones,
      cita,
      personal_salud,
      usuario_id
    ];

    const result = await query(sql, params);

    // Actualizar también ultimo_contacto_at en la tabla principal
    await query(`UPDATE pacientes_gold SET ultimo_contacto_at = CURRENT_TIMESTAMP WHERE id = $1`, [paciente_id]);

    return NextResponse.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error("Error guardando seguimiento:", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
