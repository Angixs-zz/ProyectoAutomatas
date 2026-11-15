// Respuestas de EJEMPLO para la consola (#7) mientras no existe la API (#6).
export const ESTADOS = ['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA'];

export const USUARIOS_EJEMPLO = ['Yareli', 'Diego', 'Angel', 'Edwin', 'Melody', 'Miguel Angel'];

export const TAREAS_EJEMPLO = [
  { id: 'task_1', titulo: 'Preparar informe', estado: 'PENDIENTE', responsable: 'Yareli' },
  { id: 'task_2', titulo: 'Revisar gramática', estado: 'EN_PROGRESO', responsable: 'Angel' },
  { id: 'task_3', titulo: 'Configurar Docker', estado: 'COMPLETADA', responsable: 'Edwin' },
];

// Programas de ejemplo para los botones de la consola (tomados de la gramática de Yareli).
export const EJEMPLOS = [
  {
    nombre: 'Crear y asignar',
    texto: 'CREAR TAREA "Lavar trastes" FECHA "2026-11-15"\nASIGNAR TAREA "Lavar trastes" A "Yareli"\nCAMBIAR ESTADO TAREA "Lavar trastes" A EN_PROGRESO\nLISTAR TAREAS',
  },
  {
    nombre: 'Notificar y condicional',
    texto: 'NOTIFICAR A "Angel" MENSAJE "Revisa la estructura del AST"\nENVIAR CORREO A "diego@ejemplo.com" MENSAJE "Pruebas de consola listas"\nSI TAREA "Configurar Docker" ESTA COMPLETADA ENTONCES NOTIFICAR A "Edwin" MENSAJE "Docker listo"',
  },
  { nombre: 'Error léxico', texto: 'LISTAR TAREAS @' },
  { nombre: 'Error sintáctico', texto: 'CREAR TAREA' },
  { nombre: 'Error semántico', texto: 'CONSULTAR TAREA "Informe"' },
];

const REGLAS = {
  CREAR: ['CREAR', 'TAREA', 'CADENA'],
  ASIGNAR: ['ASIGNAR', 'TAREA', 'CADENA', 'A', 'CADENA'],
  CAMBIAR: ['CAMBIAR', 'ESTADO', 'TAREA', 'CADENA', 'A', 'VALOR_ESTADO'],
  CONSULTAR: ['CONSULTAR', 'TAREA', 'CADENA'],
  LISTAR: ['LISTAR', 'TAREAS'],
  NOTIFICAR: ['NOTIFICAR', 'A', 'CADENA', 'MENSAJE', 'CADENA'],
  ENVIAR: ['ENVIAR', 'CORREO', 'A', 'CADENA', 'MENSAJE', 'CADENA'],
};
const CREAR_CON_FECHA = ['CREAR', 'TAREA', 'CADENA', 'FECHA', 'CADENA'];
const ENCABEZADO_SI = ['SI', 'TAREA', 'CADENA', 'ESTA', 'VALOR_ESTADO', 'ENTONCES'];

const NOMBRE_OPERACION = {
  CREAR: 'crear', ASIGNAR: 'asignar', CAMBIAR: 'cambiar_estado', CONSULTAR: 'consultar',
  LISTAR: 'listar', NOTIFICAR: 'notificar', ENVIAR: 'enviar_correo', SI: 'condicional',
};

function diagnostico(etapa, codigo, mensaje, linea, columna) {
  return { etapa, codigo, mensaje, linea, columna };
}


function tokenizarLinea(texto, linea) {
  const tokens = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '"') {
      const cierre = texto.indexOf('"', i + 1);
      if (cierre === -1) {
        return { tokens, error: diagnostico('lexica', 'CADENA_SIN_CERRAR', 'La cadena de texto inició con " pero llegó al fin de línea sin cerrarse.', linea, i + 1) };
      }
      tokens.push({ tipo: 'CADENA', valor: texto.slice(i + 1, cierre), columna: i + 1, fin: cierre + 2 });
      i = cierre + 1;
      continue;
    }
    if (/[A-Z_]/.test(c)) {
      let j = i;
      while (j < texto.length && /[A-Z_]/.test(texto[j])) j++;
      tokens.push({ tipo: 'PALABRA', valor: texto.slice(i, j), columna: i + 1, fin: j + 1 });
      i = j;
      continue;
    }
    return { tokens, error: diagnostico('lexica', 'CARACTER_INVALIDO', `Carácter '${c}' no reconocido fuera de una cadena de texto.`, linea, i + 1) };
  }
  return { tokens, error: null };
}


function describir(esperado) {
  if (esperado === 'CADENA') return 'un texto entre comillas';
  if (esperado === 'VALOR_ESTADO') return `un estado (${ESTADOS.join(', ')})`;
  return `'${esperado}'`;
}

function coincide(token, esperado) {
  if (esperado === 'CADENA') return token.tipo === 'CADENA';
  if (esperado === 'VALOR_ESTADO') return token.tipo === 'PALABRA' && ESTADOS.includes(token.valor);
  return token.tipo === 'PALABRA' && token.valor === esperado;
}

function compararForma(tokens, forma, inicio, linea) {
  for (let k = 0; k < forma.length; k++) {
    const token = tokens[inicio + k];
    if (!token) {
      const anterior = tokens[inicio + k - 1];
      return diagnostico('sintactica', 'ARGUMENTO_FALTANTE', `Se esperaba ${describir(forma[k])} después de '${anterior.valor}'.`, linea, anterior.fin);
    }
    if (!coincide(token, forma[k])) {
      return diagnostico('sintactica', 'TOKEN_INESPERADO', `Se esperaba ${describir(forma[k])}, pero se encontró '${token.valor}'.`, linea, token.columna);
    }
  }
  return null;
}

function analizarSimple(tokens, inicio, linea) {
  const primero = tokens[inicio];
  const comando = primero.tipo === 'PALABRA' ? primero.valor : null;
  if (!REGLAS[comando]) {
    return { error: diagnostico('sintactica', 'TOKEN_INESPERADO', `Se esperaba un comando (${Object.keys(REGLAS).join(', ')}), pero se encontró '${primero.valor}'.`, linea, primero.columna) };
  }
  const conFecha = comando === 'CREAR' && tokens[inicio + 3]?.valor === 'FECHA';
  const forma = conFecha ? CREAR_CON_FECHA : REGLAS[comando];
  const error = compararForma(tokens, forma, inicio, linea);
  if (error) return { error };
  const sobrante = tokens[inicio + forma.length];
  if (sobrante) {
    return { error: diagnostico('sintactica', 'TOKEN_INESPERADO', `No se esperaba '${sobrante.valor}' al final de la instrucción.`, linea, sobrante.columna) };
  }
  const usados = tokens.slice(inicio, inicio + forma.length);
  const fecha = conFecha ? usados[4] : null;
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha.valor)) {
    return { error: diagnostico('sintactica', 'TOKEN_INESPERADO', 'Se esperaba una fecha con formato "AAAA-MM-DD".', linea, fecha.columna) };
  }
  return { nodo: { comando, linea, cadenas: usados.filter((t) => t.tipo === 'CADENA'), estado: usados.find((t) => ESTADOS.includes(t.valor))?.valor } };
}

function analizarLinea(tokens, linea) {
  if (tokens[0].valor !== 'SI') return analizarSimple(tokens, 0, linea);
  const error = compararForma(tokens, ENCABEZADO_SI, 0, linea);
  if (error) return { error };
  if (!tokens[ENCABEZADO_SI.length]) {
    return { error: diagnostico('sintactica', 'ARGUMENTO_FALTANTE', "Se esperaba una instrucción después de 'ENTONCES'.", linea, tokens[ENCABEZADO_SI.length - 1].fin) };
  }
  const accion = analizarSimple(tokens, ENCABEZADO_SI.length, linea);
  if (accion.error) return accion;
  return { nodo: { comando: 'SI', linea, cadenas: [tokens[2]], estado: tokens[4].valor, accion: accion.nodo } };
}


function validarNodo(nodo, titulos) {
  const [primera, segunda] = nodo.cadenas;
  const usaTarea = ['ASIGNAR', 'CAMBIAR', 'CONSULTAR', 'SI'].includes(nodo.comando);
  if (usaTarea && !titulos.has(primera.valor)) {
    return diagnostico('semantica', 'TAREA_INEXISTENTE', `No existe la tarea «${primera.valor}».`, nodo.linea, primera.columna);
  }
  const usuario = nodo.comando === 'ASIGNAR' ? segunda : nodo.comando === 'NOTIFICAR' ? primera : null;
  if (usuario && !USUARIOS_EJEMPLO.includes(usuario.valor)) {
    return diagnostico('semantica', 'USUARIO_INEXISTENTE', `No existe el usuario «${usuario.valor}».`, nodo.linea, usuario.columna);
  }
  if (nodo.comando === 'ENVIAR' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(primera.valor)) {
    return diagnostico('semantica', 'CORREO_INVALIDO', `«${primera.valor}» no es un correo válido.`, nodo.linea, primera.columna);
  }
  if (nodo.comando === 'CREAR') titulos.add(primera.valor);
  if (nodo.accion) return validarNodo(nodo.accion, titulos);
  return null;
}


function ejecutarNodo(nodo, tareas) {
  const [primera, segunda] = nodo.cadenas;
  const base = { linea: nodo.linea, operacion: NOMBRE_OPERACION[nodo.comando] };
  switch (nodo.comando) {
    case 'CREAR': {
      const tarea = { id: `task_${tareas.size + 1}`, titulo: primera.valor, estado: 'PENDIENTE', responsable: null };
      tareas.set(tarea.titulo, tarea);
      return { ...base, tareaId: tarea.id, titulo: tarea.titulo, estado: tarea.estado };
    }
    case 'ASIGNAR':
      tareas.get(primera.valor).responsable = segunda.valor;
      return { ...base, titulo: primera.valor, responsable: segunda.valor };
    case 'CAMBIAR':
      tareas.get(primera.valor).estado = nodo.estado;
      return { ...base, titulo: primera.valor, estado: nodo.estado };
    case 'CONSULTAR':
      return { ...base, tarea: { ...tareas.get(primera.valor) } };
    case 'LISTAR':
      return { ...base, tareas: [...tareas.values()].map((t) => ({ ...t })) };
    case 'NOTIFICAR':
      return { ...base, destinatario: primera.valor, mensaje: segunda.valor, estado: 'en_cola' };
    case 'ENVIAR':
      return { ...base, destinatario: primera.valor, mensaje: segunda.valor, estado: 'en_cola' };
    case 'SI': {
      const condicion = tareas.get(primera.valor).estado === nodo.estado;
      return { ...base, condicion, accion: condicion ? ejecutarNodo(nodo.accion, tareas) : null };
    }
  }
}


export function simularRespuesta(texto, modo) {
  const diagnosticos = [];
  const nodos = [];
  texto.split('\n').forEach((contenido, indice) => {
    const linea = indice + 1;
    const { tokens, error } = tokenizarLinea(contenido, linea);
    if (error) { diagnosticos.push(error); return; }
    if (tokens.length === 0) return;
    const analisis = analizarLinea(tokens, linea);
    if (analisis.error) diagnosticos.push(analisis.error);
    else nodos.push(analisis.nodo);
  });

 
  if (diagnosticos.length === 0) {
    const titulos = new Set(TAREAS_EJEMPLO.map((t) => t.titulo));
    for (const nodo of nodos) {
      const error = validarNodo(nodo, titulos);
      if (error) diagnosticos.push(error);
    }
  }

  if (diagnosticos.length > 0) return { ok: false, modo, resultados: [], diagnosticos };
  if (modo === 'validacion') return { ok: true, modo, resultados: [], diagnosticos: [] };

  const tareas = new Map(TAREAS_EJEMPLO.map((t) => [t.titulo, { ...t }]));
  return { ok: true, modo, resultados: nodos.map((nodo) => ejecutarNodo(nodo, tareas)), diagnosticos: [] };
}


export function enviarPrograma(texto, modo, { fallar = false, espera = 600 } = {}) {
  return new Promise((resolver, rechazar) => {
    setTimeout(() => {
      if (fallar) rechazar(new Error('No se pudo conectar con la API.'));
      else resolver(simularRespuesta(texto, modo));
    }, espera);
  });
}
