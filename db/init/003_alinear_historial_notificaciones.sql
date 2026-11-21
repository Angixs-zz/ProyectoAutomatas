-- Migración idempotente para alinear notificaciones e historial con el ejecutor (#30) y el tablero (#8).

ALTER TABLE notificaciones
  DROP CONSTRAINT IF EXISTS notificaciones_estado_check;

ALTER TABLE notificaciones
  ADD CONSTRAINT notificaciones_estado_check
  CHECK (estado IN ('en_cola', 'enviado', 'error', 'fallido', 'incierto', 'no_procesado'));

ALTER TABLE historial_tareas
  ALTER COLUMN tarea_id DROP NOT NULL;

ALTER TABLE historial_tareas
  DROP CONSTRAINT IF EXISTS historial_tareas_tipo_check;

ALTER TABLE historial_tareas
  ADD CONSTRAINT historial_tareas_tipo_check
  CHECK (tipo IN (
    'CREADA',
    'ASIGNADA',
    'ESTADO_CAMBIADO',
    'CONSULTADA',
    'LISTADA',
    'NOTIFICACION',
    'CORREO',
    'CONDICIONAL',
    'ERROR'
  ));

ALTER TABLE historial_tareas
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'operacion'
    CHECK (categoria IN ('operacion', 'notificacion', 'correo'));

ALTER TABLE historial_tareas
  ADD COLUMN IF NOT EXISTS operacion TEXT;

ALTER TABLE historial_tareas
  ADD COLUMN IF NOT EXISTS instruccion TEXT;

ALTER TABLE historial_tareas
  ADD COLUMN IF NOT EXISTS resultado TEXT;

ALTER TABLE historial_tareas
  ADD COLUMN IF NOT EXISTS detalle TEXT;
