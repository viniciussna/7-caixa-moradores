require('dotenv').config();
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definida. Copie .env.example para .env e preencha.');
}

const usaSsl =
  process.env.DB_SSL === 'true' ||
  /azure|sslmode=require/i.test(url || '');

const pool = new Pool({
  connectionString: url,
  ssl: usaSsl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 8000,
  max: 5,
});

// Evita derrubar o processo se o banco cair com conexão ociosa.
pool.on('error', (e) => console.error('[pg] erro em conexão ociosa:', e.code || e.message));

module.exports = pool;
