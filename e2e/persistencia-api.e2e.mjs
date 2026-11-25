// Casos de frontera de API contra PostgreSQL real · [Cierre · BE-5] #41.
// Requiere Docker Compose arriba y AUTOTASK_URL / DATABASE_URL configurados.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const APP_URL = process.env.AUTOTASK_URL ?? 'http://localhost:8080';
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://autotask:autotask_dev@localhost:5432/autotask';

async function postJSON(ruta, programa) {
  const res = await fetch(`${APP_URL}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ programa }),
  });
  return { status: res.status, cuerpo: await res.json() };
}

test('E2E PostgreSQL: POST /api/validar no persiste tarea, historial, notificación ni correo', async () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const etiqueta = `ValidarSinEscritura-${Date.now()}`;
  const titulo = `Tarea ${etiqueta}`;
  const mensaje = `Aviso ${etiqueta}`;
  const destinatario = `${etiqueta.toLowerCase()}@ejemplo.com`;

  try {
    const respuesta = await postJSON('/api/validar', [
      `CREAR TAREA "${titulo}"`,
      `ASIGNAR TAREA "${titulo}" A "Yareli"`,
      `CAMBIAR ESTADO TAREA "${titulo}" A EN_PROGRESO`,
      `NOTIFICAR A "Yareli" MENSAJE "${mensaje}"`,
      `ENVIAR CORREO A "${destinatario}" MENSAJE "${mensaje}"`,
    ].join('\n'));

    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.cuerpo.ok, true, JSON.stringify(respuesta.cuerpo));
    assert.equal(respuesta.cuerpo.modo, 'validacion');
    assert.deepEqual(respuesta.cuerpo.resultados, []);

    const tarea = await pool.query('SELECT id FROM tareas WHERE titulo = $1', [titulo]);
    assert.equal(tarea.rowCount, 0, 'Validar no debe insertar la tarea');

    const notificacion = await pool.query('SELECT id FROM notificaciones WHERE mensaje = $1', [mensaje]);
    assert.equal(notificacion.rowCount, 0, 'Validar no debe insertar notificaciones');

    const historial = await pool.query(
      `SELECT h.id
         FROM historial_tareas h
         LEFT JOIN tareas t ON t.id = h.tarea_id
        WHERE t.titulo = $1 OR h.detalle = $2 OR h.instruccion LIKE $3`,
      [titulo, `Correo de prueba para ${destinatario}`, `%${etiqueta}%`],
    );
    assert.equal(historial.rowCount, 0, 'Validar no debe registrar operaciones en el historial');

    const mailpit = await fetch(`${MAILPIT_URL}/api/v1/messages`).then((res) => res.json());
    assert.equal(
      mailpit.messages.some((m) => m.To?.some((to) => to.Address === destinatario)),
      false,
      'Validar no debe enviar correos',
    );
  } finally {
    await pool.end();
  }
});

test('E2E PostgreSQL: referencia de usuario inválida no modifica tarea y conserva el diagnóstico', async () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const etiqueta = `UsuarioInexistente-${Date.now()}`;
  const programa = `ASIGNAR TAREA "Preparar informe" A "${etiqueta}"`;

  try {
    const antes = await pool.query(
      'SELECT estado, responsable_id FROM tareas WHERE id = $1',
      ['task_1'],
    );
    assert.equal(antes.rowCount, 1, 'El conjunto demo debe incluir task_1');

    const respuesta = await postJSON('/api/ejecutar', programa);

    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.cuerpo.ok, false);
    assert.equal(respuesta.cuerpo.diagnosticos[0].etapa, 'semantica');
    assert.equal(respuesta.cuerpo.diagnosticos[0].codigo, 'USUARIO_INEXISTENTE');

    const despues = await pool.query(
      'SELECT estado, responsable_id FROM tareas WHERE id = $1',
      ['task_1'],
    );
    assert.deepEqual(despues.rows, antes.rows, 'La referencia inválida no debe cambiar la tarea');

    const entradaError = await pool.query(
      `SELECT id FROM historial_tareas
        WHERE operacion = 'error' AND instruccion = $1 AND resultado = 'error'`,
      [programa],
    );
    assert.equal(entradaError.rowCount, 1, 'El error semántico debe quedar visible en el historial persistente');
  } finally {
    await pool.end();
  }
});
