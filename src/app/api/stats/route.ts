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

  // Capturamos el establecimiento seleccionado del selector global o botones del front
  const { searchParams } = new URL(request.url);
  const establecimiento = searchParams.get("establecimiento");

  try {
    const fechaUmbral = "CURRENT_DATE";
    const fechaMinimaControl = "'2025-03-01'";
    const diasAtrasoCorte = 30;

    const sisa = session.user?.sisa_code;
    const cuie = session.user?.cuie_code;
   
    // 1. Cláusula de Seguridad RBAC
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

    // 2. Cláusula Dinámica de Selección de Centro para Coordinador/Admin
    let centroFilterClause = "";
    const statsParams: any[] = [];
   
    if (establecimiento && establecimiento !== "Todos" && establecimiento !== "Capital" && establecimiento !== "Interior" && establecimiento !== "undefined") {
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

    // Filtros de apoyo para los botones geográficos explícitos
    let zonaGlobalClause = "";
    if (establecimiento === "Capital") {
      zonaGlobalClause = " AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL'";
    } else if (establecimiento === "Interior") {
      zonaGlobalClause = " AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL'";
    }

    // 3. Cláusula de derivación según rol
    let derivacionClause = "";
    if (session.user?.role === 'Centro de Salud') {
      derivacionClause = ` AND (nombre_centro_derivado IS NULL OR nombre_centro_derivado = '')`;
    }

    // 4. Métricas para los GRÁFICOS (afectadas por el filtro de zona)
    const chartsKpiSql = `
      SELECT
        COUNT(DISTINCT p.id) as total,
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') THEN 1 ELSE 0 END) as total_riesgo,
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
        SUM(CASE WHEN (p.nombre_centro_derivado IS NULL OR p.nombre_centro_derivado = '') AND (p.fecha_ultimo_control IS NULL OR CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) > 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) > 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) > 30 END) AND (NOT EXISTS (SELECT 1 FROM seguimientos s WHERE s.paciente_id = p.id AND s.contacto_logrado = true AND s.fecha_contacto >= CURRENT_DATE - (CASE WHEN p.eg_actual >= 38 THEN INTERVAL '7 days' WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN INTERVAL '15 days' ELSE INTERVAL '30 days' END))) THEN 1 ELSE 0 END) as sin_contacto_reciente,
        SUM(CASE WHEN p.fecha_ultimo_control = CURRENT_DATE - 1 THEN 1 ELSE 0 END) as controles_hoy,
        SUM(CASE WHEN p.fecha_ultimo_control BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE - 1 THEN 1 ELSE 0 END) as controles_semana,
        SUM(CASE WHEN p.fecha_ultimo_control BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1 THEN 1 ELSE 0 END) as controles_mes
      ,
        -- 🌟 NUEVOS CAMPOS PARA LAS CARDS DE CAPS
        SUM(CASE WHEN (p.controles_1er_trim > 0 AND p.cantidad_controles > ((p.eg_actual * 7)/30) - (CASE WHEN p.eg_actual < 14 THEN 1 WHEN p.eg_actual < 28 THEN 2 ELSE 3 END)) THEN 1 ELSE 0 END) as seguimiento_adecuado_caps,
        COUNT(DISTINCT CASE WHEN seg_turnos.fecha_proximo_turno >= CURRENT_DATE THEN p.id END) as turnos_asignados_caps
      ,
        -- 🌟 NUEVO KPI: Pacientes de riesgo con controles atrasados
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND (p.fecha_ultimo_control IS NULL OR CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) > 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) > 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) > 30 END) THEN 1 ELSE 0 END) as riesgo_sin_control,

        -- 🌟 NUEVOS KPIs PARA GESTIÓN DE CALIDAD
        SUM(CASE WHEN p.controles_1er_trim > 0 THEN 1 ELSE 0 END) as captacion_precoz_caps,
        COUNT(DISTINCT CASE WHEN s_efectividad.proxima_cita IS NOT NULL THEN s_efectividad.id END) as contactos_con_turno_caps,
        COUNT(DISTINCT s_efectividad.id) as contactos_totales_caps
FROM public.pacientes_gold p
      -- 🌟 CORRECCIÓN: Agregamos el LEFT JOIN que faltaba para la tabla seg_turnos
      LEFT JOIN (
        SELECT DISTINCT ON (paciente_id) paciente_id, proxima_cita as fecha_proximo_turno
        FROM public.seguimientos
        WHERE proxima_cita >= CURRENT_DATE
        ORDER BY paciente_id, fecha_contacto DESC
      ) seg_turnos ON seg_turnos.paciente_id = p.id
      -- 🌟 NUEVO JOIN para calcular la efectividad de los contactos
      LEFT JOIN public.seguimientos s_efectividad 
        ON s_efectividad.paciente_id = p.id 
        AND s_efectividad.contacto_logrado = true 
        AND s_efectividad.fecha_contacto >= CURRENT_DATE - INTERVAL '30 days'

      WHERE p.fecha_probable_parto >= ${fechaUmbral} AND p.embarazo_en_curso = true AND p.fecha_nacimiento IS NOT NULL
        ${securityClause} ${centroFilterClause} ${zonaGlobalClause} ${derivacionClause}
    `;

    // 4.1 Métricas para las TARJETAS (NO son afectadas por el filtro de zona)
    const cardsKpiSql = `
      SELECT
        COUNT(DISTINCT p.id) as total,
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') THEN 1 ELSE 0 END) as total_riesgo,
        SUM(CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30 END) THEN 1 ELSE 0 END) as total_controladas,        
        -- 🌟 NUEVO CONCEPTO: Seguimiento Adecuado (reemplaza a Vínculo Activo)
        SUM(CASE WHEN (p.controles_1er_trim > 0 AND p.cantidad_controles > ((p.eg_actual * 7)/30) - (CASE WHEN p.eg_actual < 14 THEN 1 WHEN p.eg_actual < 28 THEN 2 ELSE 3 END)) THEN 1 ELSE 0 END) as total_seguimiento_adecuado,

        SUM(CASE WHEN COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL' THEN 1 ELSE 0 END) as total_capital,
        SUM(CASE WHEN COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL' THEN 1 ELSE 0 END) as total_interior,        
        -- 🌟 NUEVOS CAMPOS: Calculamos las de riesgo que SÍ están controladas
        COUNT(DISTINCT CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND (p.fecha_ultimo_control IS NOT NULL AND (CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30 END)) THEN p.id END) as total_riesgo_controladas,
        COUNT(DISTINCT CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND (p.fecha_ultimo_control IS NOT NULL AND (CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30 END)) AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL' THEN p.id END) as total_riesgo_controladas_capital,
        COUNT(DISTINCT CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND (p.fecha_ultimo_control IS NOT NULL AND (CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30 END)) AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL' THEN p.id END) as total_riesgo_controladas_interior,
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL' THEN 1 ELSE 0 END) as total_riesgo_capital,        
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL' THEN 1 ELSE 0 END) as total_riesgo_interior,
        SUM(CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30 END) AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL' THEN 1 ELSE 0 END) as total_controladas_capital,
        SUM(CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30 END) AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL' THEN 1 ELSE 0 END) as total_controladas_interior,
        -- 🌟 NUEVO CONCEPTO: Desglose de Seguimiento Adecuado
        SUM(CASE WHEN (p.controles_1er_trim > 0 AND p.cantidad_controles > ((p.eg_actual * 7)/30) - (CASE WHEN p.eg_actual < 14 THEN 1 WHEN p.eg_actual < 28 THEN 2 ELSE 3 END)) AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL' THEN 1 ELSE 0 END) as total_seguimiento_adecuado_capital,
        SUM(CASE WHEN (p.controles_1er_trim > 0 AND p.cantidad_controles > ((p.eg_actual * 7)/30) - (CASE WHEN p.eg_actual < 14 THEN 1 WHEN p.eg_actual < 28 THEN 2 ELSE 3 END)) AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL' THEN 1 ELSE 0 END) as total_seguimiento_adecuado_interior,

        SUM(CASE WHEN p.nombre_centro_derivado IS NOT NULL AND p.nombre_centro_derivado != '' THEN 1 ELSE 0 END) as derivadas
      FROM public.pacientes_gold p
      WHERE p.fecha_probable_parto >= ${fechaUmbral} AND p.embarazo_en_curso = true AND p.fecha_nacimiento IS NOT NULL
        ${securityClause} ${centroFilterClause} ${derivacionClause}
    `;

    // 4.2 Query específica para contar las derivadas de un CAPS, ignorando el filtro de derivación.
    const derivadasCapsSql = `
      SELECT COUNT(p.id) as total_derivadas
      FROM public.pacientes_gold p
      WHERE p.fecha_probable_parto >= ${fechaUmbral} 
        AND p.embarazo_en_curso = true 
        AND p.fecha_nacimiento IS NOT NULL
        AND p.nombre_centro_derivado IS NOT NULL AND p.nombre_centro_derivado != ''
        ${securityClause} ${centroFilterClause}
    `;

    // Ejecutamos ambas consultas en paralelo
    const promises = [
      query(chartsKpiSql, statsParams),
      query(cardsKpiSql, statsParams)
    ];

    // 4.3 Query para obtener la fecha de la última actualización real de la tabla gold
    const ultimaActualizacionSql = `SELECT MAX(ingestion_at) as fecha FROM pacientes_gold`;
    promises.push(query(ultimaActualizacionSql));

    if (session.user?.role === 'Centro de Salud') {
      promises.push(query(derivadasCapsSql, statsParams));
    }

    const [chartsKpiRes, cardsKpiRes, ultimaActualizacionRes, derivadasCapsRes] = await Promise.all(promises);

    const chartsKpis = chartsKpiRes.rows[0];
    const cardsKpis = cardsKpiRes.rows[0];

    // 5. Top Establecimientos con más embarazadas
    const topGenSql = `
      SELECT s.nombre as name, s.departamento, COUNT(DISTINCT p.id) as value
      FROM public.pacientes_gold p
      INNER JOIN public.efectores_sisa s ON s.codigo_sisa = (CASE WHEN p.sisa_centro_derivado IS NOT NULL AND p.sisa_centro_derivado != '' THEN p.sisa_centro_derivado ELSE p.sisa_centro_salud END)
      WHERE p.fecha_probable_parto >= ${fechaUmbral} AND p.embarazo_en_curso = true AND (p.fecha_ultimo_control >= ${fechaMinimaControl} OR p.fecha_ultimo_control IS NULL)
        ${securityClause} ${derivacionClause}
        ${zonaGlobalClause}
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
        ${zonaGlobalClause}
        ${centroFilterClause ? centroFilterClause.replace(/= \$1/g, "= '" + establecimiento + "'") : ""}
      GROUP BY s.codigo_sisa, s.nombre, s.departamento ORDER BY value DESC
    `;
    const topRsgRes = await query(topRsgSql);
    
    // 7. Query de CAPS unificada (Filtrado estricto por Departamento Capital)
    const capsResumenSql = `
      SELECT
        -- 🌟 Usamos COALESCE para tomar el nombre de la tabla de efectores, o el de pacientes si no existe
        COALESCE(s.nombre, p.nombre_establecimiento) as caps_name,
        COUNT(DISTINCT p.id) as total_embarazadas,
      
        COUNT(DISTINCT CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') THEN p.id END) as abs_riesgo,
        ROUND((COUNT(DISTINCT CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') THEN p.id END) * 100.0) / NULLIF(COUNT(DISTINCT p.id), 0), 1) as pct_riesgo,
        COUNT(DISTINCT CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30 END) THEN p.id END) as abs_control,
        ROUND((COUNT(DISTINCT CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30 END) THEN p.id END) * 100.0) / NULLIF(COUNT(DISTINCT p.id), 0), 1) as pct_control,
        -- 🌟 NUEVO CONCEPTO: % Seguimiento Adecuado (reemplaza a % Vínculo Activo)
        COUNT(DISTINCT CASE WHEN (p.controles_1er_trim > 0 AND p.cantidad_controles > ((p.eg_actual * 7)/30) - (CASE WHEN p.eg_actual < 14 THEN 1 WHEN p.eg_actual < 28 THEN 2 ELSE 3 END)) THEN p.id END) as abs_seguimiento_adecuado,
        ROUND((COUNT(DISTINCT CASE WHEN (p.controles_1er_trim > 0 AND p.cantidad_controles > ((p.eg_actual * 7)/30) - (CASE WHEN p.eg_actual < 14 THEN 1 WHEN p.eg_actual < 28 THEN 2 ELSE 3 END)) THEN p.id END) * 100.0) / NULLIF(COUNT(DISTINCT p.id), 0), 1) as pct_seguimiento_adecuado,
        -- 🌟 CORRECCIÓN: El porcentaje se calcula dividiendo el conteo de turnos por el total de embarazadas.
        COUNT(DISTINCT CASE WHEN seg_turnos.fecha_proximo_turno >= CURRENT_DATE THEN p.id END) as turnos_asignados_caps,
        ROUND((COUNT(DISTINCT CASE WHEN seg_turnos.fecha_proximo_turno >= CURRENT_DATE THEN p.id END) * 100.0) / NULLIF(COUNT(DISTINCT p.id), 0), 1) as pct_turnos_tablero,
        
        -- 🌟 NUEVO DESGLOSE: Controladas por gestión vs. espontáneas
        COUNT(DISTINCT CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30 END) AND EXISTS (SELECT 1 FROM seguimientos s_gest WHERE s_gest.paciente_id = p.id AND s_gest.fecha_contacto < p.fecha_ultimo_control AND s_gest.fecha_contacto >= p.fecha_ultimo_control - INTERVAL '45 days') THEN p.id END) as controladas_gestion,
        COUNT(DISTINCT CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CASE WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7 WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15 ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30 END) AND NOT EXISTS (SELECT 1 FROM seguimientos s_esp WHERE s_esp.paciente_id = p.id AND s_esp.fecha_contacto < p.fecha_ultimo_control AND s_esp.fecha_contacto >= p.fecha_ultimo_control - INTERVAL '45 days') THEN p.id END) as controladas_espontaneas
      
      FROM public.pacientes_gold p
      -- 🌟 CORRECCIÓN: Usamos LEFT JOIN para no perder pacientes si su efector no está en la tabla sisa
      LEFT JOIN public.efectores_sisa s ON s.codigo_sisa = p.sisa_centro_salud
      -- 🌟 CORRECCIÓN: Usamos una subconsulta para obtener el último seguimiento con turno a futuro
      LEFT JOIN (
        SELECT DISTINCT ON (paciente_id) paciente_id, proxima_cita as fecha_proximo_turno
        FROM public.seguimientos
        WHERE proxima_cita >= CURRENT_DATE
        ORDER BY paciente_id, fecha_contacto DESC
      ) seg_turnos ON seg_turnos.paciente_id = p.id
      WHERE p.embarazo_en_curso = true 
        AND p.fecha_probable_parto >= CURRENT_DATE 
        AND p.fecha_nacimiento IS NOT NULL 
        AND (p.nombre_centro_derivado IS NULL OR p.nombre_centro_derivado = '') 
        -- 🌟 CORRECCIÓN: El filtro se aplica sobre el nombre del efector (de cualquiera de las dos tablas)
        AND (LOWER(COALESCE(s.nombre, p.nombre_establecimiento)) LIKE '%caps%' OR LOWER(COALESCE(s.nombre, p.nombre_establecimiento)) LIKE '%c.a.p.s.%')
        AND LOWER(TRIM(COALESCE(s.departamento, 'CAPITAL'))) = 'capital' -- <-- Fuerza que solo entren CAPS de Capital, con fallback a CAPITAL si no hay dato
        ${zonaGlobalClause}
        ${securityClause}
        ${centroFilterClause ? centroFilterClause.replace(/= \$1/g, "= '" + establecimiento + "'") : ""}
      GROUP BY caps_name
      ORDER BY total_embarazadas DESC;
    `;

    const capsResumenRes = await query(capsResumenSql);
    // 🌟 DISTRIBUCIÓN POR EDAD GESTACIONAL (Semanas EG) - VERSIÓN BLINDADA CONTRA EL ERROR 42803
    const edadGestacionalSql = `
      SELECT 
        rango_eg,
        COUNT(DISTINCT id) as total_embarazos,
        COUNT(DISTINCT id_controlada) as total_controladas
      FROM (
        SELECT 
          p.id,
          CASE 
            WHEN p.eg_actual BETWEEN 0 AND 4   THEN '0 a 4'
            WHEN p.eg_actual BETWEEN 5 AND 8   THEN '5 a 8'
            WHEN p.eg_actual BETWEEN 9 AND 12  THEN '09 a 12'  -- Agregamos el 0 para que ordene perfecto de forma natural
            WHEN p.eg_actual BETWEEN 13 AND 16 THEN '13 a 16'
            WHEN p.eg_actual BETWEEN 17 AND 20 THEN '17 a 20'
            WHEN p.eg_actual BETWEEN 21 AND 24 THEN '21 a 24'
            WHEN p.eg_actual BETWEEN 25 AND 28 THEN '25 a 28'
            WHEN p.eg_actual BETWEEN 29 AND 32 THEN '29 a 32'
            WHEN p.eg_actual BETWEEN 33 AND 36 THEN '33 a 36'
            ELSE '37 a 40+'
          END as rango_eg,
          CASE 
            WHEN p.eg_actual BETWEEN 0 AND 4   THEN 1
            WHEN p.eg_actual BETWEEN 5 AND 8   THEN 2
            WHEN p.eg_actual BETWEEN 9 AND 12  THEN 3
            WHEN p.eg_actual BETWEEN 13 AND 16 THEN 4
            WHEN p.eg_actual BETWEEN 17 AND 20 THEN 5
            WHEN p.eg_actual BETWEEN 21 AND 24 THEN 6
            WHEN p.eg_actual BETWEEN 25 AND 28 THEN 7
            WHEN p.eg_actual BETWEEN 29 AND 32 THEN 8
            WHEN p.eg_actual BETWEEN 33 AND 36 THEN 9
            ELSE 10
          END as orden_num,
          CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (
            CASE 
              WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7 
              WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15 
              ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30 
            END
          ) THEN p.id ELSE NULL END as id_controlada
        FROM public.pacientes_gold p
        WHERE p.embarazo_en_curso = true AND p.fecha_probable_parto >= ${fechaUmbral} AND p.fecha_nacimiento IS NOT NULL
          ${securityClause}
          ${centroFilterClause} ${derivacionClause}
          ${zonaGlobalClause}
      ) sub
      GROUP BY rango_eg, orden_num
      ORDER BY orden_num ASC;
    `;
    const egRes = await query(edadGestacionalSql, statsParams);
    const distribucionEgMapped = egRes.rows.map(r => ({
      rango: r.rango_eg === '09 a 12' ? '9 a 12' : r.rango_eg, 
      "Embarazos Activos": parseInt(r.total_embarazos) || 0,
      "Controladas (Al día)": parseInt(r.total_controladas) || 0
    }));

    const coberturaSql = `
      SELECT
        SUM(CASE WHEN p.fuente_principal = 'sumar' OR (p.fuente_principal IN ('pof', 'v_embarazosdw') AND (p.cobertura_salud ILIKE '%plan nacer%' OR p.cobertura_salud ILIKE '%sumar%')) THEN 1 ELSE 0 END) as sin_obra_social,
        SUM(CASE WHEN p.fuente_principal NOT IN ('sumar') AND p.fuente_principal IN ('pof', 'v_embarazosdw') AND p.cobertura_salud NOT ILIKE '%plan nacer%' AND p.cobertura_salud NOT ILIKE '%sumar%' AND p.cobertura_salud IS NOT NULL THEN 1 ELSE 0 END) as con_obra_social,
        SUM(CASE WHEN p.fuente_principal NOT IN ('sumar') AND (p.fuente_principal NOT IN ('pof', 'v_embarazosdw') OR p.cobertura_salud IS NULL) THEN 1 ELSE 0 END) as sin_datos
      FROM public.pacientes_gold p
      WHERE p.embarazo_en_curso = true AND p.fecha_probable_parto >= ${fechaUmbral} AND p.fecha_nacimiento IS NOT NULL
        ${securityClause}
        ${centroFilterClause} ${derivacionClause}
        ${zonaGlobalClause}
    `;
    const coberturaRes = await query(coberturaSql, statsParams);
    const cobRow = coberturaRes.rows[0];
    const coberturaStats = [
      { name: "Pública Exclusiva", value: parseInt(cobRow.sin_obra_social) || 0 },
      { name: "Con Obra Social", value: parseInt(cobRow.con_obra_social) || 0 },
      { name: "Sin Registro", value: parseInt(cobRow.sin_datos) || 0 }
    ];

    const generalData = {
      total: parseInt(cardsKpis.total) || 0,
      sub15: parseInt(chartsKpis.gen_15) || 0,
      age15_19: parseInt(chartsKpis.gen_15_19) || 0,
      age20_34: parseInt(chartsKpis.gen_20_34) || 0,
      age34plus: parseInt(chartsKpis.gen_34_plus) || 0,
      desgloseZona: {
        capital: parseInt(cardsKpis.total_capital) || 0,
        interior: parseInt(cardsKpis.total_interior) || 0,
      }
    };

    const riesgoData = {
      total: parseInt(cardsKpis.total_riesgo) || 0,
      sub15: parseInt(chartsKpis.rsg_15) || 0,
      age15_19: parseInt(chartsKpis.rsg_15_19) || 0,
      age20_34: parseInt(chartsKpis.rsg_20_34) || 0,
      age34plus: parseInt(chartsKpis.rsg_34_plus) || 0,
      desgloseZona: {
        capital: parseInt(cardsKpis.total_riesgo_capital) || 0,
        interior: parseInt(cardsKpis.total_riesgo_interior) || 0,
      }
    };

    const gestionData = {
      controlesPendientes: parseInt(chartsKpis.controles_pendientes) || 0,
      proximosPartos: parseInt(chartsKpis.proximos_partos) || 0,
      sinTelefono: parseInt(chartsKpis.sin_telefono) || 0,
      derivadas: session.user?.role === 'Centro de Salud' 
        ? (parseInt(derivadasCapsRes?.rows[0]?.total_derivadas) || 0) 
        : (parseInt(cardsKpis.derivadas) || 0),
      sinContactoReciente: parseInt(chartsKpis.sin_contacto_reciente) || 0, // Se mantiene para la vista de CAPS
      controladas: parseInt(cardsKpis.total_controladas) || 0, // Se mantiene para la vista de CAPS
      seguimientoAdecuado: parseInt(cardsKpis.total_seguimiento_adecuado) || 0,
      // 🌟 NUEVOS DATOS PARA LAS TARJETAS
      riesgoControladas: parseInt(cardsKpis.total_riesgo_controladas) || 0,
      desgloseZona: {
        // 🌟 NUEVOS CAMPOS PARA LAS CARDS DE CAPS
        seguimientoAdecuadoCaps: parseInt(chartsKpis.seguimiento_adecuado_caps) || 0,
        riesgoSinControl: parseInt(chartsKpis.riesgo_sin_control) || 0,
        turnosAsignadosCaps: parseInt(chartsKpis.turnos_asignados_caps) || 0,
        captacionPrecozCaps: parseInt(chartsKpis.captacion_precoz_caps) || 0,
        contactosConTurnoCaps: parseInt(chartsKpis.contactos_con_turno_caps) || 0,
        contactosTotalesCaps: parseInt(chartsKpis.contactos_totales_caps) || 0,

        controladas: { capital: parseInt(cardsKpis.total_controladas_capital) || 0, interior: parseInt(cardsKpis.total_controladas_interior) || 0 },
        contactadas: { capital: parseInt(cardsKpis.total_contactadas_capital) || 0, interior: parseInt(cardsKpis.total_contactadas_interior) || 0 },
        derivadas: { capital: parseInt(cardsKpis.derivadas_capital) || 0, interior: parseInt(cardsKpis.derivadas_interior) || 0 },
        // 🌟 NUEVO DESGLOSE
        riesgoControladas: { capital: parseInt(cardsKpis.total_riesgo_controladas_capital) || 0, interior: parseInt(cardsKpis.total_riesgo_controladas_interior) || 0 },        seguimientoAdecuado: { capital: parseInt(cardsKpis.total_seguimiento_adecuado_capital) || 0, interior: parseInt(cardsKpis.total_seguimiento_adecuado_interior) || 0 },
      }
    };

    const actividadData = {
      hoy: parseInt(chartsKpis.controles_hoy) || 0,
      semana: parseInt(chartsKpis.controles_semana) || 0,
      mes: parseInt(chartsKpis.controles_mes) || 0
    };

    const topGeneralMapped = topGenRes.rows.map(r => ({ name: (r.name || '').trim(), departamento: r.departamento, value: parseInt(r.value) || 0 }));
    const topRiesgoMapped = topRsgRes.rows.map(r => ({ name: (r.name || '').trim(), departamento: r.departamento, value: parseInt(r.value) || 0 }));

    const resumenCapsMapped = capsResumenRes.rows.map(r => ({
      capsName: (r.caps_name || '').trim(),
      total: parseInt(r.total_embarazadas) || 0,
      absRiesgo: parseInt(r.abs_riesgo) || 0,
      pctRiesgo: parseFloat(r.pct_riesgo) || 0,
      absControl: parseInt(r.abs_control) || 0,
      pctControl: parseFloat(r.pct_control) || 0,
      absSeguimientoAdecuado: parseInt(r.abs_seguimiento_adecuado) || 0,
      pctSeguimientoAdecuado: parseFloat(r.pct_seguimiento_adecuado) || 0,
      pctTurnosTablero: parseFloat(r.pct_turnos_tablero) || 0,
      turnosAsignadosCaps: parseInt(r.turnos_asignados_caps) || 0,
      controladasGestion: parseInt(r.controladas_gestion) || 0,
      controladasEspontaneas: parseInt(r.controladas_espontaneas) || 0
    }));

    return NextResponse.json({
      ultimaActualizacion: ultimaActualizacionRes.rows[0]?.fecha || new Date().toISOString(),
      general: generalData,
      riesgo: riesgoData,
      gestion: gestionData,
      actividad: actividadData,
      topGeneral: topGeneralMapped,
      topRiesgoAtraso: topRiesgoMapped,
      resumenCaps: resumenCapsMapped,
      distribucionEG: distribucionEgMapped, // 🌟 NOMBRE CORREGIDO AQUÍ PARA COMBINAR CON EL FRONT
      coberturaStats
    });

  } catch (error) {
    console.error("Error obteniendo estadísticas:", error);
    return NextResponse.json({ error: "Error en DB" }, { status: 500 });
  }
}
