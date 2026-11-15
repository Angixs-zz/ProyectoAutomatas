// Pruebas de las respuestas de ejemplo de la consola (#7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { EJEMPLOS, simularRespuesta, enviarPrograma } from '../consola-ejemplos.js';

function primerDiagnostico(texto) {
  const respuesta = simularRespuesta(texto, 'validacion');
  assert.equal(respuesta.ok, false);
  assert.deepEqual(respuesta.resultados, []);
  const { etapa, codigo, linea, columna } = respuesta.diagnosticos[0];
  return { etapa, codigo, linea, columna };
}

test('los casos inválidos de la gramática dan la etapa, el código y la ubicación esperados', () => {
  assert.deepEqual(primerDiagnostico('CREAR TAREA'), { etapa: 'sintactica', codigo: 'ARGUMENTO_FALTANTE', linea: 1, columna: 12 });
  assert.deepEqual(primerDiagnostico('CREAR TAREA "Limpiar cocina'), { etapa: 'lexica', codigo: 'CADENA_SIN_CERRAR', linea: 1, columna: 13 });
  assert.deepEqual(primerDiagnostico('LISTAR TAREAS @'), { etapa: 'lexica', codigo: 'CARACTER_INVALIDO', linea: 1, columna: 15 });
  assert.deepEqual(primerDiagnostico('ASIGNAR "Preparar informe" A "Yareli"'), { etapa: 'sintactica', codigo: 'TOKEN_INESPERADO', linea: 1, columna: 9 });
});

test('una tarea que no existe es un error semántico', () => {
  assert.deepEqual(primerDiagnostico('CONSULTAR TAREA "Informe"'), { etapa: 'semantica', codigo: 'TAREA_INEXISTENTE', linea: 1, columna: 17 });
});

test('reporta los errores de todas las líneas, no solo el primero', () => {
  const respuesta = simularRespuesta('CREAR TAREA\nLISTAR TAREAS\nLISTAR TAREAS @', 'validacion');
  assert.deepEqual(respuesta.diagnosticos.map((d) => d.linea), [1, 3]);
});

test('validar un programa correcto no devuelve resultados ni cambia nada', () => {
  const respuesta = simularRespuesta(EJEMPLOS[0].texto, 'validacion');
  assert.deepEqual(respuesta, { ok: true, modo: 'validacion', resultados: [], diagnosticos: [] });
});

test('ejecutar devuelve un resultado por instrucción con su línea', () => {
  const respuesta = simularRespuesta(EJEMPLOS[0].texto, 'ejecucion');
  assert.equal(respuesta.ok, true);
  assert.deepEqual(respuesta.resultados.map((r) => [r.linea, r.operacion]), [[1, 'crear'], [2, 'asignar'], [3, 'cambiar_estado'], [4, 'listar']]);
  const creada = respuesta.resultados[3].tareas.find((t) => t.titulo === 'Lavar trastes');
  assert.deepEqual([creada.estado, creada.responsable], ['EN_PROGRESO', 'Yareli']);
});

test('el condicional solo ejecuta su acción si la condición es verdadera', () => {
  const verdadera = simularRespuesta('SI TAREA "Configurar Docker" ESTA COMPLETADA ENTONCES NOTIFICAR A "Edwin" MENSAJE "Listo"', 'ejecucion');
  assert.equal(verdadera.resultados[0].condicion, true);
  assert.equal(verdadera.resultados[0].accion.operacion, 'notificar');
  const falsa = simularRespuesta('SI TAREA "Preparar informe" ESTA COMPLETADA ENTONCES NOTIFICAR A "Yareli" MENSAJE "Listo"', 'ejecucion');
  assert.deepEqual([falsa.resultados[0].condicion, falsa.resultados[0].accion], [false, null]);
});

test('todos los ejemplos de la consola dan la respuesta que anuncia su nombre', () => {
  for (const ejemplo of EJEMPLOS) {
    const respuesta = simularRespuesta(ejemplo.texto, 'ejecucion');
    assert.equal(respuesta.ok, !ejemplo.nombre.startsWith('Error'), ejemplo.nombre);
  }
});

test('la API simulada puede fallar para probar el error de carga', async () => {
  await assert.rejects(enviarPrograma('LISTAR TAREAS', 'ejecucion', { fallar: true, espera: 0 }), /No se pudo conectar/);
  const respuesta = await enviarPrograma('LISTAR TAREAS', 'ejecucion', { espera: 0 });
  assert.equal(respuesta.resultados[0].tareas.length, 3);
});
