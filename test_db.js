const fs = require('fs');
const envFile = fs.readFileSync('.env', 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
});

const { Pool } = require('pg');
const pool = new Pool({
  host: envVars.DB_HOST || envVars.HOST_DBB2,
  port: parseInt(envVars.DB_PORT || envVars.PORT_DBB2 || '5432'),
  user: envVars.DB_USER || envVars.USER_DBB2,
  password: envVars.DB_PASSWORD || envVars.PASSWORD_DBB2,
  database: envVars.DB_NAME || envVars.DB_NAME_SALUD,
  ssl: { rejectUnauthorized: false }
});

pool.query(`
  SELECT column_name 
  FROM information_schema.columns 
  WHERE table_name = 'pacientes_gold'
`)
.then(res => {
  console.log('Columns in pacientes_gold:', res.rows.map(r => r.column_name));
  process.exit(0);
})
.catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
