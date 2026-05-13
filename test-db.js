const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const pool = new Pool({
  host: process.env.DB_HOST || process.env.HOST_DBB2,
  port: parseInt(process.env.DB_PORT || process.env.PORT_DBB2 || '5432'),
  user: process.env.DB_USER || process.env.USER_DBB2,
  password: process.env.DB_PASSWORD || process.env.PASSWORD_DBB2,
  database: process.env.DB_NAME || process.env.DB_NAME_SALUD,
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    const res3 = await pool.query("SELECT cuie, codigo_sisa, nombre FROM efectores_sisa LIMIT 1");
    console.log("efectores_sisa columns:", Object.keys(res3.rows[0]));

    const res4 = await pool.query(`
      EXPLAIN ANALYZE
      SELECT 
        s.cuie,
        s.codigo_sisa,
        s.nombre as nombre_oficial,
        COUNT(CASE WHEN LOWER(p.riesgo) IN ('si', 's', 'alto', 'moderado') AND p.fecha_probable_parto >= CURRENT_DATE THEN 1 END) as total_riesgo
      FROM pacientes_gold p
      INNER JOIN efectores_sisa s ON p.cuie_seguimiento = s.cuie
      WHERE s.nombre IS NOT NULL
        AND s.nombre != ''
      GROUP BY s.cuie, s.codigo_sisa, s.nombre
      ORDER BY total_riesgo DESC, s.nombre ASC
    `);
    console.log("EXPLAIN api/filtros:", res4.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

test();
