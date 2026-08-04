const { Pool } = require('pg');

const pool = new Pool({
  host: '149.50.145.182',
  port: 5432,
  user: 'IPECD_Manuela',
  password: 'IPECDatos.2026',
  database: 'salud',
  ssl: { rejectUnauthorized: false }
});

const query = async () => {
  const sql = "WITH caps_normalized AS ("
    + " SELECT p.id, COALESCE(s.codigo_sisa, p.sisa_centro_salud) AS raw_code, "
    + " TRIM(COALESCE(s.nombre, p.nombre_establecimiento)) AS raw_name, "
    + " LOWER(TRIM(COALESCE(s.nombre, p.nombre_establecimiento))) AS raw_name_lower, "
    + " p.riesgo, p.fecha_ultimo_control, p.eg_actual, p.controles_1er_trim, p.cantidad_controles "
    + " FROM public.pacientes_gold p "
    + " LEFT JOIN public.efectores_sisa s ON s.codigo_sisa = p.sisa_centro_salud "
    + " WHERE p.embarazo_en_curso = true "
    + " AND p.fecha_probable_parto >= CURRENT_DATE "
    + " AND p.fecha_nacimiento IS NOT NULL "
    + " AND (p.nombre_centro_derivado IS NULL OR p.nombre_centro_derivado = '') "
    + " AND LOWER(TRIM(COALESCE(s.departamento, 'CAPITAL'))) = 'capital' "
    + " AND (LOWER(TRIM(COALESCE(s.nombre, p.nombre_establecimiento))) LIKE '%8%' OR LOWER(TRIM(COALESCE(s.nombre, p.nombre_establecimiento))) LIKE '%viii%') "
    + " AND (LOWER(TRIM(COALESCE(s.nombre, p.nombre_establecimiento))) LIKE '%sta%' OR LOWER(TRIM(COALESCE(s.nombre, p.nombre_establecimiento))) LIKE '%santa%') "
    + " ), caps_normalized_step AS ("
    + " SELECT *, REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(raw_name_lower, '\\b(c\\.a\\.p\\.s\\.)\\b', 'caps', 'g'), '\\b(viii)\\b', '8', 'g'), '\\b(vii)\\b', '7', 'g'), '\\b(vi)\\b', '6', 'g'), '\\b(v)\\b', '5', 'g'), '\\b(iv)\\b', '4', 'g'), '\\b(iii)\\b', '3', 'g'), '\\b(ii)\\b', '2', 'g') AS normalized_name_step1 "
    + " FROM caps_normalized "
    + " ), caps_normalized_step2 AS ("
    + " SELECT *, TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(normalized_name_step1, '\\bsta\\b', 'santa', 'g'), '\\bb[º°]?\\b', '', 'g'), '[^a-z0-9 ]+', ' ', 'g')) AS normalized_name "
    + " FROM caps_normalized_step "
    + " ) "
    + " SELECT raw_code, raw_name, raw_name_lower, normalized_name, COUNT(*) AS cnt "
    + " FROM caps_normalized_step2 "
    + " GROUP BY raw_code, raw_name, raw_name_lower, normalized_name "
    + " ORDER BY cnt DESC, raw_name;";

  const res = await pool.query(sql);
  console.log(res.rows);
  await pool.end();
};

query().catch(err => { console.error(err); process.exit(1); });
