// Validación semántica del AST · [S2 · SEM-2] #10
// Recorre el AST del parser (#4) y revisa que las tareas y los usuarios existan,
// que la operación y el cambio de estado estén permitidos y que los argumentos
// tengan sentido. No escribe datos: solo devuelve diagnósticos y referencias.

import { ESTADOS, crearTablaSimbolos } from './tabla-simbolos.js';

// Cambios de estado permitidos. Propuesta pendiente de confirmar con Diego (#5).
export const TRANSICIONES = Object.freeze({
  PENDIENTE: Object.freeze(['EN_PROGRESO', 'COMPLETADA', 'CANCELADA']),
  EN_PROGRESO: Object.freeze(['PENDIENTE', 'COMPLETADA', 'CANCELADA']),
  COMPLETADA: Object.freeze([]),
  CANCELADA: Object.freeze([]),
});

export const ESTADOS_FINALES = Object.freeze(['COMPLETADA', 'CANCELADA']);

const COMANDOS = {
  CrearTarea: 'CREAR TAREA',
  AsignarTarea: 'ASIGNAR TAREA',
  CambiarEstado: 'CAMBIAR ESTADO',
  ConsultarTarea: 'CONSULTAR TAREA',
  ListarTareas: 'LISTAR TAREAS',
  Notificar: 'NOTIFICAR',
  EnviarCorreo: 'ENVIAR CORREO',
  Condicional: 'SI ... ENTONCES',
};

const REGEX_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function fechaExiste(texto) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!partes) return false;
  const [anio, mes, dia] = partes.slice(1).map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

const SUGERENCIAS = {
  TAREA_INEXISTENTE: 'Revisa el título o créala antes con CREAR TAREA.',
  TAREA_AMBIGUA: 'Renombra una de ellas desde el tablero o crea la nueva con otro título.',
  USUARIO_INEXISTENTE: 'Revisa cómo está escrito el nombre; mayúsculas y acentos cuentan.',
  USUARIO_AMBIGUO: 'Hay que distinguir a esos usuarios en el registro.',
};

// Valida el AST con una tabla de símbolos ya armada. La tabla debe ser nueva
// para cada programa, porque aquí se registran las tareas que crea el programa.
export function validarAST(ast, tabla) {
  if (!ast || ast.tipo !== 'Programa' || !Array.isArray(ast.instrucciones)) {
    throw new TypeError('Se esperaba un nodo Programa con instrucciones.');
  }

  const diagnosticos = [];
  // Estado previsto de cada tarea mientras avanza el programa.
  // Si no está en el mapa se usa el del repositorio; null significa "no se sabe".
  const estadosPrevistos = new Map();

  function reportar(nodo, codigo, mensaje, ubicacion) {
    diagnosticos.push({
      etapa: 'semantica',
      codigo,
      mensaje: `${COMANDOS[nodo.tipo] ?? nodo.tipo}: ${mensaje}`,
      linea: ubicacion?.linea ?? null,
      columna: ubicacion?.columna ?? null,
    });
  }

  function reportarResolucion(nodo, { diagnostico }) {
    reportar(nodo, diagnostico.codigo, `${diagnostico.mensaje} ${SUGERENCIAS[diagnostico.codigo]}`, diagnostico);
  }

  function tarea(nodo, cadena) {
    const resultado = tabla.resolverTarea(cadena.valor, cadena.inicio);
    if (resultado.ok) return resultado.simbolo;
    reportarResolucion(nodo, resultado);
    return null;
  }

  function usuario(nodo, cadena) {
    const resultado = tabla.resolverUsuario(cadena.valor, cadena.inicio);
    if (resultado.ok) return resultado.simbolo;
    reportarResolucion(nodo, resultado);
    return null;
  }

  function estadoValido(nodo, estado) {
    if (ESTADOS.includes(estado.valor)) return true;
    reportar(nodo, 'ESTADO_INVALIDO', `«${estado.valor}» no es un estado. Usa ${ESTADOS.join(', ')}.`, estado.inicio);
    return false;
  }

  function textoNoVacio(nodo, cadena, que) {
    if (cadena.valor.trim() !== '') return;
    reportar(nodo, 'TEXTO_VACIO', `${que} no puede estar vacío. Escribe algo entre las comillas.`, cadena.inicio);
  }

  function estadoActual(simbolo, contexto) {
    // Dentro de un SI sobre la misma tarea, la acción solo corre si la tarea tiene ese estado.
    if (contexto.condicion?.tarea === simbolo) return contexto.condicion.estado;
    return estadosPrevistos.has(simbolo) ? estadosPrevistos.get(simbolo) : simbolo.estado;
  }

  function validarInstruccion(nodo, contexto) {
    const referencias = {};

    switch (nodo.tipo) {
      case 'CrearTarea': {
        textoNoVacio(nodo, nodo.titulo, 'El título');
        if (nodo.fecha && !fechaExiste(nodo.fecha.valor)) {
          reportar(nodo, 'FECHA_INVALIDA', `«${nodo.fecha.valor}» no es una fecha que exista. Usa AAAA-MM-DD con un día válido del mes.`, nodo.fecha.inicio);
        }
        referencias.tarea = tabla.declararTarea(nodo.titulo.valor, nodo.titulo.inicio);
        // Si la creación depende de un SI, no se sabe si la tarea existirá.
        if (contexto.dentroDeSi) estadosPrevistos.set(referencias.tarea, null);
        break;
      }

      case 'AsignarTarea': {
        referencias.tarea = tarea(nodo, nodo.tarea);
        referencias.usuario = usuario(nodo, nodo.usuario);
        const estado = referencias.tarea && estadoActual(referencias.tarea, contexto);
        if (ESTADOS_FINALES.includes(estado)) {
          reportar(nodo, 'OPERACION_NO_PERMITIDA', `la tarea «${referencias.tarea.titulo}» está ${estado} y ya no se puede asignar. Asigna una tarea PENDIENTE o EN_PROGRESO.`, nodo.tarea.inicio);
        }
        break;
      }

      case 'CambiarEstado': {
        referencias.tarea = tarea(nodo, nodo.tarea);
        if (!estadoValido(nodo, nodo.estado) || !referencias.tarea) break;
        const nuevo = nodo.estado.valor;
        const actual = estadoActual(referencias.tarea, contexto);
        if (actual === nuevo) {
          reportar(nodo, 'TRANSICION_INVALIDA', `la tarea «${referencias.tarea.titulo}» ya está ${nuevo}. Quita esta instrucción o elige otro estado.`, nodo.estado.inicio);
        } else if (actual !== null && !TRANSICIONES[actual].includes(nuevo)) {
          reportar(nodo, 'TRANSICION_INVALIDA', `la tarea «${referencias.tarea.titulo}» no puede pasar de ${actual} a ${nuevo}. Una tarea COMPLETADA o CANCELADA ya no cambia de estado.`, nodo.estado.inicio);
        }
        // Un cambio dentro de un SI puede o no ocurrir, así que después ya no se sabe el estado.
        estadosPrevistos.set(referencias.tarea, contexto.dentroDeSi ? null : nuevo);
        break;
      }

      case 'ConsultarTarea':
        referencias.tarea = tarea(nodo, nodo.tarea);
        break;

      case 'ListarTareas':
        break;

      case 'Notificar':
        referencias.usuario = usuario(nodo, nodo.usuario);
        textoNoVacio(nodo, nodo.mensaje, 'El mensaje');
        break;

      case 'EnviarCorreo':
        if (!REGEX_CORREO.test(nodo.destinatario.valor)) {
          reportar(nodo, 'CORREO_INVALIDO', `«${nodo.destinatario.valor}» no es un correo válido. Escribe una dirección como nombre@ejemplo.com.`, nodo.destinatario.inicio);
        }
        textoNoVacio(nodo, nodo.mensaje, 'El mensaje');
        break;

      case 'Condicional': {
        if (contexto.dentroDeSi) {
          reportar(nodo, 'OPERACION_NO_PERMITIDA', 'no se puede poner un SI dentro de otro. Separa las condiciones en líneas distintas.', nodo.inicio);
          break;
        }
        referencias.tarea = tarea(nodo, nodo.tarea);
        const condicionValida = estadoValido(nodo, nodo.estado);
        const condicion = referencias.tarea && condicionValida
          ? { tarea: referencias.tarea, estado: nodo.estado.valor }
          : null;
        const accion = validarInstruccion(nodo.accion, { dentroDeSi: true, condicion });
        return { ...nodo, accion, referencias };
      }

      default:
        reportar(nodo, 'OPERACION_NO_PERMITIDA', 'instrucción desconocida.', nodo.inicio);
    }

    return { ...nodo, referencias };
  }

  const instrucciones = ast.instrucciones.map((nodo) => validarInstruccion(nodo, { dentroDeSi: false, condicion: null }));
  const ok = diagnosticos.length === 0;
  return {
    ok,
    diagnosticos,
    programa: ok ? { tipo: 'Programa', instrucciones, inicio: ast.inicio, fin: ast.fin } : null,
  };
}

// Arma una tabla de símbolos nueva desde el repositorio y valida el programa.
export async function validarPrograma(ast, repositorio) {
  const tabla = await crearTablaSimbolos(repositorio);
  return validarAST(ast, tabla);
}
