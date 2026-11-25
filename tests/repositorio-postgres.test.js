import test from 'node:test';
import assert from 'node:assert/strict';
import { crearRepositorioPostgres } from '../src/persistencia/repositorio-postgres.js';

function crearPoolFalso(resolver = async () => ({ rows: [], rowCount: 0 })) {
  const llamadas = [];
  const cliente = {
    async query(sql, valores = []) {
      llamadas.push({ sql: sql.trim(), valores });
      return resolver(sql.trim(), valores);
    },
    release() {
      llamadas.push({ sql: 'RELEASE', valores: [] });
    },
  };
  return {
    llamadas,
    async query(sql, valores = []) {
      llamadas.push({ sql: sql.trim(), valores });
      return resolver(sql.trim(), valores);
    },
    async connect() {
      return cliente;
    },
    async end() {},
  };
}

test('listar tareas y usuarios mapea el formato de PostgreSQL al contrato JS', async () => {
  const pool = crearPoolFalso(async (sql) => {
    if (sql.includes('FROM tareas')) {
      return { rows: [{ id: 'task_1', titulo: 'Informe', estado: 'PENDIENTE', responsable_id: 'user_1', fecha: null }] };
    }
    if (sql.includes('FROM usuarios')) {
      return { rows: [{ id: 'user_1', nombre: 'Yareli', correo: null }] };
    }
    return { rows: [] };
  });
  const repo = crearRepositorioPostgres(pool);

  assert.deepEqual(await repo.listarTareas(), [
    { id: 'task_1', titulo: 'Informe', estado: 'PENDIENTE', responsableId: 'user_1', fecha: null },
  ]);
  assert.deepEqual(await repo.listarUsuarios(), [
    { id: 'user_1', nombre: 'Yareli', correo: null },
  ]);
});

test('DATE de pg conserva el día calendario al listar y consultar tareas', async () => {
  const fecha = new Date(2026, 10, 30);
  const fila = { id: 'task_1', titulo: 'Informe', estado: 'PENDIENTE', responsable_id: null, fecha };
  const pool = crearPoolFalso(async (sql) => (
    sql.includes('FROM tareas') ? { rows: [fila] } : { rows: [] }
  ));
  const repo = crearRepositorioPostgres(pool);
  assert.equal((await repo.listarTareas())[0].fecha, '2026-11-30');
  assert.equal((await repo.tareas.consultarTarea({ tareaId: 'task_1' })).fecha, '2026-11-30');
});

test('crear tarea usa parámetros y registra creación en la misma transacción', async () => {
  const pool = crearPoolFalso(async (sql) => {
    if (sql.startsWith('INSERT INTO tareas')) {
      return { rows: [{ id: 'task_4', titulo: 'Informe', estado: 'PENDIENTE', responsable_id: null, fecha: null }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  const repo = crearRepositorioPostgres(pool);

  const tarea = await repo.tareas.crearTarea({ titulo: 'Informe' });

  assert.equal(tarea.id, 'task_4');
  assert.equal(tarea.responsableId, null);
  assert.deepEqual(pool.llamadas.map((llamada) => llamada.sql.split(' ')[0]), [
    'BEGIN', 'INSERT', 'INSERT', 'COMMIT', 'RELEASE',
  ]);
  assert.deepEqual(pool.llamadas[1].valores, ['Informe', null]);
  assert.equal(pool.llamadas[2].valores[0], 'task_4');
});

test('asignar tarea conserva la asignación anterior en el historial', async () => {
  const pool = crearPoolFalso(async (sql) => {
    if (sql.startsWith('SELECT responsable_id')) {
      return { rows: [{ responsable_id: 'user_1' }], rowCount: 1 };
    }
    if (sql.startsWith('UPDATE tareas')) {
      return { rows: [{ id: 'task_1', titulo: 'Informe', estado: 'PENDIENTE', responsable_id: 'user_2', fecha: null }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  const repo = crearRepositorioPostgres(pool);

  const tarea = await repo.tareas.asignarTarea({ tareaId: 'task_1', usuarioId: 'user_2' });

  assert.equal(tarea.responsableId, 'user_2');
  const historial = pool.llamadas.find((llamada) => llamada.sql.startsWith('INSERT INTO historial_tareas'));
  assert.equal(historial.valores[0], 'task_1');
  assert.deepEqual(JSON.parse(historial.valores[1]), { responsableId: 'user_1' });
  assert.deepEqual(JSON.parse(historial.valores[2]), { responsableId: 'user_2' });
});

test('ejecutarEnTransaccion revierte y propaga el error del callback', async () => {
  const pool = crearPoolFalso();
  const repo = crearRepositorioPostgres(pool);

  await assert.rejects(
    repo.tareas.ejecutarEnTransaccion(async () => {
      throw new Error('fallo esperado');
    }),
    /fallo esperado/,
  );
  assert.deepEqual(pool.llamadas.map((llamada) => llamada.sql), ['BEGIN', 'ROLLBACK', 'RELEASE']);
});

test('rechaza un pool que no soporte transacciones', () => {
  assert.throws(() => crearRepositorioPostgres({ query() {} }), /pool compatible/);
});
