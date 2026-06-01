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
        centroFilterClause = ` AND sisa_centro_salud = $1`;
      } else {
        centroFilterClause = ` AND (sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = $1) OR cuie_seguimiento = $1)`;
      }
    }

    // 3. Métricas Generales y de Riesgo por Edades
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

        SUM(CASE WHEN (CURRENT_DATE - fecha_ultimo_control) > 30 OR fecha_ultimo_control IS NULL THEN 1 ELSE 0 END) as controles_pendientes,
        SUM(CASE WHEN fecha_probable_parto BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days') THEN 1 ELSE 0 END) as proximos_partos,
        SUM(CASE WHEN telefono IS NULL OR telefono = '' OR telefono = '-' THEN 1 ELSE 0 END) as sin_telefono,
        SUM(CASE WHEN nombre_centro_derivado IS NOT NULL AND nombre_centro_derivado != '' THEN 1 ELSE 0 END) as derivadas,

        SUM(CASE WHEN (
          SELECT MAX(s.fecha_contacto) 
          FROM seguimientos s 
          WHERE s.paciente_id = pacientes_gold.id AND embarazo_en_curso = true 
            AND s.contacto_logrado = true -- 👈 FILTRO CORRECTO DE TONY
        ) < CURRENT_DATE - INTERVAL '30 days' 
        OR NOT EXISTS (
          SELECT 1 
          FROM seguimientos s 
          WHERE s.paciente_id = pacientes_gold.id AND embarazo_en_curso = true 
            AND s.contacto_logrado = true -- 👈 FILTRO CORRECTO DE TONY
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

    // 4. Top Establecimientos con más embarazadas
    const topGenSql = `
      SELECT 
        s.nombre as name, 
        s.departamento,
        COUNT(p.id) as value
      FROM pacientes_gold p
      INNER JOIN efectores_sisa s ON p.sisa_centro_salud = s.codigo_sisa
      WHERE p.fecha_probable_parto >= ${fechaUmbral}
        AND p.embarazo_en_curso = true
        AND (p.fecha_ultimo_control >= ${fechaMinimaControl} OR p.fecha_ultimo_control IS NULL)
        ${securityClause}
        ${centroFilterClause ? centroFilterClause.replace(/= \$1/g, "= '" + establecimiento + "'") : ""}
      GROUP BY s.codigo_sisa, s.nombre, s.departamento
      ORDER BY value DESC
    `;
    const topGenRes = await query(topGenSql);

    // 5. Top Establecimientos con Riesgo y > 30 días sin control
    const topRsgSql = `
      SELECT 
        s.nombre as name, 
        s.departamento,
        COUNT(p.id) as value
      FROM pacientes_gold p
      INNER JOIN efectores_sisa s ON p.sisa_centro_salud = s.codigo_sisa
      WHERE p.fecha_probable_parto >= ${fechaUmbral}
        AND p.embarazo_en_curso = true
        AND (p.fecha_ultimo_control >= ${fechaMinimaControl} OR p.fecha_ultimo_control IS NULL)
        AND LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') 
        AND (p.fecha_ultimo_control IS NULL OR (CURRENT_DATE - p.fecha_ultimo_control) > ${diasAtrasoCorte})
        ${securityClause}
        ${centroFilterClause ? centroFilterClause.replace(/= \$1/g, "= '" + establecimiento + "'") : ""}
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
      gestion: {
        controlesPendientes: parseInt(kpis.controles_pendientes) || 0,
        proximosPartos: parseInt(kpis.proximos_partos) || 0,
        sinTelefono: parseInt(kpis.sin_telefono) || 0,
        derivadas: parseInt(kpis.derivadas) || 0,
        sinContactoReciente: parseInt(kpis.sin_contacto_reciente) || 0
      },
      topGeneral: topGenRes.rows.map(r => ({ name: r.name.trim(), departamento: r.departamento, value: parseInt(r.value) || 0 })),
      topRiesgoAtraso: topRsgRes.rows.map(r => ({ name: r.name.trim(), departamento: r.departamento, value: parseInt(r.value) || 0 }))
    });
  } catch (error) {
    console.error("Error obteniendo estadísticas:", error);
    return NextResponse.json({ error: "Error en DB" }, { status: 500 });
  }
}