// Pruebas de integración entre lexer, semántica, IR y ejecutor.
// El parser (#4) todavía no existe, así que el AST se arma con los ayudantes
// compartidos. Así se verifica el contrato que el parser deberá respetar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenizar } from '../src/lenguaje.js';
import { validarPrograma } from '../src/semantica/validador.js';
import { generarIR } from '../src/ir/generador-ir.js';
import { ejecutarIR } from '../src/ejecutor/ejecutor.js';
import { crearServiciosEnMemoria } from '../src/ejecutor/servicios-memoria.js';
import { crearRepositorioEnMemoria } from '../src/semantica/repositorio-memoria.js';
import {
  programa, crear, asignar, cambiar, consultar, listar, notificar, correo, si,
} from './ayudantes/ast.js';

async function preparar(ast) {
  const validado = await validarPrograma(ast, crearRepositorioEnMemoria());
  assert.equal(validado.ok, true, JSON.stringify(validado.diagnosticos));
  return generarIR(validado.programa);
}

test('el lexer entrega tokens con la forma y los tipos que espera el parser', () => {
  const texto = [
    'CREAR TAREA "Preparar informe" FECHA "2026-11-15"',
    'CAMBIAR ESTADO TAREA "Preparar informe" A EN_PROGRESO',
  ].join('\n');

  const { tokens, diagnosticos } = tokenizar(texto);

  assert.deepEqual(diagnosticos, []);
  for (const token of tokens) {
    assert.equal(typeof token.tipo, 'string');
    assert.equal(typeof token.valor, 'string');
    assert.deepEqual(Object.keys(token.inicio).sort(), ['columna', 'linea']);
    assert.deepEqual(Object.keys(token.fin).sort(), ['columna', 'linea']);
    assert.ok(token.inicio.linea >= 1);
    assert.ok(token.inicio.columna >= 1);
  }

  assert.deepEqual(
    tokens.filter((t) => t.tipo === 'KW_CREAR' || t.tipo === 'KW_CAMBIAR').map((t) => t.valor),
    ['CREAR', 'CAMBIAR'],
  );
  assert.equal(tokens.find((t) => t.tipo === 'FECHA').valor, '2026-11-15');
  assert.equal(tokens.find((t) => t.tipo === 'ESTADO_VAL').valor, 'EN_PROGRESO');
});

test('un programa válido llega del AST a la ejecución con los mismos efectos', async () => {
  const ast = programa(
    crear(1, 'Preparar reporte', '2026-11-15'),
    asignar(2, 'Preparar reporte', 'Yareli'),
    si(3, 'Preparar reporte', 'PENDIENTE', (c) => notificar(3, 'Yareli', 'Nueva tarea asignada', c)),
    consultar(4, 'Preparar reporte'),
    listar(5),
  );
  const ir = await preparar(ast);
  const servicios = crearServiciosEnMemoria();

  const resultado = await ejecutarIR(ir, servicios);

  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.diagnosticos, []);
  assert.deepEqual(resultado.resultados.map((r) => r.operacion), [
    'crear', 'asignar', 'condicional', 'consultar', 'listar',
  ]);
  assert.equal(resultado.resultados[2].condicion, true);
  assert.equal(resultado.resultados[2].accion.operacion, 'notificar');
  assert.equal(resultado.resultados[3].tarea.responsableId, 'user_1');
  assert.equal(resultado.resultados[4].tareas.length, 4);

  const estado = servicios.obtenerEstado();
  assert.equal(estado.tareas.length, 4);
  assert.equal(estado.notificaciones.length, 1);
  assert.equal(estado.correos.length, 0);
});

test('un condicional falso generado por la IR no deja efectos ni correos', async () => {
  const ir = await preparar(programa(
    si(1, 'Preparar informe', 'COMPLETADA', (c) => correo(1, 'diego@ejemplo.com', 'No debe enviarse', c)),
  ));
  const servicios = crearServiciosEnMemoria();

  const resultado = await ejecutarIR(ir, servicios);

  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.resultados, [
    { linea: 1, operacion: 'condicional', condicion: false, accion: null },
  ]);
  assert.equal(servicios.obtenerEstado().correos.length, 0);
});

test('un fallo de transición detectado al ejecutar revierte la IR generada y explica el error', async () => {
  // La semántica deja el estado como desconocido tras el SI; el ejecutor debe
  // revalidar con el estado real y revertir también la notificación en cola.
  const ir = await preparar(programa(
    notificar(1, 'Yareli', 'No debe enviarse'),
    si(2, 'Preparar informe', 'PENDIENTE', (c) => cambiar(2, 'Preparar informe', 'COMPLETADA', c)),
    cambiar(3, 'Preparar informe', 'EN_PROGRESO'),
  ));
  const servicios = crearServiciosEnMemoria();

  const resultado = await ejecutarIR(ir, servicios);

  assert.equal(resultado.ok, false);
  assert.equal(resultado.diagnosticos[0].codigo, 'TRANSICION_INVALIDA');
  assert.match(resultado.diagnosticos[0].mensaje, /no puede pasar de COMPLETADA a EN_PROGRESO/);
  assert.equal(resultado.diagnosticos[0].linea, 3);

  const estado = servicios.obtenerEstado();
  assert.equal(estado.tareas[0].estado, 'PENDIENTE');
  assert.equal(estado.notificaciones.length, 0);
  assert.equal(estado.correos.length, 0);
});

test('una tarea creada bajo SI no se puede usar después ni llegar al generador de IR', async () => {
  const validado = await validarPrograma(programa(
    si(1, 'Preparar informe', 'PENDIENTE', (c) => crear(1, 'Tarea condicional', null, c)),
    consultar(2, 'Tarea condicional'),
  ), crearRepositorioEnMemoria());

  assert.equal(validado.ok, false);
  assert.equal(validado.programa, null);
  assert.equal(validado.diagnosticos[0].codigo, 'REFERENCIA_CONDICIONAL');
  assert.throws(() => generarIR(validado.programa), TypeError);
});
