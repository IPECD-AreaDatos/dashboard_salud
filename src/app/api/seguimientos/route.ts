/*src/app/api/seguimientos/route.ts*/
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { patientScope } from "@/lib/patientScope";
import { requireHealthSession } from "@/lib/healthAuth";

/**
 * GET: Obtiene el historial de contactos de una paciente específica.
 */
export async function GET(request: Request) {
  const auth = await requireHealthSession();
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const { searchParams } = new URL(request.url);
  const pacienteId = searchParams.get("pacienteId");

  if (!pacienteId) return NextResponse.json({ error: "Falta pacienteId" }, { status: 400 });

  try {
    const scope = patientScope(session.user);
    const res = await query(
      `SELECT s.* FROM seguimientos s JOIN pacientes_gold p ON p.id = s.paciente_id WHERE s.paciente_id = $1 AND ${scope.sql} ORDER BY s.fecha_contacto DESC`,
      [parseInt(pacienteId), ...scope.params]
    );
    return NextResponse.json(res.rows);
  } catch (error) {
    console.error("Error obteniendo seguimientos:", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

/**
 * POST: Registra un nuevo contacto.
 * La identidad del operador se toma exclusivamente de la sesión central.
 */
export async function POST(request: Request) {
  const auth = await requireHealthSession();
  if (!auth.ok) return auth.response;
  const session = auth.session;

  // 🛡️ Bloqueo estricto para perfiles de sólo lectura
  if (session.user?.role?.toLowerCase() === 'lectura') {
    return NextResponse.json(
      { error: "Permiso denegado: el perfil de lectura no puede realizar modificaciones ni registrar contactos" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const {
      paciente_id,
      contacto_logrado,
      medio_contacto,
      persona_contactada,
      telefono_contactado,
      observaciones,
      proxima_cita
      // El autor se toma exclusivamente de la sesión autenticada.
    } = body;

    const scope = patientScope(session.user);
    const permitted = await query(`SELECT 1 FROM pacientes_gold p WHERE p.id = $1 AND ${scope.sql} LIMIT 1`, [paciente_id, ...scope.params]);
    if (!permitted.rows.length) return NextResponse.json({ error: "No autorizado para esta paciente" }, { status: 403 });

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
        usuario_central,
        created_at,
        updated_at
      ) VALUES (
        $1, CURRENT_TIMESTAMP, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ) RETURNING id
    `;

    const cita = proxima_cita ? proxima_cita : null;

    const params = [
      paciente_id,
      contacto_logrado,
      medio_contacto,
      persona_contactada,
      telefono_contactado,
      observaciones,
      cita,
      session.user.username || session.user.name || "Usuario",
      session.user.username || null
    ];

    const result = await query(sql, params);

    // 3. Actualizamos el flag de último contacto en la tabla principal SOLO SI FUE LOGRADO
    if (contacto_logrado === true) { // 👈 FILTRO CORRECTO DE TONY
      await query(
        `UPDATE pacientes_gold 
         SET ultimo_contacto_at = CURRENT_TIMESTAMP 
         WHERE id = $1`, 
        [paciente_id]
      );
    }

    return NextResponse.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error("Error guardando seguimiento:", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
