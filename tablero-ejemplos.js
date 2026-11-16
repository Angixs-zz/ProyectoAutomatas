// Datos de EJEMPLO para el tablero de tareas y el historial (#8) mientras no existe la API (#5 y #6).
// Las tareas y los usuarios vienen del repositorio en memoria de Ángel (src/semantica/repositorio-memoria.js),
// con su mismo contrato: tareas { id, titulo, estado, responsableId } y usuarios { id, nombre, correo }.
// El historial sigue el borrador propuesto a Diego en #8; se ajusta cuando él lo confirme en #5.
// En #16 cargarTablero() se cambia por llamadas fetch() a la API real.
import { crearRepositorioEnMemoria } from './src/semantica/repositorio-memoria.js';

export const ESTADOS_TABLERO = ['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA'];

// Del más reciente al más antiguo. tipo: operacion | notificacion | correo.
export const HISTORIAL_EJEMPLO = [
  { id: 'hist_7', fecha: '2026-11-15T19:10:00-06:00', tipo: 'correo', operacion: 'enviar_correo', instruccion: 'ENVIAR CORREO A "angel@ejemplo.com" MENSAJE "Revisa la IR"', resultado: 'fallido', detalle: 'No se pudo conectar con el servidor de correo de prueba.' },
  { id: 'hist_6', fecha: '2026-11-15T19:05:00-06:00', tipo: 'notificacion', operacion: 'notificar', instruccion: 'NOTIFICAR A "Edwin" MENSAJE "Docker listo"', usuarioId: 'user_4', resultado: 'en_cola', detalle: 'Notificación para Edwin' },
  { id: 'hist_5', fecha: '2026-11-15T19:04:00-06:00', tipo: 'correo', operacion: 'enviar_correo', instruccion: 'ENVIAR CORREO A "diego@ejemplo.com" MENSAJE "Pruebas listas"', resultado: 'enviado', detalle: 'Correo de prueba para diego@ejemplo.com' },
  { id: 'hist_4', fecha: '2026-11-15T19:02:00-06:00', tipo: 'operacion', operacion: 'consultar', instruccion: 'CONSULTAR TAREA "Informe"', resultado: 'error', detalle: 'No existe la tarea «Informe».' },
  { id: 'hist_3', fecha: '2026-11-15T18:40:00-06:00', tipo: 'operacion', operacion: 'cambiar_estado', instruccion: 'CAMBIAR ESTADO TAREA "Configurar Docker" A COMPLETADA', tareaId: 'task_3', resultado: 'exito', detalle: 'Tarea «Configurar Docker» cambió a COMPLETADA' },
  { id: 'hist_2', fecha: '2026-11-15T18:35:00-06:00', tipo: 'operacion', operacion: 'asignar', instruccion: 'ASIGNAR TAREA "Revisar gramática" A "Angel"', tareaId: 'task_2', resultado: 'exito', detalle: 'Tarea «Revisar gramática» asignada a Angel' },
  { id: 'hist_1', fecha: '2026-11-15T18:30:00-06:00', tipo: 'operacion', operacion: 'crear', instruccion: 'CREAR TAREA "Preparar informe"', tareaId: 'task_1', resultado: 'exito', detalle: 'Tarea «Preparar informe» creada' },
];

// Agrega a cada tarea el nombre de su responsable (o null si no tiene o no se encuentra).
export function unirResponsables(tareas, usuarios) {
  const nombres = new Map(usuarios.map((u) => [u.id, u.nombre]));
  return tareas.map((t) => ({ ...t, responsable: nombres.get(t.responsableId) ?? null }));
}

// Reparte las tareas en una lista por estado. Siempre devuelve las cuatro columnas, aunque estén vacías.
export function agruparPorEstado(tareas) {
  const columnas = Object.fromEntries(ESTADOS_TABLERO.map((estado) => [estado, []]));
  for (const tarea of tareas) {
    if (columnas[tarea.estado]) columnas[tarea.estado].push(tarea);
  }
  return columnas;
}

// filtro: 'todo' | 'operaciones' | 'notificaciones' (las notificaciones incluyen los correos).
export function filtrarHistorial(historial, filtro = 'todo') {
  if (filtro === 'operaciones') return historial.filter((h) => h.tipo === 'operacion');
  if (filtro === 'notificaciones') return historial.filter((h) => h.tipo !== 'operacion');
  return historial;
}

// Imita la carga desde la API: tarda un poco, puede fallar a propósito o devolver listas vacías.
export function cargarTablero({ fallar = false, vacio = false, espera = 500 } = {}) {
  return new Promise((resolver, rechazar) => {
    setTimeout(async () => {
      if (fallar) {
        rechazar(new Error('No se pudo conectar con la API.'));
        return;
      }
      if (vacio) {
        resolver({ tareas: [], historial: [] });
        return;
      }
      const repositorio = crearRepositorioEnMemoria();
      const [tareas, usuarios] = await Promise.all([repositorio.listarTareas(), repositorio.listarUsuarios()]);
      resolver({ tareas: unirResponsables(tareas, usuarios), historial: HISTORIAL_EJEMPLO.map((h) => ({ ...h })) });
    }, espera);
  });
}
