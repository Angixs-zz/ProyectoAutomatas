-- Datos reproducibles de demostración; al reinicializar no duplica filas.
INSERT INTO usuarios (id, nombre, correo) VALUES
  ('user_1', 'Yareli', 'yareli@ejemplo.com'),
  ('user_2', 'Diego', 'diego@ejemplo.com'),
  ('user_3', 'Angel', 'angel@ejemplo.com'),
  ('user_4', 'Edwin', 'edwin@ejemplo.com'),
  ('user_5', 'Melody', 'melody@ejemplo.com'),
  ('user_6', 'Miguel Angel', 'miguel@ejemplo.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tareas (id, titulo, estado, responsable_id) VALUES
  ('task_1', 'Preparar informe', 'PENDIENTE', 'user_1'),
  ('task_2', 'Revisar gramática', 'EN_PROGRESO', 'user_3'),
  ('task_3', 'Configurar Docker', 'COMPLETADA', 'user_4')
ON CONFLICT (id) DO NOTHING;

SELECT setval('usuarios_id_seq', GREATEST((SELECT COUNT(*) FROM usuarios), 1), true);
SELECT setval('tareas_id_seq', GREATEST((SELECT COUNT(*) FROM tareas), 1), true);
