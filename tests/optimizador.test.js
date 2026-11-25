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
  assert.equal(opt.instrucciones.length, 4);
  assert.equal(opt.instrucciones[0].op, 'CREAR_TAREA');
  assert.equal(opt.instrucciones.some((i) => i.op === 'NOTIFICAR'), false);
  const original = crearServiciosEnMemoria();
  const optimizado = crearServiciosEnMemoria();
  assert.deepEqual(await ejecutarIR(opt, optimizado), await ejecutarIR(ir, original));
  assert.deepEqual(optimizado.obtenerEstado(), original.obtenerEstado());
});

test('conserva cambios de estado intermedios: resultados e historial son observables', async () => {
  const ir = await compilar([
    'CREAR TAREA "Flujo"',
    'CAMBIAR ESTADO TAREA "Flujo" A EN_PROGRESO',
    'CAMBIAR ESTADO TAREA "Flujo" A COMPLETADA',
  ].join('\n'));

  const opt = optimizarIR(ir);

  assert.equal(opt.metadatos.optimizacionesAplicadas.includes('eliminacion_cambios_estado_redundantes'), false);
  assert.deepEqual(
    opt.instrucciones.map((i) => i.op),
    ['CREAR_TAREA', 'CAMBIAR_ESTADO', 'CAMBIAR_ESTADO'],
  );
  const original = crearServiciosEnMemoria();
  const optimizado = crearServiciosEnMemoria();
  const res = await ejecutarIR(ir, original);
  const resOpt = await ejecutarIR(opt, optimizado);
  assert.deepEqual(resOpt, res);
  assert.deepEqual(optimizado.obtenerEstado(), original.obtenerEstado());
  assert.equal(resOpt.resultados[1].estado, 'EN_PROGRESO');
  assert.equal(resOpt.resultados[2].estado, 'COMPLETADA');
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

// Caso nuevo 1 (#43 EX-5): barrera por efectos externos (NOTIFICAR y ENVIAR CORREO).
// Motivo de seguridad: NOTIFICAR y ENVIAR_CORREO producen efectos observables externos
// e historial intermedio; si se eliminara el primer CAMBIAR_ESTADO, el registro de la
// corrida perdería el orden real de transición previo al envío de avisos.
test('no elimina cambios de estado cuando hay notificaciones o correos intermedios', async () => {
  const ir = await compilar([
    'CREAR TAREA "Aviso intermedio"',
    'CAMBIAR ESTADO TAREA "Aviso intermedio" A EN_PROGRESO',
    'NOTIFICAR A "Yareli" MENSAJE "Pasó a progreso"',
    'ENVIAR CORREO A "diego@ejemplo.com" MENSAJE "En progreso"',
    'CAMBIAR ESTADO TAREA "Aviso intermedio" A COMPLETADA',
  ].join('\n'));

  const opt = optimizarIR(ir);

  assert.equal(opt.metadatos.optimizacionesAplicadas.includes('eliminacion_cambios_estado_redundantes'), false);
  assert.equal(opt.instrucciones.filter((i) => i.op === 'CAMBIAR_ESTADO').length, 2);
  assert.equal(opt.instrucciones.length, ir.instrucciones.length);

  const servOrig = crearServiciosEnMemoria();
  const servOpt = crearServiciosEnMemoria();
  const resOrig = await ejecutarIR(ir, servOrig);
  const resOpt = await ejecutarIR(opt, servOpt);

  assert.deepEqual(resOpt, resOrig);
  assert.deepEqual(servOpt.obtenerEstado(), servOrig.obtenerEstado());
});

// Caso nuevo 2 (#43 EX-5): estado desconocido tras un SI sobre una tarea del repositorio.
// Motivo de seguridad: el estado inicial de una tarea existente solo se conoce en runtime;
// además, si un primer SI puede modificarla, el segundo SI y un cambio posterior no deben
// plegarse ni simplificarse estáticamente para no alterar ramas ni ocultar errores reales.
test('conserva condicionales y cambios de estado cuando un SI previo depende de runtime', async () => {
  const ir = await compilar([
    'SI TAREA "Preparar informe" ESTA PENDIENTE ENTONCES CAMBIAR ESTADO TAREA "Preparar informe" A EN_PROGRESO',
    'SI TAREA "Preparar informe" ESTA EN_PROGRESO ENTONCES ENVIAR CORREO A "diego@ejemplo.com" MENSAJE "Informe activo"',
  ].join('\n'));

  const opt = optimizarIR(ir);

  assert.deepEqual(opt.metadatos.optimizacionesAplicadas, []);
  assert.equal(opt.instrucciones.filter((i) => i.op === 'EVALUAR_ESTADO').length, 2);
  assert.equal(opt.instrucciones.filter((i) => i.op === 'SALTAR_SI_FALSO').length, 2);

  const servOrig = crearServiciosEnMemoria();
  const servOpt = crearServiciosEnMemoria();
  const resOrig = await ejecutarIR(ir, servOrig);
  const resOpt = await ejecutarIR(opt, servOpt);

  assert.equal(resOpt.ok, true);
  assert.deepEqual(resOpt, resOrig);
  assert.deepEqual(servOpt.obtenerEstado(), servOrig.obtenerEstado());
  assert.equal(servOpt.obtenerEstado().tareas[0].estado, 'EN_PROGRESO');
  assert.equal(servOpt.obtenerEstado().correos.length, 1);
});
