-- Esquema inicial de AutoTask · Issue #5 (BE-1)
-- IDs de texto mantienen compatibilidad con el contrato actual (task_1/user_1).

CREATE SEQUENCE IF NOT EXISTS usuarios_id_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS tareas_id_seq START WITH 1;

CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY DEFAULT ('user_' || nextval('usuarios_id_seq')::TEXT),
  nombre TEXT NOT NULL CHECK (length(btrim(nombre)) > 0),
  correo TEXT UNIQUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tareas (
  id TEXT PRIMARY KEY DEFAULT ('task_' || nextval('tareas_id_seq')::TEXT),
  titulo TEXT NOT NULL CHECK (length(btrim(titulo)) > 0),
  estado TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA')),
  responsable_id TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha DATE,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tareas_responsable_idx ON tareas(responsable_id);
CREATE INDEX IF NOT EXISTS tareas_estado_idx ON tareas(estado);

-- El responsable actual vive en tareas.responsable_id. Este registro append-only
-- conserva creación, asignaciones/reasignaciones y cambios de estado.
CREATE TABLE IF NOT EXISTS historial_tareas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tarea_id TEXT NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  actor_usuario_id TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('CREADA', 'ASIGNADA', 'ESTADO_CAMBIADO')),
  valor_anterior JSONB,
  valor_nuevo JSONB,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS historial_tareas_tarea_fecha_idx
  ON historial_tareas(tarea_id, creado_en, id);

CREATE TABLE IF NOT EXISTS notificaciones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  mensaje TEXT NOT NULL CHECK (length(btrim(mensaje)) > 0),
  estado TEXT NOT NULL DEFAULT 'en_cola'
    CHECK (estado IN ('en_cola', 'enviado', 'error')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notificaciones_usuario_fecha_idx
  ON notificaciones(usuario_id, creado_en DESC);
