import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireHealthSession } from "@/lib/healthAuth";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function integerValue(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown) {
  return value == null ? "" : String(value);
}

function dateValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

export async function GET(request: Request) {
  const auth = await requireHealthSession();
  if (!auth.ok) return auth.response;

  const role = auth.session.user?.role;
  if (role !== "Administrador" && role !== "Coordinador") {
    return NextResponse.json({ error: "No autorizado para consultar estadísticas V2" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tipoEfector = searchParams.get("tipoEfector")?.toUpperCase() === "SAPS" ? "SAPS" : "CAPS";
  const periodoDias = Math.min(365, Math.max(1, Number.parseInt(searchParams.get("periodoDias") || "30", 10) || 30));
  const filtroEfector = tipoEfector === "SAPS"
    ? "(s.coordinador ILIKE '%saps%' OR LOWER(s.nombre) LIKE '%saps%' OR LOWER(s.nombre) LIKE '%s.a.p.s.%')"
    : "(s.coordinador ILIKE '%caps%' OR LOWER(s.nombre) LIKE '%caps%' OR LOWER(s.nombre) LIKE '%c.a.p.s.%')";

  const resumenEfectoresSql = `
    WITH fecha_actual AS (
      SELECT MAX(fecha_corte) AS fecha_t1
      FROM public.indicadores_establecimientos
      WHERE es_snapshot_final_dia = true
    ),
    fecha_anterior AS (
      SELECT COALESCE(
        (
          SELECT fecha_corte
          FROM public.indicadores_establecimientos, fecha_actual
          WHERE es_snapshot_final_dia = true
            AND fecha_corte <= fecha_t1 - (${periodoDias} * INTERVAL '1 day')
          ORDER BY fecha_corte DESC
          LIMIT 1
        ),
        (
          SELECT MIN(fecha_corte)
          FROM public.indicadores_establecimientos
          WHERE es_snapshot_final_dia = true
        )
      ) AS fecha_t0
    ),
    efectores AS (
      SELECT
        s.codigo_sisa,
        MIN(TRIM(s.nombre)) AS nombre,
        MAX(u.ultimo_acceso) AS ultimo_acceso
      FROM public.efectores_sisa s
      LEFT JOIN (
        SELECT codigo_sisa, MAX(creado_at) AS ultimo_acceso
        FROM public.logs_actividad_dashboard
        GROUP BY codigo_sisa
      ) u ON u.codigo_sisa = s.codigo_sisa
      WHERE ${filtroEfector}
        AND LOWER(TRIM(COALESCE(s.departamento, 'CAPITAL'))) = 'capital'
        AND NULLIF(TRIM(s.codigo_sisa), '') IS NOT NULL
      GROUP BY s.codigo_sisa
    ),
    actual AS (
      SELECT
        i.sisa_centro_salud AS codigo_sisa,
        SUM(i.contactos_ultimos_30_dias) AS contactos_act,
        SUM(i.controladas_x_contacto_ult_30_dias) AS controladas_contacto_act,
        SUM(i.proximos_turnos_tablero) AS turnos_act
      FROM public.indicadores_establecimientos i
      WHERE i.fecha_corte = (SELECT fecha_t1 FROM fecha_actual)
        AND i.es_snapshot_final_dia = true
      GROUP BY i.sisa_centro_salud
    ),
    anterior AS (
      SELECT
        i.sisa_centro_salud AS codigo_sisa,
        SUM(i.embarazos_en_curso) AS padron_ant,
        SUM(i.controladas) AS controladas_ant
      FROM public.indicadores_establecimientos i
      WHERE i.fecha_corte = (SELECT fecha_t0 FROM fecha_anterior)
        AND i.es_snapshot_final_dia = true
      GROUP BY i.sisa_centro_salud
    ),
    vivos AS (
      SELECT
        p.sisa_centro_salud AS codigo_sisa,
        COUNT(DISTINCT p.id) AS padron_act,
        COUNT(DISTINCT p.id) FILTER (
          WHERE p.fecha_ultimo_control IS NOT NULL
            AND CURRENT_DATE - p.fecha_ultimo_control BETWEEN 0 AND 40
        ) AS controladas_act,
        COUNT(DISTINCT p.id) FILTER (
          WHERE p.controles_1er_trim > 0
            AND p.cantidad_controles > ((p.eg_actual * 7) / 30)
              - (CASE WHEN p.eg_actual < 14 THEN 1 WHEN p.eg_actual < 28 THEN 2 ELSE 3 END)
        ) AS seg_adecuado_act
      FROM public.pacientes_gold p
      JOIN public.efectores_sisa s ON s.codigo_sisa = p.sisa_centro_salud
      WHERE p.embarazo_en_curso = true
        AND p.fecha_probable_parto >= CURRENT_DATE
        AND p.fecha_nacimiento IS NOT NULL
        AND COALESCE(p.en_red_perinatal_msp, true) = true
        AND (p.nombre_centro_derivado IS NULL OR TRIM(p.nombre_centro_derivado) = '')
        AND p.derivacion_maternidad_id IS NULL
        AND ${filtroEfector}
        AND LOWER(TRIM(COALESCE(s.departamento, 'CAPITAL'))) = 'capital'
      GROUP BY p.sisa_centro_salud
    )
    SELECT
      e.codigo_sisa,
      e.nombre AS caps_name,
      (SELECT fecha_t1 FROM fecha_actual) AS fecha_t1,
      (SELECT fecha_t0 FROM fecha_anterior) AS fecha_t0,
      e.ultimo_acceso,
      COALESCE(v.padron_act, 0) AS padron_act,
      COALESCE(a.padron_ant, 0) AS padron_ant,
      COALESCE(v.controladas_act, 0) AS controladas_act,
      COALESCE(a.controladas_ant, 0) AS controladas_ant,
      COALESCE(s.contactos_act, 0) AS contactos_act,
      COALESCE(s.controladas_contacto_act, 0) AS controladas_contacto_act,
      COALESCE(s.turnos_act, 0) AS turnos_act,
      COALESCE(v.seg_adecuado_act, 0) AS seg_adecuado_act
    FROM efectores e
    LEFT JOIN vivos v ON v.codigo_sisa = e.codigo_sisa
    LEFT JOIN actual s ON s.codigo_sisa = e.codigo_sisa
    LEFT JOIN anterior a ON a.codigo_sisa = e.codigo_sisa
    ORDER BY padron_act DESC, e.nombre;
  `;

  const padronProvincialSql = `
    SELECT
      CASE
        WHEN UPPER(TRIM(COALESCE(e.departamento, p.departamento_domicilio))) = 'CAPITAL' THEN 'CAPITAL'
        ELSE 'INTERIOR'
      END AS zona,
      CASE
        WHEN (p.nombre_centro_derivado IS NOT NULL AND TRIM(p.nombre_centro_derivado) <> '')
          OR p.derivacion_maternidad_id IS NOT NULL
          OR LOWER(COALESCE(e.nombre, p.nombre_establecimiento)) LIKE '%hosp%'
          OR LOWER(COALESCE(e.nombre, p.nombre_establecimiento)) LIKE '%matern%'
          THEN 'HOSPITAL'
        WHEN UPPER(TRIM(COALESCE(e.departamento, p.departamento_domicilio))) = 'CAPITAL'
          THEN CASE
            WHEN LOWER(COALESCE(e.nombre, '')) LIKE '%saps%'
              OR LOWER(COALESCE(e.nombre, '')) LIKE '%s.a.p.s.%'
              OR LOWER(COALESCE(e.coordinador, '')) LIKE '%saps%' THEN 'SAPS'
            WHEN LOWER(COALESCE(e.nombre, '')) LIKE '%caps%'
              OR LOWER(COALESCE(e.nombre, '')) LIKE '%c.a.p.s.%'
              OR LOWER(COALESCE(e.coordinador, '')) LIKE '%caps%' THEN 'CAPS'
            ELSE 'OTRO'
          END
        WHEN LOWER(COALESCE(e.nombre, p.nombre_establecimiento)) LIKE '%saps%'
          OR LOWER(COALESCE(e.nombre, p.nombre_establecimiento)) LIKE '%s.a.p.s.%' THEN 'SAPS'
        ELSE 'CAPS'
      END AS tipo_efector,
      COUNT(DISTINCT p.id) AS total
    FROM public.pacientes_gold p
    LEFT JOIN public.efectores_sisa e ON e.codigo_sisa = p.sisa_centro_salud
    WHERE p.embarazo_en_curso = true
      AND p.fecha_probable_parto >= CURRENT_DATE
      AND p.fecha_nacimiento IS NOT NULL
      AND COALESCE(p.en_red_perinatal_msp, true) = true
    GROUP BY 1, 2;
  `;

  const coberturaSql = `
    SELECT
      COUNT(*) FILTER (
        WHERE p.fuente_principal = 'sumar'
          OR (p.fuente_principal IN ('pof', 'v_embarazosdw')
            AND (p.cobertura_salud ILIKE '%plan nacer%' OR p.cobertura_salud ILIKE '%sumar%'))
      ) AS publica,
      COUNT(*) FILTER (
        WHERE p.fuente_principal <> 'sumar'
          AND p.fuente_principal IN ('pof', 'v_embarazosdw')
          AND p.cobertura_salud IS NOT NULL
          AND p.cobertura_salud NOT ILIKE '%plan nacer%'
          AND p.cobertura_salud NOT ILIKE '%sumar%'
      ) AS obra_social,
      COUNT(*) FILTER (
        WHERE p.fuente_principal <> 'sumar'
          AND (p.fuente_principal NOT IN ('pof', 'v_embarazosdw') OR p.cobertura_salud IS NULL)
      ) AS sin_registro
    FROM public.pacientes_gold p
    WHERE p.embarazo_en_curso = true
      AND p.fecha_probable_parto >= CURRENT_DATE
      AND p.fecha_nacimiento IS NOT NULL
      AND COALESCE(p.en_red_perinatal_msp, true) = true;
  `;

  const edadGestacionalSql = `
    SELECT rango_eg, orden_num, COUNT(DISTINCT id) AS total_embarazos,
      COUNT(DISTINCT id_controlada) AS total_controladas
    FROM (
      SELECT p.id,
        CASE
          WHEN p.eg_actual BETWEEN 0 AND 4 THEN '0 a 4'
          WHEN p.eg_actual BETWEEN 5 AND 8 THEN '5 a 8'
          WHEN p.eg_actual BETWEEN 9 AND 12 THEN '9 a 12'
          WHEN p.eg_actual BETWEEN 13 AND 16 THEN '13 a 16'
          WHEN p.eg_actual BETWEEN 17 AND 20 THEN '17 a 20'
          WHEN p.eg_actual BETWEEN 21 AND 24 THEN '21 a 24'
          WHEN p.eg_actual BETWEEN 25 AND 28 THEN '25 a 28'
          WHEN p.eg_actual BETWEEN 29 AND 32 THEN '29 a 32'
          WHEN p.eg_actual BETWEEN 33 AND 36 THEN '33 a 36'
          ELSE '37 a 40+'
        END AS rango_eg,
        CASE
          WHEN p.eg_actual BETWEEN 0 AND 4 THEN 1
          WHEN p.eg_actual BETWEEN 5 AND 8 THEN 2
          WHEN p.eg_actual BETWEEN 9 AND 12 THEN 3
          WHEN p.eg_actual BETWEEN 13 AND 16 THEN 4
          WHEN p.eg_actual BETWEEN 17 AND 20 THEN 5
          WHEN p.eg_actual BETWEEN 21 AND 24 THEN 6
          WHEN p.eg_actual BETWEEN 25 AND 28 THEN 7
          WHEN p.eg_actual BETWEEN 29 AND 32 THEN 8
          WHEN p.eg_actual BETWEEN 33 AND 36 THEN 9
          ELSE 10
        END AS orden_num,
        CASE WHEN p.fecha_ultimo_control IS NOT NULL
          AND CURRENT_DATE - p.fecha_ultimo_control BETWEEN 0 AND 40 THEN p.id END AS id_controlada
      FROM public.pacientes_gold p
      WHERE p.embarazo_en_curso = true
        AND p.fecha_probable_parto >= CURRENT_DATE
        AND p.fecha_nacimiento IS NOT NULL
        AND COALESCE(p.en_red_perinatal_msp, true) = true
    ) q
    GROUP BY rango_eg, orden_num
    ORDER BY orden_num;
  `;

  const porVencerSql = `
    SELECT COUNT(DISTINCT p.id) AS total
    FROM public.pacientes_gold p
    JOIN public.efectores_sisa s ON s.codigo_sisa = p.sisa_centro_salud
    WHERE p.embarazo_en_curso = true
      AND p.fecha_probable_parto >= CURRENT_DATE
      AND p.fecha_nacimiento IS NOT NULL
      AND COALESCE(p.en_red_perinatal_msp, true) = true
      AND LOWER(TRIM(COALESCE(s.departamento, 'CAPITAL'))) = 'capital'
      AND (p.nombre_centro_derivado IS NULL OR TRIM(p.nombre_centro_derivado) = '')
      AND p.derivacion_maternidad_id IS NULL
      AND p.fecha_ultimo_control IS NOT NULL
      AND CURRENT_DATE - p.fecha_ultimo_control BETWEEN 31 AND 40
      AND (p.proxima_cita IS NULL OR p.proxima_cita < CURRENT_DATE)
      AND NOT EXISTS (
        SELECT 1 FROM public.seguimientos sec
        WHERE sec.paciente_id = p.id AND sec.proxima_cita >= CURRENT_DATE
      )
      AND ${filtroEfector};
  `;

  const usoTableroSql = `
    WITH efectores AS (
      SELECT s.codigo_sisa, MIN(s.nombre) AS nombre
      FROM public.efectores_sisa s
      WHERE ${filtroEfector}
        AND LOWER(TRIM(COALESCE(s.departamento, 'CAPITAL'))) = 'capital'
        AND NULLIF(TRIM(s.codigo_sisa), '') IS NOT NULL
      GROUP BY s.codigo_sisa
    ), actividad AS (
      SELECT codigo_sisa, MAX(creado_at) AS ultimo_log
      FROM public.logs_actividad_dashboard
      GROUP BY codigo_sisa
    )
    SELECT e.codigo_sisa, e.nombre,
      COALESCE(CURRENT_DATE - a.ultimo_log::date, 999) AS dias_sin_uso,
      a.ultimo_log AS ultimo_acceso
    FROM efectores e
    LEFT JOIN actividad a ON a.codigo_sisa = e.codigo_sisa
    ORDER BY dias_sin_uso DESC, e.nombre;
  `;

  const territorialResumenSql = `
    WITH corte AS (
      SELECT MAX(fecha_corte) AS fecha_corte
      FROM public.indicadores_establecimientos
      WHERE es_snapshot_final_dia = true
    ), centros AS (
      SELECT NULLIF(TRIM(i.sisa_centro_salud), '') AS sisa_centro_salud,
        SUM(i.embarazos_en_curso) AS embarazos,
        SUM(i.controladas) AS controladas
      FROM public.indicadores_establecimientos i
      JOIN corte c ON i.fecha_corte = c.fecha_corte
      WHERE i.es_snapshot_final_dia = true
      GROUP BY NULLIF(TRIM(i.sisa_centro_salud), '')
    ), catalogo AS (
      SELECT DISTINCT NULLIF(TRIM(codigo_sisa), '') AS codigo_sisa
      FROM public.efectores_sisa
      WHERE NULLIF(TRIM(codigo_sisa), '') IS NOT NULL
    )
    SELECT
      c.fecha_corte,
      (SELECT MIN(ventana_inicio) FROM public.indicadores_establecimientos
        WHERE fecha_corte = c.fecha_corte AND es_snapshot_final_dia = true) AS ventana_inicio,
      (SELECT MIN(batch_id) FROM public.indicadores_establecimientos
        WHERE fecha_corte = c.fecha_corte AND es_snapshot_final_dia = true) AS batch_id,
      (SELECT MIN(fuente_batch_etl) FROM public.indicadores_establecimientos
        WHERE fecha_corte = c.fecha_corte AND es_snapshot_final_dia = true) AS fuente_batch_etl,
      COALESCE(SUM(x.embarazos), 0) AS embarazos,
      COALESCE(SUM(x.controladas), 0) AS controladas,
      COUNT(*) FILTER (WHERE x.embarazos > 0 AND x.sisa_centro_salud IS NOT NULL) AS centros_con_embarazos,
      COUNT(*) FILTER (WHERE x.embarazos > 0 AND x.controladas > 0 AND x.sisa_centro_salud IS NOT NULL) AS centros_con_control,
      COUNT(*) FILTER (WHERE x.embarazos > 0 AND x.sisa_centro_salud IS NOT NULL AND cat.codigo_sisa IS NULL) AS codigos_sin_catalogo,
      COALESCE(SUM(x.embarazos) FILTER (WHERE x.sisa_centro_salud IS NULL), 0) AS embarazos_sin_sisa,
      COALESCE(SUM(x.controladas) FILTER (WHERE x.sisa_centro_salud IS NULL), 0) AS controladas_sin_sisa
    FROM corte c
    LEFT JOIN centros x ON true
    LEFT JOIN catalogo cat ON cat.codigo_sisa = x.sisa_centro_salud
    GROUP BY c.fecha_corte;
  `;

  const padronVigenteSql = `
    SELECT
      COUNT(DISTINCT p.id) AS embarazos,
      COUNT(DISTINCT p.id) FILTER (
        WHERE p.fecha_ultimo_control IS NOT NULL
          AND CURRENT_DATE - p.fecha_ultimo_control BETWEEN 0 AND 40
      ) AS controladas
    FROM public.pacientes_gold p
    WHERE p.embarazo_en_curso = true
      AND p.fecha_probable_parto >= CURRENT_DATE
      AND p.fecha_nacimiento IS NOT NULL
      AND COALESCE(p.en_red_perinatal_msp, true) = true;
  `;

  const territorialGeoCte = `
    WITH corte AS (
      SELECT MAX(fecha_corte) AS fecha_corte
      FROM public.indicadores_establecimientos
      WHERE es_snapshot_final_dia = true
    ), centros AS (
      SELECT NULLIF(TRIM(i.sisa_centro_salud), '') AS sisa_centro_salud,
        SUM(i.embarazos_en_curso) AS embarazos,
        SUM(i.controladas) AS controladas
      FROM public.indicadores_establecimientos i
      JOIN corte c ON i.fecha_corte = c.fecha_corte
      WHERE i.es_snapshot_final_dia = true
      GROUP BY NULLIF(TRIM(i.sisa_centro_salud), '')
    ), geo AS (
      SELECT NULLIF(TRIM(codigo_sisa), '') AS codigo_sisa,
        CASE WHEN COUNT(DISTINCT NULLIF(UPPER(TRIM(departamento)), '')) > 1
          THEN 'TERRITORIO EN CONFLICTO'
          ELSE MIN(NULLIF(UPPER(TRIM(departamento)), '')) END AS departamento,
        CASE WHEN COUNT(DISTINCT NULLIF(UPPER(TRIM(localidad)), '')) > 1
          THEN 'LOCALIDAD EN CONFLICTO'
          ELSE MIN(NULLIF(UPPER(TRIM(localidad)), '')) END AS localidad,
        MIN(TRIM(nombre)) AS nombre
      FROM public.efectores_sisa
      WHERE NULLIF(TRIM(codigo_sisa), '') IS NOT NULL
      GROUP BY NULLIF(TRIM(codigo_sisa), '')
    ), base AS (
      SELECT x.sisa_centro_salud AS codigo_sisa, x.embarazos, x.controladas,
        COALESCE(g.departamento, 'SIN DEPARTAMENTO IDENTIFICADO') AS departamento,
        COALESCE(g.localidad, 'SIN LOCALIDAD IDENTIFICADA') AS localidad,
        COALESCE(g.nombre, 'EFECTOR SIN IDENTIFICAR') AS efector
      FROM centros x
      LEFT JOIN geo g ON g.codigo_sisa = x.sisa_centro_salud
    )
  `;

  const departamentosSql = `${territorialGeoCte}
    SELECT departamento, SUM(embarazos) AS embarazos, SUM(controladas) AS controladas,
      COUNT(*) FILTER (WHERE embarazos > 0) AS efectores
    FROM base
    GROUP BY departamento
    ORDER BY SUM(embarazos) DESC, departamento;
  `;

  const localidadesSql = `${territorialGeoCte}
    SELECT localidad, departamento, SUM(embarazos) AS embarazos, SUM(controladas) AS controladas,
      COUNT(*) FILTER (WHERE embarazos > 0) AS efectores
    FROM base
    GROUP BY localidad, departamento
    ORDER BY SUM(embarazos) DESC, localidad, departamento;
  `;

  const topInteriorSql = `${territorialGeoCte}
    SELECT codigo_sisa, efector, departamento, localidad, embarazos, controladas
    FROM base
    WHERE departamento NOT IN ('CAPITAL', 'SIN DEPARTAMENTO IDENTIFICADO', 'TERRITORIO EN CONFLICTO')
      AND embarazos > 0
    ORDER BY embarazos DESC, efector
    LIMIT 20;
  `;

  try {
    const [resumenRes, padronRes, coberturaRes, edadRes, porVencerRes, usoRes,
      territorialRes, padronVigenteRes, departamentosRes, localidadesRes, topInteriorRes, ultimaActualizacionRes] = await Promise.all([
      query(resumenEfectoresSql),
      query(padronProvincialSql),
      query(coberturaSql),
      query(edadGestacionalSql),
      query(porVencerSql),
      query(usoTableroSql),
      query(territorialResumenSql),
      query(padronVigenteSql),
      query(departamentosSql),
      query(localidadesSql),
      query(topInteriorSql),
      query("SELECT MAX(ingestion_at) AS fecha FROM public.pacientes_gold")
    ]);

    const desglose = {
      CAPITAL: { CAPS: 0, SAPS: 0, HOSPITAL: 0, OTRO: 0, TOTAL: 0 },
      INTERIOR: { CAPS: 0, SAPS: 0, HOSPITAL: 0, OTRO: 0, TOTAL: 0 }
    };
    for (const row of padronRes.rows as DbRow[]) {
      const zone = row.zona === "CAPITAL" ? "CAPITAL" : "INTERIOR";
      const type = stringValue(row.tipo_efector) as keyof typeof desglose.CAPITAL;
      const total = integerValue(row.total);
      if (type !== "TOTAL" && type in desglose[zone]) {
        desglose[zone][type] = total;
        desglose[zone].TOTAL += total;
      }
    }

    const coverageRow = (coberturaRes.rows[0] || {}) as DbRow;
    const totalCoverage = numberValue(coverageRow.publica)
      + numberValue(coverageRow.obra_social)
      + numberValue(coverageRow.sin_registro);
    const coveragePercent = (value: unknown) => totalCoverage > 0
      ? Number(((numberValue(value) * 100) / totalCoverage).toFixed(1))
      : 0;

    const resumenCaps = (resumenRes.rows as DbRow[]).map((row) => {
      const padronAct = integerValue(row.padron_act);
      const padronAnt = integerValue(row.padron_ant);
      const ctrlAct = integerValue(row.controladas_act);
      const ctrlAnt = integerValue(row.controladas_ant);
      const controladasContacto = integerValue(row.controladas_contacto_act);
      const segAdecuado = integerValue(row.seg_adecuado_act);
      const cobAct = padronAct > 0 ? (ctrlAct * 100) / padronAct : 0;
      const cobAnt = padronAnt > 0 ? (ctrlAnt * 100) / padronAnt : 0;
      const ultimoAcceso = dateValue(row.ultimo_acceso);
      const ultimoAccesoDate = ultimoAcceso ? new Date(ultimoAcceso) : null;
      const diasSinUso = ultimoAccesoDate && Number.isFinite(ultimoAccesoDate.getTime())
        ? Math.floor((Date.now() - ultimoAccesoDate.getTime()) / 86400000)
        : 999;

      return {
        capsName: stringValue(row.caps_name),
        codigoSisa: stringValue(row.codigo_sisa),
        fechaT1: dateValue(row.fecha_t1),
        fechaT0: dateValue(row.fecha_t0),
        padronAnt,
        padronAct,
        total: padronAct,
        ctrlAnt,
        ctrlAct,
        absControl: ctrlAct,
        cobAnt: Number(cobAnt.toFixed(1)),
        cobAct: Number(cobAct.toFixed(1)),
        pctControl: Number(cobAct.toFixed(1)),
        variacionCob: Number((cobAct - cobAnt).toFixed(1)),
        absSeguimientoAdecuado: segAdecuado,
        pctSeguimientoAdecuado: Number((padronAct > 0 ? (segAdecuado * 100) / padronAct : 0).toFixed(1)),
        controladasGestion: controladasContacto,
        controladasEspontaneas: Math.max(0, ctrlAct - controladasContacto),
        pctGestion: ctrlAct > 0 ? Number(((controladasContacto * 100) / ctrlAct).toFixed(1)) : 0,
        turnosAsignadosCaps: integerValue(row.turnos_act),
        ultimoAcceso,
        diasSinUso,
        ultimoUsoTexto: diasSinUso === 999 ? "Sin dato" : diasSinUso === 0 ? "Hoy" : diasSinUso === 1 ? "Ayer" : `Hace ${diasSinUso}d`
      };
    });

    const usoRows = usoRes.rows as DbRow[];
    const territorialSummary = (territorialRes.rows[0] || {}) as DbRow;
    const padronVigente = (padronVigenteRes.rows[0] || {}) as DbRow;
    const territorial = {
      fechaCorte: dateValue(territorialSummary.fecha_corte),
      ventanaInicio: dateValue(territorialSummary.ventana_inicio),
      batchId: stringValue(territorialSummary.batch_id) || null,
      fuenteBatchEtl: stringValue(territorialSummary.fuente_batch_etl) || null,
      resumen: {
        embarazos: numberValue(territorialSummary.embarazos),
        controladas: numberValue(territorialSummary.controladas),
        cobertura: numberValue(territorialSummary.embarazos) > 0
          ? Number(((numberValue(territorialSummary.controladas) * 100) / numberValue(territorialSummary.embarazos)).toFixed(1))
          : 0,
        efectoresConEmbarazos: numberValue(territorialSummary.centros_con_embarazos),
        efectoresConControl: numberValue(territorialSummary.centros_con_control),
        codigosSinCatalogo: numberValue(territorialSummary.codigos_sin_catalogo),
        embarazosSinSisa: numberValue(territorialSummary.embarazos_sin_sisa),
        controladasSinSisa: numberValue(territorialSummary.controladas_sin_sisa)
      },
      conciliacion: {
        embarazosVigentes: numberValue(padronVigente.embarazos),
        controladasVigentes: numberValue(padronVigente.controladas),
        diferenciaEmbarazos: numberValue(territorialSummary.embarazos) - numberValue(padronVigente.embarazos),
        diferenciaControladas: numberValue(territorialSummary.controladas) - numberValue(padronVigente.controladas)
      },
      departamentos: (departamentosRes.rows as DbRow[]).map((row) => ({
        nombre: stringValue(row.departamento),
        embarazos: numberValue(row.embarazos),
        controladas: numberValue(row.controladas),
        efectores: numberValue(row.efectores)
      })),
      localidades: (localidadesRes.rows as DbRow[]).map((row) => ({
        nombre: stringValue(row.localidad),
        departamento: stringValue(row.departamento),
        embarazos: numberValue(row.embarazos),
        controladas: numberValue(row.controladas),
        efectores: numberValue(row.efectores)
      })),
      topInterior: (topInteriorRes.rows as DbRow[]).map((row) => ({
        codigoSisa: stringValue(row.codigo_sisa),
        efector: stringValue(row.efector),
        departamento: stringValue(row.departamento),
        localidad: stringValue(row.localidad),
        embarazos: numberValue(row.embarazos),
        controladas: numberValue(row.controladas)
      }))
    };

    const totalEfectoresUso = usoRows.length;
    const activosUso = usoRows.filter((row) => numberValue(row.dias_sin_uso) <= 7).length;
    const chipsSinUso = usoRows
      .filter((row) => numberValue(row.dias_sin_uso) > 7)
      .slice(0, 4)
      .map((row) => ({ name: stringValue(row.nombre), dias: numberValue(row.dias_sin_uso) === 999 ? "S/D" : `${numberValue(row.dias_sin_uso)} días` }));
    const padronEfector = resumenCaps.reduce((sum, row) => sum + row.padronAct, 0);
    const seguimientoEfector = resumenCaps.reduce((sum, row) => sum + row.absSeguimientoAdecuado, 0);
    const seguimientoPercent = padronEfector > 0 ? Number(((seguimientoEfector * 100) / padronEfector).toFixed(1)) : 0;

    return NextResponse.json({
      ultimaActualizacion: ultimaActualizacionRes.rows[0]?.fecha || null,
      resumenCaps,
      tipoEfector,
      statsV2: {
        seguimientoAdecuado: {
          [tipoEfector.toLowerCase()]: seguimientoPercent
        },
        padronProvincial: {
          total: desglose.CAPITAL.TOTAL + desglose.INTERIOR.TOTAL,
          capital: desglose.CAPITAL,
          interior: desglose.INTERIOR
        },
        porVencer: {
          [tipoEfector.toLowerCase()]: integerValue((porVencerRes.rows[0] as DbRow | undefined)?.total)
        },
        usoTablero: {
          total: totalEfectoresUso,
          activos: activosUso,
          conPadron: resumenCaps.filter((row) => row.padronAct > 0).length,
          sinPadron: resumenCaps.filter((row) => row.padronAct === 0).length,
          sinUso: chipsSinUso
        },
        coberturaSalud: {
          publica: coveragePercent(coverageRow.publica),
          obraSocial: coveragePercent(coverageRow.obra_social),
          sinRegistro: coveragePercent(coverageRow.sin_registro)
        },
        edadGestacional: (edadRes.rows as DbRow[]).map((row) => ({
          rango: stringValue(row.rango_eg),
          total: integerValue(row.total_embarazos),
          controladas: integerValue(row.total_controladas)
        })),
        territorial
      }
    });
  } catch (error) {
    console.error("Error obteniendo estadísticas V2:", error);
    return NextResponse.json({ error: "Error en DB" }, { status: 500 });
  }
}
