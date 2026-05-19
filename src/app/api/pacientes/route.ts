/*src/app/api/pacientes/route.ts*/
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

/**
 * Maneja las peticiones GET para obtener la lista de pacientes con riesgo.
 * Requiere autenticación. Aplica filtros por DNI, establecimiento y aplica
 * reglas de seguridad (RBAC) según el rol del usuario conectado.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Extraemos los parámetros de búsqueda de la URL
  const { searchParams } = new URL(request.url);
  const exact = searchParams.get("exact") === "true"; 
  const dni = searchParams.get("dni");
  const establecimiento = searchParams.get("establecimiento");
  const riesgo = searchParams.get("riesgo") || "Si";
  const dias = searchParams.get("dias") || "0";
  const fppDesde = searchParams.get("fppDesde");
  const fppHasta = searchParams.get("fppHasta");
  const excluirDerivadas = searchParams.get("excluirDerivadas") === "true";

  try {
    const params: any[] = [];
    const sisa = session.user?.sisa_code;
    const cuie = session.user?.cuie_code;

    // 1. Lógica de Seguridad de Tony (RBAC) con prioridad SISA -> CUIE
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
    else if (session.user?.role === 'Coordinador' || session.user?.role === 'Administrador') {
      securityClause = ``;
    }

    // 2. Obtener el total para el contador del Dashboard
    const countQuery = `
      SELECT COUNT(*) 
      FROM pacientes_gold 
      WHERE fecha_probable_parto >= CURRENT_DATE 
        AND embarazo_en_curso = true ${securityClause}
    `;
    const totalRes = await query(countQuery);
    const totalGlobal = parseInt(totalRes.rows[0].count, 10);

    // 3. Construcción de la WHERE Clause principal
    let whereClause = `WHERE embarazo_en_curso = true`;

    // --- REGLA DE ORO: BYPASS DE SEGURIDAD PARA BÚSQUEDA GLOBAL POR DNI ---
    if (dni && exact) {
      params.push(dni.trim());
      whereClause += ` AND dni = $${params.length}`;
      // Al no concatenar securityClause aquí, permitimos la búsqueda en toda la base
    }
    else {
      // Búsqueda normal: Aplicamos seguridad y filtros de gestión
      whereClause += securityClause;

      // ← NUEVO: excluir derivadas para Centro de Salud
      if (excluirDerivadas && session.user?.role === 'Centro de Salud') {
        whereClause += ` AND (nombre_centro_derivado IS NULL OR nombre_centro_derivado = '')`;
      }

      if (riesgo !== "Todas") {
        whereClause += ` AND LOWER(riesgo) IN ('si', 's', 'alto', 'moderado')`;
      }

      if (dias && dias !== "0") {
        const diasNum = parseInt(dias, 10);
        if (!isNaN(diasNum)) {
          params.push(diasNum);
          whereClause += ` AND (p.fecha_ultimo_control IS NULL OR (CURRENT_DATE - p.fecha_ultimo_control) >= $${params.length})`;        }
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

      if (dni) { // Búsqueda parcial (sugerencias)
        params.push(`${dni}%`);
        whereClause += ` AND dni LIKE $${params.length}`;
      }

      if (establecimiento && establecimiento !== "Todos" && establecimiento !== "undefined") {
        params.push(establecimiento);
        // Filtramos por el CUIE que viene del componente Select
        whereClause += ` AND p.cuie_seguimiento = $${params.length}`;
      }
    }

    // 4. Query Final con JOIN a Maestros y mapeo de Fuente
    let sql = `
      SELECT DISTINCT ON (p.id)
        p.id, 
        p.dni, 
        p.nombre, 
        p.apellido, 
        p.telefono, 
        p.fecha_probable_parto,
        p.fecha_ultimo_control,
        p.riesgo,
        s.nombre as nombre_establecimiento_oficial,
        (CURRENT_DATE - p.fecha_ultimo_control) as dias_atraso,
        (SELECT MAX(sec.fecha_contacto) 
         FROM seguimientos sec 
         WHERE sec.paciente_id = p.id) as fecha_ultimo_contacto,
        p.calle_domicilio,
        p.nro_puerta_domicilio,
        p.localidad_domicilio,
        p.fuente_principal,
        p.eg_actual
      FROM pacientes_gold p
      LEFT JOIN efectores_sisa s ON (p.sisa_centro_salud = s.codigo_sisa OR p.cuie_seguimiento = s.cuie)
      ${whereClause}
      ORDER BY p.id, (CURRENT_DATE - p.fecha_ultimo_control) DESC NULLS FIRST    
      `;

    const result = await query(sql, params);

    // 5. Mapeo para el Frontend (con lógica SUMAR/POF)
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
        // Lógica de mapeo de fuente solicitada
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
      ultimaActualizacion: fechaRes.rows[0].ultima_actualizacion ?? null
    });

  } catch (error) {
    console.error("Error en API Pacientes:", error);
    return NextResponse.json({ error: "Error en la base de datos" }, { status: 500 });
  }
}