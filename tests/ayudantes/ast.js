// Constructores de nodos AST para pruebas, con la forma propuesta en #4.
// Calculan las columnas igual que el lexer (#3): una cadena empieza en su comilla
// de apertura y su fin es exclusivo. `c` es la columna donde empieza la instrucción.

export const pos = (linea, columna) => ({ linea, columna });
export const cadena = (valor, l, c) => ({ tipo: 'Cadena', valor, inicio: pos(l, c), fin: pos(l, c + valor.length + 2) });
export const estado = (valor, l, c) => ({ tipo: 'Estado', valor, inicio: pos(l, c), fin: pos(l, c + valor.length) });
const nodo = (tipo, l, c, fin, campos) => ({ tipo, ...campos, inicio: pos(l, c), fin });

// CREAR TAREA "t" [FECHA "f"]
export function crear(l, titulo, fecha = null, c = 1) {
  const t = cadena(titulo, l, c + 12);
  const f = fecha === null ? null : { ...cadena(fecha, l, t.fin.columna + 7), tipo: 'Fecha' };
  return nodo('CrearTarea', l, c, (f ?? t).fin, { titulo: t, fecha: f });
}

// ASIGNAR TAREA "t" A "u"
export function asignar(l, tarea, usuario, c = 1) {
  const t = cadena(tarea, l, c + 14);
  const u = cadena(usuario, l, t.fin.columna + 3);
  return nodo('AsignarTarea', l, c, u.fin, { tarea: t, usuario: u });
}

// CAMBIAR ESTADO TAREA "t" A E
export function cambiar(l, tarea, nuevo, c = 1) {
  const t = cadena(tarea, l, c + 21);
  const e = estado(nuevo, l, t.fin.columna + 3);
  return nodo('CambiarEstado', l, c, e.fin, { tarea: t, estado: e });
}

// CONSULTAR TAREA "t"
export function consultar(l, tarea, c = 1) {
  const t = cadena(tarea, l, c + 16);
  return nodo('ConsultarTarea', l, c, t.fin, { tarea: t });
}

// LISTAR TAREAS
export const listar = (l, c = 1) => nodo('ListarTareas', l, c, pos(l, c + 13), {});

// NOTIFICAR A "u" MENSAJE "m"
export function notificar(l, usuario, mensaje, c = 1) {
  const u = cadena(usuario, l, c + 12);
  const m = cadena(mensaje, l, u.fin.columna + 9);
  return nodo('Notificar', l, c, m.fin, { usuario: u, mensaje: m });
}

// ENVIAR CORREO A "d" MENSAJE "m"
export function correo(l, destinatario, mensaje, c = 1) {
  const d = cadena(destinatario, l, c + 16);
  const m = cadena(mensaje, l, d.fin.columna + 9);
  return nodo('EnviarCorreo', l, c, m.fin, { destinatario: d, mensaje: m });
}

// SI TAREA "t" ESTA E ENTONCES <accion>
export function si(l, tarea, valorEstado, crearAccion) {
  const t = cadena(tarea, l, 10);
  const e = estado(valorEstado, l, t.fin.columna + 6);
  const accion = crearAccion(e.fin.columna + 10);
  return nodo('Condicional', l, 1, accion.fin, { tarea: t, estado: e, accion });
}

export const programa = (...instrucciones) => ({
  tipo: 'Programa',
  instrucciones,
  inicio: pos(1, 1),
  fin: instrucciones.at(-1)?.fin ?? pos(1, 1),
});
