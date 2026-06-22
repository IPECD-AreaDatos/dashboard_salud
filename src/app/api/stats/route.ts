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
    // Maternidad, Coordinador y Admin no necesitan cláusula adicional:
    // - Maternidad: el securityClause ya incluye propias + derivadas
    // - Coordinador/Admin: ven todo

    // 4. Métricas Generales y de Riesgo por Edades
    const kpiSql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN LOWER(riesgo) IN ('si', 's', 'alto', 'moderado') THEN 1 ELSE 0 END) as total_riesgo,
        
        SUM(CASE WHEN edad_actual < 15 THEN 1 ELSE 0 END) as gen_15,
        SUM(CASE WHEN edad_actual BETWEEN 15 AND 19 THEN 1 ELSE 0 END) as gen_15_19,
        SUM(CASE WHEN edad_actual BETWEEN 20 AND 34 THEN 1 ELSE 0 END) as gen_20_34,
        SUM(CASE WHEN edad_actual > 34 THEN 1 ELSE 0 END) as gen_34_plus,
        
        SUM(CASE WHEN LOWER(riesgo) IN ('si', 's', 'alto', 'moderado') AND edad_actual < 15 THEN 1 ELSE 0 END) as rsg_15,
        SUM(CASE WHEN LOWER(riesgo) IN ('si', 's', 'alto', 'moderado') AND edad_actual BETWEEN 15 AND 19 THEN 1 ELSE 0 END) as rsg_15_19,
        SUM(CASE WHEN LOWER(riesgo) IN ('si', 's', 'alto', 'moderado') AND edad_actual BETWEEN 20 AND 34 THEN 1 ELSE 0 END) as rsg_20_34,
        SUM(CASE WHEN LOWER(riesgo) IN ('si', 's', 'alto', 'moderado') AND edad_actual > 34 THEN 1 ELSE 0 END) as rsg_34_plus,

        SUM(CASE WHEN (
              nombre_centro_derivado IS NULL OR nombre_centro_derivado = ''
            )
            AND (
              fecha_ultimo_control IS NULL
              OR
              CASE
                WHEN eg_actual >= 38                      THEN (CURRENT_DATE - fecha_ultimo_control) > 7
                WHEN eg_actual >= 32 AND eg_actual < 38   THEN (CURRENT_DATE - fecha_ultimo_control) > 15
                WHEN eg_actual < 32                       THEN (CURRENT_DATE - fecha_ultimo_control) > 30
                ELSE (CURRENT_DATE - fecha_ultimo_control) > 30
              END
            )
            THEN 1 ELSE 0 END) as controles_pendientes,
        SUM(CASE WHEN fecha_probable_parto BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days') THEN 1 ELSE 0 END) as proximos_partos,
        SUM(CASE WHEN telefono IS NULL OR telefono = '' OR telefono = '-' THEN 1 ELSE 0 END) as sin_telefono,
        SUM(CASE WHEN nombre_centro_derivado IS NOT NULL AND nombre_centro_derivado != '' THEN 1 ELSE 0 END) as derivadas,
        
        -- 🌟 NUEVAS MÉTRICAS GLOBALES: Total Controladas al día y Total Contactadas
        SUM(CASE WHEN 
          fecha_ultimo_control IS NOT NULL AND (
            CASE
              WHEN eg_actual >= 38 THEN (CURRENT_DATE - fecha_ultimo_control) <= 7
              WHEN eg_actual >= 32 AND eg_actual < 38 THEN (CURRENT_DATE - fecha_ultimo_control) <= 15
              ELSE (CURRENT_DATE - fecha_ultimo_control) <= 30
            END
          )
        THEN 1 ELSE 0 END) as total_controladas,
        
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM seguimientos s 
          WHERE s.paciente_id = pacientes_gold.id 
            AND s.contacto_logrado = true 
            AND s.fecha_contacto >= CURRENT_DATE - 30
        ) THEN 1 ELSE 0 END) as total_contactadas,

        /* 👈 CORREGIDO: Filtramos períodos cerrados tomando como techo el día de ayer (CURRENT_DATE - 1) */
        SUM(CASE WHEN fecha_ultimo_control = CURRENT_DATE - 1 THEN 1 ELSE 0 END) as controles_hoy,
        SUM(CASE WHEN fecha_ultimo_control BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE - 1 THEN 1 ELSE 0 END) as controles_semana,
        SUM(CASE WHEN fecha_ultimo_control BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1 THEN 1 ELSE 0 END) as controles_mes,

        SUM(CASE WHEN (
            -- Condición 1: no derivada
            nombre_centro_derivado IS NULL OR nombre_centro_derivado = ''
          )
          AND (
            -- Condición 2: control atrasado según eg_actual (mismo criterio que controles_pendientes)
            fecha_ultimo_control IS NULL
            OR
            CASE
              WHEN eg_actual >= 38                    THEN (CURRENT_DATE - fecha_ultimo_control) > 7
              WHEN eg_actual >= 32 AND eg_actual < 38 THEN (CURRENT_DATE - fecha_ultimo_control) > 15
              WHEN eg_actual < 32                     THEN (CURRENT_DATE - fecha_ultimo_control) > 30
              ELSE (CURRENT_DATE - fecha_ultimo_control) > 30
            END
          )
          AND (
            -- Condición 3: sin contacto logrado dentro del umbral según eg_actual
            NOT EXISTS (
              SELECT 1 FROM seguimientos s
              WHERE s.paciente_id = pacientes_gold.id
                AND embarazo_en_curso = true
                AND s.contacto_logrado = true
                AND s.fecha_contacto >= CURRENT_DATE - (
                  CASE
                    WHEN eg_actual >= 38                    THEN INTERVAL '7 days'
                    WHEN eg_actual >= 32 AND eg_actual < 38 THEN INTERVAL '15 days'
                    WHEN eg_actual < 32                     THEN INTERVAL '30 days'
                    ELSE                                         INTERVAL '30 days'
                  END
                )
            )
          )
          THEN 1 ELSE 0 END) as sin_contacto_reciente
        
      FROM pacientes_gold
      WHERE fecha_probable_parto >= ${fechaUmbral} 
        AND embarazo_en_curso = true
        AND fecha_nacimiento IS NOT NULL
        ${securityClause}
        ${centroFilterClause} -- 👈 SE APLICA EL FILTRO UNIFICADO SISA AQUÍ
    `;
    const kpiRes = await query(kpiSql, statsParams);
    const kpis = kpiRes.rows[0];

    // 5. Top Establecimientos con más embarazadas
    const topGenSql = `
      SELECT 
        s.nombre as name, 
        s.departamento,
        COUNT(p.id) as value
      FROM pacientes_gold p
      INNER JOIN efectores_sisa s ON s.codigo_sisa = (
        CASE 
          WHEN p.sisa_centro_derivado IS NOT NULL AND p.sisa_centro_derivado != ''
            THEN p.sisa_centro_derivado
          ELSE p.sisa_centro_salud
        END
      )
      WHERE p.fecha_probable_parto >= ${fechaUmbral}
        AND p.embarazo_en_curso = true
        AND (p.fecha_ultimo_control >= ${fechaMinimaControl} OR p.fecha_ultimo_control IS NULL)
        ${securityClause}
        ${derivacionClause}
        ${centroFilterClause ? centroFilterClause.replace(/= \$1/g, "= '" + establecimiento + "'") : ""}
      GROUP BY s.codigo_sisa, s.nombre, s.departamento
      ORDER BY value DESC
    `;
    const topGenRes = await query(topGenSql);

    // 6. Top Establecimientos con Riesgo y > 30 días sin control
    const topRsgSql = `
      SELECT 
        s.nombre as name, 
        s.departamento,
        COUNT(p.id) as value
      FROM pacientes_gold p
      INNER JOIN efectores_sisa s ON s.codigo_sisa = (
        CASE 
          WHEN p.sisa_centro_derivado IS NOT NULL AND p.sisa_centro_derivado != ''
            THEN p.sisa_centro_derivado
          ELSE p.sisa_centro_salud
        END
      )
      WHERE p.fecha_probable_parto >= ${fechaUmbral}
        AND p.embarazo_en_curso = true
        AND (p.fecha_ultimo_control >= ${fechaMinimaControl} OR p.fecha_ultimo_control IS NULL)
        AND LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') 
        AND (p.fecha_ultimo_control IS NULL OR (CURRENT_DATE - p.fecha_ultimo_control) > ${diasAtrasoCorte})
        ${securityClause}
        ${derivacionClause}
        ${centroFilterClause ? centroFilterClause.replace(/= \$1/g, "= '" + establecimiento + "'") : ""}
      GROUP BY s.codigo_sisa, s.nombre, s.departamento
      ORDER BY value DESC
    `;
    const topRsgRes = await query(topRsgSql);

    // 7. Query de CAPS unificada (Reflejando números SIN pacientes derivadas)
    const capsResumenSql = `
      SELECT 
        s.nombre as caps_name,
        COUNT(DISTINCT p.id) as total_embarazadas,
        
        ROUND(
          (COUNT(DISTINCT CASE WHEN 
            p.fecha_ultimo_control IS NOT NULL AND (
              CASE
                WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7
                WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15
                ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30
              END
            )
          THEN p.id END) * 100.0) / NULLIF(COUNT(DISTINCT p.id), 0), 
          1
        ) as pct_control,
        
        ROUND(
          (COUNT(DISTINCT seg_any.paciente_id) * 100.0) / NULLIF(COUNT(DISTINCT p.id), 0), 
          1
        ) as pct_contacto,
        
        COUNT(DISTINCT CASE WHEN seg_logrado.id IS NOT NULL THEN p.id END) as contactadas_caps,
        
        COUNT(DISTINCT CASE WHEN 
          p.fecha_ultimo_control IS NOT NULL AND (
            CASE
              WHEN p.eg_actual >= 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 7
              WHEN p.eg_actual >= 32 AND p.eg_actual < 38 THEN (CURRENT_DATE - p.fecha_ultimo_control) <= 15
              ELSE (CURRENT_DATE - p.fecha_ultimo_control) <= 30
            END
          )
          AND seg_any.paciente_id IS NULL 
        THEN p.id END) as acudieron_solas
        
      FROM public.pacientes_gold p
      INNER JOIN public.efectores_sisa s ON s.codigo_sisa = p.sisa_centro_salud
      LEFT JOIN public.seguimientos seg_any ON seg_any.paciente_id = p.id
      LEFT JOIN public.seguimientos seg_logrado ON seg_logrado.paciente_id = p.id AND seg_logrado.contacto_logrado = true
      
      WHERE p.embarazo_en_curso = true 
        AND p.fecha_probable_parto >= CURRENT_DATE
        AND p.fecha_nacimiento IS NOT NULL
        
        -- 👈 NUEVO FILTRO CRUCIAL: Excluimos del padrón del CAPS a aquellas pacientes con derivación activa
        AND (p.nombre_centro_derivado IS NULL OR p.nombre_centro_derivado = '')
        
        AND (
          LOWER(s.nombre) LIKE '%caps%' 
          OR LOWER(s.nombre) LIKE '%c.a.p.s.%'
        )
        ${securityClause}
        ${centroFilterClause ? centroFilterClause.replace(/= \$1/g, "= '" + establecimiento + "'") : ""}
        
      GROUP BY s.nombre
      ORDER BY total_embarazadas DESC;
    `;
    const capsResumenRes = await query(capsResumenSql);

    // 🌟 2. Mapeamos los arrays AFUERA del return para evitar que rompa el parser de Turbopack
    const generalData = {
      total: parseInt(kpis.total) || 0,
      sub15: parseInt(kpis.gen_15) || 0,
      age15_19: parseInt(kpis.gen_15_19) || 0,
      age20_34: parseInt(kpis.gen_20_34) || 0,
      age34plus: parseInt(kpis.gen_34_plus) || 0
    };

    const riesgoData = {
      total: parseInt(kpis.total_riesgo) || 0,
      sub15: parseInt(kpis.rsg_15) || 0,
      age15_19: parseInt(kpis.rsg_15_19) || 0,
      age20_34: parseInt(kpis.rsg_20_34) || 0,
      age34plus: parseInt(kpis.rsg_34_plus) || 0
    };

    const gestionData = {
      controlesPendientes: parseInt(kpis.controles_pendientes) || 0,
      proximosPartos: parseInt(kpis.proximos_partos) || 0,
      sinTelefono: parseInt(kpis.sin_telefono) || 0,
      derivadas: parseInt(kpis.derivadas) || 0,
      sinContactoReciente: parseInt(kpis.sin_contacto_reciente) || 0,
      controladas: parseInt(kpis.total_controladas) || 0,
      contactadas: parseInt(kpis.total_contactadas) || 0
    };

    const actividadData = {
      hoy: parseInt(kpis.controles_hoy) || 0,
      semana: parseInt(kpis.controles_semana) || 0,
      mes: parseInt(kpis.controles_mes) || 0
    };

    const topGeneralMapped = topGenRes.rows.map(r => ({
      name: (r.name || '').trim(),
      departamento: r.departamento,
      value: parseInt(r.value) || 0
    }));

    const topRiesgoMapped = topRsgRes.rows.map(r => ({
      name: (r.name || '').trim(),
      departamento: r.departamento,
      value: parseInt(r.value) || 0
    }));

    const resumenCapsMapped = capsResumenRes.rows.map(r => ({
      capsName: (r.caps_name || '').trim(),
      total: parseInt(r.total_embarazadas) || 0,
      pctControl: parseFloat(r.pct_control) || 0,
      pctContacto: parseFloat(r.pct_contacto) || 0,
      contactadasCaps: parseInt(r.contactadas_caps) || 0,
      acudieronSolas: parseInt(r.acudieron_solas) || 0
    }));

    // 🌟 3. Devolvemos la respuesta con objetos ya limpios y parseados
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