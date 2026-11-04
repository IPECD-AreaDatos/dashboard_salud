import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role === 'Centro de Salud' && !session.user.sisa_code && !session.user.cuie_code) {
    return NextResponse.json({ error: 'La cuenta no tiene centro asignado' }, { status: 403 });
  }
  if (session?.user?.role === 'Maternidad' && !session.user.sisa_code && !session.user.cuie_code && !session.user.maternidad_id) {
    return NextResponse.json({ error: 'La cuenta no tiene maternidad asignada' }, { status: 403 });
  }

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (session.user?.role === 'Supervisora') {
    return NextResponse.json({ error: "No autorizado para consultar estadísticas" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const establecimiento = searchParams.get("establecimiento");
  const tipoEfector = (searchParams.get("tipoEfector") || "CAPS").toUpperCase();
  const diasComparativa = parseInt(searchParams.get("periodoDias") || "30", 10);

  try {
    const fechaUmbral = "CURRENT_DATE";
    const diasAtrasoCorte = 40;

    const sisa = session.user?.sisa_code;
    const cuie = session.user?.cuie_code;

    // 1. Cláusula de Seguridad RBAC
    let securityClause = "";
    if (session.user?.role === 'Centro de Salud') {
      if (sisa) {
        securityClause = ` AND (p.sisa_centro_salud = '${sisa}')`;
      } else if (cuie) {
        securityClause = ` AND (
          p.sisa_centro_salud = '${cuie}' 
          OR p.sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = '${cuie}')
          OR p.cuie_seguimiento = '${cuie}'
        )`;
      }
    } else if (session.user?.role === 'Maternidad') {
      const matId = session.user?.maternidad_id;
      let localClause = "";
      if (sisa) {
        localClause = `sisa_centro_salud = '${sisa}'`;
      } else if (cuie) {
        localClause = `(p.sisa_centro_salud = '${cuie}' OR p.sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = '${cuie}'))`;
      }
      securityClause = ` AND (${localClause || 'FALSE'} OR p.derivacion_maternidad_id = '${matId}')`;
    }

    // 2. Cláusula Dinámica de Selección de Centro
    let centroFilterClause = "";
    const statsParams: any[] = [];
    const botonesEspeciales = ["Todos", "Capital", "Interior", "CAPS", "SAPS", "undefined"];
    if (establecimiento && !botonesEspeciales.includes(establecimiento)) {
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

    // Filtros de zona
    let zonaGlobalClause = "";
    if (establecimiento === "Capital") {
      zonaGlobalClause = " AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL'";
    } else if (establecimiento === "Interior") {
      zonaGlobalClause = " AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL'";
    } else if (establecimiento === "CAPS") {
      zonaGlobalClause = ` AND p.sisa_centro_salud IN (
        SELECT codigo_sisa FROM efectores_sisa 
        WHERE (LOWER(nombre) LIKE '%caps%' OR LOWER(nombre) LIKE '%c.a.p.s.%')
          AND LOWER(TRIM(COALESCE(departamento, 'CAPITAL'))) = 'capital'
      )`;
    } else if (establecimiento === "SAPS") {
      zonaGlobalClause = ` AND p.sisa_centro_salud IN (
        SELECT codigo_sisa FROM efectores_sisa 
        WHERE (LOWER(nombre) LIKE '%saps%' OR LOWER(nombre) LIKE '%s.a.p.s.%')
          AND LOWER(TRIM(COALESCE(departamento, 'CAPITAL'))) = 'capital'
      )`;
    }

    // 3. Cláusula de derivación
    let derivacionClause = "";
    if (session.user?.role === 'Centro de Salud') {
      derivacionClause = ` AND (p.nombre_centro_derivado IS NULL OR p.nombre_centro_derivado = '')`;
    }

    // 4. Métricas para los GRÁFICOS (Versión 1)
    const chartsKpiSql = `
      WITH pacientes_filtradas AS (
        SELECT DISTINCT p.*
        FROM public.pacientes_gold p
        WHERE p.fecha_probable_parto >= ${fechaUmbral} 
          AND p.embarazo_en_curso = true 
          AND p.fecha_nacimiento IS NOT NULL
          AND COALESCE(p.en_red_perinatal_msp, true) = true
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
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE (fecha_ultimo_control IS NULL OR (CURRENT_DATE - fecha_ultimo_control) > 40)) as controles_pendientes,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE fecha_probable_parto BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')) as proximos_partos,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE telefono IS NULL OR telefono = '' OR telefono = '-') as sin_telefono,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE (fecha_ultimo_control IS NULL OR (CURRENT_DATE - fecha_ultimo_control) > 40) AND (NOT EXISTS (SELECT 1 FROM seguimientos s WHERE s.paciente_id = pacientes_filtradas.id AND s.contacto_logrado = true AND s.fecha_contacto >= CURRENT_DATE - INTERVAL '30 days'))) as sin_contacto_reciente,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE fecha_ultimo_control = CURRENT_DATE - 1) as controles_hoy,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE fecha_ultimo_control BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE - 1) as controles_semana,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE fecha_ultimo_control BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1) as controles_mes,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE (controles_1er_trim > 0 AND cantidad_controles > ((eg_actual * 7)/30) - (CASE WHEN eg_actual < 14 THEN 1 WHEN eg_actual < 28 THEN 2 ELSE 3 END))) as seguimiento_adecuado_caps,
        (SELECT COUNT(DISTINCT p.id) FROM pacientes_filtradas p JOIN public.seguimientos s ON p.id = s.paciente_id WHERE s.proxima_cita >= CURRENT_DATE) as turnos_asignados_caps,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE LOWER(riesgo) IN ('si', 's', 'alto', 'moderado') AND (fecha_ultimo_control IS NULL OR (CURRENT_DATE - fecha_ultimo_control) > 40)) as riesgo_sin_control,
        (SELECT COUNT(*) FROM pacientes_filtradas WHERE controles_1er_trim > 0) as captacion_precoz_caps,
        (SELECT COUNT(DISTINCT p.id) 
          FROM pacientes_filtradas p 
          JOIN public.seguimientos s ON p.id = s.paciente_id 
          WHERE s.contacto_logrado = true 
            AND s.fecha_contacto >= CURRENT_DATE - INTERVAL '30 days' 
            AND s.proxima_cita >= CURRENT_DATE) as contactos_con_turno_caps,
        (SELECT COUNT(DISTINCT p.id) 
          FROM pacientes_filtradas p 
          JOIN public.seguimientos s ON p.id = s.paciente_id 
          WHERE s.contacto_logrado = true 
            AND s.fecha_contacto >= CURRENT_DATE - INTERVAL '30 days') as contactos_totales_caps
    `;

    // 4.1 Métricas para las TARJETAS (Versión 1)
    const cardsKpiSql = `
      SELECT
        COUNT(DISTINCT p.id) as total,
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') THEN 1 ELSE 0 END) as total_riesgo,
        SUM(CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - p.fecha_ultimo_control) <= 40 THEN 1 ELSE 0 END) as total_controladas,
        SUM(CASE WHEN (p.controles_1er_trim > 0 AND p.cantidad_controles > ((p.eg_actual * 7)/30) - (CASE WHEN p.eg_actual < 14 THEN 1 WHEN p.eg_actual < 28 THEN 2 ELSE 3 END)) THEN 1 ELSE 0 END) as total_seguimiento_adecuado,
        SUM(CASE WHEN COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL' THEN 1 ELSE 0 END) as total_capital,
        SUM(CASE WHEN COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL' THEN 1 ELSE 0 END) as total_interior,        
        COUNT(DISTINCT CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND (p.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - p.fecha_ultimo_control) <= 40) THEN p.id END) as total_riesgo_controladas,
        COUNT(DISTINCT CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND (p.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - p.fecha_ultimo_control) <= 40) AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL' THEN p.id END) as total_riesgo_controladas_capital,
        COUNT(DISTINCT CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND (p.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - p.fecha_ultimo_control) <= 40) AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL' THEN p.id END) as total_riesgo_controladas_interior,
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL' THEN 1 ELSE 0 END) as total_riesgo_capital,        
        SUM(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL' THEN 1 ELSE 0 END) as total_riesgo_interior,
        SUM(CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - p.fecha_ultimo_control) <= 40 AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL' THEN 1 ELSE 0 END) as total_controladas_capital,
        SUM(CASE WHEN p.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - p.fecha_ultimo_control) <= 40 AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL' THEN 1 ELSE 0 END) as total_controladas_interior,
        SUM(CASE WHEN (p.controles_1er_trim > 0 AND p.cantidad_controles > ((p.eg_actual * 7)/30) - (CASE WHEN p.eg_actual < 14 THEN 1 WHEN p.eg_actual < 28 THEN 2 ELSE 3 END)) AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL' THEN 1 ELSE 0 END) as total_seguimiento_adecuado_capital,
        SUM(CASE WHEN (p.controles_1er_trim > 0 AND p.cantidad_controles > ((p.eg_actual * 7)/30) - (CASE WHEN p.eg_actual < 14 THEN 1 WHEN p.eg_actual < 28 THEN 2 ELSE 3 END)) AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL' THEN 1 ELSE 0 END) as total_seguimiento_adecuado_interior,
        SUM(CASE WHEN p.nombre_centro_derivado IS NOT NULL AND p.nombre_centro_derivado != '' THEN 1 ELSE 0 END) as derivadas
      FROM public.pacientes_gold p
      WHERE p.fecha_probable_parto >= ${fechaUmbral} 
        AND p.embarazo_en_curso = true 
        AND p.fecha_nacimiento IS NOT NULL
        AND COALESCE(p.en_red_perinatal_msp, true) = true
        ${securityClause} ${centroFilterClause} ${derivacionClause}
    `;

    // Filtros de efectores
    const filtroEfectoresSql = tipoEfector === 'SAPS'
      ? "(s.coordinador ILIKE '%saps%' OR LOWER(s.nombre) LIKE '%saps%' OR LOWER(s.nombre) LIKE '%s.a.p.s.%')"
      : "(s.coordinador ILIKE '%caps%' OR LOWER(s.nombre) LIKE '%caps%' OR LOWER(s.nombre) LIKE '%c.a.p.s.%')";

    // 🌟 7. QUERY DE TABLA EVOLUTIVA DINÁMICA (con último acceso cruzado de logs_actividad_dashboard)
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
      ultima_act_por_centro AS (
        SELECT 
          codigo_sisa,
          MAX(creado_at) as ultimo_acceso
        FROM public.logs_actividad_dashboard
        GROUP BY codigo_sisa
      ),
      efectores_capital AS (
        SELECT 
          s.codigo_sisa,
          TRIM(s.nombre) as raw_name,
          translate(LOWER(TRIM(s.nombre)), 'áéíóúüñ', 'aeiouun') as raw_name_lower,
          uac.ultimo_acceso
        FROM public.efectores_sisa s
        LEFT JOIN ultima_act_por_centro uac ON s.codigo_sisa = uac.codigo_sisa
        WHERE ${filtroEfectoresSql}
          AND LOWER(TRIM(COALESCE(s.departamento, 'CAPITAL'))) = 'capital'
      ),
      efectores_normalized AS (
        SELECT 
          codigo_sisa,
          raw_name,
          ultimo_acceso,
          TRIM(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REGEXP_REPLACE(
                  REGEXP_REPLACE(
                    REGEXP_REPLACE(
                      REGEXP_REPLACE(
                        REGEXP_REPLACE(
                          REGEXP_REPLACE(
                            REGEXP_REPLACE(
                              REGEXP_REPLACE(raw_name_lower, '\\b(c[\\.? ]*a[\\.? ]*p[\\.? ]*s[\\.? ]*|caps)\\b', 'caps', 'g'),
                              '\\b(s[\\.? ]*a[\\.? ]*p[\\.? ]*s[\\.? ]*|saps)\\b', 'saps', 'g'
                            ),
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
              ),
              '[^a-z0-9 ]+', ' ', 'g'
            )
          ) AS normalized_name
        FROM efectores_capital
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
        MAX(c.ultimo_acceso) as ultimo_acceso,
        SUM(COALESCE(da.padron_act, 0)) as padron_act,
        SUM(COALESCE(dant.padron_ant, 0)) as padron_ant,
        SUM(COALESCE(da.controladas_act, 0)) as controladas_act,
        SUM(COALESCE(dant.controladas_ant, 0)) as controladas_ant,
        SUM(COALESCE(da.contactos_act, 0)) as contactos_act,
        SUM(COALESCE(da.controladas_contacto_act, 0)) as controladas_contacto_act,
        SUM(COALESCE(da.seg_adecuado_act, 0)) as seg_adecuado_act,
        SUM(COALESCE(da.turnos_act, 0)) as turnos_act
      FROM efectores_normalized c
      LEFT JOIN datos_t1 da ON c.codigo_sisa = da.sisa_centro_salud
      LEFT JOIN datos_t0 dant ON c.codigo_sisa = dant.sisa_centro_salud
      GROUP BY c.normalized_name
      ORDER BY padron_act DESC;
    `;

    // 🌟 NUEVAS CONSULTAS DINÁMICAS PARA LA VERSIÓN 2
    // A) Desglose de Padrón Provincial real: Capital vs Interior (CAPS, SAPS, Hospitales)
    const desgloseProvincialV2Sql = `
      SELECT 
        CASE 
          WHEN UPPER(TRIM(COALESCE(e.departamento, p.departamento_domicilio))) = 'CAPITAL' THEN 'CAPITAL'
          ELSE 'INTERIOR'
        END AS zona,
        CASE 
          WHEN LOWER(COALESCE(e.nombre, p.nombre_establecimiento)) LIKE '%caps%' OR LOWER(COALESCE(e.nombre, p.nombre_establecimiento)) LIKE '%c.a.p.s.%' THEN 'CAPS'
          WHEN LOWER(COALESCE(e.nombre, p.nombre_establecimiento)) LIKE '%saps%' OR LOWER(COALESCE(e.nombre, p.nombre_establecimiento)) LIKE '%s.a.p.s.%' THEN 'SAPS'
          ELSE 'HOSPITAL'
        END AS tipo_efector,
        COUNT(DISTINCT p.id) AS total
      FROM public.pacientes_gold p
      LEFT JOIN public.efectores_sisa e ON e.codigo_sisa = p.sisa_centro_salud
      WHERE p.embarazo_en_curso = true 
        AND p.fecha_probable_parto >= ${fechaUmbral}
        AND p.fecha_nacimiento IS NOT NULL
        AND COALESCE(p.en_red_perinatal_msp, true) = true
      GROUP BY 1, 2;
    `;

    // B) Por vencer sin turno (Control vence en 10 días, sin turno cargado)
    const porVencerV2Sql = `
      SELECT 
        COUNT(CASE WHEN (CURRENT_DATE - p.fecha_ultimo_control) BETWEEN 30 AND 40 AND (p.proxima_cita IS NULL OR p.proxima_cita < CURRENT_DATE) THEN 1 END) as por_vencer_caps,
        COUNT(CASE WHEN (CURRENT_DATE - p.fecha_ultimo_control) BETWEEN 30 AND 40 AND (p.proxima_cita IS NULL OR p.proxima_cita < CURRENT_DATE) AND LOWER(COALESCE(e.nombre, p.nombre_establecimiento)) LIKE '%saps%' THEN 1 END) as por_vencer_saps
      FROM public.pacientes_gold p
      LEFT JOIN public.efectores_sisa e ON e.codigo_sisa = p.sisa_centro_salud
      WHERE p.embarazo_en_curso = true 
        AND p.fecha_probable_parto >= ${fechaUmbral}
        AND p.fecha_ultimo_control IS NOT NULL;
    `;

    // C) Uso del Tablero según tabla logs_actividad_dashboard
    const usoTableroV2Sql = `
      WITH efectores_tipo AS (
        SELECT s.codigo_sisa, s.nombre
        FROM public.efectores_sisa s
        WHERE ${filtroEfectoresSql}
          AND LOWER(TRIM(COALESCE(s.departamento, 'CAPITAL'))) = 'capital'
      ),
      ultima_actividad AS (
        SELECT 
          l.codigo_sisa,
          MAX(l.creado_at) as ultimo_log
        FROM public.logs_actividad_dashboard l
        GROUP BY l.codigo_sisa
      )
      SELECT 
        e.nombre,
        COALESCE(CURRENT_DATE - ua.ultimo_log::date, 999) as dias_sin_uso
      FROM efectores_tipo e
      LEFT JOIN ultima_actividad ua ON e.codigo_sisa = ua.codigo_sisa
      ORDER BY dias_sin_uso DESC;
    `;

    // D) Edad Gestacional completa (10 rangos + captación temprana)
    const edadGestacionalV2Sql = `
      SELECT 
        sub.orden_num,
        sub.rango_eg,
        COUNT(DISTINCT sub.id) as total_embarazos,
        COUNT(DISTINCT CASE WHEN sub.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - sub.fecha_ultimo_control) <= 40 THEN sub.id END) as total_controladas
      FROM (
        SELECT 
          p.id,
          p.fecha_ultimo_control,
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
          CASE 
            WHEN p.eg_actual BETWEEN 0 AND 4   THEN '0 a 4'
            WHEN p.eg_actual BETWEEN 5 AND 8   THEN '5 a 8'
            WHEN p.eg_actual BETWEEN 9 AND 12  THEN '9 a 12'
            WHEN p.eg_actual BETWEEN 13 AND 16 THEN '13 a 16'
            WHEN p.eg_actual BETWEEN 17 AND 20 THEN '17 a 20'
            WHEN p.eg_actual BETWEEN 21 AND 24 THEN '21 a 24'
            WHEN p.eg_actual BETWEEN 25 AND 28 THEN '25 a 28'
            WHEN p.eg_actual BETWEEN 29 AND 32 THEN '29 a 32'
            WHEN p.eg_actual BETWEEN 33 AND 36 THEN '33 a 36'
            ELSE '37 a 40+'
          END as rango_eg
        FROM public.pacientes_gold p
        LEFT JOIN public.efectores_sisa s ON s.codigo_sisa = p.sisa_centro_salud
        WHERE p.embarazo_en_curso = true 
          AND p.fecha_probable_parto >= ${fechaUmbral} 
          AND p.fecha_nacimiento IS NOT NULL
          AND COALESCE(p.en_red_perinatal_msp, true) = true
          AND ${filtroEfectoresSql}
      ) sub
      GROUP BY sub.orden_num, sub.rango_eg
      ORDER BY sub.orden_num ASC;
    `;

    // E) Cobertura de salud
    const coberturaSql = `
      SELECT
        SUM(CASE WHEN p.fuente_principal = 'sumar' OR (p.fuente_principal IN ('pof', 'v_embarazosdw') AND (p.cobertura_salud ILIKE '%plan nacer%' OR p.cobertura_salud ILIKE '%sumar%')) THEN 1 ELSE 0 END) as sin_obra_social,
        SUM(CASE WHEN p.fuente_principal NOT IN ('sumar') AND p.fuente_principal IN ('pof', 'v_embarazosdw') AND p.cobertura_salud NOT ILIKE '%plan nacer%' AND p.cobertura_salud NOT ILIKE '%sumar%' AND p.cobertura_salud IS NOT NULL THEN 1 ELSE 0 END) as con_obra_social,
        SUM(CASE WHEN p.fuente_principal NOT IN ('sumar') AND (p.fuente_principal NOT IN ('pof', 'v_embarazosdw') OR p.cobertura_salud IS NULL) THEN 1 ELSE 0 END) as sin_datos
      FROM public.pacientes_gold p
      WHERE p.embarazo_en_curso = true 
        AND p.fecha_probable_parto >= ${fechaUmbral} 
        AND p.fecha_nacimiento IS NOT NULL
        AND COALESCE(p.en_red_perinatal_msp, true) = true;
    `;

    const promises = [
      query(chartsKpiSql, statsParams),
      query(cardsKpiSql, statsParams),
      query(capsUnificadaSql),
      query(`SELECT MAX(ingestion_at) as fecha FROM pacientes_gold`),
      query(desgloseProvincialV2Sql),
      query(porVencerV2Sql),
      query(usoTableroV2Sql),
      query(edadGestacionalV2Sql),
      query(coberturaSql)
    ];

    const [
      chartsKpiRes,
      cardsKpiRes,
      capsRes,
      ultimaActualizacionRes,
      desgloseProvRes,
      porVencerRes,
      usoTableroRes,
      egV2Res,
      cobRes
    ] = await Promise.all(promises);

    const chartsKpis = chartsKpiRes.rows[0];
    const cardsKpis = cardsKpiRes.rows[0];

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

      // 🕒 Cálculo dinámico del último uso desde los logs
      const ultimoAcceso = r.ultimo_acceso ? new Date(r.ultimo_acceso) : null;
      let diasSinUso = 999;
      let ultimoUsoTexto = "Sin dato";

      if (ultimoAcceso) {
        const diffMs = Date.now() - ultimoAcceso.getTime();
        diasSinUso = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diasSinUso === 0) {
          ultimoUsoTexto = "Hoy";
        } else if (diasSinUso === 1) {
          ultimoUsoTexto = "Ayer";
        } else if (diasSinUso <= 30) {
          ultimoUsoTexto = `Hace ${diasSinUso}d`;
        } else {
          ultimoUsoTexto = ultimoAcceso.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
        }
      }

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
        turnosAsignadosCaps: parseInt(r.turnos_act) || 0,
        // 🌟 Campos que usa la V2 para la columna "Último Uso":
        ultimoAcceso: r.ultimo_acceso,
        diasSinUso,
        ultimoUsoTexto
      };
    });

    // Procesar desglose V2 (Capital vs Interior: CAPS, SAPS, Hosp)
    const desgloseMap: Record<string, Record<string, number>> = {
      CAPITAL: { CAPS: 0, SAPS: 0, HOSPITAL: 0, TOTAL: 0 },
      INTERIOR: { CAPS: 0, SAPS: 0, HOSPITAL: 0, TOTAL: 0 }
    };

    desgloseProvRes.rows.forEach((r: any) => {
      const z = r.zona === "CAPITAL" ? "CAPITAL" : "INTERIOR";
      const tipo = r.tipo_efector;
      const count = parseInt(r.total) || 0;
      if (desgloseMap[z] && desgloseMap[z][tipo] !== undefined) {
        desgloseMap[z][tipo] = count;
        desgloseMap[z].TOTAL += count;
      }
    });

    // Procesar uso de tablero V2
    const totalEfectoresUso = usoTableroRes.rows.length;
    const activosUso = usoTableroRes.rows.filter((r: any) => parseInt(r.dias_sin_uso) <= 7).length;
    const chipsSinUso = usoTableroRes.rows
      .filter((r: any) => parseInt(r.dias_sin_uso) > 7)
      .slice(0, 4)
      .map((r: any) => ({
        name: r.nombre.replace(/C\.A\.P\.S\.|S\.A\.P\.S\./gi, "").trim(),
        dias: r.dias_sin_uso === 999 ? "S/D" : `${r.dias_sin_uso} días`
      }));

    // Procesar cobertura de salud V2
    const cobRow = cobRes.rows[0];
    const totCob = (parseInt(cobRow.sin_obra_social) || 0) + (parseInt(cobRow.con_obra_social) || 0) + (parseInt(cobRow.sin_datos) || 0);
    const coberturaSaludV2 = {
      publica: totCob > 0 ? Math.round(((parseInt(cobRow.sin_obra_social) || 0) * 100) / totCob) : 85,
      obraSocial: totCob > 0 ? Math.round(((parseInt(cobRow.con_obra_social) || 0) * 100) / totCob) : 3,
      sinRegistro: totCob > 0 ? Math.round(((parseInt(cobRow.sin_datos) || 0) * 100) / totCob) : 12
    };

    return NextResponse.json({
      // 🌟 ESTRUCTURA ORIGINAL (Compatible con versión vieja)
      ultimaActualizacion: ultimaActualizacionRes.rows[0]?.fecha || new Date().toISOString(),
      general: {
        total: parseInt(cardsKpis.total) || 0,
        sub15: parseInt(chartsKpis.gen_15) || 0,
        age15_19: parseInt(chartsKpis.gen_15_19) || 0,
        age20_34: parseInt(chartsKpis.gen_20_34) || 0,
        age34plus: parseInt(chartsKpis.gen_34_plus) || 0,
        desgloseZona: {
          capital: parseInt(cardsKpis.total_capital) || 0,
          interior: parseInt(cardsKpis.total_interior) || 0,
        }
      },
      riesgo: {
        total: parseInt(cardsKpis.total_riesgo) || 0,
        sub15: parseInt(chartsKpis.rsg_15) || 0,
        age15_19: parseInt(chartsKpis.rsg_15_19) || 0,
        age20_34: parseInt(chartsKpis.rsg_20_34) || 0,
        age34plus: parseInt(chartsKpis.rsg_34_plus) || 0,
        desgloseZona: {
          capital: parseInt(cardsKpis.total_riesgo_capital) || 0,
          interior: parseInt(cardsKpis.total_riesgo_interior) || 0,
        }
      },
      gestion: {
        controlesPendientes: parseInt(chartsKpis.controles_pendientes) || 0,
        proximosPartos: parseInt(chartsKpis.proximos_partos) || 0,
        sinTelefono: parseInt(chartsKpis.sin_telefono) || 0,
        derivadas: parseInt(cardsKpis.derivadas) || 0,
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
          riesgoControladas: { capital: parseInt(cardsKpis.total_riesgo_controladas_capital) || 0, interior: parseInt(cardsKpis.total_riesgo_controladas_interior) || 0 },
          seguimientoAdecuado: { capital: parseInt(cardsKpis.total_seguimiento_adecuado_capital) || 0, interior: parseInt(cardsKpis.total_seguimiento_adecuado_interior) || 0 },
        }
      },
      actividad: {
        hoy: parseInt(chartsKpis.controles_hoy) || 0,
        semana: parseInt(chartsKpis.controles_semana) || 0,
        mes: parseInt(chartsKpis.controles_mes) || 0
      },
      resumenCaps,
      tipoEfector,

      // 🌟 PROPIEDADES ADICIONALES PARA LA VERSIÓN 2
      statsV2: {
        padronProvincial: {
          total: desgloseMap.CAPITAL.TOTAL + desgloseMap.INTERIOR.TOTAL,
          capital: desgloseMap.CAPITAL,
          interior: desgloseMap.INTERIOR
        },
        porVencer: {
          caps: parseInt(porVencerRes.rows[0]?.por_vencer_caps) || 0,
          saps: parseInt(porVencerRes.rows[0]?.por_vencer_saps) || 0
        },
        usoTablero: {
          total: totalEfectoresUso,
          activos: activosUso,
          sinUso: chipsSinUso
        },
        coberturaSalud: coberturaSaludV2,
        edadGestacional: egV2Res.rows.map((r: any) => ({
          rango: r.rango_eg,
          total: parseInt(r.total_embarazos) || 0,
          controladas: parseInt(r.total_controladas) || 0
        }))
      }
    });

  } catch (error) {
    console.error("Error obteniendo estadísticas:", error);
    return NextResponse.json({ error: "Error en DB" }, { status: 500 });
  }
}