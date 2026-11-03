import { Pool } from 'pg';

/**
 * Configuración del pool de conexiones para PostgreSQL.
 * Utiliza variables de entorno para establecer la conexión.
 */
const pool = new Pool({
  host: process.env.DB_HOST || process.env.HOST_DBB2,
  port: parseInt(process.env.DB_PORT || process.env.PORT_DBB2 || '5432'),
  user: process.env.DB_USER || process.env.USER_DBB2,
  password: process.env.DB_PASSWORD || process.env.PASSWORD_DBB2,
  database: process.env.DB_NAME || process.env.DB_NAME_SALUD,
  // La excepción de TLS solo existe para la base ficticia local de pruebas.
  ssl: process.env.IMI_SSO_TEST_MODE === 'si' && process.env.DB_HOST === '127.0.0.1' && process.env.DB_NAME === 'salud_sso_test'
    ? false : { rejectUnauthorized: false }
});

/**
 * Ejecuta una consulta SQL en la base de datos.
 * @param {string} text - La consulta SQL a ejecutar.
 * @param {any[]} [params] - Parámetros opcionales para la consulta.
 * @returns {Promise<any>} El resultado de la consulta.
 */
export const query = (text: string, params?: any[]) => pool.query(text, params);