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
  SELECT 
    fuente_principal, 
    COUNT(*) as total,
    COUNT(CASE WHEN cobertura_salud ILIKE '%plan nacer%' OR cobertura_salud ILIKE '%sumar%' THEN 1 END) as con_nacer_o_sumar,
    array_agg(DISTINCT cobertura_salud) FILTER (WHERE cobertura_salud IS NOT NULL) as coberturas_ejemplo
  FROM pacientes_gold
  WHERE embarazo_en_curso = true
  GROUP BY fuente_principal
`)
.then(res => {
  console.log('Results by fuente_principal:');
  res.rows.forEach(r => {
    console.log(`- Fuente: ${r.fuente_principal}, Total: ${r.total}, Con Nacer/Sumar: ${r.con_nacer_o_sumar}`);
    console.log(`  Coberturas:`, r.coberturas_ejemplo?.slice(0, 10));
  });
  
  return pool.query(`
    SELECT DISTINCT cobertura_salud
    FROM pacientes_gold
    WHERE embarazo_en_curso = true AND fuente_principal IN ('v_embarazosdw', 'POF')
    LIMIT 20
  `);
})
.then(res => {
  console.log('POF Coberturas:');
  console.log(res.rows.map(r => r.cobertura_salud));
  process.exit(0);
})
.catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
