const { Pool } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split(/\r?\n/).reduce((result,line)=>{const t=line.trim();if(!t||t.startsWith('#')||!t.includes('='))return result;const i=t.indexOf('=');result[t.slice(0,i).trim()]=t.slice(i+1).trim().replace(/^['"]|['"]$/g,'');return result;},{});
const pool=new Pool({host:env.DB_HOST||env.HOST_DBB2,port:parseInt(env.DB_PORT||env.PORT_DBB2||'5432',10),user:env.DB_USER||env.USER_DBB2,password:env.DB_PASSWORD||env.PASSWORD_DBB2,database:env.DB_NAME||env.DB_NAME_SALUD,ssl:{rejectUnauthorized:false}});
(async()=>{
 const rows=await pool.query(`SELECT fecha_corte, es_snapshot_final_dia, COUNT(*) AS filas, SUM(embarazos_en_curso) AS padron, SUM(controladas) AS controladas, SUM(seguimiento_adecuado) AS seguimiento, SUM(contactos_ultimos_30_dias) AS contactos FROM public.indicadores_establecimientos GROUP BY fecha_corte, es_snapshot_final_dia ORDER BY fecha_corte DESC LIMIT 12`);
 const latest=await pool.query(`SELECT MAX(fecha_corte) AS fecha_corte FROM public.indicadores_establecimientos WHERE es_snapshot_final_dia=true`);
 const prev=await pool.query(`SELECT MAX(fecha_corte) AS fecha_corte FROM public.indicadores_establecimientos WHERE es_snapshot_final_dia=true AND fecha_corte < (SELECT MAX(fecha_corte) FROM public.indicadores_establecimientos WHERE es_snapshot_final_dia=true)`);
 const current=await pool.query(`SELECT COUNT(*) AS total, SUM(embarazos_en_curso) AS padron, SUM(controladas) AS controladas, SUM(seguimiento_adecuado) AS seguimiento FROM public.indicadores_establecimientos WHERE fecha_corte=(SELECT MAX(fecha_corte) FROM public.indicadores_establecimientos WHERE es_snapshot_final_dia=true) AND es_snapshot_final_dia=true`);
 console.log(JSON.stringify({rows:rows.rows,latest:latest.rows[0],previous:prev.rows[0],current:current.rows[0]},null,2));
 await pool.end();
})().catch(e=>{console.error(e);process.exitCode=1});
