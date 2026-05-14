// src/app/api/stats/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    // Definir la misma fecha umbral que se usa para las listas activas (hoy, por defecto).
    const fechaUmbral = "CURRENT_DATE";
    const fechaMinimaControl = "'2025-03-01'";
    const diasAtrasoCorte = 30;

    const sisa = session.user?.sisa_code;
    const cuie = session.user?.cuie_code;
    // RBAC Security Clause
    let securityClause = "";
    if (session.user?.role === 'Centro de Salud') {
      if (sisa) {
        // Si hay SISA nacional, es la prioridad absoluta
        securityClause = ` AND sisa_centro_salud = '${sisa}'`;
      } else if (cuie) {
        // Si no hay SISA, buscamos por CUIE o mapeamos CUIE -> SISA
        securityClause = ` AND (sisa_centro_salud = '${cuie}' OR sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = '${cuie}'))`;
      }
    }
    else if (session.user?.role === 'Maternidad') {
      const matId = session.user?.maternidad_id;
      // Maternidad: Ve lo propio (por SISA o CUIE) + derivaciones
      let localClause = "";
      if (sisa) {
        localClause = `sisa_centro_salud = '${sisa}'`;
      } else if (cuie) {
        localClause = `(sisa_centro_salud = '${cuie}' OR sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = '${cuie}'))`;
      }

      securityClause = ` AND (${localClause} OR derivacion_maternidad_id = '${matId}')`;
    }

    // 1. Métricas Generales y de Riesgo por Edades (Ignorando fechas mínimas de control, pero aplicando RBAC y umbral FPP)
    const kpiSql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN LOWER(riesgo) IN ('si', 's') THEN 1 ELSE 0 END) as total_riesgo,
        
        SUM(CASE WHEN edad_actual < 15 THEN 1 ELSE 0 END) as gen_15,
        SUM(CASE WHEN edad_actual BETWEEN 15 AND 19 THEN 1 ELSE 0 END) as gen_15_19,
        SUM(CASE WHEN edad_actual BETWEEN 20 AND 34 THEN 1 ELSE 0 END) as gen_20_34,
        SUM(CASE WHEN edad_actual > 34 THEN 1 ELSE 0 END) as gen_34_plus,
        
        SUM(CASE WHEN LOWER(riesgo) IN ('si', 's') AND edad_actual < 15 THEN 1 ELSE 0 END) as rsg_15,
        SUM(CASE WHEN LOWER(riesgo) IN ('si', 's') AND edad_actual BETWEEN 15 AND 19 THEN 1 ELSE 0 END) as rsg_15_19,
        SUM(CASE WHEN LOWER(riesgo) IN ('si', 's') AND edad_actual BETWEEN 20 AND 34 THEN 1 ELSE 0 END) as rsg_20_34,
        SUM(CASE WHEN LOWER(riesgo) IN ('si', 's') AND edad_actual > 34 THEN 1 ELSE 0 END) as rsg_34_plus,

        -- Métricas Operativas para CAPS
        SUM(CASE WHEN (CURRENT_DATE - fecha_ultimo_control) > 30 OR fecha_ultimo_control IS NULL THEN 1 ELSE 0 END) as controles_pendientes,
        SUM(CASE WHEN fecha_probable_parto BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days') THEN 1 ELSE 0 END) as proximos_partos,
        SUM(CASE WHEN telefono IS NULL OR telefono = '' OR telefono = '-' THEN 1 ELSE 0 END) as sin_telefono
      FROM pacientes_gold
      WHERE fecha_probable_parto >= ${fechaUmbral} 
        AND fecha_nacimiento IS NOT NULL
        ${securityClause}
    `;
    const kpiRes = await query(kpiSql);
    const kpis = kpiRes.rows[0];

    // Base query para gráficos según el código de Tony
    const baseChartWhere = `
      WHERE fecha_probable_parto >= ${fechaUmbral}
        AND nombre_establecimiento IS NOT NULL
        AND nombre_establecimiento != ''
        AND (fecha_ultimo_control >= ${fechaMinimaControl} OR fecha_ultimo_control IS NULL)
        ${securityClause}
    `;

    // 2. Top Establecimientos con más embarazadas (UNIFICADO POR SISA)
    const topGenSql = `
      SELECT 
        s.nombre as name, 
        s.departamento,
        COUNT(p.id) as value
      FROM pacientes_gold p
      INNER JOIN efectores_sisa s ON p.sisa_centro_salud = s.codigo_sisa
      WHERE p.fecha_probable_parto >= ${fechaUmbral}
        AND (p.fecha_ultimo_control >= ${fechaMinimaControl} OR p.fecha_ultimo_control IS NULL)
        ${securityClause}
      GROUP BY s.codigo_sisa, s.nombre, s.departamento
      ORDER BY value DESC
    `;
    const topGenRes = await query(topGenSql);

    // 3. Top Establecimientos con Riesgo y > 30 días sin control (UNIFICADO POR SISA)
    const topRsgSql = `
      SELECT 
        s.nombre as name, 
        s.departamento,
        COUNT(p.id) as value
      FROM pacientes_gold p
      INNER JOIN efectores_sisa s ON p.sisa_centro_salud = s.codigo_sisa
      WHERE p.fecha_probable_parto >= ${fechaUmbral}
        AND (p.fecha_ultimo_control >= ${fechaMinimaControl} OR p.fecha_ultimo_control IS NULL)
        AND LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') 
        AND (p.fecha_ultimo_control IS NULL OR (CURRENT_DATE - p.fecha_ultimo_control) > ${diasAtrasoCorte})
        ${securityClause}
      GROUP BY s.codigo_sisa, s.nombre, s.departamento
      ORDER BY value DESC
    `;
    const topRsgRes = await query(topRsgSql);

    return NextResponse.json({
      general: {
        total: parseInt(kpis.total) || 0,
        sub15: parseInt(kpis.gen_15) || 0,
        age15_19: parseInt(kpis.gen_15_19) || 0,
        age20_34: parseInt(kpis.gen_20_34) || 0,
        age34plus: parseInt(kpis.gen_34_plus) || 0
      },
      riesgo: {
        total: parseInt(kpis.total_riesgo) || 0,
        sub15: parseInt(kpis.rsg_15) || 0,
        age15_19: parseInt(kpis.rsg_15_19) || 0,
        age20_34: parseInt(kpis.rsg_20_34) || 0,
        age34plus: parseInt(kpis.rsg_34_plus) || 0
      },
      gestion: { // Nuevas métricas para el CAPS
        controlesPendientes: parseInt(kpis.controles_pendientes) || 0,
        proximosPartos: parseInt(kpis.proximos_partos) || 0,
        sinTelefono: parseInt(kpis.sin_telefono) || 0
      },
      topGeneral: topGenRes.rows.map(r => ({ name: r.name.trim(), departamento: r.departamento, value: parseInt(r.value) || 0 })),
      topRiesgoAtraso: topRsgRes.rows.map(r => ({ name: r.name.trim(), departamento: r.departamento, value: parseInt(r.value) || 0 }))
    });
  } catch (error) {
    console.error("Error obteniendo estadísticas:", error);
    return NextResponse.json({ error: "Error en DB" }, { status: 500 });
  }
}