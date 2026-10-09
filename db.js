const { Pool } = require('pg');
require('dotenv').config();

// Configuración flexible: Detecta si está en Render (DATABASE_URL) o en Local
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false, // Necesario para conexiones seguras en Render
        },
      }
    : {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'veterinaria_db',
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 5432,
      }
);

pool.on('connect', () => {
  console.log('Base de datos conectada con éxito');
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};