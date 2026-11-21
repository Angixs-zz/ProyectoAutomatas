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

    const val = await fetch(`${baseUrl}/api/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programa: 'CREAR TAREA "Desde API"' }),
    }).then((r) => r.json());
    assert.equal(val.ok, true);
    assert.equal(val.modo, 'validacion');
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
  } finally {
    await cerrar();
  }
});
