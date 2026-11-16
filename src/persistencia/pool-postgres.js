import pg from 'pg';

const { Pool } = pg;

export function crearPoolPostgres(configuracion = {}) {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ...configuracion,
  });
}
