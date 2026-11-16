// Pruebas de la tabla de símbolos (#9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearTablaSimbolos, TablaSimbolos } from '../src/semantica/tabla-simbolos.js';
import { crearRepositorioEnMemoria, TAREAS_PRUEBA } from '../src/semantica/repositorio-memoria.js';

const tablaDePrueba = () => crearTablaSimbolos(crearRepositorioEnMemoria());

test('resuelve una tarea existente con su estado, tipo y operaciones', async () => {
  const tabla = await tablaDePrueba();
  const { ok, simbolo } = tabla.resolverTarea('Configurar Docker');
  assert.equal(ok, true);
  assert.equal(simbolo.tipo, 'tarea');
  assert.equal(simbolo.id, 'task_3');
  assert.equal(simbolo.estado, 'COMPLETADA');
  assert.equal(simbolo.responsableId, 'user_4');
  assert.equal(simbolo.origen, 'repositorio');
  assert.ok(simbolo.operaciones.includes('cambiar_estado'));
});

test('resuelve un usuario existente', async () => {
  const tabla = await tablaDePrueba();
  const { ok, simbolo } = tabla.resolverUsuario('Yareli');
  assert.equal(ok, true);
  assert.deepEqual([simbolo.tipo, simbolo.id, simbolo.correo], ['usuario', 'user_1', 'yareli@ejemplo.com']);
  assert.ok(simbolo.operaciones.includes('notificar'));
});

test('una tarea desconocida da TAREA_INEXISTENTE con su ubicación', async () => {
  const tabla = await tablaDePrueba();
  const resultado = tabla.resolverTarea('Informe', { linea: 1, columna: 17 });
  assert.equal(resultado.ok, false);
  assert.deepEqual(resultado.candidatos, []);
  assert.deepEqual(resultado.diagnostico, {
    etapa: 'semantica',
    codigo: 'TAREA_INEXISTENTE',
    mensaje: 'No existe la tarea «Informe».',
    linea: 1,
    columna: 17,
  });
});

test('un usuario desconocido da USUARIO_INEXISTENTE', async () => {
  const tabla = await tablaDePrueba();
  const { ok, diagnostico } = tabla.resolverUsuario('Pedro', { linea: 2, columna: 35 });
  assert.equal(ok, false);
  assert.deepEqual([diagnostico.codigo, diagnostico.linea, diagnostico.columna], ['USUARIO_INEXISTENTE', 2, 35]);
});

test('sin ubicación, el diagnóstico lleva línea y columna en null', async () => {
  const tabla = await tablaDePrueba();
  const { diagnostico } = tabla.resolverTarea('No existe');
  assert.deepEqual([diagnostico.linea, diagnostico.columna], [null, null]);
});

test('la comparación es exacta: mayúsculas y acentos cuentan', async () => {
  const tabla = await tablaDePrueba();
  assert.equal(tabla.resolverTarea('preparar informe').ok, false);
  assert.equal(tabla.resolverTarea('Revisar gramatica').ok, false);
  assert.equal(tabla.resolverTarea('Revisar gramática').ok, true);
});

test('dos tareas con el mismo título dan TAREA_AMBIGUA y no se elige ninguna', async () => {
  const repo = crearRepositorioEnMemoria({
    tareas: [
      { id: 'task_1', titulo: 'Lavar trastes', estado: 'PENDIENTE', responsableId: null },
      { id: 'task_2', titulo: 'Lavar trastes', estado: 'COMPLETADA', responsableId: null },
    ],
  });
  const tabla = await crearTablaSimbolos(repo);
  const resultado = tabla.resolverTarea('Lavar trastes', { linea: 3, columna: 16 });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.simbolo, undefined);
  assert.equal(resultado.diagnostico.codigo, 'TAREA_AMBIGUA');
  assert.deepEqual(resultado.candidatos.map((s) => s.id), ['task_1', 'task_2']);
});

test('dos usuarios con el mismo nombre dan USUARIO_AMBIGUO', async () => {
  const repo = crearRepositorioEnMemoria({
    usuarios: [
      { id: 'user_1', nombre: 'Angel', correo: 'a@ejemplo.com' },
      { id: 'user_2', nombre: 'Angel', correo: 'b@ejemplo.com' },
    ],
  });
  const tabla = await crearTablaSimbolos(repo);
  const resultado = tabla.resolverUsuario('Angel');
  assert.equal(resultado.diagnostico.codigo, 'USUARIO_AMBIGUO');
  assert.equal(resultado.candidatos.length, 2);
});

test('busca tareas y usuarios por id', async () => {
  const tabla = await tablaDePrueba();
  assert.equal(tabla.buscarTareaPorId('task_2').titulo, 'Revisar gramática');
  assert.equal(tabla.buscarUsuarioPorId('user_6').nombre, 'Miguel Angel');
  assert.equal(tabla.buscarTareaPorId('task_99'), null);
  assert.equal(tabla.buscarUsuarioPorId('user_99'), null);
});

test('una tarea creada en el programa se puede usar después sin escribir en el repositorio', async () => {
  const repo = crearRepositorioEnMemoria();
  const tabla = await crearTablaSimbolos(repo);
  assert.equal(tabla.resolverTarea('Lavar trastes').ok, false);

  const declarada = tabla.declararTarea('Lavar trastes', { linea: 1, columna: 13 });
  const { ok, simbolo } = tabla.resolverTarea('Lavar trastes', { linea: 2, columna: 15 });
  assert.equal(ok, true);
  assert.equal(simbolo, declarada);
  assert.deepEqual([simbolo.id, simbolo.estado, simbolo.origen], [null, 'PENDIENTE', 'programa']);
  assert.deepEqual(simbolo.declaradaEn, { linea: 1, columna: 13 });

  const tareasGuardadas = await repo.listarTareas();
  assert.equal(tareasGuardadas.length, TAREAS_PRUEBA.length);
});

test('crear en el programa una tarea con un título que ya existe la vuelve ambigua', async () => {
  const tabla = await tablaDePrueba();
  tabla.declararTarea('Preparar informe');
  assert.equal(tabla.resolverTarea('Preparar informe').diagnostico.codigo, 'TAREA_AMBIGUA');
});

test('la tabla acepta cualquier repositorio con el mismo contrato y lo lee una sola vez', async () => {
  let lecturas = 0;
  const repoFalso = {
    async listarTareas() {
      lecturas++;
      return [{ id: 't-10', titulo: 'Sacar basura', estado: 'CANCELADA', responsableId: 'u-1' }];
    },
    async listarUsuarios() {
      lecturas++;
      return [{ id: 'u-1', nombre: 'Diego', correo: null }];
    },
  };
  const tabla = await crearTablaSimbolos(repoFalso);
  tabla.resolverTarea('Sacar basura');
  tabla.resolverTarea('Sacar basura');
  tabla.resolverUsuario('Diego');
  assert.equal(lecturas, 2);
  assert.equal(tabla.resolverTarea('Sacar basura').simbolo.estado, 'CANCELADA');
});

test('los símbolos son de solo lectura', () => {
  const tabla = new TablaSimbolos([{ id: 'task_1', titulo: 'Preparar informe', estado: 'PENDIENTE' }], []);
  const { simbolo } = tabla.resolverTarea('Preparar informe');
  assert.throws(() => { simbolo.estado = 'COMPLETADA'; }, TypeError);
  assert.equal(tabla.resolverTarea('Preparar informe').simbolo.estado, 'PENDIENTE');
});
