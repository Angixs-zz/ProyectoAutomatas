// Repositorios PostgreSQL para AutoTask · [S2 · BE-1] #5
// Respeta el contrato de docs/tabla-simbolos.md y docs/contrato-ir.md.

const TIPO_A_OPERACION = {
  CREADA: 'crear',
  ASIGNADA: 'asignar',
  ESTADO_CAMBIADO: 'cambiar_estado',
  CONSULTADA: 'consultar',
  LISTADA: 'listar',
  NOTIFICACION: 'notificar',
  CORREO: 'enviar_correo',
  CONDICIONAL: 'condicional',
  ERROR: 'error',
};

const OPERACION_A_TIPO = {
  crear: 'CREADA',
  asignar: 'ASIGNADA',
  cambiar_estado: 'ESTADO_CAMBIADO',
  consultar: 'CONSULTADA',
  listar: 'LISTADA',
  notificar: 'NOTIFICACION',
  enviar_correo: 'CORREO',
  condicional: 'CONDICIONAL',
  error: 'ERROR',
};

function describirFilaHistorial(fila) {
  if (fila.detalle) return fila.detalle;
  const nuevo = fila.valor_nuevo ?? {};
  switch (fila.tipo) {
    case 'CREADA':
      return `Tarea «${nuevo.titulo ?? fila.tarea_id ?? ''}» creada (${nuevo.estado ?? 'PENDIENTE'})`;
    case 'ASIGNADA':
      return `Tarea ${fila.tarea_id ?? ''} asignada a ${nuevo.responsableId ?? 'sin asignar'}`;
    case 'ESTADO_CAMBIADO':
      return `Tarea ${fila.tarea_id ?? ''} cambió a ${nuevo.estado ?? ''}`;
    default:
      return `Operación ${TIPO_A_OPERACION[fila.tipo] ?? fila.tipo} registrada`;
  }
}

function historialDesdeFila(fila) {
  const fecha = fila.creado_en instanceof Date
    ? fila.creado_en.toISOString()
    : String(fila.creado_en ?? new Date().toISOString());
  return {
    id: `hist_${fila.id}`,
    fecha,
    tipo: fila.categoria ?? 'operacion',
    operacion: fila.operacion ?? TIPO_A_OPERACION[fila.tipo] ?? 'operacion',
    instruccion: fila.instruccion ?? '',
    tareaId: fila.tarea_id ?? null,
    usuarioId: fila.actor_usuario_id ?? null,
    resultado: fila.resultado ?? 'exito',
    detalle: describirFilaHistorial(fila),
    valorAnterior: fila.valor_anterior ?? null,
    valorNuevo: fila.valor_nuevo ?? null,
  };
}

function tareaDesdeFila(fila) {
  if (!fila) return null;
  // pg interpreta DATE como medianoche local. Usar ISO UTC puede desplazar el día
  // en zonas horarias positivas; String(Date) no produce una fecha ISO.
  const fecha = fila.fecha instanceof Date
    ? `${fila.fecha.getFullYear()}-${String(fila.fecha.getMonth() + 1).padStart(2, '0')}-${String(fila.fecha.getDate()).padStart(2, '0')}`
    : fila.fecha == null ? null : String(fila.fecha).slice(0, 10);
  return {
    id: fila.id,
    titulo: fila.titulo,
    estado: fila.estado,
    responsableId: fila.responsable_id ?? null,
    fecha,
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
        `INSERT INTO historial_tareas (tarea_id, tipo, valor_nuevo, categoria, operacion, resultado, detalle)
         VALUES ($1, 'CREADA', $2::jsonb, 'operacion', 'crear', 'exito', $3)`,
        [
          creada.id,
          JSON.stringify({ titulo: creada.titulo, estado: creada.estado, fecha: creada.fecha }),
          `Tarea «${creada.titulo}» creada (${creada.estado})`,
        ],
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
        `INSERT INTO historial_tareas (tarea_id, tipo, valor_anterior, valor_nuevo, categoria, operacion, resultado, detalle)
         VALUES ($1, 'ASIGNADA', $2::jsonb, $3::jsonb, 'operacion', 'asignar', 'exito', $4)`,
        [
          tareaId,
          JSON.stringify({ responsableId: anterior.rows[0].responsable_id }),
          JSON.stringify({ responsableId: usuarioId }),
          `Tarea «${actualizada.titulo}» asignada`,
        ],
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
        `INSERT INTO historial_tareas (tarea_id, tipo, valor_anterior, valor_nuevo, categoria, operacion, resultado, detalle)
         VALUES ($1, 'ESTADO_CAMBIADO', $2::jsonb, $3::jsonb, 'operacion', 'cambiar_estado', 'exito', $4)`,
        [
          tareaId,
          JSON.stringify({ estado: anterior.rows[0].estado }),
          JSON.stringify({ estado }),
          `Tarea «${actualizada.titulo}» cambió a ${estado}`,
        ],
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
        `SELECT id, tarea_id, actor_usuario_id, tipo, valor_anterior, valor_nuevo,
                categoria, operacion, instruccion, resultado, detalle, creado_en
           FROM historial_tareas
          WHERE ($1::text IS NULL OR tarea_id = $1)
          ORDER BY creado_en DESC, id DESC
          LIMIT $2`,
        [tareaId, Math.max(1, Math.min(Number(limite) || 100, 500))],
      );
      return rows.map(historialDesdeFila);
    },

    async registrarHistorial(entrada) {
      const tipo = OPERACION_A_TIPO[entrada.operacion] ?? entrada.tipo ?? 'ERROR';
      const categoria = entrada.tipo === 'notificacion' || entrada.tipo === 'correo'
        ? entrada.tipo
        : (entrada.categoria ?? 'operacion');
      const { rows } = await queryable.query(
        `INSERT INTO historial_tareas (
           tarea_id, actor_usuario_id, tipo, categoria, operacion, instruccion, resultado, detalle
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, tarea_id, actor_usuario_id, tipo, valor_anterior, valor_nuevo,
                   categoria, operacion, instruccion, resultado, detalle, creado_en`,
        [
          entrada.tareaId ?? null,
          entrada.usuarioId ?? null,
          tipo,
          categoria,
          entrada.operacion ?? TIPO_A_OPERACION[tipo] ?? 'operacion',
          entrada.instruccion ?? '',
          entrada.resultado ?? 'exito',
          entrada.detalle ?? '',
        ],
      );
      return historialDesdeFila(rows[0]);
    },

    async registrarNotificacion({ usuarioId, mensaje, estado = 'en_cola' }) {
      const { rows } = await queryable.query(
        `INSERT INTO notificaciones (usuario_id, mensaje, estado)
         VALUES ($1, $2, $3)
         RETURNING id, usuario_id, mensaje, estado, creado_en`,
        [usuarioId, String(mensaje), estado],
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
    registrarHistorial: escribir('registrarHistorial'),
    tareas,
    notificaciones: { registrarNotificacion: escribir('registrarNotificacion') },
    cerrar: () => pool.end(),
  };
}
