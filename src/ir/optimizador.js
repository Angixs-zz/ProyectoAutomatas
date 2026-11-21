/**
 * Optimizador de Representación Intermedia (IR) · [S3 · EX-2]
 * Aplica optimizaciones locales que preservan el comportamiento observable:
 * 1. Simplificación de condiciones constantes y eliminación de código inalcanzable.
 * 2. Eliminación de cambios de estado redundantes (dead store) en bloques lineales.
 */
import { TRANSICIONES, ESTADOS_FINALES } from '../semantica/validador.js';

function claveTarea(refTarea) {
  if (!refTarea) return null;
  return refTarea.tipo === 'temporal' ? `tmp:${refTarea.ref}` : `id:${refTarea.id}`;
}

function clonarInstruccion(inst) {
  return structuredClone(inst);
}

function simplificarCondiciones(instrucciones, aplicadas) {
  const salida = [];
  const estadosConocidos = new Map();
  let i = 0;

  while (i < instrucciones.length) {
    const inst = instrucciones[i];
    const siguiente = instrucciones[i + 1];

    if (
      inst.op === 'EVALUAR_ESTADO' &&
      siguiente?.op === 'SALTAR_SI_FALSO' &&
      siguiente.condicion === inst.destinoTemp
    ) {
      const clave = claveTarea(inst.tarea);
      const estadoConocido = clave ? estadosConocidos.get(clave) : undefined;
      const idxEtiqueta = instrucciones.findIndex(
        (item, idx) => idx > i + 1 && item.op === 'ETIQUETA' && item.nombre === siguiente.etiqueta,
      );

      if (estadoConocido !== undefined && idxEtiqueta !== -1) {
        const esVerdadera = estadoConocido === inst.estadoEsperado;
        if (esVerdadera) {
          aplicadas.add('simplificacion_condiciones_constantes');
          for (let j = i + 2; j < idxEtiqueta; j += 1) {
            const interna = clonarInstruccion(instrucciones[j]);
            if (interna.condicional?.temp === inst.destinoTemp) {
              interna.condicional = { ...interna.condicional, valor: true };
            }
            if (interna.op === 'CREAR_TAREA' && interna.salidaRef) {
              estadosConocidos.set(`tmp:${interna.salidaRef}`, 'PENDIENTE');
            } else if (interna.op === 'CAMBIAR_ESTADO') {
              const k = claveTarea(interna.tarea);
              if (k) estadosConocidos.set(k, interna.estado);
            }
            salida.push(interna);
          }
        } else {
          aplicadas.add('eliminacion_codigo_inalcanzable');
        }
        i = idxEtiqueta + 1;
        continue;
      }

      // Condición no conocida en tiempo de compilación: invalidar estados modificados dentro del bloque
      salida.push(clonarInstruccion(inst), clonarInstruccion(siguiente));
      if (idxEtiqueta !== -1) {
        for (let j = i + 2; j < idxEtiqueta; j += 1) {
          const interna = instrucciones[j];
          if (interna.op === 'CAMBIAR_ESTADO') {
            const k = claveTarea(interna.tarea);
            if (k) estadosConocidos.delete(k);
          }
          salida.push(clonarInstruccion(interna));
        }
        salida.push(clonarInstruccion(instrucciones[idxEtiqueta]));
        i = idxEtiqueta + 1;
        continue;
      }
      i += 2;
      continue;
    }

    if (inst.op === 'CREAR_TAREA' && inst.salidaRef) {
      estadosConocidos.set(`tmp:${inst.salidaRef}`, 'PENDIENTE');
    } else if (inst.op === 'CAMBIAR_ESTADO') {
      const clave = claveTarea(inst.tarea);
      if (clave) estadosConocidos.set(clave, inst.estado);
    }

    salida.push(clonarInstruccion(inst));
    i += 1;
  }

  return salida;
}

const OPS_BARRERA_BLOQUE = new Set([
  'ETIQUETA',
  'SALTAR_SI_FALSO',
  'EVALUAR_ESTADO',
  'CONSULTAR_TAREA',
  'LISTAR_TAREAS',
  'NOTIFICAR',
  'ENVIAR_CORREO',
]);

function eliminarCambiosRedundantes(instrucciones, aplicadas) {
  const eliminar = new Set();
  const estadosConocidos = new Map();
  let ultimoCambio = new Map();

  for (let i = 0; i < instrucciones.length; i += 1) {
    const inst = instrucciones[i];

    if (OPS_BARRERA_BLOQUE.has(inst.op) || inst.condicional) {
      ultimoCambio = new Map();
      if (inst.op === 'ETIQUETA' || inst.op === 'SALTAR_SI_FALSO') {
        estadosConocidos.clear();
      }
      continue;
    }

    if (inst.op === 'CREAR_TAREA' && inst.salidaRef) {
      const clave = `tmp:${inst.salidaRef}`;
      estadosConocidos.set(clave, 'PENDIENTE');
      ultimoCambio.delete(clave);
      continue;
    }

    if (inst.op === 'CAMBIAR_ESTADO') {
      const clave = claveTarea(inst.tarea);
      if (!clave) continue;

      const previo = ultimoCambio.get(clave);
      if (
        previo &&
        previo.estadoPrevio !== undefined &&
        !ESTADOS_FINALES.includes(previo.estado) &&
        TRANSICIONES[previo.estadoPrevio]?.includes(previo.estado) &&
        TRANSICIONES[previo.estado]?.includes(inst.estado) &&
        TRANSICIONES[previo.estadoPrevio]?.includes(inst.estado)
      ) {
        eliminar.add(previo.indice);
        ultimoCambio.set(clave, {
          indice: i,
          estado: inst.estado,
          estadoPrevio: previo.estadoPrevio,
        });
        estadosConocidos.set(clave, inst.estado);
        aplicadas.add('eliminacion_cambios_estado_redundantes');
        continue;
      }

      ultimoCambio.set(clave, {
        indice: i,
        estado: inst.estado,
        estadoPrevio: estadosConocidos.get(clave),
      });
      estadosConocidos.set(clave, inst.estado);
    }
  }

  return instrucciones.filter((_, idx) => !eliminar.has(idx));
}

/**
 * Optimiza un ProgramaIR sin mutar el original.
 * @param {object} programaIR
 * @returns {object}
 */
export function optimizarIR(programaIR) {
  if (!programaIR || programaIR.tipo !== 'ProgramaIR' || !Array.isArray(programaIR.instrucciones)) {
    throw new TypeError('Se esperaba un ProgramaIR válido.');
  }

  const aplicadas = new Set(programaIR.metadatos?.optimizacionesAplicadas ?? []);
  const trasCondiciones = simplificarCondiciones(programaIR.instrucciones, aplicadas);
  const trasRedundantes = eliminarCambiosRedundantes(trasCondiciones, aplicadas);

  return {
    tipo: 'ProgramaIR',
    version: programaIR.version ?? 1,
    instrucciones: trasRedundantes,
    metadatos: {
      ...programaIR.metadatos,
      totalInstruccionesOriginales:
        programaIR.metadatos?.totalInstruccionesOriginales ?? programaIR.instrucciones.length,
      optimizacionesAplicadas: [...aplicadas],
    },
  };
}
