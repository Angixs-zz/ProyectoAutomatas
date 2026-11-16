// Pruebas del ejecutor de instrucciones intermedias (#12 EX-1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ejecutarIR } from '../src/ejecutor/ejecutor.js';
import { crearServiciosEnMemoria } from '../src/ejecutor/servicios-memoria.js';

function programa(...instrucciones) {
  return {
    tipo: 'ProgramaIR',
    version: 1,
    instrucciones,
    metadatos: {
      totalInstruccionesOriginales: instrucciones.length,
      optimizacionesAplicadas: [],
    },
  };
}

const refId = (id, titulo) => ({ tipo: 'id', id, titulo });
const refTmp = (ref, titulo) => ({ tipo: 'temporal', ref, titulo });
const usuarioYareli = { id: 'user_1', nombre: 'Yareli', correo: 'yareli@ejemplo.com' };
const usuarioAngel = { id: 'user_3', nombre: 'Angel', correo: 'angel@ejemplo.com' };

test('ejecuta crear, asignar, cambiar estado, consultar, listar, notificar y enviar correo', async () => {
  const servicios = crearServiciosEnMemoria();
  const ir = programa(
    { op: 'CREAR_TAREA', titulo: 'Preparar demo', fecha: '2026-11-20', salidaRef: 'tmp_1', linea: 1, columna: 1 },
    { op: 'ASIGNAR_TAREA', tarea: refTmp('tmp_1', 'Preparar demo'), usuario: usuarioYareli, linea: 2, columna: 1 },
    { op: 'CAMBIAR_ESTADO', tarea: refTmp('tmp_1', 'Preparar demo'), estado: 'EN_PROGRESO', linea: 3, columna: 1 },
    { op: 'CONSULTAR_TAREA', tarea: refTmp('tmp_1', 'Preparar demo'), linea: 4, columna: 1 },
    { op: 'LISTAR_TAREAS', linea: 5, columna: 1 },
    { op: 'NOTIFICAR', usuario: usuarioAngel, mensaje: 'Demo en progreso', linea: 6, columna: 1 },
    { op: 'ENVIAR_CORREO', destinatario: 'diego@ejemplo.com', mensaje: 'Correo de prueba', linea: 7, columna: 1 },
  );

  const res = await ejecutarIR(ir, servicios);

  assert.equal(res.ok, true);
  assert.equal(res.modo, 'ejecucion');
  assert.deepEqual(res.diagnosticos, []);
  assert.equal(res.resultados.length, 7);
  assert.equal(res.resultados[0].operacion, 'crear');
  assert.equal(res.resultados[0].tareaId, 'task_4');
  assert.equal(res.resultados[1].operacion, 'asignar');
  assert.equal(res.resultados[1].responsable, 'Yareli');
  assert.equal(res.resultados[2].estado, 'EN_PROGRESO');
  assert.equal(res.resultados[3].tarea.id, 'task_4');
  assert.equal(res.resultados[4].tareas.length, 4);
  assert.equal(res.resultados[5].estado, 'en_cola');
  assert.equal(res.resultados[6].estado, 'en_cola');

  const estadoFinal = servicios.obtenerEstado();
  assert.equal(estadoFinal.tareas.length, 4);
  assert.equal(estadoFinal.notificaciones.length, 1);
  assert.equal(estadoFinal.correos.length, 1);
});

test('condicional verdadero ejecuta su acción y registra el resultado observable', async () => {
  const servicios = crearServiciosEnMemoria();
  const ir = programa(
    { op: 'EVALUAR_ESTADO', tarea: refId('task_3', 'Configurar Docker'), estadoEsperado: 'COMPLETADA', destinoTemp: 'cond_1', linea: 1, columna: 1 },
    { op: 'SALTAR_SI_FALSO', condicion: 'cond_1', etiqueta: 'fin_si_1', linea: 1, columna: 1 },
    {
      op: 'NOTIFICAR',
      usuario: usuarioAngel,
      mensaje: 'Docker listo',
      linea: 1,
      columna: 52,
      condicional: { temp: 'cond_1', linea: 1 },
    },
    { op: 'ETIQUETA', nombre: 'fin_si_1' },
  );

  const res = await ejecutarIR(ir, servicios);

  assert.equal(res.ok, true);
  assert.deepEqual(res.resultados, [
    {
      linea: 1,
      operacion: 'condicional',
      condicion: true,
      accion: {
        linea: 1,
        operacion: 'notificar',
        usuarioId: 'user_3',
        destinatario: 'Angel',
        mensaje: 'Docker listo',
        estado: 'en_cola',
      },
    },
  ]);
  assert.equal(servicios.obtenerEstado().notificaciones.length, 1);
});

test('condicional falso salta la acción, no produce efectos y registra condicion false', async () => {
  const servicios = crearServiciosEnMemoria();
  const ir = programa(
    { op: 'EVALUAR_ESTADO', tarea: refId('task_1', 'Preparar informe'), estadoEsperado: 'COMPLETADA', destinoTemp: 'cond_1', linea: 1, columna: 1 },
    { op: 'SALTAR_SI_FALSO', condicion: 'cond_1', etiqueta: 'fin_si_1', linea: 1, columna: 1 },
    {
      op: 'ENVIAR_CORREO',
      destinatario: 'diego@ejemplo.com',
      mensaje: 'No debería enviarse',
      linea: 1,
      columna: 51,
      condicional: { temp: 'cond_1', linea: 1 },
    },
    { op: 'ETIQUETA', nombre: 'fin_si_1' },
  );

  const res = await ejecutarIR(ir, servicios);

  assert.equal(res.ok, true);
  assert.deepEqual(res.resultados, [
    {
      linea: 1,
      operacion: 'condicional',
      condicion: false,
      accion: null,
    },
  ]);
  assert.equal(servicios.obtenerEstado().correos.length, 0);
});

test('revierte la transacción y evita correos fantasma si falla una transición en tiempo de ejecución', async () => {
  const servicios = crearServiciosEnMemoria();
  // task_1 empieza en PENDIENTE; el SI la completa y la siguiente línea intenta regresarla a EN_PROGRESO.
  const ir = programa(
    { op: 'CREAR_TAREA', titulo: 'Tarea que debe revertirse', fecha: null, salidaRef: 'tmp_1', linea: 1, columna: 1 },
    { op: 'NOTIFICAR', usuario: usuarioYareli, mensaje: 'No debe enviarse', linea: 2, columna: 1 },
    { op: 'ENVIAR_CORREO', destinatario: 'diego@ejemplo.com', mensaje: 'Tampoco debe enviarse', linea: 3, columna: 1 },
    { op: 'EVALUAR_ESTADO', tarea: refId('task_1', 'Preparar informe'), estadoEsperado: 'PENDIENTE', destinoTemp: 'cond_1', linea: 4, columna: 1 },
    { op: 'SALTAR_SI_FALSO', condicion: 'cond_1', etiqueta: 'fin_si_1', linea: 4, columna: 1 },
    { op: 'CAMBIAR_ESTADO', tarea: refId('task_1', 'Preparar informe'), estado: 'COMPLETADA', linea: 4, columna: 49, condicional: { temp: 'cond_1', linea: 4 } },
    { op: 'ETIQUETA', nombre: 'fin_si_1' },
    { op: 'CAMBIAR_ESTADO', tarea: refId('task_1', 'Preparar informe'), estado: 'EN_PROGRESO', linea: 5, columna: 1 },
  );

  const res = await ejecutarIR(ir, servicios);

  assert.equal(res.ok, false);
  assert.equal(res.modo, 'ejecucion');
  assert.deepEqual(res.resultados, []);
  assert.equal(res.diagnosticos.length, 1);
  assert.equal(res.diagnosticos[0].etapa, 'ejecucion');
  assert.equal(res.diagnosticos[0].codigo, 'TRANSICION_INVALIDA');
  assert.equal(res.diagnosticos[0].linea, 5);

  const estado = servicios.obtenerEstado();
  assert.equal(estado.tareas.length, 3);
  assert.equal(estado.tareas[0].estado, 'PENDIENTE');
  assert.equal(estado.notificaciones.length, 0);
  assert.equal(estado.correos.length, 0);
});

test('rechaza asignar en tiempo de ejecución una tarea finalizada por un condicional previo', async () => {
  const servicios = crearServiciosEnMemoria();
  const ir = programa(
    { op: 'EVALUAR_ESTADO', tarea: refId('task_1', 'Preparar informe'), estadoEsperado: 'PENDIENTE', destinoTemp: 'cond_1', linea: 1, columna: 1 },
    { op: 'SALTAR_SI_FALSO', condicion: 'cond_1', etiqueta: 'fin_si_1', linea: 1, columna: 1 },
    { op: 'CAMBIAR_ESTADO', tarea: refId('task_1', 'Preparar informe'), estado: 'CANCELADA', linea: 1, columna: 49, condicional: { temp: 'cond_1', linea: 1 } },
    { op: 'ETIQUETA', nombre: 'fin_si_1' },
    { op: 'ASIGNAR_TAREA', tarea: refId('task_1', 'Preparar informe'), usuario: usuarioYareli, linea: 2, columna: 1 },
  );

  const res = await ejecutarIR(ir, servicios);

  assert.equal(res.ok, false);
  assert.equal(res.diagnosticos[0].etapa, 'ejecucion');
  assert.equal(res.diagnosticos[0].codigo, 'OPERACION_NO_PERMITIDA');
  assert.equal(res.diagnosticos[0].linea, 2);
  assert.equal(servicios.obtenerEstado().tareas[0].estado, 'PENDIENTE');
});

test('reporta TAREA_INEXISTENTE, ERROR_PERSISTENCIA y ERROR_CORREO con servicios simulados sin filtrar stack', async () => {
  const servicios = crearServiciosEnMemoria();
  const resInexistente = await ejecutarIR(
    programa({ op: 'CONSULTAR_TAREA', tarea: refId('task_999', 'Fantasma'), linea: 1, columna: 1 }),
    servicios,
  );
  assert.equal(resInexistente.ok, false);
  assert.equal(resInexistente.diagnosticos[0].codigo, 'TAREA_INEXISTENTE');

  const serviciosErrorBD = crearServiciosEnMemoria();
  const ejecutarTxOriginal = serviciosErrorBD.tareas.ejecutarEnTransaccion;
  serviciosErrorBD.tareas.ejecutarEnTransaccion = (callback) => ejecutarTxOriginal((tx) => callback({
    ...tx,
    crearTarea: async () => {
      throw new Error('ECONNREFUSED secret_db_password');
    },
  }));
  const resBD = await ejecutarIR(
    programa({ op: 'CREAR_TAREA', titulo: 'Nueva', fecha: null, salidaRef: 'tmp_1', linea: 1, columna: 1 }),
    serviciosErrorBD,
  );
  assert.equal(resBD.ok, false);
  assert.equal(resBD.diagnosticos[0].codigo, 'ERROR_PERSISTENCIA');
  assert.equal(resBD.diagnosticos[0].mensaje.includes('secret_db_password'), false);
  assert.equal(serviciosErrorBD.obtenerEstado().tareas.length, 3);

  const serviciosErrorCorreo = crearServiciosEnMemoria();
  serviciosErrorCorreo.correo.enviarCorreo = async () => {
    throw new Error('SMTP down');
  };
  const resCorreo = await ejecutarIR(
    programa({ op: 'ENVIAR_CORREO', destinatario: 'diego@ejemplo.com', mensaje: 'Hola', linea: 1, columna: 1 }),
    serviciosErrorCorreo,
  );
  assert.equal(resCorreo.ok, false);
  assert.equal(resCorreo.diagnosticos[0].codigo, 'ERROR_CORREO');
  assert.equal(resCorreo.diagnosticos[0].etapa, 'ejecucion');
});
