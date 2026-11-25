# Evidencias de entrega · AutoTask

Las evidencias 01–04 corresponden al commit `3b96a25` de `main`. La evidencia 05 registra la verificación complementaria BE-6 ejecutada con Mailpit local y la rama `test/be-6-smtp-evidencia`.

| Archivo | Contenido real capturado |
| --- | --- |
| [01-pruebas-unitarias.txt](01-pruebas-unitarias.txt) | Salida completa de `npm test` (**120/120** pruebas aprobadas). |
| [02-pruebas-e2e.txt](02-pruebas-e2e.txt) | Salida completa de `npm run test:e2e` (**5/5** pruebas E2E aprobadas contra Docker Compose). |
| [03-docker-estado.txt](03-docker-estado.txt) | Salida de `docker compose ps` y `GET /api/salud` (`almacenamiento: "postgres"`). |
| [04-pipeline-y-mailpit.json](04-pipeline-y-mailpit.json) | Respuestas reales de `/api/validar` (con optimización), errores `lexica`, `sintactica`, `semantica` y `ejecucion`, y resumen de mensajes recibidos en Mailpit. |
| [05-be-6-smtp.md](05-be-6-smtp.md) | Verificación de Mailpit local, significado de estados parciales y límites del escenario SMTP fallido (#42). |

## Capturas manuales pendientes (UI y GitHub Projects)

Las capturas visuales del navegador y del tablero Kanban deben adjuntarse manualmente en el issue `#20` siguiendo la tabla de [../guion-demostracion.md](../guion-demostracion.md) §3 (pantalla inicial, consola, tablero, historial filtrado, Mailpit UI y tablero de GitHub Projects).
