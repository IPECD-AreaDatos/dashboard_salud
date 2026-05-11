/*src/app/api/pacientes/route.ts*/
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

/**
 * Maneja las peticiones GET para obtener la lista de pacientes con riesgo.
 * Requiere autenticación. Aplica filtros por DNI, establecimiento y aplica
 * reglas de seguridad (RBAC) según el rol del usuario conectado.
 * 
 * @param {Request} request - La solicitud HTTP que contiene los parámetros de búsqueda.
 * @returns {Promise<NextResponse>} Respuesta JSON con los pacientes formateados para el frontend o un error.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Extraemos los parámetros de búsqueda de la URL
  const { searchParams } = new URL(request.url);
  const exact = searchParams.get("exact") === "true"; // Capturamos el flag
  const dni = searchParams.get("dni");
  const establecimiento = searchParams.get("establecimiento");
  const riesgo = searchParams.get("riesgo") || "Si";
  const dias = searchParams.get("dias") || "0";
  const fppDesde = searchParams.get("fppDesde");
  const fppHasta = searchParams.get("fppHasta");

  try {
    let whereClause = `WHERE 1=1`;
    const params: any[] = [];

    // Lógica de Seguridad de Tony (RBAC) para ambas consultas
    let securityClause = ``;
    if (session.user?.role === 'Centro de Salud' && session.user?.cuie_code) {
      // El Centro de Salud solo ve lo que tiene asignado por su código SISA (o su CUIE equivalente)
      securityClause += ` AND (sisa_centro_salud = '${session.user.cuie_code}' OR sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = '${session.user.cuie_code}'))`;
    } 
    else if (session.user?.role === 'Maternidad' && session.user?.maternidad_id) {
      // La Maternidad ve lo asignado a su SISA/CUIE o lo que fue derivado a su ID de maternidad
      securityClause += ` AND ((sisa_centro_salud = '${session.user.cuie_code}' OR sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = '${session.user.cuie_code}')) OR derivacion_maternidad_id = '${session.user.maternidad_id}')`;
    }
    else if (session.user?.role === 'Coordinador') {
        // El coordinador ve todo, pero recordá que no ve auditoría (eso lo manejás en el front)
        securityClause += ``; 
    }
    console.log("CLAUSULA GENERADA:", securityClause);
    
    // Primero, obtener el total de embarazadas para el contraste (sin aplicar los otros filtros de búsqueda)
    const countQuery = `
      SELECT COUNT(*) 
      FROM pacientes_gold 
      WHERE fecha_probable_parto >= CURRENT_DATE ${securityClause}
    `;
    const totalRes = await query(countQuery);
    const totalGlobal = parseInt(totalRes.rows[0].count, 10);

    // 1. Filtros de la Query principal (Capa Gold)
    whereClause += securityClause;

    // SI HAY DNI EXACTO, IGNORAMOS EL RESTO DE LOS FILTROS DE GESTIÓN
    if (dni && exact) {
        params.push(dni.trim());
        whereClause += ` AND dni = $${params.length}`;
    } 
    else {
        // Solo si NO es búsqueda exacta, aplicamos filtros de Riesgo, Días y FPP
        if (riesgo !== "Todas") {
            whereClause += ` AND LOWER(riesgo) IN ('si', 's', 'alto', 'moderado')`;
        }

        if (dias && dias !== "0") {
            const diasNum = parseInt(dias, 10);
            if (!isNaN(diasNum)) {
                params.push(diasNum);
                whereClause += ` AND (CURRENT_DATE - fecha_ultimo_control) >= $${params.length}`;
            }
        }

        if (fppDesde) {
            params.push(fppDesde);
            whereClause += ` AND fecha_probable_parto >= $${params.length}`;
        } else if (!fppDesde && !fppHasta && !dni) {
            whereClause += ` AND fecha_probable_parto >= CURRENT_DATE`;
        }

        if (fppHasta) {
            params.push(fppHasta);
            whereClause += ` AND fecha_probable_parto <= $${params.length}`;
        }

        if (dni) {
            params.push(`${dni}%`);
            whereClause += ` AND dni LIKE $${params.length}`;
        }
    }

    if (establecimiento && establecimiento !== "Todos") {
      params.push(establecimiento);
      whereClause += ` AND nombre_establecimiento = $${params.length}`;
    }

    let sql = `
      SELECT 
        p.id, 
        p.dni, 
        p.nombre, 
        p.apellido, 
        p.telefono, 
        p.fecha_probable_parto,
        p.fecha_ultimo_control,
        p.riesgo,
        p.nombre_establecimiento,
        (CURRENT_DATE - p.fecha_ultimo_control) as dias_atraso,
        -- Buscamos la última fecha de la tabla seguimientos
        (SELECT MAX(s.fecha_contacto) 
         FROM seguimientos s 
         WHERE s.paciente_id = p.id) as fecha_ultimo_contacto,
        p.calle_domicilio,
        p.nro_puerta_domicilio,
        p.localidad_domicilio
      FROM pacientes_gold p
      ${whereClause}
      ORDER BY dias_atraso DESC NULLS FIRST
    `;

    const result = await query(sql, params);
    
    // Mapeo para el Frontend
    const pacientes = result.rows.map(p => {
      let dom = "";
      if (p.calle_domicilio) {
        dom = `${p.calle_domicilio} ${p.nro_puerta_domicilio || ''}`.trim();
      }
      
      // Calculamos los días sin contacto aquí mismo para que el frontend ya los reciba
      const hoy = new Date();
      const ultContacto = p.fecha_ultimo_contacto ? new Date(p.fecha_ultimo_contacto) : null;
      const diasSContacto = ultContacto 
          ? Math.floor((hoy.getTime() - ultContacto.getTime()) / (1000 * 60 * 60 * 24))
          : 999;

      return {
        id: p.id,
        dni: p.dni,
        nombre: `${p.apellido}, ${p.nombre}`,
        telefono: p.telefono || "-",
        fpp: p.fecha_probable_parto,
        ult_control: p.fecha_ultimo_control,
        establecimiento: p.nombre_establecimiento || "No asignado",
        dias: p.dias_atraso !== null ? p.dias_atraso : 999,
        // Enviamos la fecha real y los días calculados
        fecha_ultimo_contacto: p.fecha_ultimo_contacto, 
        dias_sin_contacto: diasSContacto,
        domicilio: dom || "No registrado"
      };
    });

    return NextResponse.json({
      data: pacientes,
      totalGlobal
    });
  } catch (error) {
    console.error("Error en API Pacientes:", error);
    return NextResponse.json({ error: "Error en la base de datos" }, { status: 500 });
  }
}