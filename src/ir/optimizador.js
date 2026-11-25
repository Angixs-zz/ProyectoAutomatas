/**
 * Optimizador de Representación Intermedia (IR) · [S3 · EX-2]
 * Aplica optimizaciones locales que preservan el comportamiento observable:
 * 1. Simplificación de condiciones constantes y eliminación de código inalcanzable.
 * 2. Eliminación de acciones inalcanzables bajo condiciones falsas.
 * Los cambios de estado no se eliminan: cada transición se expone en resultados
 * e historial persistente, incluso si otra transición la sobrescribe.
 */

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
          // La condición falsa también es un resultado observable del programa.
          // Se elimina solo la acción, conservando evaluación, salto y etiqueta.
          salida.push(clonarInstruccion(inst), clonarInstruccion(siguiente));
          salida.push(clonarInstruccion(instrucciones[idxEtiqueta]));
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

  return {
    tipo: 'ProgramaIR',
    version: programaIR.version ?? 1,
    instrucciones: trasCondiciones,
    metadatos: {
      ...programaIR.metadatos,
      totalInstruccionesOriginales:
        programaIR.metadatos?.totalInstruccionesOriginales ?? programaIR.instrucciones.length,
      optimizacionesAplicadas: [...aplicadas],
    },
  };
}
