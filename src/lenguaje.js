/**
 * Analizador Léxico (Lexer) para AutoTask · [S1 · LEN-2]
 * Convierte texto plano en una secuencia de tokens con ubicación (base 1)
 * y reporta diagnósticos léxicos recuperándose línea por línea.
 */

const PALABRAS_CLAVE = new Set([
  "CREAR",
  "TAREA",
  "TAREAS",
  "ASIGNAR",
  "CAMBIAR",
  "ESTADO",
  "CONSULTAR",
  "LISTAR",
  "NOTIFICAR",
  "ENVIAR",
  "CORREO",
  "MENSAJE",
  "FECHA",
  "A",
  "SI",
  "ESTA",
  "ENTONCES",
]);

const ESTADOS_VALIDOS = new Set([
  "PENDIENTE",
  "EN_PROGRESO",
  "COMPLETADA",
  "CANCELADA",
]);

const REGEX_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tokeniza el código fuente de AutoTask.
 * @param {string} entrada Texto del programa
 * @returns {{ tokens: Array<object>, diagnosticos: Array<object> }}
 */
export function tokenizar(entrada) {
  const tokens = [];
  const diagnosticos = [];

  let i = 0;
  let linea = 1;
  let columna = 1;
  const n = entrada.length;

  while (i < n) {
    const c = entrada[i];

    // 1. Espacios y tabuladores (se ignoran, pero avanzan la columna)
    if (c === " " || c === "\t") {
      i++;
      columna++;
      continue;
    }

    // 2. Saltos de línea (\r\n o \n) -> Delimitadores de instrucción
    if (c === "\r" || c === "\n") {
      const inicio = { linea, columna };
      if (c === "\r" && i + 1 < n && entrada[i + 1] === "\n") {
        i += 2;
        columna += 2;
      } else {
        i += 1;
        columna += 1;
      }
      tokens.push({
        tipo: "SALTO_LINEA",
        valor: "\\n",
        inicio,
        fin: { linea, columna },
      });
      linea++;
      columna = 1;
      continue;
    }

    // 3. Cadenas de texto y Fechas entre comillas dobles ("...")
    if (c === '"') {
      const inicio = { linea, columna };
      i++; // consumir comilla de apertura
      columna++;

      let contenido = "";
      let cerrada = false;

      while (i < n) {
        const actual = entrada[i];
        if (actual === "\n" || actual === "\r") {
          break; // Salto de línea antes de cerrar comillas
        }
        if (actual === '"') {
          cerrada = true;
          i++; // consumir comilla de cierre
          columna++;
          break;
        }
        contenido += actual;
        i++;
        columna++;
      }

      if (!cerrada) {
        diagnosticos.push({
          etapa: "lexica",
          codigo: "CADENA_SIN_CERRAR",
          mensaje: "La cadena de texto inició con '\"' pero llegó al fin de línea o entrada sin cerrarse.",
          linea: inicio.linea,
          columna: inicio.columna,
        });
        continue;
      }

      const esFecha = REGEX_FECHA_ISO.test(contenido);
      tokens.push({
        tipo: esFecha ? "FECHA" : "CADENA",
        valor: contenido,
        inicio,
        fin: { linea, columna },
      });
      continue;
    }

    // 4. Palabras clave, estados e identificadores (letras A-Z, a-z y _)
    if (/[A-Za-z_]/.test(c)) {
      const inicio = { linea, columna };
      let lexema = "";

      while (i < n && /[A-Za-z0-9_]/.test(entrada[i])) {
        lexema += entrada[i];
        i++;
        columna++;
      }

      let tipo = "IDENTIFICADOR";
      if (PALABRAS_CLAVE.has(lexema)) {
        tipo = `KW_${lexema}`;
      } else if (ESTADOS_VALIDOS.has(lexema)) {
        tipo = "ESTADO_VAL";
      }

      tokens.push({
        tipo,
        valor: lexema,
        inicio,
        fin: { linea, columna },
      });
      continue;
    }

    // 5. Números enteros
    if (/[0-9]/.test(c)) {
      const inicio = { linea, columna };
      let lexema = "";

      while (i < n && /[0-9]/.test(entrada[i])) {
        lexema += entrada[i];
        i++;
        columna++;
      }

      tokens.push({
        tipo: "ENTERO",
        valor: lexema,
        inicio,
        fin: { linea, columna },
      });
      continue;
    }

    // 6. Cualquier otro carácter no permitido -> Error léxico con recuperación
    diagnosticos.push({
      etapa: "lexica",
      codigo: "CARACTER_INVALIDO",
      mensaje: `Carácter '${c}' no reconocido fuera de una cadena de texto.`,
      linea,
      columna,
    });
    i++;
    columna++;
  }

  return { tokens, diagnosticos };
}