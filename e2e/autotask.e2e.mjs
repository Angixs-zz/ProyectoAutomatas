// Suite reproducible de pruebas funcionales E2E para Docker Compose (app + PostgreSQL + Mailpit) · [S4 · EX-4] #18.
// Se ejecuta de forma opcional con `npm run test:e2e`; `npm test` no requiere Docker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenizar, parsear } from '../src/lenguaje.js';
import { validarPrograma } from '../src/semantica/validador.js';
import { generarIR } from '../src/ir/generador-ir.js';
import { optimizarIR } from '../src/ir/optimizador.js';
import { ejecutarIR } from '../src/ejecutor/ejecutor.js';
import { crearServiciosEnMemoria } from '../src/ejecutor/servicios-memoria.js';
import { crearPoolPostgres } from '../src/persistencia/pool-postgres.js';
import { crearRepositorioPostgres } from '../src/persistencia/repositorio-postgres.js';
import { crearServicioCorreoSMTP } from '../src/ejecutor/correo-smtp.js';
import { ejecutarPrograma } from '../src/motor/ejecutar-programa.js';

const APP_URL = process.env.AUTOTASK_URL ?? 'http://localhost:8080';
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://autotask:autotask_dev@localhost:5432/autotask';

async function peticionJSON(ruta, { method = 'GET', body } = {}) {
  const res = await fetch(`${APP_URL}${ruta}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(res.status, 200, `${method} ${ruta} devolvió estado ${res.status}`);
  return res.json();
}

test('E2E Docker: web disponible y /api/salud conectado a PostgreSQL', async () => {
  const html = await fetch(`${APP_URL}/`).then((r) => {
    assert.equal(r.status, 200);
    return r.text();
  });
  assert.match(html, /id="consola"/);
  assert.match(html, /id="tablero"/);

  const salud = await peticionJSON('/api/salud');
  assert.equal(salud.ok, true);
  assert.equal(salud.almacenamiento, 'postgres');
});

test('E2E Docker: flujo completo de comandos, condicionales, tablero, historial y Mailpit', async () => {
  const etiqueta = `E2E-${Date.now()}`;
  const titulo = `Tarea ${etiqueta}`;
  const correoDestino = `prueba-${etiqueta.toLowerCase()}@ejemplo.com`;

  const ej = await peticionJSON('/api/ejecutar', {
    method: 'POST',
    body: {
      programa: [
        `CREAR TAREA "${titulo}" FECHA "2026-11-30"`,
        `ASIGNAR TAREA "${titulo}" A "Yareli"`,
        `CAMBIAR ESTADO TAREA "${titulo}" A EN_PROGRESO`,
        `SI TAREA "${titulo}" ESTA EN_PROGRESO ENTONCES NOTIFICAR A "Angel" MENSAJE "Notif ${etiqueta}"`,
        'SI TAREA "Preparar informe" ESTA COMPLETADA ENTONCES NOTIFICAR A "Angel" MENSAJE "No debe enviarse"',
        `ENVIAR CORREO A "${correoDestino}" MENSAJE "Correo ${etiqueta}"`,
        `CONSULTAR TAREA "${titulo}"`,
        'LISTAR TAREAS',
      ].join('\n'),
    },
  });

  assert.equal(ej.ok, true, JSON.stringify(ej));
  assert.equal(ej.resultados.length, 8);
  assert.equal(ej.resultados[3].condicion, true);
  assert.equal(ej.resultados[4].condicion, false);
  assert.equal(ej.resultados[4].accion, null);

  const tablero = await peticionJSON('/api/tablero');
  const tarea = tablero.tareas.find((t) => t.titulo === titulo);
  assert.ok(tarea, 'La tarea creada debe aparecer en /api/tablero');
  assert.equal(tarea.estado, 'EN_PROGRESO');
  assert.equal(tarea.responsable, 'Yareli');

  assert.ok(tablero.historial.some((h) => h.operacion === 'consultar'));
  assert.ok(tablero.historial.some((h) => h.operacion === 'listar'));
  assert.ok(tablero.historial.some((h) => h.operacion === 'notificar' && h.tipo === 'notificacion'));
  assert.ok(tablero.historial.some((h) => h.operacion === 'enviar_correo' && h.tipo === 'correo'));

  const mailpit = await fetch(`${MAILPIT_URL}/api/v1/messages`).then((r) => r.json());
  assert.ok(
    mailpit.messages.some((m) => m.To?.some((to) => to.Address === correoDestino)),
    `Mailpit debe haber recibido el correo para ${correoDestino}`,
  );
});

test('E2E Docker: rechaza errores por etapa y hace rollback real en PostgreSQL', async () => {
  const errLex = await peticionJSON('/api/ejecutar', {
    method: 'POST',
    body: { programa: 'CREAR TAREA "Sin cerrar' },
  });
  assert.equal(errLex.ok, false);
  assert.equal(errLex.diagnosticos[0].etapa, 'lexica');

  const errSint = await peticionJSON('/api/ejecutar', {
    method: 'POST',
    body: { programa: 'CREAR TAREA' },
  });
  assert.equal(errSint.ok, false);
  assert.equal(errSint.diagnosticos[0].etapa, 'sintactica');

  const errSem = await peticionJSON('/api/ejecutar', {
    method: 'POST',
    body: { programa: 'CONSULTAR TAREA "Tarea Inexistente E2E"' },
  });
  assert.equal(errSem.ok, false);
  assert.equal(errSem.diagnosticos[0].etapa, 'semantica');

  const tituloRollback = `Rollback-${Date.now()}`;
  const errEj = await peticionJSON('/api/ejecutar', {
    method: 'POST',
    body: {
      programa: [
        `CREAR TAREA "${tituloRollback}"`,
        'SI TAREA "Preparar informe" ESTA PENDIENTE ENTONCES CAMBIAR ESTADO TAREA "Preparar informe" A COMPLETADA',
        'CAMBIAR ESTADO TAREA "Preparar informe" A EN_PROGRESO',
      ].join('\n'),
    },
  });
  assert.equal(errEj.ok, false);
  assert.equal(errEj.diagnosticos[0].etapa, 'ejecucion');
  assert.equal(errEj.diagnosticos[0].codigo, 'TRANSICION_INVALIDA');

  const tablero = await peticionJSON('/api/tablero');
  assert.equal(tablero.tareas.find((t) => t.titulo === tituloRollback), undefined);
});

test('E2E: compara ejecución de IR sin optimizar y optimizada preservando efectos', async () => {
  const codigo = [
    'CREAR TAREA "Comparar IR"',
    'SI TAREA "Comparar IR" ESTA PENDIENTE ENTONCES CAMBIAR ESTADO TAREA "Comparar IR" A EN_PROGRESO',
    'CAMBIAR ESTADO TAREA "Comparar IR" A COMPLETADA',
    'CONSULTAR TAREA "Comparar IR"',
  ].join('\n');

  async function correr(optimizar) {
    const { tokens } = tokenizar(codigo);
    const { ast } = parsear(tokens);
    const servicios = crearServiciosEnMemoria();
    const validado = await validarPrograma(ast, servicios.tareas);
    assert.equal(validado.ok, true);
    const irBase = generarIR(validado.programa);
    const irFinal = optimizar ? optimizarIR(irBase) : irBase;
    const ejecucion = await ejecutarIR(irFinal, servicios);
    return { ejecucion, estado: servicios.obtenerEstado(), irFinal };
  }

  const sinOpt = await correr(false);
  const conOpt = await correr(true);

  assert.ok(conOpt.irFinal.metadatos.optimizacionesAplicadas.length >= 1);
  assert.deepEqual(conOpt.ejecucion.resultados, sinOpt.ejecucion.resultados);
  assert.deepEqual(conOpt.estado.tareas, sinOpt.estado.tareas);
});

test('E2E PostgreSQL: manejo seguro de error parcial post-commit sin reintentos', async () => {
  const pool = crearPoolPostgres({ connectionString: DATABASE_URL });
  const repo = crearRepositorioPostgres(pool);
  const titulo = `Parcial-PG-${Date.now()}`;
  try {
    const servicios = {
      tareas: { ...repo.tareas, listarUsuarios: repo.listarUsuarios },
      notificaciones: repo.notificaciones,
      correo: crearServicioCorreoSMTP({ host: '127.0.0.1', port: 19999 }),
    };

    const res = await ejecutarPrograma(
      [
        `CREAR TAREA "${titulo}"`,
        'NOTIFICAR A "Yareli" MENSAJE "Notif antes de fallo"',
        'ENVIAR CORREO A "fallo@ejemplo.com" MENSAJE "Fallo SMTP"',
        'ENVIAR CORREO A "omitido@ejemplo.com" MENSAJE "No procesado"',
      ].join('\n'),
      { modo: 'ejecucion', servicios },
    );

    assert.equal(res.ok, false);
    assert.equal(res.partial, true);
    assert.equal(res.resultados[1].estado, 'en_cola');
    assert.equal(res.resultados[2].estado, 'incierto');
    assert.equal(res.resultados[3].estado, 'no_procesado');

    const tareas = await repo.listarTareas();
    assert.ok(tareas.some((t) => t.titulo === titulo));
  } finally {
    await pool.end();
  }
});
