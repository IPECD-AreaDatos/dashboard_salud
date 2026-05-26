/*src/app/api/pacientes/route.ts*/
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

/**
 * Maneja las peticiones GET para obtener la lista de pacientes con riesgo.
 * Si no se encuentran resultados con los filtros estrictos, aplica un fallback automático.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const exact = searchParams.get("exact") === "true"; 
  const dni = searchParams.get("dni");
  const establecimiento = searchParams.get("establecimiento");
  const riesgo = searchParams.get("riesgo") || "Si";
  const dias = searchParams.get("dias") || "0";
  const fppDesde = searchParams.get("fppDesde");
  const fppHasta = searchParams.get("fppHasta");
  const excluirDerivadas = searchParams.get("excluirDerivadas") === "true";

  const permitirFallback = searchParams.get("permitirFallback") !== "false";

  try {
    const sisa = session.user?.sisa_code;
    const cuie = session.user?.cuie_code;

    // 1. Lógica de Seguridad de Tony (RBAC)
    let securityClause = ``;
    if (session.user?.role === 'Centro de Salud') {
      if (sisa) {
        securityClause = ` AND sisa_centro_salud = '${sisa}'`;
      } else if (cuie) {
        securityClause = ` AND (sisa_centro_salud = '${cuie}' OR sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = '${cuie}'))`;
      }
    }
    else if (session.user?.role === 'Maternidad') {
      const matId = session.user?.maternidad_id;
      let localClause = "";
      if (sisa) {
        localClause = `sisa_centro_salud = '${sisa}'`;
      } else if (cuie) {
        localClause = `(sisa_centro_salud = '${cuie}' OR sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = '${cuie}'))`;
      }
      securityClause = ` AND (${localClause} OR derivacion_maternidad_id = '${matId}')`;
    }

    // 2. Obtener el total para el contador del Dashboard (siempre con el conteo base de lo asignado en curso)
    const countQuery = `
      SELECT COUNT(*) 
      FROM pacientes_gold 
      WHERE fecha_probable_parto >= CURRENT_DATE 
        AND embarazo_en_curso = true ${securityClause}
    `;
    const totalRes = await query(countQuery);
    const totalGlobal = parseInt(totalRes.rows[0].count, 10);

    // Función auxiliar para armar la query y sus parámetros
    const ejecutarConsultaPacientes = async (aplicarRestriccionesGestión: boolean) => {
      const params: any[] = [];
      let whereClause = `WHERE embarazo_en_curso = true`;

      if (dni && exact) {
        params.push(dni.trim());
        whereClause += ` AND dni = $${params.length}`;
      } else {
        whereClause += securityClause;

        if (excluirDerivadas) {
          whereClause += ` AND (nombre_centro_derivado IS NULL OR nombre_centro_derivado = '')`;
        }

        // --- APLICACIÓN CONDICIONAL DE FILTROS DE GESTIÓN (FALLBACK) ---
        if (aplicarRestriccionesGestión) {
          if (riesgo !== "Todas") {
            whereClause += ` AND LOWER(riesgo) IN ('si', 's', 'alto', 'moderado')`;
          }

          if (dias && dias !== "0") {
            const diasNum = parseInt(dias, 10);
            if (!isNaN(diasNum)) {
              params.push(diasNum);
              whereClause += ` AND (p.fecha_ultimo_control IS NULL OR (CURRENT_DATE - p.fecha_ultimo_control) >= $${params.length})`;
            }
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

        if (establecimiento && establecimiento !== "Todos" && establecimiento !== "undefined") {
          params.push(establecimiento);
          // Si el código enviado es un SISA (numérico de 14 dígitos aprox), filtramos directo por sisa_centro_salud
          if (/^\d+$/.test(establecimiento.trim()) && establecimiento.trim().length >= 10) {
            whereClause += ` AND p.sisa_centro_salud = $${params.length}`;
          } else {
            // Si es un CUIE (alfanumérico de 6), priorizamos mapearlo al SISA o buscarlo por cuie alternativo
            whereClause += ` AND (p.sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = $${params.length}) OR p.cuie_seguimiento = $${params.length})`;
          }
        }
      }

      const sql = `
        SELECT DISTINCT ON (p.id)
          p.id, p.dni, p.nombre, p.apellido, p.telefono, p.fecha_probable_parto, p.fecha_ultimo_control, p.riesgo,
          s.nombre as nombre_establecimiento_oficial,
          (CURRENT_DATE - p.fecha_ultimo_control) as dias_atraso,
          (SELECT MAX(sec.fecha_contacto) 
              FROM seguimientos sec 
              WHERE sec.paciente_id = p.id 
                AND sec.contacto_logrado = true) as fecha_ultimo_contacto,         
          p.calle_domicilio, p.nro_puerta_domicilio, p.localidad_domicilio, p.fuente_principal, p.eg_actual
        FROM pacientes_gold p
        LEFT JOIN efectores_sisa s ON (p.sisa_centro_salud = s.codigo_sisa OR p.cuie_seguimiento = s.cuie)
        ${whereClause}
        ORDER BY p.id, (CURRENT_DATE - p.fecha_ultimo_control) DESC NULLS FIRST      
      `;

      return await query(sql, params);
    };

    // 3. Intento de Consulta Principal (Filtros estrictos activados)
    let result = await ejecutarConsultaPacientes(true);
    let fallbackActivo = false;

    // 👈 MODIFICADO AQUÍ: Agregamos la condición 'permitirFallback'
    if (result.rows.length === 0 && !dni && permitirFallback) {
      result = await ejecutarConsultaPacientes(false);
      fallbackActivo = true;
    }

    // 4. Mapeo para el Frontend
    const pacientes = result.rows.map(p => {
      let dom = "";
      if (p.calle_domicilio) {
        dom = `${p.calle_domicilio} ${p.nro_puerta_domicilio || ''}`.trim();
      }

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
        establecimiento: p.nombre_establecimiento_oficial || "No asignado",
        dias: p.dias_atraso !== null ? p.dias_atraso : 999,
        fecha_ultimo_contacto: p.fecha_ultimo_contacto,
        dias_sin_contacto: diasSContacto,
        domicilio: dom || "No registrado",
        fuente_principal: p.fuente_principal === 'sumar' 
                ? 'SUMAR' 
                : (p.fuente_principal === 'v_embarazosdw' ? 'POF' : p.fuente_principal || 'S/D'),
        eg_actual: p.eg_actual ?? null
      };
    });

    const fechaRes = await query(`SELECT MAX(ingestion_at) as ultima_actualizacion FROM pacientes_gold`);
    
    return NextResponse.json({
      data: pacientes,
      totalGlobal,
      fallbackActivo, // 👈 LE AVISAMOS AL PANEL SI SE REBAJARON LOS FILTROS
      ultimaActualizacion: fechaRes.rows[0].ultima_actualizacion ?? null
    });

  } catch (error) {
    console.error("Error en API Pacientes:", error);
    return NextResponse.json({ error: "Error en la base de datos" }, { status: 500 });
  }
}