/*src/app/api/stats/route.ts*/
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Capturamos el establecimiento seleccionado del selector global
  const { searchParams } = new URL(request.url);
  const establecimiento = searchParams.get("establecimiento");

  try {
    const fechaUmbral = "CURRENT_DATE";
    const fechaMinimaControl = "'2025-03-01'";
    const diasAtrasoCorte = 30;

    const sisa = session.user?.sisa_code;
    const cuie = session.user?.cuie_code;
   
    // 1. Cláusula de Seguridad RBAC (Tony)
    let securityClause = "";
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

    // 2. Cláusula Dinámica de Selección de Centro para Coordinador/Admin (Prioridad SISA)
    let centroFilterClause = "";
    const statsParams: any[] = [];
   
    if (establecimiento && establecimiento !== "Todos" && establecimiento !== "undefined") {
      statsParams.push(establecimiento);
      if (/^\d+$/.test(establecimiento.trim()) && establecimiento.trim().length >= 10) {
        centroFilterClause = ` AND (sisa_centro_salud = $1 OR sisa_centro_derivado = $1)`;
      } else {
        centroFilterClause = ` AND (
          sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = $1)
          OR sisa_centro_derivado IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = $1)
          OR cuie_seguimiento = $1
        )`;
      }
    }

    // 3. Cláusula de derivación según rol
    let derivacionClause = "";
    if (session.user?.role === 'Centro de Salud') {
      derivacionClause = ` AND (nombre_centro_derivado IS NULL OR nombre_centro_derivado = '')`;
    }

    // 4. Métricas Generales y de Riesgo por Edades (🌟 OPTIMIZADA CON SUBQUERIES PARA EVITAR DUPLICACIONES)
    const kpiSql = `
      SELECT
        COUNT(DISTINCT p.id) as total,
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') THEN 1 ELSE 0 END) as total_riesgo,

        -- Desglose de Padrón y Riesgo por Zona (Buscando el depto directo en una subquery limpia para blindar los totales)
        SUM(CASE WHEN (SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1) = 'CAPITAL' THEN 1 ELSE 0 END) as total_capital,
        SUM(CASE WHEN (SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1) <> 'CAPITAL' THEN 1 ELSE 0 END) as total_interior,
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND (SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1) = 'CAPITAL' THEN 1 ELSE 0 END) as total_riesgo_capital,
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND (SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1) <> 'CAPITAL' THEN 1 ELSE 0 END) as total_riesgo_interior,

        SUM(CASE WHEN p.edad_actual < 15 THEN 1 ELSE 0 END) as gen_15,
        SUM(CASE WHEN p.edad_actual BETWEEN 15 AND 19 THEN 1 ELSE 0 END) as gen_15_19,
        SUM(CASE WHEN p.edad_actual BETWEEN 20 AND 34 THEN 1 ELSE 0 END) as gen_20_34,
        SUM(CASE WHEN p.edad_actual > 34 THEN 1 ELSE 0 END) as gen_34_plus,
       
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND p.edad_actual < 15 THEN 1 ELSE 0 END) as rsg_15,
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND p.edad_actual BETWEEN 15 AND 19 THEN 1 ELSE 0 END) as rsg_15_19,
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND p.edad_actual BETWEEN 20 AND 34 THEN 1 ELSE 0 END) as rsg_20_34,
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND p.edad_actual > 34 THEN 1 ELSE 0 END) as rsg_34_plus,

        SUM(CASE WHEN (p.nombre_centro_derivado IS NULL OR p.nombre_centro_derivado = '') AND (p.fecha_ultimo_control IS NULL OR CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) > 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) > 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) > 30 END) THEN 1 ELSE 0 END) as controles_pendientes,
        SUM(CASE WHEN p.fecha_probable_parto BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days') THEN 1 ELSE 0 END) as proximos_partos,
        SUM(CASE WHEN p.telefono IS NULL OR p.telefono = '' OR p.telefono = '-' THEN 1 ELSE 0 END) as sin_telefono,
        SUM(CASE WHEN p.nombre_centro_derivado IS NOT NULL AND p.nombre_centro_derivado != '' THEN 1 ELSE 0 END) as derivadas,
       
        SUM(CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30 END) THEN 1 ELSE 0 END) as total_controladas,

        -- Desglose de Controladas por Zona
        SUM(CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30 END) AND (SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1) = 'CAPITAL' THEN 1 ELSE 0 END) as total_controladas_capital,
        SUM(CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30 END) AND (SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1) <> 'CAPITAL' THEN 1 ELSE 0 END) as total_controladas_interior,
       
        SUM(CASE WHEN EXISTS (SELECT 1 FROM seguimientos s WHERE s.paciente_id = p.id AND s.contacto_logrado = true AND s.fecha_contacto >= CURRENT_DATE - 30) THEN 1 ELSE 0 END) as total_contactadas,

        -- Desglose de Contactadas por Zona
        SUM(CASE WHEN EXISTS (SELECT 1 FROM seguimientos seg WHERE seg.paciente_id = p.id AND seg.contacto_logrado = true AND seg.fecha_contacto >= CURRENT_DATE - 30) AND (SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1) = 'CAPITAL' THEN 1 ELSE 0 END) as total_contactadas_capital,
        SUM(CASE WHEN EXISTS (SELECT 1 FROM seguimientos seg WHERE seg.paciente_id = p.id AND seg.contacto_logrado = true AND seg.fecha_contacto >= CURRENT_DATE - 30) AND (SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1) <> 'CAPITAL' THEN 1 ELSE 0 END) as total_contactadas_interior,

        -- Desglose de Derivadas por Zona
        SUM(CASE WHEN p.nombre_centro_derivado IS NOT NULL AND p.nombre_centro_derivado != '' AND (SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1) = 'CAPITAL' THEN 1 ELSE 0 END) as derivadas_capital,
        SUM(CASE WHEN p.nombre_centro_derivado IS NOT NULL AND p.nombre_centro_derivado != '' AND (SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1) <> 'CAPITAL' THEN 1 ELSE 0 END) as derivadas_interior,

        SUM(CASE WHEN p.fecha_ultimo_control = CURRENT_DATE - 1 THEN 1 ELSE 0 END) as controles_hoy,
        SUM(CASE WHEN p.fecha_ultimo_control BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE - 1 THEN 1 ELSE 0 END) as controles_semana,
        SUM(CASE WHEN p.fecha_ultimo_control BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1 THEN 1 ELSE 0 END) as controles_mes,

        SUM(CASE WHEN (p.nombre_centro_derivado IS NULL OR p.nombre_centro_derivado = '') AND (p.fecha_ultimo_control IS NULL OR CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) > 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) > 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) > 30 END) AND (NOT EXISTS (SELECT 1 FROM seguimientos s WHERE s.paciente_id = p.id AND s.contacto_logrado = true AND s.fecha_contacto >= CURRENT_DATE - (CASE WHEN p.eg_actual >= 38 THEN INTERVAL '7 days' WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN INTERVAL '15 days' ELSE INTERVAL '30 days' END))) THEN 1 ELSE 0 END) as sin_contacto_reciente
       
      FROM public.pacientes_gold p
      WHERE p.fecha_probable_parto >= ${fechaUmbral} 
        AND p.embarazo_en_curso = true
        AND p.fecha_nacimiento IS NOT NULL
        ${securityClause}
        ${centroFilterClause}
    `;
    const kpiRes = await query(kpiSql, statsParams);
    const kpis = kpiRes.rows[0];

    // 5. Top Establecimientos con más embarazadas
    const topGenSql = `
      SELECT s.nombre as name, s.departamento, COUNT(DISTINCT p.id) as value
      FROM public.pacientes_gold p
      INNER JOIN public.efectores_sisa s ON s.codigo_sisa = (CASE WHEN p.sisa_centro_derivado IS NOT NULL AND p.sisa_centro_derivado != '' THEN p.sisa_centro_derivado ELSE p.sisa_centro_salud END)
      WHERE p.fecha_probable_parto >= ${fechaUmbral} AND p.embarazo_en_curso = true AND (p.fecha_ultimo_control >= ${fechaMinimaControl} OR p.fecha_ultimo_control IS NULL)
        ${securityClause} ${derivacionClause}
        ${centroFilterClause ? centroFilterClause.replace(/= \$1/g, "= '" + establecimiento + "'") : ""}
      GROUP BY s.codigo_sisa, s.nombre, s.departamento ORDER BY value DESC
    `;
    const topGenRes = await query(topGenSql);

    // 6. Top Establecimientos con Riesgo
    const topRsgSql = `
      SELECT s.nombre as name, s.departamento, COUNT(DISTINCT p.id) as value
      FROM public.pacientes_gold p
      INNER JOIN public.efectores_sisa s ON s.codigo_sisa = (CASE WHEN p.sisa_centro_derivado IS NOT NULL AND p.sisa_centro_derivado != '' THEN p.sisa_centro_derivado ELSE p.sisa_centro_salud END)
      WHERE p.fecha_probable_parto >= ${fechaUmbral} AND p.embarazo_en_curso = true AND LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND (p.fecha_ultimo_control IS NULL OR (CURRENT_DATE - p.fecha_ultimo_control) > ${diasAtrasoCorte})
        ${securityClause} ${derivacionClause}
        ${centroFilterClause ? centroFilterClause.replace(/= \$1/g, "= '" + establecimiento + "'") : ""}
      GROUP BY s.codigo_sisa, s.nombre, s.departamento ORDER BY value DESC
    `;
    const topRsgRes = await query(topRsgSql);

    // 7. Query de CAPS unificada (Con columnas de base de datos validadas)
    const capsResumenSql = `
      SELECT
        s.nombre as caps_name,
        COUNT(DISTINCT p.id) as total_embarazadas,
       
        -- % de Riesgo
        ROUND((COUNT(DISTINCT CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') THEN p.id END) * 100.0) / NULLIF(COUNT(DISTINCT p.id), 0), 1) as pct_riesgo,

        -- % de Control
        ROUND((COUNT(DISTINCT CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30 END) THEN p.id END) * 100.0) / NULLIF(COUNT(DISTINCT p.id), 0), 1) as pct_control,
       
        -- % de Vínculo Activo
        ROUND((COUNT(DISTINCT CASE WHEN seg_any.paciente_id IS NOT NULL OR (p.fecha_ultimo_control IS NOT NULL AND (CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30 END)) THEN p.id END) * 100.0) / NULLIF(COUNT(DISTINCT p.id), 0), 1) as pct_vinculo,

        -- % Turnos Asignados x Tablero
        ROUND((COUNT(DISTINCT CASE WHEN LOWER(seg_any.medio_contacto) LIKE '%turno%' OR LOWER(seg_any.observaciones) LIKE '%turno%' OR LOWER(seg_any.observaciones) LIKE '%agend%' THEN p.id END) * 100.0) / NULLIF(COUNT(DISTINCT p.id), 0), 1) as pct_turnos_tablero
       
      FROM public.pacientes_gold p
      INNER JOIN public.efectores_sisa s ON s.codigo_sisa = p.sisa_centro_salud
      LEFT JOIN public.seguimientos seg_any ON seg_any.paciente_id = p.id
      WHERE p.embarazo_en_curso = true AND p.fecha_probable_parto >= CURRENT_DATE AND p.fecha_nacimiento IS NOT NULL AND (p.nombre_centro_derivado IS NULL OR p.nombre_centro_derivado = '') AND (LOWER(s.nombre) LIKE '%caps%' OR LOWER(s.nombre) LIKE '%c.a.p.s.%')
        ${securityClause}
        ${centroFilterClause ? centroFilterClause.replace(/= \$1/g, "= '" + establecimiento + "'") : ""}
      GROUP BY s.nombre ORDER BY total_embarazadas DESC;
    `;
    const capsResumenRes = await query(capsResumenSql);

    const generalData = {
      total: parseInt(kpis.total) || 0,
      sub15: parseInt(kpis.gen_15) || 0,
      age15_19: parseInt(kpis.gen_15_19) || 0,
      age20_34: parseInt(kpis.gen_20_34) || 0,
      age34plus: parseInt(kpis.gen_34_plus) || 0,
      desgloseZona: {
        capital: parseInt(kpis.total_capital) || 0,
        interior: parseInt(kpis.total_interior) || 0,
      }
    };

    const riesgoData = {
      total: parseInt(kpis.total_riesgo) || 0,
      sub15: parseInt(kpis.rsg_15) || 0,
      age15_19: parseInt(kpis.rsg_15_19) || 0,
      age20_34: parseInt(kpis.rsg_20_34) || 0,
      age34plus: parseInt(kpis.rsg_34_plus) || 0,
      desgloseZona: {
        capital: parseInt(kpis.total_riesgo_capital) || 0,
        interior: parseInt(kpis.total_riesgo_interior) || 0,
      }
    };

    const gestionData = {
      controlesPendientes: parseInt(kpis.controles_pendientes) || 0,
      proximosPartos: parseInt(kpis.proximos_partos) || 0,
      sinTelefono: parseInt(kpis.sin_telefono) || 0,
      derivadas: parseInt(kpis.derivadas) || 0,
      sinContactoReciente: parseInt(kpis.sin_contacto_reciente) || 0,
      controladas: parseInt(kpis.total_controladas) || 0,
      contactadas: parseInt(kpis.total_contactadas) || 0,
      desgloseZona: {
        controladas: { capital: parseInt(kpis.total_controladas_capital) || 0, interior: parseInt(kpis.total_controladas_interior) || 0 },
        contactadas: { capital: parseInt(kpis.total_contactadas_capital) || 0, interior: parseInt(kpis.total_contactadas_interior) || 0 },
        derivadas: { capital: parseInt(kpis.derivadas_capital) || 0, interior: parseInt(kpis.derivadas_interior) || 0 },
      }
    };

    const actividadData = {
      hoy: parseInt(kpis.controles_hoy) || 0,
      semana: parseInt(kpis.controles_semana) || 0,
      mes: parseInt(kpis.controles_mes) || 0
    };

    const topGeneralMapped = topGenRes.rows.map(r => ({ name: (r.name || '').trim(), departamento: r.departamento, value: parseInt(r.value) || 0 }));
    const topRiesgoMapped = topRsgRes.rows.map(r => ({ name: (r.name || '').trim(), departamento: r.departamento, value: parseInt(r.value) || 0 }));

    const resumenCapsMapped = capsResumenRes.rows.map(r => ({
      capsName: (r.caps_name || '').trim(),
      total: parseInt(r.total_embarazadas) || 0,
      pctRiesgo: parseFloat(r.pct_riesgo) || 0,
      pctControl: parseFloat(r.pct_control) || 0,
      pctVinculo: parseFloat(r.pct_vinculo) || 0,
      pctTurnosTablero: parseFloat(r.pct_turnos_tablero) || 0
    }));

    return NextResponse.json({
      general: generalData,
      riesgo: riesgoData,
      gestion: gestionData,
      actividad: actividadData,
      topGeneral: topGeneralMapped,
      topRiesgoAtraso: topRiesgoMapped,
      resumenCaps: resumenCapsMapped
    });

  } catch (error) {
    console.error("Error obteniendo estadísticas:", error);
    return NextResponse.json({ error: "Error en DB" }, { status: 500 });
  }
}