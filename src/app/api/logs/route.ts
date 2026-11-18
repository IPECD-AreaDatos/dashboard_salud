/*src\app\api\logs\route.ts*/
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { DASHBOARD_ROLES, requireHealthSession } from "@/lib/healthAuth";

const allowedEvents: Record<string, readonly string[]> = {
  Seguimiento: ["VISUALIZAR_LISTADO", "EXPORTAR_EXCEL"],
  Auditoría: ["VISUALIZAR_LISTADO", "DESCARGAR_EXCEL", "VISUALIZAR_RED_PERINATAL", "DESCARGAR_EXCEL_RED_PERINATAL"],
  Estadísticas: ["VISUALIZAR_ESTADISTICAS", "EXPORTAR_EXCEL"],
};

export async function POST(request: Request) {
  try {
    // 1. Validamos que haya una sesión activa en el Dashboard
    const auth = await requireHealthSession(DASHBOARD_ROLES);
    if (!auth.ok) return auth.response;
    const session = auth.session;

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 4096) return NextResponse.json({ error: "Evento demasiado grande" }, { status: 413 });
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
    const decoder = new TextDecoder();
    let rawBody = "";
    let byteLength = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteLength += chunk.value.byteLength;
      if (byteLength > 4096) {
        await reader.cancel();
        return NextResponse.json({ error: "Evento demasiado grande" }, { status: 413 });
      }
      rawBody += decoder.decode(chunk.value, { stream: true });
    }
    rawBody += decoder.decode();
    let body: unknown;
    try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Evento inválido" }, { status: 400 }); }
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
    const { modulo, accion, detalles } = body as { modulo?: unknown; accion?: unknown; detalles?: unknown };
    if (typeof modulo !== "string" || typeof accion !== "string" ||
        !Object.prototype.hasOwnProperty.call(allowedEvents, modulo) || !allowedEvents[modulo].includes(accion)) {
      return NextResponse.json({ error: "Evento no permitido" }, { status: 400 });
    }
    if (detalles !== undefined && (typeof detalles !== "string" || detalles.length > 300)) {
      return NextResponse.json({ error: "Detalle inválido" }, { status: 400 });
    }

    // 3. Capturamos la IP del cliente de forma segura (por si tu jefe quiere auditoría de red)
    const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "127.0.0.1";

    // 4. Armamos la Query SQL apuntando a la nueva tabla de negocio
    const sql = `
      INSERT INTO public.logs_actividad_dashboard (
        usuario_id, 
        usuario_name, 
        usuario_role, 
        establecimiento_name, 
        codigo_sisa,
        modulo, 
        accion, 
        detalles,
        paciente_dni,
        contacto_exitoso,
        fecha_turno_asignado,
        ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id;
    `;
    const u = session.user as any;
    
    // El código SISA/CUIE será estrictamente null si no es un Efector de Salud
    const identificadorCentro = u.sisa_code || u.cuie_code || (u.maternidad_id ? `MATERNIDAD_${u.maternidad_id}` : null);
    
    // Extraemos las variables adecuadamente para evitar la confusión
    const nombreUsuarioLogin = u.username || u.email || "Usuario Desconocido"; 

    // Asignamos el nombre correcto de la dependencia dependiendo del rol
    let nombreEstablecimiento = session.user.name || "Establecimiento Desconocido";
    if (u.role === 'Coordinador') {
      nombreEstablecimiento = "Coordinación";
    } else if (u.role === 'Administrador') {
      nombreEstablecimiento = "Administración";
    } else if (u.role?.toLowerCase() === 'lectura') {
      nombreEstablecimiento = "Lectura";
    }

    // Pasamos las variables mapeando la sesión del agente actual
    // Nota: Usamos fallbacks por si algún campo de la sesión viene indefinido
    const numericUserId = Number(u.id);
    // La tabla histórica requiere un entero y no tiene FK a usuarios; el nombre
    // central queda registrado en usuario_name para identificar al actor real.
    const auditUserId = Number.isSafeInteger(numericUserId) && numericUserId > 0
      ? numericUserId
      : 0;
    const params = [
      auditUserId,
      nombreUsuarioLogin, // El usuario de acceso (ej: ga.caps6.cap)
      u.role || "Sin Rol",
      nombreEstablecimiento, // Nombre real del centro (ej: C.A.P.S. 6...)
      identificadorCentro,   // Código SISA o CUIE (ej: 50180212139123)
      modulo,
      accion,
      detalles ? `[evento de interfaz; no acredita ejecución] ${detalles}` : "[evento de interfaz; no acredita ejecución]",
      null,
      null,
      null,
      ip
    ];

    const result = await query(sql, params);

    return NextResponse.json({ 
      success: true, 
      log_id: result.rows[0].id 
    }, { status: 201 });

  } catch (error) {
    console.error("❌ Error crítico en el endpoint de logs:", error);
    return NextResponse.json({ error: "Error interno del servidor al procesar el log" }, { status: 500 });
  }
}
