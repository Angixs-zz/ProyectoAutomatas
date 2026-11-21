// Servicios simulados en memoria para probar el ejecutor (#12 EX-1).
// Implementan el contrato definido en docs/contrato-ir.md para tareas,
// notificaciones y correo SMTP sin depender de PostgreSQL ni Mailpit.

import { TAREAS_PRUEBA, USUARIOS_PRUEBA } from '../semantica/repositorio-memoria.js';

function clonarTarea(tarea) {
  return { ...tarea, fecha: tarea.fecha ?? null };
}

export function crearServiciosEnMemoria({
  tareas = TAREAS_PRUEBA,
  usuarios = USUARIOS_PRUEBA,
} = {}) {
  let datosTareas = tareas.map(clonarTarea);
  const datosUsuarios = usuarios.map((u) => ({ ...u }));
  const notificaciones = [];
  const correos = [];
  let siguienteTareaId = datosTareas.length + 1;
  let siguienteNotifId = 1;
  let siguienteCorreoId = 1;

  function crearRepositorio(estado) {
    return {
      async crearTarea({ titulo, fecha = null }) {
        const nueva = {
          id: `task_${siguienteTareaId++}`,
          titulo: String(titulo),
          estado: 'PENDIENTE',
          responsableId: null,
          fecha: fecha ?? null,
        };
        estado.push(nueva);
        return clonarTarea(nueva);
      },

      async asignarTarea({ tareaId, usuarioId }) {
        const encontrada = estado.find((t) => t.id === tareaId);
        if (!encontrada) return null;
        encontrada.responsableId = usuarioId;
        return clonarTarea(encontrada);
      },

      async cambiarEstado({ tareaId, estado: nuevoEstado }) {
        const encontrada = estado.find((t) => t.id === tareaId);
        if (!encontrada) return null;
        encontrada.estado = nuevoEstado;
        return clonarTarea(encontrada);
      },

      async consultarTarea({ tareaId }) {
        const encontrada = estado.find((t) => t.id === tareaId);
        return encontrada ? clonarTarea(encontrada) : null;
      },

      async listarTareas() {
        return estado.map(clonarTarea);
      },
    };
  }

  const repoDirecto = {
    async ejecutarEnTransaccion(callback) {
      const respaldo = datosTareas.map(clonarTarea);
      const respaldoSiguienteId = siguienteTareaId;
      const borrador = datosTareas.map(clonarTarea);
      try {
        const resultado = await callback(crearRepositorio(borrador));
        datosTareas = borrador;
        return resultado;
      } catch (error) {
        datosTareas = respaldo;
        siguienteTareaId = respaldoSiguienteId;
        throw error;
      }
    },
    crearTarea: (...args) => crearRepositorio(datosTareas).crearTarea(...args),
    asignarTarea: (...args) => crearRepositorio(datosTareas).asignarTarea(...args),
    cambiarEstado: (...args) => crearRepositorio(datosTareas).cambiarEstado(...args),
    consultarTarea: (...args) => crearRepositorio(datosTareas).consultarTarea(...args),
    listarTareas: (...args) => crearRepositorio(datosTareas).listarTareas(...args),
    async listarUsuarios() {
      return datosUsuarios.map((u) => ({ ...u }));
    },
  };

  return {
    tareas: repoDirecto,
    notificaciones: {
      async registrarNotificacion({ usuarioId, mensaje }) {
        const registro = {
          id: `notif_${siguienteNotifId++}`,
          usuarioId,
          mensaje,
          estado: 'en_cola',
        };
        notificaciones.push(registro);
        return { ...registro };
      },
    },
    correo: {
      async enviarCorreo({ destinatario, mensaje }) {
        const registro = {
          id: `mail_${siguienteCorreoId++}`,
          destinatario,
          mensaje,
          estado: 'en_cola',
        };
        correos.push(registro);
        return { aceptado: true, ...registro };
      },
    },
    obtenerEstado() {
      return {
        tareas: datosTareas.map(clonarTarea),
        usuarios: datosUsuarios.map((u) => ({ ...u })),
        notificaciones: notificaciones.map((n) => ({ ...n })),
        correos: correos.map((c) => ({ ...c })),
      };
    },
  };
}
