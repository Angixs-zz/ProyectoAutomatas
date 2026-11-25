# Evidencias de entrega · AutoTask

Las evidencias 01–04 corresponden al commit `3b96a25` de `main`. La evidencia 05 registra la verificación complementaria BE-6 ejecutada con Mailpit local y la rama `test/be-6-smtp-evidencia`.

| Archivo | Contenido real capturado |
| --- | --- |
| [01-pruebas-unitarias.txt](01-pruebas-unitarias.txt) | Salida completa de `npm test` (**120/120** pruebas aprobadas). |
| [02-pruebas-e2e.txt](02-pruebas-e2e.txt) | Salida completa de `npm run test:e2e` (**5/5** pruebas E2E aprobadas contra Docker Compose). |
| [03-docker-estado.txt](03-docker-estado.txt) | Salida de `docker compose ps` y `GET /api/salud` (`almacenamiento: "postgres"`). |
| [04-pipeline-y-mailpit.json](04-pipeline-y-mailpit.json) | Respuestas reales de `/api/validar` (con optimización), errores `lexica`, `sintactica`, `semantica` y `ejecucion`, y resumen de mensajes recibidos en Mailpit. |
| [05-be-6-smtp.md](05-be-6-smtp.md) | Verificación de Mailpit local, significado de estados parciales y límites del escenario SMTP fallido (#42). |
| [06-integracion-2026-11-24.md](06-integracion-2026-11-24.md) | Comandos y resultados de integración en `9c683cf` tras #46–#52; límites explícitos. |

## Capturas de interfaz existentes y pendientes

Melody adjuntó capturas **reales** de validar sin escritura, ejecución, tablero, historial, condicional/correo visible en Mailpit, error semántico, vistas simuladas, móvil y modo claro en [su comentario al issue #45](https://github.com/Angixs-zz/ProyectoAutomatas/issues/45#issuecomment-7091763705). Corresponden a `76de0b3`, anterior a los PR #50 y #51; no prueban visualmente las correcciones posteriores. Ver las evidencias restantes en [el guion](../guion-demostracion.md) §3. No hay captura final de GitHub Projects ni demostración presencial.
