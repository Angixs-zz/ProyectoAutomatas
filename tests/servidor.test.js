import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { crearAplicacion } from '../src/api/servidor.js';
import { crearServiciosEnMemoria } from '../src/ejecutor/servicios-memoria.js';

async function iniciarServidorPrueba(opciones = {}) {
  const servidor = http.createServer(crearAplicacion(opciones));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const { port } = servidor.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    cerrar: () => new Promise((r) => servidor.close(r)),
  };
}

test('API /api/salud, /api/validar, /api/ejecutar y /api/tablero funcionan de extremo a extremo', async () => {
  const servicios = crearServiciosEnMemoria();
  const { baseUrl, cerrar } = await iniciarServidorPrueba({ servicios });

  try {
    const salud = await fetch(`${baseUrl}/api/salud`).then((r) => r.json());
    assert.equal(salud.ok, true);
    assert.equal(salud.almacenamiento, 'memoria');

    const estadoAntesDeValidar = JSON.parse(JSON.stringify(servicios.obtenerEstado()));
    const val = await fetch(`${baseUrl}/api/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programa: 'CREAR TAREA "Desde API"' }),
    }).then((r) => r.json());
    assert.equal(val.ok, true);
    assert.equal(val.modo, 'validacion');
    assert.deepEqual(val.resultados, []);
    assert.deepEqual(servicios.obtenerEstado(), estadoAntesDeValidar);
    assert.equal(servicios.obtenerEstado().tareas.length, 3);

    const ej = await fetch(`${baseUrl}/api/ejecutar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        programa: [
          'CREAR TAREA "Desde API" FECHA "2026-11-20"',
          'ASIGNAR TAREA "Desde API" A "Yareli"',
          'NOTIFICAR A "Yareli" MENSAJE "Lista"',
        ].join('\n'),
      }),
    }).then((r) => r.json());
    assert.equal(ej.ok, true);
    assert.equal(ej.resultados.length, 3);

    const tablero = await fetch(`${baseUrl}/api/tablero`).then((r) => r.json());
    assert.equal(tablero.tareas.length, 4);
    assert.equal(tablero.tareas[3].responsable, 'Yareli');
    assert.equal(tablero.historial.length, 3);
    assert.equal(tablero.historial[0].tipo, 'notificacion');
  } finally {
    await cerrar();
  }
});

test('API sirve index.html y rechaza rutas fuera del proyecto o JSON inválido', async () => {
  const { baseUrl, cerrar } = await iniciarServidorPrueba();

  try {
    const html = await fetch(`${baseUrl}/`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /AutoTask/);

    const bad = await fetch(`${baseUrl}/api/ejecutar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{no es json',
    });
    assert.equal(bad.status, 400);

    const sinPrograma = await fetch(`${baseUrl}/api/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(sinPrograma.status, 400);
    assert.deepEqual(await sinPrograma.json(), { error: 'Se esperaba el campo «programa» como texto.' });

    const metodoInvalido = await fetch(`${baseUrl}/api/salud`, { method: 'DELETE' });
    assert.equal(metodoInvalido.status, 405);
  } finally {
    await cerrar();
  }
});

test('API clasifica los errores por etapa con línea y columna, sin escribir tareas', async () => {
  const servicios = crearServiciosEnMemoria();
  const { baseUrl, cerrar } = await iniciarServidorPrueba({ servicios });

  async function validar(programa) {
    const res = await fetch(`${baseUrl}/api/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programa }),
    });
    assert.equal(res.status, 200);
    return res.json();
  }

  try {
    const lexico = await validar('CREAR TAREA "Led" @');
    assert.equal(lexico.ok, false);
    assert.equal(lexico.diagnosticos[0].etapa, 'lexica');
    assert.equal(lexico.diagnosticos[0].codigo, 'CARACTER_INVALIDO');
    assert.equal(lexico.diagnosticos[0].linea, 1);
    assert.equal(lexico.diagnosticos[0].columna, 19);

    const sintactico = await validar('CREAR TAREA');
    assert.equal(sintactico.ok, false);
    assert.equal(sintactico.diagnosticos[0].etapa, 'sintactica');
    assert.equal(sintactico.diagnosticos[0].codigo, 'ARGUMENTO_FALTANTE');
    assert.equal(sintactico.diagnosticos[0].linea, 1);
    assert.equal(sintactico.diagnosticos[0].columna, 12);

    const semantico = await validar('CONSULTAR TAREA "No existe"');
    assert.equal(semantico.ok, false);
    assert.equal(semantico.diagnosticos[0].etapa, 'semantica');
    assert.equal(semantico.diagnosticos[0].codigo, 'TAREA_INEXISTENTE');

    const ejecucion = await fetch(`${baseUrl}/api/ejecutar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        programa: [
          'CREAR TAREA "Rollback API"',
          'SI TAREA "Preparar informe" ESTA PENDIENTE ENTONCES CAMBIAR ESTADO TAREA "Preparar informe" A COMPLETADA',
          'CAMBIAR ESTADO TAREA "Preparar informe" A EN_PROGRESO',
        ].join('\n'),
      }),
    }).then((r) => r.json());
    assert.equal(ejecucion.ok, false);
    assert.equal(ejecucion.partial, undefined);
    assert.deepEqual(ejecucion.resultados, []);
    assert.equal(ejecucion.diagnosticos[0].etapa, 'ejecucion');
    assert.equal(ejecucion.diagnosticos[0].codigo, 'TRANSICION_INVALIDA');
    assert.equal(ejecucion.diagnosticos[0].linea, 3);

    const estado = servicios.obtenerEstado();
    assert.equal(estado.tareas.length, 3);
    assert.equal(estado.tareas.some((t) => t.titulo === 'Rollback API'), false);
    assert.equal(estado.tareas.find((t) => t.id === 'task_1').estado, 'PENDIENTE');
  } finally {
    await cerrar();
  }
});

test('API expone el tablero con responsables, historial y estados de despacho', async () => {
  const servicios = crearServiciosEnMemoria();
  const { baseUrl, cerrar } = await iniciarServidorPrueba({ servicios });

  try {
    const ejecucion = await fetch(`${baseUrl}/api/ejecutar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        programa: [
          'CREAR TAREA "Tarea de tablero"',
          'ASIGNAR TAREA "Tarea de tablero" A "Yareli"',
          'NOTIFICAR A "Yareli" MENSAJE "Notificación de prueba"',
        ].join('\n'),
      }),
    }).then((r) => r.json());
    assert.equal(ejecucion.ok, true);

    const tablero = await fetch(`${baseUrl}/api/tablero`).then((r) => r.json());
    const tarea = tablero.tareas.find((t) => t.titulo === 'Tarea de tablero');
    assert.equal(tarea.responsable, 'Yareli');
    assert.equal(tablero.historial[0].tipo, 'notificacion');
    assert.equal(tablero.historial[0].resultado, 'en_cola');
  } finally {
    await cerrar();
  }
});

test('API informa partial:true y conserva los resultados cuando falla un despacho tras el commit', async () => {
  const servicios = crearServiciosEnMemoria();
  servicios.correo = {
    async enviarCorreo() {
      throw new Error('SMTP no disponible');
    },
  };
  const { baseUrl, cerrar } = await iniciarServidorPrueba({ servicios });

  try {
    const res = await fetch(`${baseUrl}/api/ejecutar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        programa: [
          'CREAR TAREA "Parcial API"',
          'NOTIFICAR A "Yareli" MENSAJE "Antes del fallo"',
          'ENVIAR CORREO A "fallo@ejemplo.com" MENSAJE "SMTP caído"',
          'ENVIAR CORREO A "omitido@ejemplo.com" MENSAJE "No procesado"',
        ].join('\n'),
      }),
    });

    assert.equal(res.status, 200);
    const parcial = await res.json();
    assert.equal(parcial.ok, false);
    assert.equal(parcial.partial, true);
    assert.equal(parcial.resultados.length, 4);
    assert.equal(parcial.resultados[1].estado, 'en_cola');
    assert.equal(parcial.resultados[2].estado, 'incierto');
    assert.equal(parcial.resultados[3].estado, 'no_procesado');
    assert.equal(parcial.diagnosticos[0].codigo, 'ERROR_CORREO');

    const estado = servicios.obtenerEstado();
    assert.ok(estado.tareas.some((t) => t.titulo === 'Parcial API'));
  } finally {
    await cerrar();
  }
});
