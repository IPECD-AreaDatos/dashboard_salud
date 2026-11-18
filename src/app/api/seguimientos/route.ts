import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { DASHBOARD_ROLES, requireHealthSession } from "@/lib/healthAuth";

/**
- GET: Obtiene el historial de contactos de una paciente específica (abierto a todo el padrón provincial al buscar por DNI).
 */
export async function GET(request: Request) {
  const auth = await requireHealthSession(DASHBOARD_ROLES);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const dni = searchParams.get("dni")?.trim();

  if (!dni || !/^\d{6,12}$/.test(dni)) return NextResponse.json({ error: "DNI inválido" }, { status: 400 });

  try {
    const patient = await query(
      `SELECT id, dni FROM pacientes_gold WHERE dni = $1 AND embarazo_en_curso = true LIMIT 1`,
      [dni]
    );
    if (!patient.rows.length) return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });

    const user = auth.session.user;
    const numericId = Number(user.id);
    const auditUserId = Number.isSafeInteger(numericId) && numericId > 0 ? numericId : 0;
    const institution = user.role === "Administrador" ? "Administración"
      : user.role === "Coordinador" ? "Coordinación"
      : user.name || "Establecimiento Desconocido";
    const code = user.sisa_code || user.cuie_code || (user.maternidad_id ? `MATERNIDAD_${user.maternidad_id}` : null);
    await query(
      `INSERT INTO public.logs_actividad_dashboard
        (usuario_id, usuario_name, usuario_role, establecimiento_name, codigo_sisa,
         modulo, accion, detalles, paciente_dni, ip_address)
       VALUES ($1,$2,$3,$4,$5,'Seguimiento','CONSULTAR_HISTORIAL','Consulta de historial autorizada',$6,$7)`,
      [auditUserId, user.username || user.name || "Usuario", user.role || "Sin Rol", institution, code,
        patient.rows[0].dni, request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "127.0.0.1"]
    );

    const res = await query(
      `SELECT s.* FROM seguimientos s WHERE s.paciente_id = $1 ORDER BY s.fecha_contacto DESC LIMIT 100`,
      [patient.rows[0].id]
    );
    return NextResponse.json(res.rows, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Error obteniendo seguimientos:", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

/**
- POST: Registra un nuevo contacto (permite registrar seguimiento a pacientes de otros centros si fueron buscadas por DNI).
 */
export async function POST(request: Request) {
  const auth = await requireHealthSession(DASHBOARD_ROLES);
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
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 8192) return NextResponse.json({ error: "Datos de seguimiento inválidos" }, { status: 413 });
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Datos de seguimiento inválidos" }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Datos de seguimiento inválidos" }, { status: 400 });
    }
    const {
      paciente_dni,
      contacto_logrado,
      medio_contacto,
      persona_contactada,
      telefono_contactado,
      observaciones,
      proxima_cita
    } = body;

    // Validamos únicamente que la paciente exista y tenga embarazo en curso en el padrón provincial
    const mediosPermitidos = ["llamada", "whatsapp", "sms", "visita_domiciliaria", "email", "otro"];
    const personasPermitidas = ["paciente", "familiar", "vecino", "otro"];
    const fechaTurno = typeof proxima_cita === "string" && /^\d{4}-\d{2}-\d{2}$/.test(proxima_cita)
      ? new Date(`${proxima_cita}T00:00:00Z`) : null;
    const fechaValida = !proxima_cita || Boolean(fechaTurno && !Number.isNaN(fechaTurno.getTime()) &&
      fechaTurno.toISOString().slice(0, 10) === proxima_cita);
    if (typeof paciente_dni !== 'string' || !/^\d{6,12}$/.test(paciente_dni.trim()) ||
        typeof contacto_logrado !== 'boolean' || typeof medio_contacto !== "string" || !mediosPermitidos.includes(medio_contacto) ||
        typeof persona_contactada !== "string" || !personasPermitidas.includes(persona_contactada) ||
        typeof telefono_contactado !== "string" || telefono_contactado.length > 64 ||
        typeof observaciones !== "string" || observaciones.length > 2000 || !fechaValida) {
      return NextResponse.json({ error: "Datos de seguimiento inválidos" }, { status: 400 });
    }
    const permitted = await query(`SELECT id, dni FROM pacientes_gold p WHERE p.dni = $1 AND embarazo_en_curso = true LIMIT 1`, [paciente_dni.trim()]);
    if (!permitted.rows.length) {
      return NextResponse.json({ error: "Paciente no encontrada o sin embarazo activo" }, { status: 404 });
    }
    const pacienteId = permitted.rows[0].id;

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
      pacienteId,
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
        await client.query('UPDATE pacientes_gold SET ultimo_contacto_at = CURRENT_TIMESTAMP WHERE id = $1', [pacienteId]);
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
