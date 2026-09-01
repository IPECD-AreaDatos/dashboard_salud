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

  if (session.user?.role === 'Supervisora') {
    return NextResponse.json({ error: "No autorizado para consultar estadísticas" }, { status: 403 });
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
        // 🌟 CORREGIDO: Lógica de seguridad idéntica a la de la grilla de seguimiento
        securityClause = ` AND (p.sisa_centro_salud = '${sisa}')`;
      } else if (cuie) {
        securityClause = ` AND (
          p.sisa_centro_salud = '${cuie}' 
          OR p.sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = '${cuie}')
          OR p.cuie_seguimiento = '${cuie}'
        )`;
      }
    }
    else if (session.user?.role === 'Maternidad') {
      const matId = session.user?.maternidad_id;
      let localClause = "";
      if (sisa) {
        localClause = `sisa_centro_salud = '${sisa}'`;
      } else if (cuie) {
        localClause = `(p.sisa_centro_salud = '${cuie}' OR p.sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = '${cuie}'))`;
      }
      securityClause = ` AND (${localClause} OR p.derivacion_maternidad_id = '${matId}')`;
    }

    // 2. Cláusula Dinámica de Selección de Centro para Coordinador/Admin
    let centroFilterClause = "";
    const statsParams: any[] = [];
   
    if (establecimiento && establecimiento !== "Todos" && establecimiento !== "Capital" && establecimiento !== "Interior" && establecimiento !== "undefined") {
      statsParams.push(establecimiento);
      if (/^\d+$/.test(establecimiento.trim()) && establecimiento.trim().length >= 10) {
        centroFilterClause = ` AND (p.sisa_centro_salud = $1 OR p.sisa_centro_derivado = $1)`;
      } else {
        centroFilterClause = ` AND (
          p.sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = $1)
          OR p.sisa_centro_derivado IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = $1)
          OR p.cuie_seguimiento = $1
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
      derivacionClause = ` AND (p.nombre_centro_derivado IS NULL OR p.nombre_centro_derivado = '')`;
    }

    // 4. Métricas para los GRÁFICOS (afectadas por el filtro de zona)
    const chartsKpiSql = `
      WITH pacientes_filtradas AS (
        SELECT DISTINCT p.*
        FROM public.pacientes_gold p
        WHERE p.fecha_probable_parto >= ${fechaUmbral} 
          AND p.embarazo_en_curso = true 
          AND p.fecha_nacimiento IS NOT NULL
          ${securityClause} ${centroFilterClause} ${zonaGlobalClause} ${derivacionClause}
      )
      SELECT 
        (SELECT COUNT(*) FROM pacientes_filtradas) as total,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE LOWER(riesgo) IN ('si', 's', 'alto', 'moderado')) as total_riesgo,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE edad_actual < 15) as gen_15,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE edad_actual BETWEEN 15 AND 19) as gen_15_19,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE edad_actual BETWEEN 20 AND 34) as gen_20_34,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE edad_actual > 34) as gen_34_plus,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE LOWER(riesgo) IN ('si', 's', 'alto', 'moderado') AND edad_actual < 15) as rsg_15,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE LOWER(riesgo) IN ('si', 's', 'alto', 'moderado') AND edad_actual BETWEEN 15 AND 19) as rsg_15_19,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE LOWER(riesgo) IN ('si', 's', 'alto', 'moderado') AND edad_actual BETWEEN 20 AND 34) as rsg_20_34,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE LOWER(riesgo) IN ('si', 's', 'alto', 'moderado') AND edad_actual > 34) as rsg_34_plus,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE (fecha_ultimo_control IS NULL OR (CURRENT_DATE - fecha_ultimo_control) > 30)) as controles_pendientes,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE fecha_probable_parto BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')) as proximos_partos,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE telefono IS NULL OR telefono = '' OR telefono = '-') as sin_telefono,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE (fecha_ultimo_control IS NULL OR (CURRENT_DATE - fecha_ultimo_control) > 30) AND (NOT EXISTS (SELECT 1 FROM seguimientos s WHERE s.paciente_id = pacientes_filtradas.id AND s.contacto_logrado = true AND s.fecha_contacto >= CURRENT_DATE - INTERVAL '30 days'))) as sin_contacto_reciente,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE fecha_ultimo_control = CURRENT_DATE - 1) as controles_hoy,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE fecha_ultimo_control BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE - 1) as controles_semana,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE fecha_ultimo_control BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1) as controles_mes,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE (controles_1er_trim > 0 AND cantidad_controles > ((eg_actual * 7)/30) - (CASE WHEN eg_actual < 14 THEN 1 WHEN eg_actual < 28 THEN 2 ELSE 3 END))) as seguimiento_adecuado_caps,
        (SELECT COUNT(DISTINCT p.id) FROM pacientes_filtradas p JOIN public.seguimientos s ON p.id = s.paciente_id WHERE s.proxima_cita >= CURRENT_DATE) as turnos_asignados_caps,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE LOWER(riesgo) IN ('si', 's', 'alto', 'moderado') AND (fecha_ultimo_control IS NULL OR (CURRENT_DATE - fecha_ultimo_control) > 30)) as riesgo_sin_control,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE controles_1er_trim > 0) as captacion_precoz_caps,
        (SELECT COUNT(DISTINCT s.id) FROM pacientes_filtradas p JOIN public.seguimientos s ON p.id = s.paciente_id WHERE s.contacto_logrado = true AND s.fecha_contacto >= CURRENT_DATE - INTERVAL '30 days' AND s.proxima_cita IS NOT NULL) as contactos_con_turno_caps,
        (SELECT COUNT(DISTINCT s.id) FROM pacientes_filtradas p JOIN public.seguimientos s ON p.id = s.paciente_id WHERE s.contacto_logrado = true AND s.fecha_contacto >= CURRENT_DATE - INTERVAL '30 days') as contactos_totales_caps
    `;

    // 4.1 Métricas para las TARJETAS (NO son afectadas por el filtro de zona)
    const cardsKpiSql = `
      SELECT
        COUNT(DISTINCT p.id) as total,
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') THEN 1 ELSE 0 END) as total_riesgo,
        SUM(CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - p.fecha_ultimo_control) <= 30 THEN 1 ELSE 0 END) as total_controladas,
        -- 🌟 NUEVO CONCEPTO: Seguimiento Adecuado (reemplaza a Vínculo Activo)
        SUM(CASE WHEN (p.controles_1er_trim > 0 AND p.cantidad_controles > ((p.eg_actual * 7)/30) - (CASE WHEN p.eg_actual < 14 THEN 1 WHEN p.eg_actual < 28 THEN 2 ELSE 3 END)) THEN 1 ELSE 0 END) as total_seguimiento_adecuado,

        SUM(CASE WHEN COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL' THEN 1 ELSE 0 END) as total_capital,
        SUM(CASE WHEN COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL' THEN 1 ELSE 0 END) as total_interior,        
        -- 🌟 NUEVOS CAMPOS: Calculamos las de riesgo que SÍ están controladas
        COUNT(DISTINCT CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND (p.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - p.fecha_ultimo_control) <= 30) THEN p.id END) as total_riesgo_controladas,
        COUNT(DISTINCT CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND (p.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - p.fecha_ultimo_control) <= 30) AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL' THEN p.id END) as total_riesgo_controladas_capital,
        COUNT(DISTINCT CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND (p.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - p.fecha_ultimo_control) <= 30) AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL' THEN p.id END) as total_riesgo_controladas_interior,
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL' THEN 1 ELSE 0 END) as total_riesgo_capital,        
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL' THEN 1 ELSE 0 END) as total_riesgo_interior,
        SUM(CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - p.fecha_ultimo_control) <= 30 AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL' THEN 1 ELSE 0 END) as total_controladas_capital,
        SUM(CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - p.fecha_ultimo_control) <= 30 AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL' THEN 1 ELSE 0 END) as total_controladas_interior,
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
      WHERE p.fecha_probable_parto >= ${fechaUmbral} AND p.embarazo_en_curso = true        ${securityClause} ${derivacionClause}
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
    
    

    //-----
    // Capturamos el período dinámico para la comparativa (7, 15, 30 días)
    const diasComparativa = parseInt(searchParams.get("periodoDias") || "30", 10);

    // 🌟 Query Unificada y Consolidada de Desempeño y Evolución por CAPS (Capital)
    const capsUnificadaSql = `
      WITH fecha_actual_cte AS (
        SELECT MAX(fecha_corte) as fecha_t1
        FROM public.indicadores_establecimientos
        WHERE es_snapshot_final_dia = true
      ),
      fecha_anterior_cte AS (
        SELECT COALESCE(
          (
            SELECT fecha_corte
            FROM public.indicadores_establecimientos, fecha_actual_cte
            WHERE es_snapshot_final_dia = true
              AND fecha_corte <= (fecha_t1 - (${diasComparativa} * INTERVAL '1 day'))
            ORDER BY fecha_corte DESC
            LIMIT 1
          ),
          (
            SELECT MIN(fecha_corte)
            FROM public.indicadores_establecimientos
            WHERE es_snapshot_final_dia = true
          )
        ) as fecha_t0
      ),
      caps_capital AS (
        SELECT 
          s.codigo_sisa,
          TRIM(s.nombre) as raw_name,
          translate(LOWER(TRIM(s.nombre)), 'áéíóúüñ', 'aeiouun') as raw_name_lower
        FROM public.efectores_sisa s
        WHERE (LOWER(s.nombre) LIKE '%caps%' OR LOWER(s.nombre) LIKE '%c.a.p.s.%')
          AND LOWER(TRIM(COALESCE(s.departamento, 'CAPITAL'))) = 'capital'
      ),
      caps_normalized_step AS (
        SELECT 
          codigo_sisa,
          raw_name,
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REGEXP_REPLACE(
                  REGEXP_REPLACE(
                    REGEXP_REPLACE(
                      REGEXP_REPLACE(
                        REGEXP_REPLACE(raw_name_lower, '\\b(c[\\.? ]*a[\\.? ]*p[\\.? ]*s[\\.? ]*|caps)\\b', 'caps', 'g'),
                        '\\b(viii)\\b', '8', 'g'
                      ),
                      '\\b(vii)\\b', '7', 'g'
                    ),
                    '\\b(vi)\\b', '6', 'g'
                  ),
                  '\\b(v)\\b', '5', 'g'
                ),
                '\\b(iv)\\b', '4', 'g'
              ),
              '\\b(iii)\\b', '3', 'g'
            ),
            '\\b(ii)\\b', '2', 'g'
          ) AS normalized_name_step1
        FROM caps_capital
      ),
      caps_normalized_step2 AS (
        SELECT 
          codigo_sisa,
          raw_name,
          TRIM(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REGEXP_REPLACE(normalized_name_step1, '\\bsta\\b', 'santa', 'g'),
                '\\bb[º°]?\\b', '', 'g'
              ),
              '[^a-z0-9 ]+', ' ', 'g'
            )
          ) AS normalized_name
        FROM caps_normalized_step
      ),
      datos_t1 AS (
        SELECT 
          sisa_centro_salud,
          embarazos_en_curso as padron_act,
          controladas as controladas_act,
          seguimiento_adecuado as seg_adecuado_act,
          contactos_ultimos_30_dias as contactos_act,
          controladas_x_contacto_ult_30_dias as controladas_contacto_act,
          proximos_turnos_tablero as turnos_act
        FROM public.indicadores_establecimientos
        WHERE fecha_corte = (SELECT fecha_t1 FROM fecha_actual_cte)
          AND es_snapshot_final_dia = true
      ),
      datos_t0 AS (
        SELECT 
          sisa_centro_salud,
          embarazos_en_curso as padron_ant,
          controladas as controladas_ant
        FROM public.indicadores_establecimientos
        WHERE fecha_corte = (SELECT fecha_t0 FROM fecha_anterior_cte)
          AND es_snapshot_final_dia = true
      )
      SELECT 
        MIN(c.raw_name) as caps_name,
        c.normalized_name,
        (SELECT fecha_t1 FROM fecha_actual_cte) as fecha_t1,
        (SELECT fecha_t0 FROM fecha_anterior_cte) as fecha_t0,
        SUM(COALESCE(da.padron_act, 0)) as padron_act,
        SUM(COALESCE(dant.padron_ant, 0)) as padron_ant,
        SUM(COALESCE(da.controladas_act, 0)) as controladas_act,
        SUM(COALESCE(dant.controladas_ant, 0)) as controladas_ant,
        SUM(COALESCE(da.contactos_act, 0)) as contactos_act,
        SUM(COALESCE(da.controladas_contacto_act, 0)) as controladas_contacto_act,
        SUM(COALESCE(da.seg_adecuado_act, 0)) as seg_adecuado_act,
        SUM(COALESCE(da.turnos_act, 0)) as turnos_act
      FROM caps_normalized_step2 c
      LEFT JOIN datos_t1 da ON c.codigo_sisa = da.sisa_centro_salud
      LEFT JOIN datos_t0 dant ON c.codigo_sisa = dant.sisa_centro_salud
      GROUP BY c.normalized_name
      ORDER BY padron_act DESC;
    `;

    const capsRes = await query(capsUnificadaSql);
    const resumenCaps = capsRes.rows.map((r: any) => {
      const padronAct = parseInt(r.padron_act) || 0;
      const padronAnt = parseInt(r.padron_ant) || 0;
      const ctrlAct = parseInt(r.controladas_act) || 0;
      const ctrlAnt = parseInt(r.controladas_ant) || 0;
      const ctrlContacto = parseInt(r.controladas_contacto_act) || 0;
      const segAdecuado = parseInt(r.seg_adecuado_act) || 0;

      const cobAct = padronAct > 0 ? (ctrlAct * 100.0) / padronAct : 0;
      const cobAnt = padronAnt > 0 ? (ctrlAnt * 100.0) / padronAnt : 0;
      const varCob = cobAct - cobAnt;
      const pctGestion = ctrlAct > 0 ? (ctrlContacto * 100.0) / ctrlAct : 0;
      const pctSegAdecuado = padronAct > 0 ? (segAdecuado * 100.0) / padronAct : 0;

      return {
        capsName: r.caps_name,
        fechaT1: r.fecha_t1,
        fechaT0: r.fecha_t0,
        padronAnt,
        padronAct,
        total: padronAct,
        ctrlAnt,
        ctrlAct,
        absControl: ctrlAct,
        cobAnt: parseFloat(cobAnt.toFixed(1)),
        cobAct: parseFloat(cobAct.toFixed(1)),
        pctControl: parseFloat(cobAct.toFixed(1)),
        variacionCob: parseFloat(varCob.toFixed(1)),
        absSeguimientoAdecuado: segAdecuado,
        pctSeguimientoAdecuado: parseFloat(pctSegAdecuado.toFixed(1)),
        controladasGestion: ctrlContacto,
        controladasEspontaneas: Math.max(0, ctrlAct - ctrlContacto),
        pctGestion: parseFloat(pctGestion.toFixed(1)),
        turnosAsignadosCaps: parseInt(r.turnos_act) || 0
      };
    });

    // 🌟 DISTRIBUCIÓN POR EDAD GESTACIONAL (Semanas EG)
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
            WHEN p.eg_actual BETWEEN 9 AND 12  THEN '09 a 12'
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
          CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - p.fecha_ultimo_control) <= 30 THEN p.id ELSE NULL END as id_controlada
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
      sinContactoReciente: parseInt(chartsKpis.sin_contacto_reciente) || 0,
      controladas: parseInt(cardsKpis.total_controladas) || 0,
      seguimientoAdecuado: parseInt(cardsKpis.total_seguimiento_adecuado) || 0,
      riesgoControladas: parseInt(cardsKpis.total_riesgo_controladas) || 0,
      desgloseZona: {
        seguimientoAdecuadoCaps: parseInt(chartsKpis.seguimiento_adecuado_caps) || 0,
        riesgoSinControl: parseInt(chartsKpis.riesgo_sin_control) || 0,
        turnosAsignadosCaps: parseInt(chartsKpis.turnos_asignados_caps) || 0,
        captacionPrecozCaps: parseInt(chartsKpis.captacion_precoz_caps) || 0,
        contactosConTurnoCaps: parseInt(chartsKpis.contactos_con_turno_caps) || 0,
        contactosTotalesCaps: parseInt(chartsKpis.contactos_totales_caps) || 0,
        controladas: { capital: parseInt(cardsKpis.total_controladas_capital) || 0, interior: parseInt(cardsKpis.total_controladas_interior) || 0 },
        contactadas: { capital: parseInt(cardsKpis.total_contactadas_capital) || 0, interior: parseInt(cardsKpis.total_contactadas_interior) || 0 },
        derivadas: { capital: parseInt(cardsKpis.derivadas_capital) || 0, interior: parseInt(cardsKpis.derivadas_interior) || 0 },
        riesgoControladas: { capital: parseInt(cardsKpis.total_riesgo_controladas_capital) || 0, interior: parseInt(cardsKpis.total_riesgo_controladas_interior) || 0 },
        seguimientoAdecuado: { capital: parseInt(cardsKpis.total_seguimiento_adecuado_capital) || 0, interior: parseInt(cardsKpis.total_seguimiento_adecuado_interior) || 0 },
      }
    };

    const actividadData = {
      hoy: parseInt(chartsKpis.controles_hoy) || 0,
      semana: parseInt(chartsKpis.controles_semana) || 0,
      mes: parseInt(chartsKpis.controles_mes) || 0
    };

    const topGeneralMapped = topGenRes.rows.map(r => ({ name: (r.name || '').trim(), departamento: r.departamento, value: parseInt(r.value) || 0 }));
    const topRiesgoMapped = topRsgRes.rows.map(r => ({ name: (r.name || '').trim(), departamento: r.departamento, value: parseInt(r.value) || 0 }));

    return NextResponse.json({
      ultimaActualizacion: ultimaActualizacionRes.rows[0]?.fecha || new Date().toISOString(),
      general: generalData,
      riesgo: riesgoData,
      gestion: gestionData,
      actividad: actividadData,
      topGeneral: topGeneralMapped,
      topRiesgoAtraso: topRiesgoMapped,
      resumenCaps, // 🌟 Pasamos directamente el dataset enriquecido
      distribucionEG: distribucionEgMapped,
      coberturaStats
    });

  } catch (error) {
    console.error("Error obteniendo estadísticas:", error);
    return NextResponse.json({ error: "Error en DB" }, { status: 500 });
  }
}