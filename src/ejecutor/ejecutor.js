// Ejecutor de instrucciones intermedias (IR) · [S3 · EX-1] #12
// Procesa un ProgramaIR en orden dentro de una transacción de tareas, revalida
// estados en tiempo de ejecución y solo despacha notificaciones/correos si todo
// el programa termina sin errores.

import { ESTADOS } from '../semantica/tabla-simbolos.js';
import { ESTADOS_FINALES, TRANSICIONES } from '../semantica/validador.js';

class ErrorEjecucion extends Error {
  constructor(codigo, mensaje, linea = null, columna = null) {
    super(mensaje);
    this.codigo = codigo;
    this.linea = linea;
    this.columna = columna;
  }
}

function diagnostico(codigo, mensaje, linea = null, columna = null) {
  return {
    etapa: 'ejecucion',
    codigo,
    mensaje,
    linea,
    columna,
  };
}

function fallo(codigo, mensaje, linea = null, columna = null) {
  return {
    ok: false,
    modo: 'ejecucion',
    resultados: [],
    diagnosticos: [diagnostico(codigo, mensaje, linea, columna)],
  };
}

function validarEntradas(programaIR, servicios) {
  if (!programaIR || programaIR.tipo !== 'ProgramaIR' || !Array.isArray(programaIR.instrucciones)) {
    throw new TypeError('Se esperaba un ProgramaIR con una lista de instrucciones.');
  }
  if (!servicios?.tareas?.ejecutarEnTransaccion || !servicios?.notificaciones?.registrarNotificacion || !servicios?.correo?.enviarCorreo) {
    throw new TypeError('Se requieren servicios de tareas (transaccional), notificaciones y correo.');
  }
}

function indexarEtiquetas(instrucciones) {
  const etiquetas = new Map();
  instrucciones.forEach((inst, indice) => {
    if (inst.op === 'ETIQUETA') {
      etiquetas.set(inst.nombre, indice);
    }
  });
  return etiquetas;
}

function resolverTareaId(refTarea, temporalesTareas, inst) {
  if (!refTarea) {
    throw new ErrorEjecucion('TAREA_INEXISTENTE', 'Falta la referencia de la tarea en la instrucción IR.', inst.linea, inst.columna);
  }
  if (refTarea.tipo === 'id') return refTarea.id;
  if (refTarea.tipo === 'temporal') {
    const id = temporalesTareas.get(refTarea.ref);
    if (!id) {
      throw new ErrorEjecucion('TAREA_INEXISTENTE', `No se encontró la tarea temporal «${refTarea.titulo ?? refTarea.ref}».`, inst.linea, inst.columna);
    }
    return id;
  }
  throw new ErrorEjecucion('TAREA_INEXISTENTE', 'Tipo de referencia de tarea desconocido en la IR.', inst.linea, inst.columna);
}

async function obtenerTareaExistente(txTareas, refTarea, temporalesTareas, inst) {
  const tareaId = resolverTareaId(refTarea, temporalesTareas, inst);
  const tarea = await txTareas.consultarTarea({ tareaId });
  if (!tarea) {
    throw new ErrorEjecucion(
      'TAREA_INEXISTENTE',
      `No existe la tarea «${refTarea.titulo ?? tareaId}» al momento de ejecutar.`,
      inst.linea,
      inst.columna,
    );
  }
  return tarea;
}

function envolverResultado(inst, resultado, temporalesCondiciones) {
  if (!inst.condicional) return resultado;
  const linea = inst.condicional.linea ?? inst.linea ?? null;
  const condicion = typeof inst.condicional.valor === 'boolean'
    ? inst.condicional.valor
    : Boolean(temporalesCondiciones.get(inst.condicional.temp));
  return {
    linea,
    operacion: 'condicional',
    condicion,
    accion: resultado,
  };
}

export async function ejecutarIR(programaIR, servicios) {
  validarEntradas(programaIR, servicios);

  const instrucciones = programaIR.instrucciones;
  const etiquetas = indexarEtiquetas(instrucciones);
  const colaNotificaciones = [];
  const colaCorreos = [];
  let resultados = [];

  try {
    resultados = await servicios.tareas.ejecutarEnTransaccion(async (txTareas) => {
      const temporalesTareas = new Map();
      const temporalesCondiciones = new Map();
      const salida = [];
      let pc = 0;

      while (pc < instrucciones.length) {
        const inst = instrucciones[pc];
        const linea = inst.linea ?? null;
        const columna = inst.columna ?? null;

        switch (inst.op) {
          case 'ETIQUETA':
            pc += 1;
            break;

          case 'CREAR_TAREA': {
            const creada = await txTareas.crearTarea({
              titulo: inst.titulo,
              fecha: inst.fecha ?? null,
            });
            if (inst.salidaRef) {
              temporalesTareas.set(inst.salidaRef, creada.id);
            }
            salida.push(envolverResultado(inst, {
              linea,
              operacion: 'crear',
              tareaId: creada.id,
              titulo: creada.titulo,
              estado: creada.estado,
              fecha: creada.fecha ?? null,
            }, temporalesCondiciones));
            pc += 1;
            break;
          }

          case 'ASIGNAR_TAREA': {
            const actual = await obtenerTareaExistente(txTareas, inst.tarea, temporalesTareas, inst);
            if (ESTADOS_FINALES.includes(actual.estado)) {
              throw new ErrorEjecucion(
                'OPERACION_NO_PERMITIDA',
                `ASIGNAR TAREA: la tarea «${actual.titulo}» está ${actual.estado} y no se puede asignar.`,
                linea,
                columna,
              );
            }
            const actualizada = await txTareas.asignarTarea({
              tareaId: actual.id,
              usuarioId: inst.usuario.id,
            });
            salida.push(envolverResultado(inst, {
              linea,
              operacion: 'asignar',
              tareaId: actualizada.id,
              titulo: actualizada.titulo,
              responsableId: actualizada.responsableId,
              responsable: inst.usuario.nombre,
            }, temporalesCondiciones));
            pc += 1;
            break;
          }

          case 'CAMBIAR_ESTADO': {
            if (!ESTADOS.includes(inst.estado)) {
              throw new ErrorEjecucion(
                'ESTADO_INVALIDO',
                `CAMBIAR ESTADO: «${inst.estado}» no es un estado válido.`,
                linea,
                columna,
              );
            }
            const actual = await obtenerTareaExistente(txTareas, inst.tarea, temporalesTareas, inst);
            if (actual.estado === inst.estado) {
              throw new ErrorEjecucion(
                'TRANSICION_INVALIDA',
                `CAMBIAR ESTADO: la tarea «${actual.titulo}» ya está en ${inst.estado}.`,
                linea,
                columna,
              );
            }
            if (!TRANSICIONES[actual.estado]?.includes(inst.estado)) {
              throw new ErrorEjecucion(
                'TRANSICION_INVALIDA',
                `CAMBIAR ESTADO: la tarea «${actual.titulo}» no puede pasar de ${actual.estado} a ${inst.estado}.`,
                linea,
                columna,
              );
            }
            const actualizada = await txTareas.cambiarEstado({
              tareaId: actual.id,
              estado: inst.estado,
            });
            salida.push(envolverResultado(inst, {
              linea,
              operacion: 'cambiar_estado',
              tareaId: actualizada.id,
              titulo: actualizada.titulo,
              estado: actualizada.estado,
            }, temporalesCondiciones));
            pc += 1;
            break;
          }

          case 'CONSULTAR_TAREA': {
            const actual = await obtenerTareaExistente(txTareas, inst.tarea, temporalesTareas, inst);
            salida.push(envolverResultado(inst, {
              linea,
              operacion: 'consultar',
              tarea: actual,
            }, temporalesCondiciones));
            pc += 1;
            break;
          }

          case 'LISTAR_TAREAS': {
            const tareas = await txTareas.listarTareas();
            salida.push(envolverResultado(inst, {
              linea,
              operacion: 'listar',
              tareas,
            }, temporalesCondiciones));
            pc += 1;
            break;
          }

          case 'NOTIFICAR': {
            colaNotificaciones.push({
              usuarioId: inst.usuario.id,
              mensaje: inst.mensaje,
              linea,
              columna,
            });
            salida.push(envolverResultado(inst, {
              linea,
              operacion: 'notificar',
              usuarioId: inst.usuario.id,
              destinatario: inst.usuario.nombre,
              mensaje: inst.mensaje,
              estado: 'en_cola',
            }, temporalesCondiciones));
            pc += 1;
            break;
          }

          case 'ENVIAR_CORREO': {
            colaCorreos.push({
              destinatario: inst.destinatario,
              mensaje: inst.mensaje,
              linea,
              columna,
            });
            salida.push(envolverResultado(inst, {
              linea,
              operacion: 'enviar_correo',
              destinatario: inst.destinatario,
              mensaje: inst.mensaje,
              estado: 'en_cola',
            }, temporalesCondiciones));
            pc += 1;
            break;
          }

          case 'EVALUAR_ESTADO': {
            const actual = await obtenerTareaExistente(txTareas, inst.tarea, temporalesTareas, inst);
            temporalesCondiciones.set(inst.destinoTemp, actual.estado === inst.estadoEsperado);
            pc += 1;
            break;
          }

          case 'SALTAR_SI_FALSO': {
            const destino = etiquetas.get(inst.etiqueta);
            if (destino === undefined) {
              throw new ErrorEjecucion(
                'IR_INVALIDA',
                `No existe la etiqueta de salto «${inst.etiqueta}» en la IR.`,
                linea,
                columna,
              );
            }
            const cumple = Boolean(temporalesCondiciones.get(inst.condicion));
            if (cumple) {
              pc += 1;
            } else {
              salida.push({
                linea,
                operacion: 'condicional',
                condicion: false,
                accion: null,
              });
              pc = destino;
            }
            break;
          }

          default:
            throw new ErrorEjecucion(
              'OPERACION_NO_PERMITIDA',
              `Operación IR desconocida: «${inst.op}».`,
              linea,
              columna,
            );
        }
      }

      return salida;
    });
  } catch (error) {
    if (error instanceof ErrorEjecucion) {
      return fallo(error.codigo, error.mensaje ?? error.message, error.linea, error.columna);
    }
    return fallo('ERROR_PERSISTENCIA', 'No se pudo completar la operación en el repositorio de tareas.');
  }

  for (const notif of colaNotificaciones) {
    try {
      await servicios.notificaciones.registrarNotificacion({
        usuarioId: notif.usuarioId,
        mensaje: notif.mensaje,
      });
    } catch {
      return fallo('ERROR_PERSISTENCIA', 'No se pudo registrar la notificación pendiente.', notif.linea, notif.columna);
    }
  }

  for (const correo of colaCorreos) {
    try {
      await servicios.correo.enviarCorreo({
        destinatario: correo.destinatario,
        mensaje: correo.mensaje,
      });
    } catch {
      return fallo('ERROR_CORREO', 'No se pudo enviar el correo de prueba.', correo.linea, correo.columna);
    }
  }

  return {
    ok: true,
    modo: 'ejecucion',
    resultados,
    diagnosticos: [],
  };
}
