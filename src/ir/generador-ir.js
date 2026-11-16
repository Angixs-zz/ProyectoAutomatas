// Generación de la representación intermedia (IR) · [S3 · SEM-3] #11
// Traduce el programa que devuelve validarPrograma (#10) a la IR acordada con
// Edwin en docs/contrato-ir.md (#12). Es una función pura: no lee el repositorio
// ni ejecuta nada, y devuelve objetos planos que se pueden imprimir y comparar.

export const VERSION_IR = 1;

function ubicacion(nodo) {
  return { linea: nodo.inicio?.linea ?? null, columna: nodo.inicio?.columna ?? null };
}

export function generarIR(programa) {
  if (!programa || programa.tipo !== 'Programa' || !Array.isArray(programa.instrucciones)) {
    throw new TypeError('Se esperaba el programa validado por validarPrograma (cuando ok es true).');
  }

  const instrucciones = [];
  // Tarea creada en el programa (su símbolo) -> nombre temporal 'tmp_N'.
  const temporales = new Map();
  let totalTemporales = 0;
  let totalCondicionales = 0;

  function simbolo(nodo, campo) {
    const encontrado = nodo.referencias?.[campo];
    if (!encontrado) {
      throw new TypeError(`${nodo.tipo} no trae referencias.${campo}. Valida el programa antes de generar la IR.`);
    }
    return encontrado;
  }

  function refTarea(nodo) {
    const tarea = simbolo(nodo, 'tarea');
    if (tarea.origen === 'programa') {
      return { tipo: 'temporal', ref: temporales.get(tarea), titulo: tarea.titulo };
    }
    return { tipo: 'id', id: tarea.id, titulo: tarea.titulo };
  }

  function refUsuario(nodo) {
    const usuario = simbolo(nodo, 'usuario');
    return { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo };
  }

  // Traduce una instrucción simple. `extra` lleva el campo `condicional` cuando
  // la instrucción es la acción de un SI.
  function traducirSimple(nodo, extra = {}) {
    const lugar = { ...ubicacion(nodo), ...extra };

    switch (nodo.tipo) {
      case 'CrearTarea': {
        totalTemporales += 1;
        const salidaRef = `tmp_${totalTemporales}`;
        temporales.set(simbolo(nodo, 'tarea'), salidaRef);
        return { op: 'CREAR_TAREA', titulo: nodo.titulo.valor, fecha: nodo.fecha?.valor ?? null, salidaRef, ...lugar };
      }
      case 'AsignarTarea':
        return { op: 'ASIGNAR_TAREA', tarea: refTarea(nodo), usuario: refUsuario(nodo), ...lugar };
      case 'CambiarEstado':
        return { op: 'CAMBIAR_ESTADO', tarea: refTarea(nodo), estado: nodo.estado.valor, ...lugar };
      case 'ConsultarTarea':
        return { op: 'CONSULTAR_TAREA', tarea: refTarea(nodo), ...lugar };
      case 'ListarTareas':
        return { op: 'LISTAR_TAREAS', ...lugar };
      case 'Notificar':
        return { op: 'NOTIFICAR', usuario: refUsuario(nodo), mensaje: nodo.mensaje.valor, ...lugar };
      case 'EnviarCorreo':
        return { op: 'ENVIAR_CORREO', destinatario: nodo.destinatario.valor, mensaje: nodo.mensaje.valor, ...lugar };
      default:
        throw new TypeError(`No se puede traducir a IR una instrucción de tipo «${nodo.tipo}».`);
    }
  }

  // SI TAREA "t" ESTA E ENTONCES <accion>
  //   EVALUAR_ESTADO -> SALTAR_SI_FALSO -> <accion> -> ETIQUETA
  function traducirCondicional(nodo) {
    totalCondicionales += 1;
    const temp = `cond_${totalCondicionales}`;
    const etiqueta = `fin_si_${totalCondicionales}`;
    const { linea, columna } = ubicacion(nodo);

    instrucciones.push(
      { op: 'EVALUAR_ESTADO', tarea: refTarea(nodo), estadoEsperado: nodo.estado.valor, destinoTemp: temp, linea, columna },
      { op: 'SALTAR_SI_FALSO', condicion: temp, etiqueta, linea, columna },
      traducirSimple(nodo.accion, { condicional: { temp, linea } }),
      { op: 'ETIQUETA', nombre: etiqueta },
    );
  }

  for (const nodo of programa.instrucciones) {
    if (nodo.tipo === 'Condicional') traducirCondicional(nodo);
    else instrucciones.push(traducirSimple(nodo));
  }

  return {
    tipo: 'ProgramaIR',
    version: VERSION_IR,
    instrucciones,
    metadatos: {
      totalInstruccionesOriginales: instrucciones.length,
      optimizacionesAplicadas: [],
    },
  };
}

// --- Inspección ---

const textoTarea = (ref) => `${ref.tipo === 'temporal' ? ref.ref : ref.id} "${ref.titulo}"`;
const textoUsuario = (u) => `${u.id} (${u.nombre})`;

function describirInstruccion(inst) {
  switch (inst.op) {
    case 'CREAR_TAREA':
      return `"${inst.titulo}"${inst.fecha ? ` fecha ${inst.fecha}` : ''} -> ${inst.salidaRef}`;
    case 'ASIGNAR_TAREA':
      return `${textoTarea(inst.tarea)} a ${textoUsuario(inst.usuario)}`;
    case 'CAMBIAR_ESTADO':
      return `${textoTarea(inst.tarea)} a ${inst.estado}`;
    case 'CONSULTAR_TAREA':
      return textoTarea(inst.tarea);
    case 'LISTAR_TAREAS':
      return '';
    case 'NOTIFICAR':
      return `${textoUsuario(inst.usuario)} "${inst.mensaje}"`;
    case 'ENVIAR_CORREO':
      return `${inst.destinatario} "${inst.mensaje}"`;
    case 'EVALUAR_ESTADO':
      return `${textoTarea(inst.tarea)} == ${inst.estadoEsperado} -> ${inst.destinoTemp}`;
    case 'SALTAR_SI_FALSO':
      return `${inst.condicion} -> ${inst.etiqueta}`;
    default:
      return JSON.stringify(inst);
  }
}

// Devuelve la IR como texto, una instrucción por renglón, para revisarla a ojo
// o mostrarla en la documentación.
export function describirIR(programaIR) {
  return programaIR.instrucciones
    .map((inst, indice) => {
      const numero = String(indice + 1).padStart(2, ' ');
      if (inst.op === 'ETIQUETA') return `${numero}  ${inst.nombre}:`;
      const condicion = inst.condicional ? `  [si ${inst.condicional.temp}]` : '';
      const cuerpo = `${inst.op.padEnd(16)}${describirInstruccion(inst)}${condicion}`.trimEnd();
      return `${numero}  ${cuerpo}  ; línea ${inst.linea}`;
    })
    .join('\n');
}
