/**
 * Analizador Sintáctico (Parser) para AutoTask · [S1 · LEN-3] (#4)
 * Convierte una secuencia de tokens en un AST de Programa, instrucciones,
 * argumentos y condicionales, reportando errores sintácticos con ubicación
 * y expectativa, con recuperación por línea.
 */

const COMANDOS_INICIO = [
  'CREAR',
  'ASIGNAR',
  'CAMBIAR',
  'CONSULTAR',
  'LISTAR',
  'NOTIFICAR',
  'ENVIAR',
  'SI',
];

function copiarPos(pos) {
  return { linea: pos.linea, columna: pos.columna };
}

function formatoToken(token) {
  if (token.tipo === 'CADENA' || token.tipo === 'FECHA') {
    return `"${token.valor}"`;
  }
  return token.valor;
}

function crearNodoCadena(token) {
  return {
    tipo: 'Cadena',
    valor: token.valor,
    inicio: copiarPos(token.inicio),
    fin: copiarPos(token.fin),
  };
}

function crearNodoFecha(token) {
  return {
    tipo: 'Fecha',
    valor: token.valor,
    inicio: copiarPos(token.inicio),
    fin: copiarPos(token.fin),
  };
}

function crearNodoEstado(token) {
  return {
    tipo: 'Estado',
    valor: token.valor,
    inicio: copiarPos(token.inicio),
    fin: copiarPos(token.fin),
  };
}

/**
 * Parsea un arreglo de tokens producido por `tokenizar(entrada)`.
 * @param {Array<object>} tokens Tokens emitidos por el lexer
 * @returns {{ ast: object, diagnosticos: Array<object> }}
 */
export function parsear(tokens) {
  if (!Array.isArray(tokens)) {
    throw new TypeError('Se esperaba un arreglo de tokens.');
  }

  const instrucciones = [];
  const diagnosticos = [];
  let i = 0;
  const n = tokens.length;

  function actual() {
    return i < n ? tokens[i] : null;
  }

  function esFinDeLinea(token = actual()) {
    return token === null || token.tipo === 'SALTO_LINEA';
  }

  function saltarSaltosDeLinea() {
    while (i < n && tokens[i].tipo === 'SALTO_LINEA') {
      i++;
    }
  }

  function sincronizarLinea() {
    while (i < n && tokens[i].tipo !== 'SALTO_LINEA') {
      i++;
    }
    if (i < n && tokens[i].tipo === 'SALTO_LINEA') {
      i++;
    }
  }

  function reportar(codigo, mensaje, pos) {
    diagnosticos.push({
      etapa: 'sintactica',
      codigo,
      mensaje,
      linea: pos.linea,
      columna: pos.columna,
    });
  }

  function esperar(tipoEsperado, descripcionEsperada, ultimoToken) {
    const tok = actual();
    if (esFinDeLinea(tok)) {
      reportar(
        'ARGUMENTO_FALTANTE',
        `Se esperaba ${descripcionEsperada} después de '${ultimoToken.valor}'.`,
        ultimoToken.fin,
      );
      return null;
    }
    if (tok.tipo !== tipoEsperado) {
      reportar(
        'TOKEN_INESPERADO',
        `Se esperaba ${descripcionEsperada} después de '${ultimoToken.valor}', pero se encontró '${formatoToken(tok)}'.`,
        tok.inicio,
      );
      return null;
    }
    i++;
    return tok;
  }

  function parsearInstruccionSimple() {
    const inicioTok = actual();
    if (esFinDeLinea(inicioTok)) {
      return null;
    }

    switch (inicioTok.tipo) {
      case 'KW_CREAR': {
        i++;
        const tokTarea = esperar('KW_TAREA', "la palabra clave 'TAREA'", inicioTok);
        if (!tokTarea) return null;

        const tokTitulo = esperar('CADENA', 'una CADENA con el título de la tarea', tokTarea);
        if (!tokTitulo) return null;

        const titulo = crearNodoCadena(tokTitulo);
        let fecha = null;
        let fin = titulo.fin;

        if (!esFinDeLinea() && actual().tipo === 'KW_FECHA') {
          const tokKwFecha = actual();
          i++;
          const tokFecha = esperar('FECHA', 'una FECHA con formato "YYYY-MM-DD"', tokKwFecha);
          if (!tokFecha) return null;
          fecha = crearNodoFecha(tokFecha);
          fin = fecha.fin;
        }

        return {
          tipo: 'CrearTarea',
          titulo,
          fecha,
          inicio: copiarPos(inicioTok.inicio),
          fin: copiarPos(fin),
        };
      }

      case 'KW_ASIGNAR': {
        i++;
        const tokTarea = esperar('KW_TAREA', "la palabra clave 'TAREA'", inicioTok);
        if (!tokTarea) return null;

        const tokTitulo = esperar('CADENA', 'una CADENA con el título de la tarea', tokTarea);
        if (!tokTitulo) return null;

        const tokA = esperar('KW_A', "la palabra clave 'A'", tokTitulo);
        if (!tokA) return null;

        const tokUsuario = esperar('CADENA', 'una CADENA con el nombre del usuario', tokA);
        if (!tokUsuario) return null;

        const tarea = crearNodoCadena(tokTitulo);
        const usuario = crearNodoCadena(tokUsuario);

        return {
          tipo: 'AsignarTarea',
          tarea,
          usuario,
          inicio: copiarPos(inicioTok.inicio),
          fin: copiarPos(usuario.fin),
        };
      }

      case 'KW_CAMBIAR': {
        i++;
        const tokEstadoKw = esperar('KW_ESTADO', "la palabra clave 'ESTADO'", inicioTok);
        if (!tokEstadoKw) return null;

        const tokTarea = esperar('KW_TAREA', "la palabra clave 'TAREA'", tokEstadoKw);
        if (!tokTarea) return null;

        const tokTitulo = esperar('CADENA', 'una CADENA con el título de la tarea', tokTarea);
        if (!tokTitulo) return null;

        const tokA = esperar('KW_A', "la palabra clave 'A'", tokTitulo);
        if (!tokA) return null;

        const tokEstado = esperar(
          'ESTADO_VAL',
          'un estado válido (PENDIENTE, EN_PROGRESO, COMPLETADA o CANCELADA)',
          tokA,
        );
        if (!tokEstado) return null;

        const tarea = crearNodoCadena(tokTitulo);
        const estado = crearNodoEstado(tokEstado);

        return {
          tipo: 'CambiarEstado',
          tarea,
          estado,
          inicio: copiarPos(inicioTok.inicio),
          fin: copiarPos(estado.fin),
        };
      }

      case 'KW_CONSULTAR': {
        i++;
        const tokTarea = esperar('KW_TAREA', "la palabra clave 'TAREA'", inicioTok);
        if (!tokTarea) return null;

        const tokTitulo = esperar('CADENA', 'una CADENA con el título de la tarea', tokTarea);
        if (!tokTitulo) return null;

        const tarea = crearNodoCadena(tokTitulo);

        return {
          tipo: 'ConsultarTarea',
          tarea,
          inicio: copiarPos(inicioTok.inicio),
          fin: copiarPos(tarea.fin),
        };
      }

      case 'KW_LISTAR': {
        i++;
        const tokTareas = esperar('KW_TAREAS', "la palabra clave 'TAREAS'", inicioTok);
        if (!tokTareas) return null;

        return {
          tipo: 'ListarTareas',
          inicio: copiarPos(inicioTok.inicio),
          fin: copiarPos(tokTareas.fin),
        };
      }

      case 'KW_NOTIFICAR': {
        i++;
        const tokA = esperar('KW_A', "la palabra clave 'A'", inicioTok);
        if (!tokA) return null;

        const tokUsuario = esperar('CADENA', 'una CADENA con el nombre del usuario', tokA);
        if (!tokUsuario) return null;

        const tokMensajeKw = esperar('KW_MENSAJE', "la palabra clave 'MENSAJE'", tokUsuario);
        if (!tokMensajeKw) return null;

        const tokMensaje = esperar('CADENA', 'una CADENA con el mensaje', tokMensajeKw);
        if (!tokMensaje) return null;

        const usuario = crearNodoCadena(tokUsuario);
        const mensaje = crearNodoCadena(tokMensaje);

        return {
          tipo: 'Notificar',
          usuario,
          mensaje,
          inicio: copiarPos(inicioTok.inicio),
          fin: copiarPos(mensaje.fin),
        };
      }

      case 'KW_ENVIAR': {
        i++;
        const tokCorreo = esperar('KW_CORREO', "la palabra clave 'CORREO'", inicioTok);
        if (!tokCorreo) return null;

        const tokA = esperar('KW_A', "la palabra clave 'A'", tokCorreo);
        if (!tokA) return null;

        const tokDest = esperar('CADENA', 'una CADENA con el correo del destinatario', tokA);
        if (!tokDest) return null;

        const tokMensajeKw = esperar('KW_MENSAJE', "la palabra clave 'MENSAJE'", tokDest);
        if (!tokMensajeKw) return null;

        const tokMensaje = esperar('CADENA', 'una CADENA con el mensaje', tokMensajeKw);
        if (!tokMensaje) return null;

        const destinatario = crearNodoCadena(tokDest);
        const mensaje = crearNodoCadena(tokMensaje);

        return {
          tipo: 'EnviarCorreo',
          destinatario,
          mensaje,
          inicio: copiarPos(inicioTok.inicio),
          fin: copiarPos(mensaje.fin),
        };
      }

      default:
        reportar(
          'TOKEN_INESPERADO',
          `Se esperaba una instrucción válida (${COMANDOS_INICIO.join(', ')}), pero se encontró '${formatoToken(inicioTok)}'.`,
          inicioTok.inicio,
        );
        return null;
    }
  }

  function parsearCondicional() {
    const inicioTok = actual(); // KW_SI
    i++;

    const tokTarea = esperar('KW_TAREA', "la palabra clave 'TAREA'", inicioTok);
    if (!tokTarea) return null;

    const tokTitulo = esperar('CADENA', 'una CADENA con el título de la tarea', tokTarea);
    if (!tokTitulo) return null;

    const tokEsta = esperar('KW_ESTA', "la palabra clave 'ESTA'", tokTitulo);
    if (!tokEsta) return null;

    const tokEstado = esperar(
      'ESTADO_VAL',
      'un estado válido (PENDIENTE, EN_PROGRESO, COMPLETADA o CANCELADA)',
      tokEsta,
    );
    if (!tokEstado) return null;

    const tokEntonces = esperar('KW_ENTONCES', "la palabra clave 'ENTONCES'", tokEstado);
    if (!tokEntonces) return null;

    const tokAccion = actual();
    if (esFinDeLinea(tokAccion)) {
      reportar(
        'ARGUMENTO_FALTANTE',
        "Se esperaba una instrucción simple después de 'ENTONCES'.",
        tokEntonces.fin,
      );
      return null;
    }

    if (tokAccion.tipo === 'KW_SI') {
      reportar(
        'TOKEN_INESPERADO',
        "No se permite un condicional 'SI' anidado después de 'ENTONCES'; se esperaba una instrucción simple.",
        tokAccion.inicio,
      );
      return null;
    }

    const accion = parsearInstruccionSimple();
    if (!accion) return null;

    return {
      tipo: 'Condicional',
      tarea: crearNodoCadena(tokTitulo),
      estado: crearNodoEstado(tokEstado),
      accion,
      inicio: copiarPos(inicioTok.inicio),
      fin: copiarPos(accion.fin),
    };
  }

  function parsearInstruccion() {
    const tok = actual();
    if (tok.tipo === 'KW_SI') {
      return parsearCondicional();
    }
    return parsearInstruccionSimple();
  }

  while (i < n) {
    saltarSaltosDeLinea();
    if (i >= n) break;

    const nodo = parsearInstruccion();
    if (!nodo) {
      sincronizarLinea();
      continue;
    }

    // Verificar que no haya texto sobrante en la misma línea
    if (!esFinDeLinea()) {
      const sobrante = actual();
      reportar(
        'TOKEN_INESPERADO',
        `Se esperaba fin de línea después de la instrucción, pero se encontró '${formatoToken(sobrante)}'.`,
        sobrante.inicio,
      );
      sincronizarLinea();
      continue;
    }

    instrucciones.push(nodo);
    if (i < n && tokens[i].tipo === 'SALTO_LINEA') {
      i++;
    }
  }

  const inicio = instrucciones.length > 0 ? copiarPos(instrucciones[0].inicio) : { linea: 1, columna: 1 };
  const fin = instrucciones.length > 0 ? copiarPos(instrucciones[instrucciones.length - 1].fin) : { linea: 1, columna: 1 };

  return {
    ast: {
      tipo: 'Programa',
      instrucciones,
      inicio,
      fin,
    },
    diagnosticos,
  };
}

