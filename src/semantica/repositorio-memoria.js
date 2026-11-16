// Repositorio en memoria para pruebas y demostración · [S2 · SEM-1] #9
// Cumple el mismo contrato que debe tener el repositorio de PostgreSQL (#5):
//   listarTareas()   -> Promise<Array<{ id, titulo, estado, responsableId }>>
//   listarUsuarios() -> Promise<Array<{ id, nombre, correo }>>

export const USUARIOS_PRUEBA = [
  { id: 'user_1', nombre: 'Yareli', correo: 'yareli@ejemplo.com' },
  { id: 'user_2', nombre: 'Diego', correo: 'diego@ejemplo.com' },
  { id: 'user_3', nombre: 'Angel', correo: 'angel@ejemplo.com' },
  { id: 'user_4', nombre: 'Edwin', correo: 'edwin@ejemplo.com' },
  { id: 'user_5', nombre: 'Melody', correo: 'melody@ejemplo.com' },
  { id: 'user_6', nombre: 'Miguel Angel', correo: 'miguel@ejemplo.com' },
];

// Mismas tareas que usa la consola de ejemplo (consola-ejemplos.js).
export const TAREAS_PRUEBA = [
  { id: 'task_1', titulo: 'Preparar informe', estado: 'PENDIENTE', responsableId: 'user_1' },
  { id: 'task_2', titulo: 'Revisar gramática', estado: 'EN_PROGRESO', responsableId: 'user_3' },
  { id: 'task_3', titulo: 'Configurar Docker', estado: 'COMPLETADA', responsableId: 'user_4' },
];

export function crearRepositorioEnMemoria({ tareas = TAREAS_PRUEBA, usuarios = USUARIOS_PRUEBA } = {}) {
  const datosTareas = tareas.map((t) => ({ ...t }));
  const datosUsuarios = usuarios.map((u) => ({ ...u }));
  return {
    async listarTareas() {
      return datosTareas.map((t) => ({ ...t }));
    },
    async listarUsuarios() {
      return datosUsuarios.map((u) => ({ ...u }));
    },
  };
}
