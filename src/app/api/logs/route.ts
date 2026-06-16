/*src\app\api\logs\route.ts*/
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route"; // Ajustá esta ruta si tus authOptions están en otro lado

export async function POST(request: Request) {
  try {
    // 1. Validamos que haya una sesión activa en el Dashboard
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autorizado para registrar logs" }, { status: 401 });
    }

    // 2. Extraemos los datos de la acción que nos manda el Frontend
    const { modulo, accion, detalles, paciente_dni, contacto_exitoso, fecha_turno_asignado } = await request.json();

    // 3. Capturamos la IP del cliente de forma segura (por si tu jefe quiere auditoría de red)
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";

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
    const params = [
      u.id || 0,
      nombreUsuarioLogin, // El usuario de acceso (ej: ga.caps6.cap)
      u.role || "Sin Rol",
      nombreEstablecimiento, // Nombre real del centro (ej: C.A.P.S. 6...)
      identificadorCentro,   // Código SISA o CUIE (ej: 50180212139123)
      modulo,
      accion,
      detalles || null,
      paciente_dni || null,
      contacto_exitoso !== undefined ? contacto_exitoso : null,
      fecha_turno_asignado || null,
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