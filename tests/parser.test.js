import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenizar, parsear } from '../src/lenguaje.js';
import { crearRepositorioEnMemoria } from '../src/semantica/repositorio-memoria.js';
import { validarPrograma } from '../src/semantica/validador.js';
import { generarIR } from '../src/ir/generador-ir.js';
import {
  programa,
  crear,
  asignar,
  cambiar,
  consultar,
  listar,
  notificar,
  correo,
  si,
} from './ayudantes/ast.js';

test('Parsea el ejemplo 1 de la gramática y coincide exactamente con el contrato del AST', () => {
  const codigo = [
    'CREAR TAREA "Preparar informe" FECHA "2026-11-15"',
    'ASIGNAR TAREA "Preparar informe" A "Yareli"',
    'CAMBIAR ESTADO TAREA "Preparar informe" A EN_PROGRESO',
    'CONSULTAR TAREA "Preparar informe"',
    'LISTAR TAREAS',
  ].join('\n');

  const { tokens, diagnosticos: errLex } = tokenizar(codigo);
  assert.equal(errLex.length, 0);

  const { ast, diagnosticos } = parsear(tokens);
  assert.equal(diagnosticos.length, 0);

  const esperado = programa(
    crear(1, 'Preparar informe', '2026-11-15'),
    asignar(2, 'Preparar informe', 'Yareli'),
    cambiar(3, 'Preparar informe', 'EN_PROGRESO'),
    consultar(4, 'Preparar informe'),
    listar(5),
  );

  assert.deepEqual(ast, esperado);
});

test('Parsea el ejemplo 2 con notificaciones, correo, fecha opcional y condicional', () => {
  const codigo = [
    'CREAR TAREA "Revisar PR"',
    'NOTIFICAR A "Angel" MENSAJE "Revisa la estructura del AST"',
    'ENVIAR CORREO A "diego@ejemplo.com" MENSAJE "Pruebas de consola listas"',
    'SI TAREA "Preparar informe" ESTA COMPLETADA ENTONCES NOTIFICAR A "Angel" MENSAJE "Informe finalizado"',
  ].join('\n');

  const { tokens } = tokenizar(codigo);
  const { ast, diagnosticos } = parsear(tokens);

  assert.equal(diagnosticos.length, 0);

  const esperado = programa(
    crear(1, 'Revisar PR', null),
    notificar(2, 'Angel', 'Revisa la estructura del AST'),
    correo(3, 'diego@ejemplo.com', 'Pruebas de consola listas'),
    si(4, 'Preparar informe', 'COMPLETADA', (c) => notificar(4, 'Angel', 'Informe finalizado', c)),
  );

  assert.deepEqual(ast, esperado);
});

test('Ignora líneas vacías y espacios extra al inicio y final del programa', () => {
  const codigo = '\n\n   LISTAR TAREAS   \n\n';
  const { tokens } = tokenizar(codigo);
  const { ast, diagnosticos } = parsear(tokens);

  assert.equal(diagnosticos.length, 0);
  assert.equal(ast.tipo, 'Programa');
  assert.equal(ast.instrucciones.length, 1);
  assert.equal(ast.instrucciones[0].tipo, 'ListarTareas');
  assert.deepEqual(ast.instrucciones[0].inicio, { linea: 3, columna: 4 });
  assert.deepEqual(ast.instrucciones[0].fin, { linea: 3, columna: 17 });
});

test('Programa vacío o solo con saltos de línea devuelve Programa sin instrucciones', () => {
  const { tokens } = tokenizar('\n\n');
  const { ast, diagnosticos } = parsear(tokens);

  assert.equal(diagnosticos.length, 0);
  assert.deepEqual(ast, {
    tipo: 'Programa',
    instrucciones: [],
    inicio: { linea: 1, columna: 1 },
    fin: { linea: 1, columna: 1 },
  });
});

test('Reporta ARGUMENTO_FALTANTE cuando una instrucción termina antes de tiempo', () => {
  const { tokens } = tokenizar('CREAR TAREA');
  const { ast, diagnosticos } = parsear(tokens);

  assert.equal(ast.instrucciones.length, 0);
  assert.equal(diagnosticos.length, 1);
  assert.equal(diagnosticos[0].etapa, 'sintactica');
  assert.equal(diagnosticos[0].codigo, 'ARGUMENTO_FALTANTE');
  assert.equal(diagnosticos[0].linea, 1);
  assert.equal(diagnosticos[0].columna, 12);
  assert.match(diagnosticos[0].mensaje, /CADENA/);
});

test('Reporta TOKEN_INESPERADO cuando el orden gramatical es incorrecto', () => {
  const { tokens } = tokenizar('ASIGNAR "Preparar informe" A "Yareli"');
  const { ast, diagnosticos } = parsear(tokens);

  assert.equal(ast.instrucciones.length, 0);
  assert.equal(diagnosticos.length, 1);
  assert.equal(diagnosticos[0].etapa, 'sintactica');
  assert.equal(diagnosticos[0].codigo, 'TOKEN_INESPERADO');
  assert.equal(diagnosticos[0].linea, 1);
  assert.equal(diagnosticos[0].columna, 9);
  assert.match(diagnosticos[0].mensaje, /TAREA/);
});

test('Rechaza texto sobrante al final de una instrucción válida', () => {
  const { tokens } = tokenizar('LISTAR TAREAS EXTRA');
  const { ast, diagnosticos } = parsear(tokens);

  assert.equal(ast.instrucciones.length, 0);
  assert.equal(diagnosticos.length, 1);
  assert.equal(diagnosticos[0].etapa, 'sintactica');
  assert.equal(diagnosticos[0].codigo, 'TOKEN_INESPERADO');
  assert.equal(diagnosticos[0].linea, 1);
  assert.equal(diagnosticos[0].columna, 15);
});

test('Rechaza condicionales anidados y comandos en minúsculas', () => {
  const codigo = [
    'SI TAREA "A" ESTA PENDIENTE ENTONCES SI TAREA "B" ESTA COMPLETADA ENTONCES LISTAR TAREAS',
    'crear tarea "Minúsculas"',
  ].join('\n');

  const { tokens } = tokenizar(codigo);
  const { ast, diagnosticos } = parsear(tokens);

  assert.equal(ast.instrucciones.length, 0);
  assert.equal(diagnosticos.length, 2);
  assert.equal(diagnosticos[0].etapa, 'sintactica');
  assert.equal(diagnosticos[0].codigo, 'TOKEN_INESPERADO');
  assert.equal(diagnosticos[0].linea, 1);
  assert.equal(diagnosticos[1].etapa, 'sintactica');
  assert.equal(diagnosticos[1].codigo, 'TOKEN_INESPERADO');
  assert.equal(diagnosticos[1].linea, 2);
  assert.equal(diagnosticos[1].columna, 1);
});

test('Recupera por línea: reporta todos los errores y conserva las instrucciones válidas', () => {
  const codigo = [
    'CREAR TAREA',
    'LISTAR TAREAS',
    'SI TAREA "X" ESTA PENDIENTE ENTONCES',
    'CONSULTAR TAREA "Cocina"',
  ].join('\n');

  const { tokens } = tokenizar(codigo);
  const { ast, diagnosticos } = parsear(tokens);

  assert.equal(diagnosticos.length, 2);
  assert.equal(diagnosticos[0].linea, 1);
  assert.equal(diagnosticos[0].codigo, 'ARGUMENTO_FALTANTE');
  assert.equal(diagnosticos[1].linea, 3);
  assert.equal(diagnosticos[1].codigo, 'ARGUMENTO_FALTANTE');

  assert.equal(ast.instrucciones.length, 2);
  assert.equal(ast.instrucciones[0].tipo, 'ListarTareas');
  assert.equal(ast.instrucciones[1].tipo, 'ConsultarTarea');
});

test('Integración: tokenizar -> parsear -> validarPrograma -> generarIR funciona de extremo a extremo', async () => {
  const codigo = [
    'CREAR TAREA "Preparar informe" FECHA "2026-11-15"',
    'ASIGNAR TAREA "Preparar informe" A "Yareli"',
    'CAMBIAR ESTADO TAREA "Preparar informe" A EN_PROGRESO',
    'SI TAREA "Preparar informe" ESTA EN_PROGRESO ENTONCES NOTIFICAR A "Angel" MENSAJE "En curso"',
  ].join('\n');

  const { tokens, diagnosticos: errLex } = tokenizar(codigo);
  assert.equal(errLex.length, 0);

  const { ast, diagnosticos: errSint } = parsear(tokens);
  assert.equal(errSint.length, 0);

  const repo = crearRepositorioEnMemoria({
    tareas: [],
    usuarios: [
      { id: 'u-1', nombre: 'Yareli', correo: 'yareli@ejemplo.com' },
      { id: 'u-2', nombre: 'Angel', correo: 'angel@ejemplo.com' },
    ],
  });
  const validacion = await validarPrograma(ast, repo);

  assert.equal(validacion.ok, true);
  assert.equal(validacion.diagnosticos.length, 0);

  const ir = generarIR(validacion.programa);
  assert.equal(ir.instrucciones.length > 0, true);
});
