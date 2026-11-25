# Verificación integrada · 2026-11-24

Base: `main` en `4d7897805e25298612d1d949b4a3ed0361c0ccd9` (#46–#51); se volvieron a ejecutar ambas suites sobre la rama de corrección del optimizador/documentación, antes del PR de cierre. Para identificar el commit final integrado, consultar la matriz y el historial de `main`; esta nota no pretende que las capturas antiguas representen ese commit.

## Comandos ejecutados y resultados observados

| Comando | Resultado |
| --- | --- |
| `npm test` | **123 pruebas, 123 aprobadas, 0 fallidas**; repetido tras retirar la eliminación insegura de transiciones. |
| `docker compose up -d --build` | **Falló** al publicar `localhost:5432`: puerto ocupado; no se borraron datos. |
| `POSTGRES_PORT=55432 docker compose up -d --build` | App reconstruida; `postgres` healthy, `mailpit` healthy. Contenedores sobre el volumen preexistente, **no** arranque limpio. |
| `curl -fsS http://localhost:8080/api/salud` | `{"ok":true,"almacenamiento":"postgres"}`. |
| `POSTGRES_PORT=55432 DATABASE_URL=postgresql://autotask:autotask_dev@localhost:55432/autotask npm run test:e2e` | **8 pruebas, 8 aprobadas, 0 fallidas**, repetido sobre el optimizador corregido; flujo, correo recibido mediante consulta a Mailpit, DATE ISO, errores léxico/sintáctico/semántico, rollback, validación sin escritura, ambos `SI`, dos optimizaciones comparadas con la IR original, error SMTP parcial, persistencia de tarea/fecha/historial tras `docker compose restart app postgres`. |

Los comandos E2E crean tareas y correos con identificadores temporales; no eliminan datos. La comparación de IR usa servicios en memoria dentro de la suite E2E, mientras que flujo, correo, validación y reinicio sí se ejecutan contra PostgreSQL/Mailpit reales. Las capturas reales del navegador y Mailpit realizadas por Melody sobre `76de0b3` se enlazan en [#45](https://github.com/Angixs-zz/ProyectoAutomatas/issues/45#issuecomment-7091763705); no se tomaron capturas nuevas del navegador ni del Kanban en esta verificación. Tampoco se hizo arranque desde volumen vacío, ni demostración en vivo.
