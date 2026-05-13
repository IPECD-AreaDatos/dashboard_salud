const fs = require("fs");
const env = fs.readFileSync(".env", "utf8").split("\n").reduce((acc, line) => {
  const [k, ...v] = line.split("=");
  if(k && v) acc[k] = v.join("=").replace(/"/g, "").trim();
  return acc;
}, {});
const { Pool } = require("pg");
const pool = new Pool({
  host: env.DB_HOST,
  port: parseInt(env.DB_PORT || "5432"),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});
pool.query("SELECT * FROM pacientes_gold LIMIT 1").then(r => {
  console.log("Columns:", Object.keys(r.rows[0]));
  process.exit(0);
}).catch(console.error);
