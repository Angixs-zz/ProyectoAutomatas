// Pruebas de la generación de IR (#11).
// Cada prueba arma un AST, lo valida con la semántica (#10) y traduce el resultado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generarIR, describirIR } from '../src/ir/generador-ir.js';
import { validarPrograma } from '../src/semantica/validador.js';
import { crearRepositorioEnMemoria } from '../src/semantica/repositorio-memoria.js';
import { programa, crear, asignar, cambiar, consultar, listar, notificar, correo, si } from './ayudantes/ast.js';

async function irDe(...instrucciones) {
  const validado = await validarPrograma(programa(...instrucciones), crearRepositorioEnMemoria());
  assert.deepEqual(validado.diagnosticos, [], 'el programa de prueba debe ser válido');
  return generarIR(validado.programa);
}

const yareli = { id: 'user_1', nombre: 'Yareli', correo: 'yareli@ejemplo.com' };
const informe = { tipo: 'id', id: 'task_1', titulo: 'Preparar informe' };

// --- Un ejemplo por tipo de comando ---

test('CREAR TAREA genera CREAR_TAREA con fecha y un temporal', async () => {
  const ir = await irDe(crear(1, 'Lavar trastes', '2026-11-20'), crear(2, 'Sacar basura'));
  assert.deepEqual(ir.instrucciones, [
    { op: 'CREAR_TAREA', titulo: 'Lavar trastes', fecha: '2026-11-20', salidaRef: 'tmp_1', linea: 1, columna: 1 },
    { op: 'CREAR_TAREA', titulo: 'Sacar basura', fecha: null, salidaRef: 'tmp_2', linea: 2, columna: 1 },
  ]);
});

test('ASIGNAR TAREA sobre una tarea existente usa su id y los datos del usuario', async () => {
  const ir = await irDe(asignar(1, 'Preparar informe', 'Yareli'));
  assert.deepEqual(ir.instrucciones, [
    { op: 'ASIGNAR_TAREA', tarea: informe, usuario: yareli, linea: 1, columna: 1 },
  ]);
});

test('CAMBIAR ESTADO genera CAMBIAR_ESTADO con el estado nuevo', async () => {
  const ir = await irDe(cambiar(1, 'Preparar informe', 'EN_PROGRESO'));
  assert.deepEqual(ir.instrucciones, [
    { op: 'CAMBIAR_ESTADO', tarea: informe, estado: 'EN_PROGRESO', linea: 1, columna: 1 },
  ]);
});

test('CONSULTAR TAREA y LISTAR TAREAS', async () => {
  const ir = await irDe(consultar(1, 'Preparar informe'), listar(2));
  assert.deepEqual(ir.instrucciones, [
    { op: 'CONSULTAR_TAREA', tarea: informe, linea: 1, columna: 1 },
    { op: 'LISTAR_TAREAS', linea: 2, columna: 1 },
  ]);
});

test('NOTIFICAR y ENVIAR CORREO', async () => {
  const ir = await irDe(
    notificar(1, 'Yareli', 'Revisa el AST'),
    correo(2, 'diego@ejemplo.com', 'Pruebas listas'),
  );
  assert.deepEqual(ir.instrucciones, [
    { op: 'NOTIFICAR', usuario: yareli, mensaje: 'Revisa el AST', linea: 1, columna: 1 },
    { op: 'ENVIAR_CORREO', destinatario: 'diego@ejemplo.com', mensaje: 'Pruebas listas', linea: 2, columna: 1 },
  ]);
});

test('una tarea creada en el programa se usa después por su temporal', async () => {
  const ir = await irDe(
    crear(1, 'Lavar trastes'),
    asignar(2, 'Lavar trastes', 'Yareli'),
    cambiar(3, 'Lavar trastes', 'EN_PROGRESO'),
  );
  const temporal = { tipo: 'temporal', ref: 'tmp_1', titulo: 'Lavar trastes' };
  assert.deepEqual(ir.instrucciones[1].tarea, temporal);
  assert.deepEqual(ir.instrucciones[2].tarea, temporal);
});

// --- Secuencias con condición ---

test('traduce el ejemplo completo de docs/contrato-ir.md', async () => {
  const ir = await irDe(
    crear(1, 'Preparar reporte', '2026-11-15'),
    asignar(2, 'Preparar reporte', 'Yareli'),
    si(3, 'Preparar reporte', 'PENDIENTE', (c) => notificar(3, 'Yareli', 'Nueva tarea asignada', c)),
  );
  const reporte = { tipo: 'temporal', ref: 'tmp_1', titulo: 'Preparar reporte' };
  assert.deepEqual(ir, {
    tipo: 'ProgramaIR',
    version: 1,
    instrucciones: [
      { op: 'CREAR_TAREA', titulo: 'Preparar reporte', fecha: '2026-11-15', salidaRef: 'tmp_1', linea: 1, columna: 1 },
      { op: 'ASIGNAR_TAREA', tarea: reporte, usuario: yareli, linea: 2, columna: 1 },
      { op: 'EVALUAR_ESTADO', tarea: reporte, estadoEsperado: 'PENDIENTE', destinoTemp: 'cond_1', linea: 3, columna: 1 },
      { op: 'SALTAR_SI_FALSO', condicion: 'cond_1', etiqueta: 'fin_si_1', linea: 3, columna: 1 },
      // La acción empieza en la columna 53: «SI TAREA "Preparar reporte" ESTA PENDIENTE ENTONCES » mide 52.
      { op: 'NOTIFICAR', usuario: yareli, mensaje: 'Nueva tarea asignada', linea: 3, columna: 53, condicional: { temp: 'cond_1', linea: 3 } },
      { op: 'ETIQUETA', nombre: 'fin_si_1' },
    ],
    metadatos: { totalInstruccionesOriginales: 6, optimizacionesAplicadas: [] },
  });
});

test('cada SI tiene su propio temporal de condición y su propia etiqueta', async () => {
  const ir = await irDe(
    si(1, 'Preparar informe', 'PENDIENTE', (c) => cambiar(1, 'Preparar informe', 'EN_PROGRESO', c)),
    si(2, 'Configurar Docker', 'COMPLETADA', (c) => correo(2, 'edwin@ejemplo.com', 'Docker listo', c)),
  );
  assert.deepEqual(ir.instrucciones.map((i) => i.op), [
    'EVALUAR_ESTADO', 'SALTAR_SI_FALSO', 'CAMBIAR_ESTADO', 'ETIQUETA',
    'EVALUAR_ESTADO', 'SALTAR_SI_FALSO', 'ENVIAR_CORREO', 'ETIQUETA',
  ]);
  assert.deepEqual(
    ir.instrucciones.filter((i) => i.op === 'SALTAR_SI_FALSO').map((i) => [i.condicion, i.etiqueta]),
    [['cond_1', 'fin_si_1'], ['cond_2', 'fin_si_2']],
  );
  assert.deepEqual(ir.instrucciones[6].condicional, { temp: 'cond_2', linea: 2 });
});

test('un CREAR TAREA dentro de un SI también recibe su temporal', async () => {
  const ir = await irDe(
    si(1, 'Preparar informe', 'PENDIENTE', (c) => crear(1, 'Revisar informe', null, c)),
  );
  assert.deepEqual(ir.instrucciones[2], {
    op: 'CREAR_TAREA', titulo: 'Revisar informe', fecha: null, salidaRef: 'tmp_1', linea: 1, columna: 53,
    condicional: { temp: 'cond_1', linea: 1 },
  });
});

// --- Sin efectos externos ---

test('la IR es de solo datos: se puede pasar a JSON y regresar igual', async () => {
  const ir = await irDe(
    crear(1, 'Lavar trastes'),
    si(2, 'Lavar trastes', 'PENDIENTE', (c) => notificar(2, 'Yareli', 'Hay trastes', c)),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(ir)), ir);
});

test('generar no modifica el programa y siempre da la misma IR', async () => {
  const validado = await validarPrograma(
    programa(crear(1, 'Lavar trastes'), asignar(2, 'Lavar trastes', 'Diego')),
    crearRepositorioEnMemoria(),
  );
  const antes = JSON.stringify(validado.programa);
  const primera = generarIR(validado.programa);
  const segunda = generarIR(validado.programa);
  assert.equal(JSON.stringify(validado.programa), antes);
  assert.deepEqual(primera, segunda);
});

test('rechaza un programa sin validar', async () => {
  assert.throws(() => generarIR(null), TypeError);
  assert.throws(() => generarIR(programa(consultar(1, 'Preparar informe'))), /referencias\.tarea/);
  const fallido = await validarPrograma(programa(consultar(1, 'No existe')), crearRepositorioEnMemoria());
  assert.throws(() => generarIR(fallido.programa), TypeError);
});

// --- Inspección ---

test('describirIR muestra la IR como texto para revisarla', async () => {
  const ir = await irDe(
    crear(1, 'Preparar reporte', '2026-11-15'),
    asignar(2, 'Preparar reporte', 'Yareli'),
    si(3, 'Preparar reporte', 'PENDIENTE', (c) => notificar(3, 'Yareli', 'Nueva tarea asignada', c)),
  );
  assert.equal(describirIR(ir), [
    ' 1  CREAR_TAREA     "Preparar reporte" fecha 2026-11-15 -> tmp_1  ; línea 1',
    ' 2  ASIGNAR_TAREA   tmp_1 "Preparar reporte" a user_1 (Yareli)  ; línea 2',
    ' 3  EVALUAR_ESTADO  tmp_1 "Preparar reporte" == PENDIENTE -> cond_1  ; línea 3',
    ' 4  SALTAR_SI_FALSO cond_1 -> fin_si_1  ; línea 3',
    ' 5  NOTIFICAR       user_1 (Yareli) "Nueva tarea asignada"  [si cond_1]  ; línea 3',
    ' 6  fin_si_1:',
  ].join('\n'));
});
