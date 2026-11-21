// Pruebas de los datos de ejemplo del tablero y el historial (#8).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ESTADOS_TABLERO, HISTORIAL_EJEMPLO, unirResponsables, agruparPorEstado, filtrarHistorial, cargarTablero } from '../tablero-ejemplos.js';

test('carga al menos tres tareas con su estado y el nombre de su responsable', async () => {
  const { tareas } = await cargarTablero({ espera: 0 });
  assert.ok(tareas.length >= 3);
  assert.deepEqual(tareas.map((t) => [t.titulo, t.estado, t.responsable]), [
    ['Preparar informe', 'PENDIENTE', 'Yareli'],
    ['Revisar gramática', 'EN_PROGRESO', 'Angel'],
    ['Configurar Docker', 'COMPLETADA', 'Edwin'],
  ]);
});

test('una tarea sin responsable o con un usuario desconocido queda como null', () => {
  const tareas = [{ id: 't1', responsableId: null }, { id: 't2', responsableId: 'user_99' }];
  assert.deepEqual(unirResponsables(tareas, [{ id: 'user_1', nombre: 'Yareli' }]).map((t) => t.responsable), [null, null]);
});

test('agrupa por estado y siempre devuelve las cuatro columnas', async () => {
  const { tareas } = await cargarTablero({ espera: 0 });
  const columnas = agruparPorEstado(tareas);
  assert.deepEqual(Object.keys(columnas), ESTADOS_TABLERO);
  assert.deepEqual(Object.values(columnas).map((lista) => lista.length), [1, 1, 1, 0]);
});

test('el historial va del más reciente al más antiguo y cada resultado corresponde a su tipo', () => {
  const fechas = HISTORIAL_EJEMPLO.map((h) => Date.parse(h.fecha));
  assert.deepEqual(fechas, [...fechas].sort((a, b) => b - a));
  for (const h of HISTORIAL_EJEMPLO) {
    const permitidos = h.tipo === 'operacion' ? ['exito', 'error'] : ['en_cola', 'enviado', 'fallido', 'incierto', 'no_procesado'];
    assert.ok(permitidos.includes(h.resultado), `${h.id}: ${h.resultado}`);
  }
});

test('filtra el historial por operaciones o por notificaciones y correos', () => {
  assert.equal(filtrarHistorial(HISTORIAL_EJEMPLO, 'todo').length, HISTORIAL_EJEMPLO.length);
  assert.ok(filtrarHistorial(HISTORIAL_EJEMPLO, 'operaciones').every((h) => h.tipo === 'operacion'));
  assert.deepEqual(filtrarHistorial(HISTORIAL_EJEMPLO, 'notificaciones').map((h) => h.tipo), ['notificacion', 'correo', 'notificacion', 'correo']);
});

test('puede devolver listas vacías o fallar para probar esos estados', async () => {
  assert.deepEqual(await cargarTablero({ vacio: true, espera: 0 }), { tareas: [], historial: [] });
  await assert.rejects(cargarTablero({ fallar: true, espera: 0 }), /No se pudo conectar/);
});
