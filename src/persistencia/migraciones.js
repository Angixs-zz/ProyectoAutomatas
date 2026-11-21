import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR_INIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/init');

/**
 * Ejecuta en orden los scripts SQL de `db/init/` que aún no estén registrados
 * en `esquema_migraciones`, de forma idempotente y reproducible.
 * @param {import('pg').Pool} pool
 */
export async function aplicarMigraciones(pool, directorio = DIR_INIT) {
  if (!pool?.query || !pool?.connect) {
    throw new TypeError('Se requiere un pool compatible con node-postgres.');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS esquema_migraciones (
      nombre TEXT PRIMARY KEY,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const archivos = (await fs.readdir(directorio))
    .filter((nombre) => nombre.endsWith('.sql'))
    .sort();

  const { rows } = await pool.query('SELECT nombre FROM esquema_migraciones');
  const aplicadas = new Set(rows.map((r) => r.nombre));

  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = await fs.readFile(path.join(directorio, archivo), 'utf8');
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(sql);
      await cliente.query(
        'INSERT INTO esquema_migraciones (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING',
        [archivo],
      );
      await cliente.query('COMMIT');
    } catch (error) {
      try {
        await cliente.query('ROLLBACK');
      } catch {
        // Conserva el error original de la migración.
      }
      throw error;
    } finally {
      cliente.release();
    }
  }
}
