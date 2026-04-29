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
  ssl: {
    rejectUnauthorized: false // Necesario para conexiones externas a veces
  }
});

/**
 * Ejecuta una consulta SQL en la base de datos.
 * @param {string} text - La consulta SQL a ejecutar.
 * @param {any[]} [params] - Parámetros opcionales para la consulta.
 * @returns {Promise<any>} El resultado de la consulta.
 */
export const query = (text: string, params?: any[]) => pool.query(text, params);