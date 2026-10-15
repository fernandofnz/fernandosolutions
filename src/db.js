// Banco de dados: arquivo SQLite local ou Turso (libSQL) online.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

const PASTA_DADOS = process.env.PASTA_DADOS || path.join(__dirname, '..', 'dados');
const ONLINE = !!process.env.TURSO_DATABASE_URL;
if (!ONLINE) fs.mkdirSync(PASTA_DADOS, { recursive: true });

const db = createClient(ONLINE
  ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
  : { url: 'file:' + path.join(PASTA_DADOS, 'prospeccao.db').replace(/\\/g, '/') });

async function prepararBanco() {
  if (!ONLINE) await db.execute('PRAGMA journal_mode = WAL');
}

module.exports = { db, prepararBanco, PASTA_DADOS, ONLINE };
