import test from "node:test";
import assert from "node:assert/strict";
import { tokenizar } from "../src/lenguaje.js";

test("Tokeniza un programa válido de varias líneas con fechas, cadenas y estados", () => {
  const codigo = [
    'CREAR TAREA "Preparar informe" FECHA "2026-11-15"',
    'ASIGNAR TAREA "Preparar informe" A "Yareli"',
    'CAMBIAR ESTADO TAREA "Preparar informe" A EN_PROGRESO',
  ].join("\n");

  const { tokens, diagnosticos } = tokenizar(codigo);

  assert.equal(diagnosticos.length, 0);
  assert.equal(tokens[0].tipo, "KW_CREAR");
  assert.deepEqual(tokens[0].inicio, { linea: 1, columna: 1 });
  assert.deepEqual(tokens[0].fin, { linea: 1, columna: 6 });

  const tokenCadena = tokens.find((t) => t.tipo === "CADENA");
  assert.equal(tokenCadena.valor, "Preparar informe");

  const tokenFecha = tokens.find((t) => t.tipo === "FECHA");
  assert.equal(tokenFecha.valor, "2026-11-15");

  const tokenEstado = tokens.find((t) => t.tipo === "ESTADO_VAL");
  assert.equal(tokenEstado.valor, "EN_PROGRESO");
  assert.equal(tokenEstado.inicio.linea, 3);
});

test("Tokeniza enteros e identificadores correctamente", () => {
  const { tokens, diagnosticos } = tokenizar("CONSULTAR TAREA 42 tarea_extra");

  assert.equal(diagnosticos.length, 0);
  assert.equal(tokens[2].tipo, "ENTERO");
  assert.equal(tokens[2].valor, "42");
  assert.equal(tokens[3].tipo, "IDENTIFICADOR");
  assert.equal(tokens[3].valor, "tarea_extra");
});

test("Reporta CARACTER_INVALIDO con línea y columna exactas y continúa analizando", () => {
  const codigo = 'LISTAR TAREAS @\nCREAR TAREA "Cocina"';
  const { tokens, diagnosticos } = tokenizar(codigo);

  assert.equal(diagnosticos.length, 1);
  assert.deepEqual(diagnosticos[0], {
    etapa: "lexica",
    codigo: "CARACTER_INVALIDO",
    mensaje: "Carácter '@' no reconocido fuera de una cadena de texto.",
    linea: 1,
    columna: 15,
  });

  // Verifica que se recuperó y tokenizó la línea 2
  const linea2 = tokens.filter((t) => t.inicio.linea === 2);
  assert.equal(linea2[0].tipo, "KW_CREAR");
});

test("Reporta CADENA_SIN_CERRAR cuando falta la comilla de cierre antes del salto de línea", () => {
  const codigo = 'CREAR TAREA "Limpiar cocina\nLISTAR TAREAS';
  const { tokens, diagnosticos } = tokenizar(codigo);

  assert.equal(diagnosticos.length, 1);
  assert.equal(diagnosticos[0].etapa, "lexica");
  assert.equal(diagnosticos[0].codigo, "CADENA_SIN_CERRAR");
  assert.equal(diagnosticos[0].linea, 1);
  assert.equal(diagnosticos[0].columna, 13);

  // Verifica que la línea 2 sí fue procesada tras el salto de línea
  const linea2 = tokens.filter((t) => t.inicio.linea === 2);
  assert.equal(linea2[0].tipo, "KW_LISTAR");
});