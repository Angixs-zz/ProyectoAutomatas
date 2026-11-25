# BE-6 · Notificaciones, SMTP y resultados parciales

Verificación manual reproducible del Issue #42 contra Docker Compose, PostgreSQL y Mailpit locales. No se usó un servidor de correo real.

## Entorno y comandos

Puertos publicados durante la ejecución:

| Servicio | Puerto local |
| --- | ---: |
| API AutoTask | 32771 |
| PostgreSQL | 32770 |
| Mailpit SMTP | 32768 |
| Mailpit UI/API | 32769 |

Se consultan con `docker compose port app 8080`, `docker compose port postgres 5432`, `docker compose port mailpit 1025` y `docker compose port mailpit 8025`. Ejecutar E2E con:

```sh
AUTOTASK_URL=http://localhost:32771 \
MAILPIT_URL=http://localhost:32769 \
DATABASE_URL=postgresql://autotask:autotask_dev@localhost:32770/autotask \
npm run test:e2e
```

Resultado observado: **5/5 pruebas aprobadas**. La prueba de flujo completo envía un destinatario único por ejecución y consulta `GET /api/v1/messages` de Mailpit para verificar su recepción. La prueba de fallo SMTP usa deliberadamente `127.0.0.1:19999`, no un SMTP externo.

Una consulta reproducible para ver el mensaje reciente:

```sh
curl -fsS http://localhost:32769/api/v1/messages \
  | jq '.messages[] | {ID, To, Subject, Created}'
```

Mensaje observado en Mailpit durante esta verificación:

```json
{
  "ID": "3GeD8Sd9MoCNCZpf8OSlMN",
  "To": [{ "Address": "prueba-e2e-1795310174746@ejemplo.com" }],
  "Subject": "Notificación de prueba · AutoTask",
  "Created": "2026-11-22T01:16:14.796Z"
}
```

## Significado de los estados

- **`en_cola`**: el servidor SMTP aceptó el mensaje. La respuesta positiva del despacho no confirma que haya llegado al buzón final. En esta prueba, la recepción se comprueba solamente dentro de Mailpit.
- **`incierto`**: falló el despacho actual después del commit de tareas. Como no siempre se puede saber si SMTP alcanzó a aceptar el mensaje, el cliente no debe repetir todo el programa.
- **`no_procesado`**: los despachos posteriores al primero que falla se omiten; el ejecutor no continúa la cola.
- **`partial: true`**: las escrituras de tareas ya quedaron confirmadas, pero hubo un fallo al despachar una notificación o un correo. La respuesta es parcial, no una reversión completa ni una confirmación de entrega.

La suite unitaria `tests/ejecutor.test.js` comprueba los tres estados y el contador de intentos (dos llamadas: primera aceptada, segunda fallida; no se llama el tercer despacho). La E2E PostgreSQL confirma `partial: true`, `incierto`, `no_procesado` y que la tarea creada persiste.

## Limitación observada

La prueba de fallo real usa un puerto SMTP local cerrado; verifica el camino de error y el comportamiento conservador, pero no simula el caso específico de que el servidor SMTP acepte el mensaje y se pierda la respuesta final. El estado `incierto` cubre deliberadamente esa ambigüedad. No se hicieron envíos a Internet.
