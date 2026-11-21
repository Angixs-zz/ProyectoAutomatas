import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenizar } from '../src/lenguaje.js';
import { parsear } from '../src/lenguaje.js';
import { validarPrograma } from '../src/semantica/validador.js';
import { generarIR } from '../src/ir/generador-ir.js';
import { optimizarIR } from '../src/ir/optimizador.js';
import { ejecutarIR } from '../src/ejecutor/ejecutor.js';
import { crearRepositorioEnMemoria } from '../src/semantica/repositorio-memoria.js';
import { crearServiciosEnMemoria } from '../src/ejecutor/servicios-memoria.js';

async function compilar(texto) {
  const { tokens, diagnosticos: dLex } = tokenizar(texto);
  assert.deepEqual(dLex, []);
  const { ast, diagnosticos: dSin } = parsear(tokens);
  assert.deepEqual(dSin, []);
  const sem = await validarPrograma(ast, crearRepositorioEnMemoria());
  assert.equal(sem.ok, true, JSON.stringify(sem.diagnosticos));
  return generarIR(sem.programa);
}

test('simplifica una condición siempre verdadera tras CREAR TAREA y conserva la salida observable', async () => {
  const ir = await compilar([
    'CREAR TAREA "Nueva"',
    'SI TAREA "Nueva" ESTA PENDIENTE ENTONCES NOTIFICAR A "Yareli" MENSAJE "Lista"',
  ].join('\n'));
  const snapshotOriginal = JSON.stringify(ir);

  const opt = optimizarIR(ir);

  assert.equal(JSON.stringify(ir), snapshotOriginal);
  assert.ok(opt.metadatos.optimizacionesAplicadas.includes('simplificacion_condiciones_constantes'));
  assert.equal(opt.instrucciones.some((i) => i.op === 'EVALUAR_ESTADO' || i.op === 'SALTAR_SI_FALSO'), false);

  const resOriginal = await ejecutarIR(ir, crearServiciosEnMemoria());
  const resOpt = await ejecutarIR(opt, crearServiciosEnMemoria());
  assert.equal(resOpt.ok, resOriginal.ok);
  assert.equal(resOpt.resultados.length, resOriginal.resultados.length);
  assert.equal(resOpt.resultados[1].operacion, 'condicional');
  assert.equal(resOpt.resultados[1].condicion, true);
  assert.equal(resOpt.resultados[1].accion.operacion, 'notificar');
});

test('elimina código inalcanzable cuando la condición es siempre falsa', async () => {
  const ir = await compilar([
    'CREAR TAREA "Nueva"',
    'SI TAREA "Nueva" ESTA COMPLETADA ENTONCES NOTIFICAR A "Yareli" MENSAJE "Nunca"',
  ].join('\n'));

  const opt = optimizarIR(ir);

  assert.ok(opt.metadatos.optimizacionesAplicadas.includes('eliminacion_codigo_inalcanzable'));
  assert.equal(opt.instrucciones.length, 1);
  assert.equal(opt.instrucciones[0].op, 'CREAR_TAREA');
});

test('elimina cambios de estado redundantes en un bloque lineal sin ocultar errores', async () => {
  const ir = await compilar([
    'CREAR TAREA "Flujo"',
    'CAMBIAR ESTADO TAREA "Flujo" A EN_PROGRESO',
    'CAMBIAR ESTADO TAREA "Flujo" A COMPLETADA',
  ].join('\n'));

  const opt = optimizarIR(ir);

  assert.ok(opt.metadatos.optimizacionesAplicadas.includes('eliminacion_cambios_estado_redundantes'));
  assert.deepEqual(
    opt.instrucciones.map((i) => i.op),
    ['CREAR_TAREA', 'CAMBIAR_ESTADO'],
  );
  assert.equal(opt.instrucciones[1].estado, 'COMPLETADA');

  const res = await ejecutarIR(opt, crearServiciosEnMemoria());
  assert.equal(res.ok, true);
  assert.equal(res.resultados[1].estado, 'COMPLETADA');
});

test('no elimina cambios de estado si hay una consulta observable intermedia', async () => {
  const ir = await compilar([
    'CREAR TAREA "Con consulta"',
    'CAMBIAR ESTADO TAREA "Con consulta" A EN_PROGRESO',
    'CONSULTAR TAREA "Con consulta"',
    'CAMBIAR ESTADO TAREA "Con consulta" A COMPLETADA',
  ].join('\n'));

  const opt = optimizarIR(ir);

  assert.equal(opt.instrucciones.filter((i) => i.op === 'CAMBIAR_ESTADO').length, 2);
});
