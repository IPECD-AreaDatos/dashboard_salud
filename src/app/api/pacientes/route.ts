import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Extraemos los parámetros de búsqueda de la URL
  const { searchParams } = new URL(request.url);
  const dni = searchParams.get("dni");
  const establecimiento = searchParams.get("establecimiento");

  try {
    // 1. Base de la Query (Capa Gold)
    // Seleccionamos nombre_establecimiento para que coincida con el filtro lateral
    let sql = `
      SELECT 
        id, 
        dni, 
        nombre, 
        apellido, 
        telefono, 
        fecha_probable_parto,
        fecha_ultimo_control,
        riesgo,
        nombre_establecimiento,
        (CURRENT_DATE - fecha_ultimo_control) as dias_atraso,
        ultimo_contacto_at
      FROM pacientes_gold
      WHERE (LOWER(riesgo) IN ('si', 's', 'alto', 'moderado'))
        AND fecha_probable_parto >= CURRENT_DATE
    `;

    const params: any[] = [];

    // 2. Filtro dinámico: Búsqueda por DNI
    if (dni) {
      sql += ` AND dni LIKE $${params.length + 1}`;
      params.push(`${dni}%`); // Busca DNIs que empiecen con esos números
    }

    // 3. Filtro dinámico: Establecimiento
    if (establecimiento && establecimiento !== "Todos") {
      sql += ` AND nombre_establecimiento = $${params.length + 1}`;
      params.push(establecimiento);
    }

    // 4. Lógica de Seguridad de Tony (RBAC)
    // Nota: Usamos session.user?.role para limitar qué registros puede ver cada usuario
    if (session.user?.role === 'Centro de Salud' && session.user?.cuie_code) {
      sql += ` AND cuie_seguimiento = $${params.length + 1}`;
      params.push(session.user.cuie_code);
    } 
    else if (session.user?.role === 'Maternidad' && session.user?.maternidad_id) {
      sql += ` AND (cuie_seguimiento = $${params.length + 1} OR derivacion_maternidad_id = $${params.length + 2})`;
      params.push(session.user.cuie_code, session.user.maternidad_id);
    }

    // Ordenamos por días de atraso (Prioridad para los que llevan más tiempo sin control)
    sql += ` ORDER BY dias_atraso DESC NULLS FIRST`;

    const result = await query(sql, params);
    
    // 5. Mapeo para el Frontend
    const pacientes = result.rows.map(p => ({
        id: p.id,
        dni: p.dni,
        nombre: `${p.apellido}, ${p.nombre}`,
        telefono: p.telefono || "-",
        fpp: p.fecha_probable_parto,
        ult_control: p.fecha_ultimo_control,
        establecimiento: p.nombre_establecimiento || "No asignado",
        dias: p.dias_atraso !== null ? p.dias_atraso : 999,
        contactada: p.ultimo_contacto_at ? "✅" : ""
      }));

    return NextResponse.json(pacientes);
  } catch (error) {
    console.error("Error en API Pacientes:", error);
    return NextResponse.json({ error: "Error en la base de datos" }, { status: 500 });
  }
}