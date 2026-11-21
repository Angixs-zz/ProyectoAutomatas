// Repositorios PostgreSQL para AutoTask · [S2 · BE-1] #5
// Respeta el contrato de docs/tabla-simbolos.md y docs/contrato-ir.md.

function tareaDesdeFila(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    titulo: fila.titulo,
    estado: fila.estado,
    responsableId: fila.responsable_id ?? null,
    fecha: fila.fecha == null ? null : String(fila.fecha).slice(0, 10),
  };
}

function usuarioDesdeFila(fila) {
  if (!fila) return null;
  return { id: fila.id, nombre: fila.nombre, correo: fila.correo ?? null };
}

function crearAcceso(queryable) {
  return {
    async listarTareas() {
      const { rows } = await queryable.query(
        `SELECT id, titulo, estado, responsable_id, fecha
           FROM tareas
          ORDER BY id`,
      );
      return rows.map(tareaDesdeFila);
    },

    async listarUsuarios() {
      const { rows } = await queryable.query(
        'SELECT id, nombre, correo FROM usuarios ORDER BY id',
      );
      return rows.map(usuarioDesdeFila);
    },

    async crearUsuario({ nombre, correo = null }) {
      const { rows } = await queryable.query(
        `INSERT INTO usuarios (nombre, correo)
         VALUES ($1, $2)
         RETURNING id, nombre, correo`,
        [String(nombre), correo],
      );
      return usuarioDesdeFila(rows[0]);
    },

    async crearTarea({ titulo, fecha = null }) {
      const { rows } = await queryable.query(
        `INSERT INTO tareas (titulo, fecha)
         VALUES ($1, $2)
         RETURNING id, titulo, estado, responsable_id, fecha`,
        [String(titulo), fecha],
      );
      const creada = tareaDesdeFila(rows[0]);
      await queryable.query(
        `INSERT INTO historial_tareas (tarea_id, tipo, valor_nuevo)
         VALUES ($1, 'CREADA', $2::jsonb)`,
        [creada.id, JSON.stringify({ titulo: creada.titulo, estado: creada.estado, fecha: creada.fecha })],
      );
      return creada;
    },

    async asignarTarea({ tareaId, usuarioId }) {
      const anterior = await queryable.query(
        'SELECT responsable_id FROM tareas WHERE id = $1 FOR UPDATE',
        [tareaId],
      );
      if (!anterior.rowCount) return null;
      const { rows } = await queryable.query(
        `UPDATE tareas
            SET responsable_id = $2, actualizada_en = now()
          WHERE id = $1
          RETURNING id, titulo, estado, responsable_id, fecha`,
        [tareaId, usuarioId],
      );
      const actualizada = tareaDesdeFila(rows[0]);
      await queryable.query(
        `INSERT INTO historial_tareas (tarea_id, tipo, valor_anterior, valor_nuevo)
         VALUES ($1, 'ASIGNADA', $2::jsonb, $3::jsonb)`,
        [tareaId, JSON.stringify({ responsableId: anterior.rows[0].responsable_id }), JSON.stringify({ responsableId: usuarioId })],
      );
      return actualizada;
    },

    async cambiarEstado({ tareaId, estado }) {
      const anterior = await queryable.query(
        'SELECT estado FROM tareas WHERE id = $1 FOR UPDATE',
        [tareaId],
      );
      if (!anterior.rowCount) return null;
      const { rows } = await queryable.query(
        `UPDATE tareas
            SET estado = $2, actualizada_en = now()
          WHERE id = $1
          RETURNING id, titulo, estado, responsable_id, fecha`,
        [tareaId, estado],
      );
      const actualizada = tareaDesdeFila(rows[0]);
      await queryable.query(
        `INSERT INTO historial_tareas (tarea_id, tipo, valor_anterior, valor_nuevo)
         VALUES ($1, 'ESTADO_CAMBIADO', $2::jsonb, $3::jsonb)`,
        [tareaId, JSON.stringify({ estado: anterior.rows[0].estado }), JSON.stringify({ estado })],
      );
      return actualizada;
    },

    async consultarTarea({ tareaId }) {
      const { rows } = await queryable.query(
        `SELECT id, titulo, estado, responsable_id, fecha
           FROM tareas WHERE id = $1`,
        [tareaId],
      );
      return tareaDesdeFila(rows[0]);
    },

    async listarHistorial({ tareaId = null, limite = 100 } = {}) {
      const { rows } = await queryable.query(
        `SELECT id, tarea_id, actor_usuario_id, tipo, valor_anterior, valor_nuevo, creado_en
           FROM historial_tareas
          WHERE ($1::text IS NULL OR tarea_id = $1)
          ORDER BY creado_en DESC, id DESC
          LIMIT $2`,
        [tareaId, Math.max(1, Math.min(Number(limite) || 100, 500))],
      );
      return rows.map((fila) => ({
        id: fila.id,
        tareaId: fila.tarea_id,
        actorUsuarioId: fila.actor_usuario_id,
        tipo: fila.tipo,
        valorAnterior: fila.valor_anterior,
        valorNuevo: fila.valor_nuevo,
        creadoEn: fila.creado_en,
      }));
    },

    async registrarNotificacion({ usuarioId, mensaje }) {
      const { rows } = await queryable.query(
        `INSERT INTO notificaciones (usuario_id, mensaje)
         VALUES ($1, $2)
         RETURNING id, usuario_id, mensaje, estado, creado_en`,
        [usuarioId, String(mensaje)],
      );
      const fila = rows[0];
      return {
        id: String(fila.id),
        usuarioId: fila.usuario_id,
        mensaje: fila.mensaje,
        estado: fila.estado,
        creadoEn: fila.creado_en,
      };
    },
  };
}

async function enTransaccion(pool, callback) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await callback(crearAcceso(cliente));
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    try {
      await cliente.query('ROLLBACK');
    } catch {
      // Conserva el error original; el pool descartará clientes rotos.
    }
    throw error;
  } finally {
    cliente.release();
  }
}

export function crearRepositorioPostgres(pool) {
  if (!pool?.query || !pool?.connect) {
    throw new TypeError('Se requiere un pool compatible con node-postgres.');
  }
  const lectura = crearAcceso(pool);
  const escribir = (metodo) => (...args) => enTransaccion(pool, (tx) => tx[metodo](...args));

  const tareas = {
    ejecutarEnTransaccion: (callback) => enTransaccion(pool, callback),
    crearTarea: escribir('crearTarea'),
    asignarTarea: escribir('asignarTarea'),
    cambiarEstado: escribir('cambiarEstado'),
    consultarTarea: (...args) => lectura.consultarTarea(...args),
    listarTareas: (...args) => lectura.listarTareas(...args),
  };

  return {
    listarTareas: lectura.listarTareas,
    listarUsuarios: lectura.listarUsuarios,
    crearUsuario: escribir('crearUsuario'),
    listarHistorial: lectura.listarHistorial,
    tareas,
    notificaciones: { registrarNotificacion: escribir('registrarNotificacion') },
    cerrar: () => pool.end(),
  };
}
