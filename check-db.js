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

async function checkSisa() {
  try {
    const res = await pool.query("SELECT * FROM efectores_sisa LIMIT 5");
    console.log("Columns:", Object.keys(res.rows[0]));
    console.log("Sample Data:", res.rows);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

checkSisa();
