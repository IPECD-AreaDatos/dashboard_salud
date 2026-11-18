import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { requireHealthSession } from "@/lib/healthAuth";

/**
- GET: Obtiene el historial de contactos de una paciente específica (abierto a todo el padrón provincial al buscar por DNI).
 */
export async function GET(request: Request) {
  const auth = await requireHealthSession();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const pacienteId = searchParams.get("pacienteId");

  if (!pacienteId) return NextResponse.json({ error: "Falta pacienteId" }, { status: 400 });

  try {
    const res = await query(
      `SELECT s.* FROM seguimientos s JOIN pacientes_gold p ON p.id = s.paciente_id WHERE s.paciente_id = $1 ORDER BY s.fecha_contacto DESC`,
      [parseInt(pacienteId)]
    );
    return NextResponse.json(res.rows);
  } catch (error) {
    console.error("Error obteniendo seguimientos:", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

/**
- POST: Registra un nuevo contacto (permite registrar seguimiento a pacientes de otros centros si fueron buscadas por DNI).
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
    } = body;

    // Validamos únicamente que la paciente exista y tenga embarazo en curso en el padrón provincial
    if (!Number.isSafeInteger(Number(paciente_id)) || Number(paciente_id) <= 0 || typeof contacto_logrado !== 'boolean') {
      return NextResponse.json({ error: "Datos de seguimiento inválidos" }, { status: 400 });
    }
    const permitted = await query(`SELECT dni FROM pacientes_gold p WHERE p.id = $1 AND embarazo_en_curso = true LIMIT 1`, [paciente_id]);
    if (!permitted.rows.length) {
      return NextResponse.json({ error: "Paciente no encontrada o sin embarazo activo" }, { status: 404 });
    }

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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(sql, params);
      if (contacto_logrado) {
        await client.query('UPDATE pacientes_gold SET ultimo_contacto_at = CURRENT_TIMESTAMP WHERE id = $1', [paciente_id]);
      }

      const user = session.user;
      const numericId = Number(user.id);
      const auditUserId = Number.isSafeInteger(numericId) && numericId > 0 ? numericId : 0;
      const institution = user.role === 'Administrador' ? 'Administración'
        : user.role === 'Coordinador' ? 'Coordinación'
        : user.role?.toLowerCase() === 'lectura' ? 'Lectura'
        : user.name || 'Establecimiento Desconocido';
      const code = user.sisa_code || user.cuie_code || (user.maternidad_id ? `MATERNIDAD_${user.maternidad_id}` : null);
      const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';
      const auditSql = `INSERT INTO public.logs_actividad_dashboard
        (usuario_id, usuario_name, usuario_role, establecimiento_name, codigo_sisa,
         modulo, accion, detalles, paciente_dni, contacto_exitoso, fecha_turno_asignado, ip_address)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`;
      const common = [auditUserId, user.username || user.name || 'Usuario', user.role || 'Sin Rol', institution, code, 'Seguimiento'];
      await client.query(auditSql, [...common, 'REGISTRAR_CONTACTO',
        `Seguimiento ${result.rows[0].id}. Medio: ${medio_contacto}. Dirigido a: ${persona_contactada}.`,
        permitted.rows[0].dni || null, contacto_logrado, null, ip]);
      if (contacto_logrado && cita) {
        await client.query(auditSql, [...common, 'ASIGNAR_TURNO',
          `Seguimiento ${result.rows[0].id}. Turno coordinado por ${user.username || user.name || 'Usuario'}`,
          permitted.rows[0].dni || null, null, cita, ip]);
      }
      await client.query('COMMIT');
      return NextResponse.json({ success: true, id: result.rows[0].id });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error guardando seguimiento:", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
