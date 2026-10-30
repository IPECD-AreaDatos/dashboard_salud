import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Permiso para Primeros Latidos, Admin y Coordinadores
  const allowedRoles = ["Administrador", "Coordinador", "Primeros Latidos"];
  if (!allowedRoles.includes(session.user?.role || "")) {
    return NextResponse.json({ error: "Acceso denegado a Primeros Latidos" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || "";
  const zona = searchParams.get("zona") || "Todos"; // 'Todos' | 'Capital' | 'Interior'
  const departamento = searchParams.get("departamento") || "Todos";
  const establecimiento = searchParams.get("establecimiento") || "Todos";
  const corteDias = searchParams.get("corteDias") || "Todos"; // '40' | '60' | '90' | 'al_dia' | 'sin_control'

  try {
    const params: any[] = [];
    let filterClauses = "";

    // 1. Filtro de búsqueda nominal / DNI
    if (search) {
      params.push(`%${search}%`);
      filterClauses += ` AND (p.dni ILIKE $${params.length} OR p.apellido ILIKE $${params.length} OR p.nombre ILIKE $${params.length})`;
    }

    // 2. Filtro Zona (Capital / Interior)
    if (zona === "Capital") {
      filterClauses += ` AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) = 'CAPITAL'`;
    } else if (zona === "Interior") {
      filterClauses += ` AND COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) <> 'CAPITAL'`;
    }

    // 3. Filtro Departamento
    if (departamento !== "Todos") {
      params.push(departamento.toUpperCase());
      filterClauses += ` AND UPPER(TRIM(COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), p.departamento_domicilio))) = $${params.length}`;
    }

    // 4. Filtro Establecimiento
    if (establecimiento !== "Todos") {
      params.push(establecimiento);
      filterClauses += ` AND (p.nombre_establecimiento = $${params.length} OR p.sisa_centro_salud = $${params.length})`;
    }

    // 5. Filtro de corte de días desde último control
    if (corteDias === "40") {
      filterClauses += ` AND (p.fecha_ultimo_control IS NULL OR (CURRENT_DATE - p.fecha_ultimo_control) > 40)`;
    } else if (corteDias === "60") {
      filterClauses += ` AND (p.fecha_ultimo_control IS NULL OR (CURRENT_DATE - p.fecha_ultimo_control) > 60)`;
    } else if (corteDias === "90") {
      filterClauses += ` AND (p.fecha_ultimo_control IS NULL OR (CURRENT_DATE - p.fecha_ultimo_control) > 90)`;
    } else if (corteDias === "al_dia") {
      filterClauses += ` AND p.fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - p.fecha_ultimo_control) <= 40`;
    } else if (corteDias === "sin_control") {
      filterClauses += ` AND p.fecha_ultimo_control IS NULL`;
    }

    // Consulta de listado completo de embarazadas activas (universo exacto del Excel de Tony)
    const listSql = `
      SELECT 
        p.id,
        p.dni,
        p.apellido,
        p.nombre,
        p.fecha_nacimiento,
        p.fecha_probable_parto,
        p.fecha_ultimo_control,
        CASE 
          WHEN p.fecha_ultimo_control IS NOT NULL THEN (CURRENT_DATE - p.fecha_ultimo_control)
          ELSE NULL 
        END AS dias_ultimo_control,
        p.telefono,
        p.calle_domicilio,
        p.nro_puerta_domicilio,
        p.barrio_paraje_domicilio,
        COALESCE(p.nombre_establecimiento, (SELECT e.nombre FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1)) AS nombre_establecimiento,
        COALESCE(p.localidad_domicilio, (SELECT e.localidad FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1)) AS localidad,
        COALESCE((SELECT e.departamento FROM efectores_sisa e WHERE e.codigo_sisa = p.sisa_centro_salud LIMIT 1), UPPER(TRIM(p.departamento_domicilio))) AS departamento
      FROM public.pacientes_gold p
      WHERE p.embarazo_en_curso = true
        AND p.fecha_probable_parto >= CURRENT_DATE
        AND p.fecha_nacimiento IS NOT NULL
        AND COALESCE(p.en_red_perinatal_msp, true) = true
        ${filterClauses}
      ORDER BY dias_ultimo_control DESC NULLS FIRST, p.apellido ASC;
    `;

    // Consulta de KPIs ejecutivos para las cards superiores de Primeros Latidos
    const kpiSql = `
      SELECT 
        COUNT(*) AS total_activas,
        COUNT(CASE WHEN fecha_ultimo_control IS NOT NULL AND (CURRENT_DATE - fecha_ultimo_control) <= 40 THEN 1 END) AS aptas_al_dia,
        COUNT(CASE WHEN fecha_ultimo_control IS NULL OR (CURRENT_DATE - fecha_ultimo_control) > 40 THEN 1 END) AS atraso_mas_40,
        COUNT(CASE WHEN fecha_ultimo_control IS NULL OR (CURRENT_DATE - fecha_ultimo_control) > 60 THEN 1 END) AS atraso_mas_60,
        COUNT(CASE WHEN fecha_ultimo_control IS NULL OR (CURRENT_DATE - fecha_ultimo_control) > 90 THEN 1 END) AS atraso_mas_90,
        COUNT(CASE WHEN fecha_ultimo_control IS NULL THEN 1 END) AS sin_ningun_control
      FROM public.pacientes_gold p
      WHERE p.embarazo_en_curso = true
        AND p.fecha_probable_parto >= CURRENT_DATE
        AND p.fecha_nacimiento IS NOT NULL
        AND COALESCE(p.en_red_perinatal_msp, true) = true;
    `;

    // Filtros disponibles para selects
    const deptosSql = `
      SELECT DISTINCT UPPER(TRIM(departamento)) as departamento 
      FROM efectores_sisa 
      WHERE departamento IS NOT NULL AND TRIM(departamento) <> ''
      ORDER BY 1 ASC;
    `;

    const [listRes, kpiRes, deptosRes] = await Promise.all([
      query(listSql, params),
      query(kpiSql),
      query(deptosSql)
    ]);

    return NextResponse.json({
      kpis: kpiRes.rows[0],
      pacientes: listRes.rows,
      totalResultados: listRes.rows.length,
      departamentos: deptosRes.rows.map(r => r.departamento)
    });

  } catch (error) {
    console.error("Error en API Primeros Latidos:", error);
    return NextResponse.json({ error: "Error en base de datos" }, { status: 500 });
  }
}