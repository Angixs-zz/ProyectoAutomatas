// Pruebas de la validación semántica (#10).
// Los AST se arman a mano con la forma propuesta en #4 mientras no existe el parser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validarPrograma } from '../src/semantica/validador.js';
import { crearRepositorioEnMemoria, TAREAS_PRUEBA } from '../src/semantica/repositorio-memoria.js';

// --- Constructores de nodos. `c` es la columna donde empieza la instrucción. ---
const pos = (linea, columna) => ({ linea, columna });
const cadena = (valor, l, c) => ({ tipo: 'Cadena', valor, inicio: pos(l, c), fin: pos(l, c + valor.length + 2) });
const estado = (valor, l, c) => ({ tipo: 'Estado', valor, inicio: pos(l, c), fin: pos(l, c + valor.length) });
const nodo = (tipo, l, c, fin, campos) => ({ tipo, ...campos, inicio: pos(l, c), fin });

// CREAR TAREA "t" [FECHA "f"]
function crear(l, titulo, fecha = null, c = 1) {
  const t = cadena(titulo, l, c + 12);
  const f = fecha === null ? null : { ...cadena(fecha, l, t.fin.columna + 7), tipo: 'Fecha' };
  return nodo('CrearTarea', l, c, (f ?? t).fin, { titulo: t, fecha: f });
}
// ASIGNAR TAREA "t" A "u"
function asignar(l, tarea, usuario, c = 1) {
  const t = cadena(tarea, l, c + 14);
  const u = cadena(usuario, l, t.fin.columna + 3);
  return nodo('AsignarTarea', l, c, u.fin, { tarea: t, usuario: u });
}
// CAMBIAR ESTADO TAREA "t" A E
function cambiar(l, tarea, nuevo, c = 1) {
  const t = cadena(tarea, l, c + 21);
  const e = estado(nuevo, l, t.fin.columna + 3);
  return nodo('CambiarEstado', l, c, e.fin, { tarea: t, estado: e });
}
// CONSULTAR TAREA "t"
function consultar(l, tarea, c = 1) {
  const t = cadena(tarea, l, c + 16);
  return nodo('ConsultarTarea', l, c, t.fin, { tarea: t });
}
// LISTAR TAREAS
const listar = (l, c = 1) => nodo('ListarTareas', l, c, pos(l, c + 13), {});
// NOTIFICAR A "u" MENSAJE "m"
function notificar(l, usuario, mensaje, c = 1) {
  const u = cadena(usuario, l, c + 12);
  const m = cadena(mensaje, l, u.fin.columna + 9);
  return nodo('Notificar', l, c, m.fin, { usuario: u, mensaje: m });
}
// ENVIAR CORREO A "d" MENSAJE "m"
function correo(l, destinatario, mensaje, c = 1) {
  const d = cadena(destinatario, l, c + 16);
  const m = cadena(mensaje, l, d.fin.columna + 9);
  return nodo('EnviarCorreo', l, c, m.fin, { destinatario: d, mensaje: m });
}
// SI TAREA "t" ESTA E ENTONCES <accion>
function si(l, tarea, valorEstado, crearAccion) {
  const t = cadena(tarea, l, 10);
  const e = estado(valorEstado, l, t.fin.columna + 6);
  const accion = crearAccion(e.fin.columna + 10);
  return nodo('Condicional', l, 1, accion.fin, { tarea: t, estado: e, accion });
}
const programa = (...instrucciones) => ({
  tipo: 'Programa',
  instrucciones,
  inicio: pos(1, 1),
  fin: instrucciones.at(-1)?.fin ?? pos(1, 1),
});

const validar = (ast, repo = crearRepositorioEnMemoria()) => validarPrograma(ast, repo);
const codigos = (r) => r.diagnosticos.map((d) => [d.codigo, d.linea, d.columna]);

// --- Positivas ---

test('acepta el ejemplo 1 de la gramática y resuelve las referencias', async () => {
  const ast = programa(
    crear(1, 'Preparar reporte', '2026-11-15'),
    asignar(2, 'Preparar reporte', 'Yareli'),
    cambiar(3, 'Preparar reporte', 'EN_PROGRESO'),
    consultar(4, 'Preparar reporte'),
    listar(5),
  );
  const r = await validar(ast);
  assert.deepEqual(r.diagnosticos, []);
  assert.equal(r.ok, true);
  const [creada, asignada] = r.programa.instrucciones;
  assert.equal(creada.referencias.tarea.origen, 'programa');
  assert.equal(asignada.referencias.tarea, creada.referencias.tarea);
  assert.equal(asignada.referencias.usuario.id, 'user_1');
});

test('acepta el ejemplo 2 de la gramática: notificar, correo y condicional', async () => {
  const ast = programa(
    notificar(1, 'Angel', 'Revisa la estructura del AST'),
    correo(2, 'diego@ejemplo.com', 'Pruebas de consola listas'),
    si(3, 'Preparar informe', 'COMPLETADA', (c) => notificar(3, 'Angel', 'Informe finalizado', c)),
  );
  const r = await validar(ast);
  assert.equal(r.ok, true);
  const condicional = r.programa.instrucciones[2];
  assert.equal(condicional.referencias.tarea.id, 'task_1');
  assert.equal(condicional.accion.referencias.usuario.nombre, 'Angel');
});

test('acepta cambios de estado permitidos en cadena', async () => {
  const r = await validar(programa(
    cambiar(1, 'Preparar informe', 'EN_PROGRESO'),
    cambiar(2, 'Preparar informe', 'COMPLETADA'),
  ));
  assert.equal(r.ok, true);
});

// --- Negativas ---

test('una tarea que no existe se reporta en la columna del título y explica cómo corregirla', async () => {
  const r = await validar(programa(consultar(1, 'Informe')));
  assert.equal(r.ok, false);
  assert.equal(r.programa, null);
  assert.deepEqual(r.diagnosticos, [{
    etapa: 'semantica',
    codigo: 'TAREA_INEXISTENTE',
    mensaje: 'CONSULTAR TAREA: No existe la tarea «Informe». Revisa el título o créala antes con CREAR TAREA.',
    linea: 1,
    columna: 17,
  }]);
});

test('un usuario que no existe se reporta en la columna del nombre', async () => {
  const r = await validar(programa(asignar(1, 'Preparar informe', 'Pedro')));
  assert.deepEqual(codigos(r), [['USUARIO_INEXISTENTE', 1, 36]]);
});

test('una tarea con título repetido es ambigua', async () => {
  const repo = crearRepositorioEnMemoria({
    tareas: [...TAREAS_PRUEBA, { id: 'task_9', titulo: 'Preparar informe', estado: 'PENDIENTE', responsableId: null }],
  });
  const r = await validar(programa(consultar(1, 'Preparar informe')), repo);
  assert.deepEqual(codigos(r), [['TAREA_AMBIGUA', 1, 17]]);
});

test('una tarea completada no puede volver a otro estado', async () => {
  const r = await validar(programa(cambiar(1, 'Configurar Docker', 'PENDIENTE')));
  assert.deepEqual(codigos(r), [['TRANSICION_INVALIDA', 1, 44]]);
  assert.match(r.diagnosticos[0].mensaje, /no puede pasar de COMPLETADA a PENDIENTE/);
});

test('cambiar al mismo estado es una transición inválida', async () => {
  const r = await validar(programa(cambiar(1, 'Revisar gramática', 'EN_PROGRESO')));
  assert.deepEqual(codigos(r), [['TRANSICION_INVALIDA', 1, 44]]);
});

test('el estado que cambia dentro del programa se toma en cuenta', async () => {
  const r = await validar(programa(
    crear(1, 'Lavar trastes'),
    cambiar(2, 'Lavar trastes', 'COMPLETADA'),
    cambiar(3, 'Lavar trastes', 'EN_PROGRESO'),
  ));
  assert.deepEqual(codigos(r).map(([codigo, linea]) => [codigo, linea]), [['TRANSICION_INVALIDA', 3]]);
});

test('no se puede asignar una tarea completada o cancelada', async () => {
  const r = await validar(programa(asignar(1, 'Configurar Docker', 'Diego')));
  assert.deepEqual(codigos(r), [['OPERACION_NO_PERMITIDA', 1, 15]]);
});

test('un estado que no está en la lista es ESTADO_INVALIDO', async () => {
  const r = await validar(programa(cambiar(1, 'Preparar informe', 'TERMINADA')));
  assert.deepEqual(codigos(r), [['ESTADO_INVALIDO', 1, 43]]);
});

test('rechaza correo mal escrito, fecha inexistente y textos vacíos', async () => {
  const r = await validar(programa(
    correo(1, 'diego-ejemplo.com', 'Hola'),
    crear(2, 'Pagar luz', '2026-02-30'),
    notificar(3, 'Diego', '   '),
    crear(4, ''),
  ));
  assert.deepEqual(codigos(r), [
    ['CORREO_INVALIDO', 1, 17],
    ['FECHA_INVALIDA', 2, 31],
    ['TEXTO_VACIO', 3, 29],
    ['TEXTO_VACIO', 4, 13],
  ]);
});

test('reporta los errores de todas las instrucciones en orden', async () => {
  const r = await validar(programa(
    consultar(1, 'No existe'),
    listar(2),
    asignar(3, 'Preparar informe', 'Nadie'),
  ));
  assert.deepEqual(codigos(r).map(([, linea]) => linea), [1, 3]);
});

// --- Condiciones ---

test('la tarea de la condición tiene que existir', async () => {
  const r = await validar(programa(
    si(1, 'Informe', 'PENDIENTE', (c) => notificar(1, 'Yareli', 'Hola', c)),
  ));
  assert.deepEqual(codigos(r), [['TAREA_INEXISTENTE', 1, 10]]);
});

test('la acción del SI también se valida', async () => {
  const r = await validar(programa(
    si(1, 'Preparar informe', 'PENDIENTE', (c) => notificar(1, 'Pedro', 'Hola', c)),
  ));
  assert.equal(r.diagnosticos[0].codigo, 'USUARIO_INEXISTENTE');
  assert.match(r.diagnosticos[0].mensaje, /^NOTIFICAR:/);
});

test('la acción sobre la misma tarea se revisa con el estado de la condición', async () => {
  const valido = await validar(programa(
    si(1, 'Revisar gramática', 'EN_PROGRESO', (c) => cambiar(1, 'Revisar gramática', 'COMPLETADA', c)),
  ));
  assert.equal(valido.ok, true);

  const invalido = await validar(programa(
    si(1, 'Preparar informe', 'COMPLETADA', (c) => cambiar(1, 'Preparar informe', 'PENDIENTE', c)),
  ));
  assert.equal(invalido.diagnosticos[0].codigo, 'TRANSICION_INVALIDA');
  assert.match(invalido.diagnosticos[0].mensaje, /de COMPLETADA a PENDIENTE/);
});

test('después de un cambio dentro de un SI el estado ya no se conoce y no se marca error', async () => {
  // Si la condición se cumple, "Revisar gramática" queda COMPLETADA y la línea 2 fallaría al ejecutar.
  // La validación no lo sabe de antemano: lo revisa el ejecutor (#12).
  const r = await validar(programa(
    si(1, 'Configurar Docker', 'COMPLETADA', (c) => cambiar(1, 'Revisar gramática', 'COMPLETADA', c)),
    cambiar(2, 'Revisar gramática', 'PENDIENTE'),
  ));
  assert.equal(r.ok, true);
});

test('no se permite un SI dentro de otro SI', async () => {
  const r = await validar(programa(
    si(1, 'Preparar informe', 'PENDIENTE', (c) => ({
      ...si(1, 'Preparar informe', 'PENDIENTE', () => listar(1, c)),
      inicio: pos(1, c),
    })),
  ));
  assert.equal(r.diagnosticos[0].codigo, 'OPERACION_NO_PERMITIDA');
});

// --- Sin modificar datos ---

test('validar no modifica el repositorio ni el AST, y cada validación empieza de cero', async () => {
  const repo = crearRepositorioEnMemoria();
  const ast = programa(crear(1, 'Lavar trastes'), consultar(2, 'Lavar trastes'));
  const copia = structuredClone(ast);

  const primera = await validar(ast, repo);
  const segunda = await validar(ast, repo);

  assert.equal(primera.ok, true);
  assert.equal(segunda.ok, true); // la tarea declarada en la primera no se queda guardada
  assert.deepEqual(ast, copia);
  assert.equal((await repo.listarTareas()).length, TAREAS_PRUEBA.length);
});
