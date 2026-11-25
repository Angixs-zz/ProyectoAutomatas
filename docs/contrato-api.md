# Contrato de la API HTTP de AutoTask

**Issue:** [#6 · BE-2 · Crear la API de validación y consulta de AutoTask](https://github.com/Angixs-zz/ProyectoAutomatas/issues/6)  
**Implementación verificada:** `src/api/servidor.js`, `src/motor/ejecutar-programa.js`, `src/ejecutor/ejecutor.js`  
**Base de verificación:** `main` en `fb42e70` (PR #36 fusionado)  
**Responsable del issue:** Diego (`@diegooash`) · Integración y contrato verificados por el líder técnico.

Este documento describe el contrato **real** de la API. Los ejemplos fueron obtenidos ejecutando el servidor implementado, no son contratos supuestos. Las respuestas que dependen de datos usan los datos demo (`task_1`, `task_2`, `task_3` y los usuarios de `db/init/002_datos_demo.sql`).

---

## 1. Convenciones generales

| Aspecto | Contrato implementado |
| --- | --- |
| URL base local | `http://localhost:8080` |
| URL base con Docker | `http://localhost:${APP_PORT}` (`8080` por defecto) |
| Formato | JSON UTF-8 |
| Cabecera recomendada | `Content-Type: application/json` |
| Cuerpo de validar/ejecutar | `{ "programa": "..." }` |
| Alias aceptado | `{ "texto": "..." }` cuando no se envía `programa` |
| Ubicaciones | `linea` y `columna` empiezan en **1**; `null` si el error no tiene ubicación |
| Resultado de un programa | Siempre HTTP `200`, aunque `ok` sea `false` |
| Errores de la petición HTTP | HTTP `400`, `404`, `405` o `500` con un cuerpo distinto al de diagnósticos |

> **Importante:** un error léxico, sintáctico, semántico o de ejecución **no** es un error HTTP. La petición se procesó correctamente y el resultado del programa se informa con `ok: false` y `diagnosticos`. Los códigos `400/404/405/500` se reservan para problemas de la petición o del servidor.

### Endpoints

| Método | Ruta | Función |
| --- | --- | --- |
| `GET` | `/api/salud` | Estado del servidor y almacenamiento activo. |
| `GET` | `/api/tablero` | Tareas con su responsable e historial reciente. |
| `POST` | `/api/validar` | Analiza, valida y optimiza el programa **sin escribir datos**. |
| `POST` | `/api/ejecutar` | Analiza, valida, optimiza y ejecuta el programa. |

---

## 2. `GET /api/salud`

Comprueba que el servidor responde e indica si está usando PostgreSQL o el almacenamiento en memoria.

### Solicitud

```bash
curl http://localhost:8080/api/salud
```

### Respuesta `200`

```json
{
  "ok": true,
  "almacenamiento": "postgres"
}
```

`almacenamiento` toma uno de estos valores:

| Valor | Cuándo aparece |
| --- | --- |
| `postgres` | El proceso tiene `DATABASE_URL` o `PGHOST` y pudo aplicar las migraciones. |
| `memoria` | No hay PostgreSQL configurado; se usan los servicios en memoria. |

---

## 3. `GET /api/tablero`

Devuelve todas las tareas y el historial de operaciones. Es la fuente de datos de la vista de tablero e historial.

### Solicitud

```bash
curl http://localhost:8080/api/tablero
```

### Respuesta `200`

Ejemplo real recortado a las primeras tareas e historial:

```json
{
  "tareas": [
    {
      "id": "task_1",
      "titulo": "Preparar informe",
      "estado": "PENDIENTE",
      "responsableId": "user_1",
      "fecha": null,
      "responsable": "Yareli"
    },
    {
      "id": "task_2",
      "titulo": "Revisar gramática",
      "estado": "EN_PROGRESO",
      "responsableId": "user_3",
      "fecha": null,
      "responsable": "Angel"
    }
  ],
  "historial": [
    {
      "id": "hist_6",
      "fecha": "2026-11-21T02:54:30.969Z",
      "tipo": "operacion",
      "operacion": "listar",
      "instruccion": "LISTAR TAREAS",
      "tareaId": null,
      "resultado": "exito",
      "detalle": "Listado de 4 tareas"
    },
    {
      "id": "hist_5",
      "fecha": "2026-11-21T02:54:30.969Z",
      "tipo": "operacion",
      "operacion": "consultar",
      "instruccion": "CONSULTAR TAREA \"Informe semanal\"",
      "tareaId": "task_4",
      "resultado": "exito",
      "detalle": "Consulta de «Informe semanal» (EN_PROGRESO)"
    }
  ]
}
```

### Campos de una tarea

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `id` | string | Identificador persistido (`task_N`). |
| `titulo` | string | Título exacto de la tarea. |
| `estado` | string | `PENDIENTE`, `EN_PROGRESO`, `COMPLETADA` o `CANCELADA`. |
| `responsableId` | string \| null | ID del usuario responsable. |
| `fecha` | string \| null | Fecha ISO `YYYY-MM-DD` o `null`. |
| `responsable` | string \| null | Nombre del usuario resuelto por la API; `null` si no tiene responsable. |

### Campos de una entrada de historial

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `id` | string | Identificador de la entrada (`hist_N`). |
| `fecha` | string | Fecha ISO 8601 de registro. |
| `tipo` | string | `operacion`, `notificacion` o `correo`. |
| `operacion` | string | `crear`, `asignar`, `cambiar_estado`, `consultar`, `listar`, `notificar`, `enviar_correo`, `condicional` o `error`. |
| `instruccion` | string | Línea del programa que originó la entrada (vacía si no aplica). |
| `tareaId` | string \| null | Tarea relacionada, cuando existe. |
| `usuarioId` | string \| null | Usuario relacionado en notificaciones; puede omitirse en entradas que no lo usan. |
| `resultado` | string | `exito`, `en_cola`, `enviado`, `fallido`, `incierto`, `no_procesado` o `error`, según la operación. |
| `detalle` | string | Texto legible para la interfaz. |
| `valorAnterior` | object \| null | Presente en entradas persistidas de PostgreSQL cuando aplica. |
| `valorNuevo` | object \| null | Presente en entradas persistidas de PostgreSQL cuando aplica. |

El historial se devuelve del más reciente al más antiguo. En PostgreSQL se consultan como máximo 100 entradas (`listarHistorial({ limite: 100 })`). En memoria se devuelve el historial acumulado por esa instancia del servidor.

---

## 4. `POST /api/validar`

Ejecuta el pipeline completo **hasta el optimizador**, pero no ejecuta el programa:

```text
texto → tokens → AST → validación semántica → IR → optimizador
```

### Solicitud

```bash
curl -X POST http://localhost:8080/api/validar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CREAR TAREA \"Informe semanal\" FECHA \"2026-11-30\"\nASIGNAR TAREA \"Informe semanal\" A \"Yareli\""}'
```

### Respuesta correcta `200`

```json
{
  "ok": true,
  "modo": "validacion",
  "resultados": [],
  "diagnosticos": [],
  "optimizaciones": []
}
```

`optimizaciones` contiene los nombres de las reglas que el optimizador pudo aplicar. Ejemplo real con una condición constante:

```bash
curl -X POST http://localhost:8080/api/validar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CREAR TAREA \"Optimizable\"\nSI TAREA \"Optimizable\" ESTA PENDIENTE ENTONCES CAMBIAR ESTADO TAREA \"Optimizable\" A EN_PROGRESO\nCAMBIAR ESTADO TAREA \"Optimizable\" A COMPLETADA"}'
```

```json
{
  "ok": true,
  "modo": "validacion",
  "resultados": [],
  "diagnosticos": [],
  "optimizaciones": [
    "simplificacion_condiciones_constantes"
  ]
}
```

Nombres implementados:

| Nombre | Regla |
| --- | --- |
| `simplificacion_condiciones_constantes` | Sustituye una condición cuyo resultado ya se conoce por la acción directa. |
| `eliminacion_codigo_inalcanzable` | Elimina la acción de un `SI` conocido falso; conserva el resultado del condicional. Los cambios de estado intermedios no se eliminan porque generan historial y resultados. |

### Garantía de solo lectura

En modo `validacion`:

- `ejecutarPrograma` llama a `validarPrograma`, que solo lee tareas y usuarios mediante la tabla de símbolos.
- No se llama a `ejecutarIR`.
- No se crean tareas, no se registra historial, no se registran notificaciones y no se envía correo.
- La respuesta siempre devuelve `resultados: []`.

Esta garantía está cubierta por `tests/servidor.test.js` (la validación no altera el estado de los servicios) y por `tests/validador.test.js` (la validación no modifica el repositorio).

---

## 5. `POST /api/ejecutar`

Ejecuta el pipeline completo:

```text
texto → tokens → AST → validación semántica → IR → optimizador → ejecutor
```

### Solicitud

```bash
curl -X POST http://localhost:8080/api/ejecutar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CREAR TAREA \"Informe semanal\" FECHA \"2026-11-30\"\nASIGNAR TAREA \"Informe semanal\" A \"Yareli\"\nCAMBIAR ESTADO TAREA \"Informe semanal\" A EN_PROGRESO\nSI TAREA \"Informe semanal\" ESTA EN_PROGRESO ENTONCES NOTIFICAR A \"Angel\" MENSAJE \"Tarea en progreso\"\nSI TAREA \"Preparar informe\" ESTA COMPLETADA ENTONCES NOTIFICAR A \"Angel\" MENSAJE \"No se envía\"\nCONSULTAR TAREA \"Informe semanal\"\nLISTAR TAREAS"}'
```

### Respuesta correcta `200`

```json
{
  "ok": true,
  "modo": "ejecucion",
  "resultados": [
    {
      "linea": 1,
      "operacion": "crear",
      "tareaId": "task_4",
      "titulo": "Informe semanal",
      "estado": "PENDIENTE",
      "fecha": "2026-11-30"
    },
    {
      "linea": 2,
      "operacion": "asignar",
      "tareaId": "task_4",
      "titulo": "Informe semanal",
      "responsableId": "user_1",
      "responsable": "Yareli"
    },
    {
      "linea": 3,
      "operacion": "cambiar_estado",
      "tareaId": "task_4",
      "titulo": "Informe semanal",
      "estado": "EN_PROGRESO"
    },
    {
      "linea": 4,
      "operacion": "condicional",
      "condicion": true,
      "accion": {
        "linea": 4,
        "operacion": "notificar",
        "usuarioId": "user_3",
        "destinatario": "Angel",
        "mensaje": "Tarea en progreso",
        "estado": "en_cola"
      }
    },
    {
      "linea": 5,
      "operacion": "condicional",
      "condicion": false,
      "accion": null
    },
    {
      "linea": 6,
      "operacion": "consultar",
      "tarea": {
        "id": "task_4",
        "titulo": "Informe semanal",
        "estado": "EN_PROGRESO",
        "responsableId": "user_1",
        "fecha": "2026-11-30"
      }
    },
    {
      "linea": 7,
      "operacion": "listar",
      "tareas": [
        {
          "id": "task_1",
          "titulo": "Preparar informe",
          "estado": "PENDIENTE",
          "responsableId": "user_1",
          "fecha": null
        }
      ]
    }
  ],
  "diagnosticos": []
}
```

> El ejemplo de `listar` está recortado. En una ejecución real devuelve todas las tareas existentes.

### Resultado por operación

| Operación | Objeto devuelto en `resultados` |
| --- | --- |
| `CREAR TAREA` | `{ linea, operacion: "crear", tareaId, titulo, estado, fecha }` |
| `ASIGNAR TAREA` | `{ linea, operacion: "asignar", tareaId, titulo, responsableId, responsable }` |
| `CAMBIAR ESTADO` | `{ linea, operacion: "cambiar_estado", tareaId, titulo, estado }` |
| `CONSULTAR TAREA` | `{ linea, operacion: "consultar", tarea: { id, titulo, estado, responsableId, fecha } }` |
| `LISTAR TAREAS` | `{ linea, operacion: "listar", tareas: [...] }` |
| `NOTIFICAR` | `{ linea, operacion: "notificar", usuarioId, destinatario, mensaje, estado: "en_cola" }` |
| `ENVIAR CORREO` | `{ linea, operacion: "enviar_correo", destinatario, mensaje, estado: "en_cola" }` |
| `SI ... ENTONCES` verdadero | `{ linea, operacion: "condicional", condicion: true, accion: <resultado> }` |
| `SI ... ENTONCES` falso | `{ linea, operacion: "condicional", condicion: false, accion: null }` |

`estado: "en_cola"` significa **aceptado por el servicio**, no entrega confirmada al destinatario. En Mailpit el correo puede verificarse en `http://localhost:8025`.

### Nota sobre los resultados y el optimizador

El optimizador puede eliminar código que nunca se ejecutaría. Por eso no siempre hay un objeto en `resultados` por cada línea del texto original:

- Una condición estáticamente falsa puede desaparecer y no producir un objeto `condicional`.
- Un cambio de estado sobrescrito puede no aparecer.
- Las operaciones con efectos externos (`NOTIFICAR`, `ENVIAR CORREO`) y las lecturas (`CONSULTAR`, `LISTAR`) no se eliminan ni se reordenan.

Si el consumidor necesita la traza línea por línea del texto original, debe usar el programa fuente junto con `resultados`; no debe suponer que `resultados.length` es igual al número de líneas.

---

## 6. Errores y diagnósticos

### 6.1 Errores de la petición HTTP

| Código | Cuándo | Cuerpo real |
| --- | --- | --- |
| `400` | El cuerpo no es JSON válido. | `{"error":"El cuerpo debe ser JSON válido."}` |
| `400` | No se envió `programa` ni `texto` como string. | `{"error":"Se esperaba el campo «programa» como texto."}` |
| `404` | Archivo estático inexistente o ruta GET no implementada. | Texto plano `No encontrado`. |
| `405` | Método no permitido sobre una ruta de API que no cae en el servidor estático. | Texto plano `Método no permitido`. |
| `500` | Excepción inesperada del servidor. | `{"error":"Error interno del servidor."}` |
| `403` | Intento de salir del directorio público. | Texto plano `Acceso denegado`. |

Ejemplo real de `400`:

```bash
curl -i -X POST http://localhost:8080/api/ejecutar \
  -H 'Content-Type: application/json' \
  -d '{no es json'
```

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8

{"error":"El cuerpo debe ser JSON válido."}
```

Ejemplo real de campo faltante:

```bash
curl -i -X POST http://localhost:8080/api/validar \
  -H 'Content-Type: application/json' \
  -d '{}'
```

```http
HTTP/1.1 400 Bad Request

{"error":"Se esperaba el campo «programa» como texto."}
```

### 6.2 Diagnósticos de programa

Todos los diagnósticos tienen la misma forma:

```json
{
  "etapa": "lexica",
  "codigo": "CODIGO_ESTABLE",
  "mensaje": "Texto legible para la persona usuaria.",
  "linea": 1,
  "columna": 13
}
```

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `etapa` | string | `lexica`, `sintactica`, `semantica` o `ejecucion`. |
| `codigo` | string | Código estable para que el frontend no dependa del mensaje. |
| `mensaje` | string | Explicación legible; no incluye stack traces ni secretos. |
| `linea` | number \| null | Línea del programa donde se detectó el problema. |
| `columna` | number \| null | Columna del token o argumento problemático. |

El pipeline se detiene en la primera etapa que falla:

- Si hay errores léxicos, no se parsea.
- Si hay errores sintácticos, no se valida semánticamente.
- Si hay errores semánticos, no se genera ni ejecuta la IR.

Dentro de una misma etapa se devuelven todos los diagnósticos recuperados, no solo el primero.

### 6.3 Errores léxicos

| Código | Cuándo |
| --- | --- |
| `CARACTER_INVALIDO` | Aparece un carácter no reconocido fuera de una cadena. |
| `CADENA_SIN_CERRAR` | Una cadena abre con `"` y llega al fin de línea o de entrada sin cerrarse. |

Ejemplo real:

```bash
curl -X POST http://localhost:8080/api/ejecutar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CREAR TAREA \"Led\" @"}'
```

```json
{
  "ok": false,
  "modo": "ejecucion",
  "resultados": [],
  "diagnosticos": [
    {
      "etapa": "lexica",
      "codigo": "CARACTER_INVALIDO",
      "mensaje": "Carácter '@' no reconocido fuera de una cadena de texto.",
      "linea": 1,
      "columna": 19
    }
  ]
}
```

```bash
curl -X POST http://localhost:8080/api/ejecutar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CREAR TAREA \"Sin cerrar"}'
```

```json
{
  "ok": false,
  "modo": "ejecucion",
  "resultados": [],
  "diagnosticos": [
    {
      "etapa": "lexica",
      "codigo": "CADENA_SIN_CERRAR",
      "mensaje": "La cadena de texto inició con '\"' pero llegó al fin de línea o entrada sin cerrarse.",
      "linea": 1,
      "columna": 13
    }
  ]
}
```

### 6.4 Errores sintácticos

| Código | Cuándo |
| --- | --- |
| `ARGUMENTO_FALTANTE` | La instrucción termina antes de completar un argumento obligatorio. La ubicación apunta al final del último token válido. |
| `TOKEN_INESPERADO` | Se encuentra un token con el tipo incorrecto, texto sobrante, un comando desconocido o un `SI` anidado. |

Ejemplo real de argumento faltante:

```bash
curl -X POST http://localhost:8080/api/ejecutar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CREAR TAREA"}'
```

```json
{
  "ok": false,
  "modo": "ejecucion",
  "resultados": [],
  "diagnosticos": [
    {
      "etapa": "sintactica",
      "codigo": "ARGUMENTO_FALTANTE",
      "mensaje": "Se esperaba una CADENA con el título de la tarea después de 'TAREA'.",
      "linea": 1,
      "columna": 12
    }
  ]
}
```

Ejemplo real de token inesperado:

```bash
curl -X POST http://localhost:8080/api/ejecutar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CREAR TAREA \"X\" FECHA \"2026-11-30\" SOBRA"}'
```

```json
{
  "ok": false,
  "modo": "ejecucion",
  "resultados": [],
  "diagnosticos": [
    {
      "etapa": "sintactica",
      "codigo": "TOKEN_INESPERADO",
      "mensaje": "Se esperaba fin de línea después de la instrucción, pero se encontró 'SOBRA'.",
      "linea": 1,
      "columna": 36
    }
  ]
}
```

### 6.5 Errores semánticos

| Código | Cuándo |
| --- | --- |
| `TAREA_INEXISTENTE` | La tarea no existe en el repositorio ni fue creada antes en el mismo programa. |
| `TAREA_AMBIGUA` | Hay más de una tarea con el mismo título. |
| `USUARIO_INEXISTENTE` | El usuario no existe. Mayúsculas y acentos cuentan. |
| `USUARIO_AMBIGUO` | Hay más de un usuario con el mismo nombre. |
| `TRANSICION_INVALIDA` | El cambio de estado no está permitido o la tarea ya está en ese estado. |
| `OPERACION_NO_PERMITIDA` | Se asigna una tarea `COMPLETADA`/`CANCELADA`, se anida un `SI` o se usa un nodo desconocido. |
| `CORREO_INVALIDO` | El destinatario de `ENVIAR CORREO` no tiene forma de correo. |
| `FECHA_INVALIDA` | La fecha tiene formato `YYYY-MM-DD` pero ese día no existe. |
| `TEXTO_VACIO` | El título o el mensaje están vacíos o solo contienen espacios. |
| `REFERENCIA_CONDICIONAL` | Se usa después de un `SI` una tarea que solo se crea dentro de ese condicional. |
| `ESTADO_INVALIDO` | El AST contiene un estado fuera del catálogo. En texto normal el lexer/parser suele rechazarlo antes con un error sintáctico. |

Ejemplo real:

```bash
curl -X POST http://localhost:8080/api/ejecutar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CONSULTAR TAREA \"No existe\""}'
```

```json
{
  "ok": false,
  "modo": "ejecucion",
  "resultados": [],
  "diagnosticos": [
    {
      "etapa": "semantica",
      "codigo": "TAREA_INEXISTENTE",
      "mensaje": "CONSULTAR TAREA: No existe la tarea «No existe». Revisa el título o créala antes con CREAR TAREA.",
      "linea": 1,
      "columna": 17
    }
  ]
}
```

Ejemplo real de fecha inexistente:

```bash
curl -X POST http://localhost:8080/api/ejecutar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CREAR TAREA \"X\" FECHA \"2026-02-30\""}'
```

```json
{
  "ok": false,
  "modo": "ejecucion",
  "resultados": [],
  "diagnosticos": [
    {
      "etapa": "semantica",
      "codigo": "FECHA_INVALIDA",
      "mensaje": "CREAR TAREA: «2026-02-30» no es una fecha que exista. Usa AAAA-MM-DD con un día válido del mes.",
      "linea": 1,
      "columna": 23
    }
  ]
}
```

### 6.6 Errores de ejecución

Ocurren después de que el análisis y la validación semántica pasaron, pero el estado real de la base de datos no coincide con lo previsto o falla un servicio.

| Código | Cuándo |
| --- | --- |
| `TAREA_INEXISTENTE` | La tarea desapareció entre la validación y la ejecución. |
| `TRANSICION_INVALIDA` | El estado real impide el cambio (por ejemplo, una tarea ya `COMPLETADA`). |
| `OPERACION_NO_PERMITIDA` | Se intenta asignar una tarea finalizada en tiempo de ejecución. |
| `ESTADO_INVALIDO` | La IR contiene un estado inválido. |
| `IR_INVALIDA` | La IR referencia una etiqueta de salto inexistente. |
| `ERROR_PERSISTENCIA` | Falló la transacción de tareas o el registro de una notificación después del commit. |
| `ERROR_CORREO` | Falló el envío SMTP después del commit. |

Ejemplo real de error previo al commit (rollback total):

```bash
curl -X POST http://localhost:8080/api/ejecutar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CREAR TAREA \"Rollback demostrativo\"\nSI TAREA \"Preparar informe\" ESTA PENDIENTE ENTONCES CAMBIAR ESTADO TAREA \"Preparar informe\" A COMPLETADA\nCAMBIAR ESTADO TAREA \"Preparar informe\" A EN_PROGRESO"}'
```

```json
{
  "ok": false,
  "modo": "ejecucion",
  "resultados": [],
  "diagnosticos": [
    {
      "etapa": "ejecucion",
      "codigo": "TRANSICION_INVALIDA",
      "mensaje": "CAMBIAR ESTADO: la tarea «Preparar informe» no puede pasar de COMPLETADA a EN_PROGRESO.",
      "linea": 3,
      "columna": 1
    }
  ]
}
```

En este caso la tarea «Rollback demostrativo» **no** queda creada: toda la transacción se revierte y la cola de notificaciones/correos se descarta.

---

## 7. `partial: true`: fallo después del commit

El ejecutor agrupa todas las operaciones de tareas en una transacción. Las notificaciones y los correos se encolan y se despachan **solo después** de confirmar (`COMMIT`) la transacción.

Si un despacho falla después del commit:

- Las tareas ya confirmadas **no se pueden revertir**.
- Las notificaciones/correos ya aceptados tampoco se pueden deshacer.
- La respuesta incluye `partial: true`.
- `resultados` conserva las operaciones realizadas.
- El despacho que falló queda en `estado: "incierto"`.
- Los despachos posteriores quedan en `estado: "no_procesado"`.
- **No se debe reintentar automáticamente el programa completo**: se duplicarían tareas, notificaciones o correos.

### Respuesta real de un fallo parcial

```json
{
  "ok": false,
  "partial": true,
  "modo": "ejecucion",
  "resultados": [
    {
      "linea": 1,
      "operacion": "crear",
      "tareaId": "task_4",
      "titulo": "Parcial demo",
      "estado": "PENDIENTE",
      "fecha": null
    },
    {
      "linea": 2,
      "operacion": "notificar",
      "usuarioId": "user_1",
      "destinatario": "Yareli",
      "mensaje": "Antes del fallo",
      "estado": "en_cola"
    },
    {
      "linea": 3,
      "operacion": "enviar_correo",
      "destinatario": "fallo@ejemplo.com",
      "mensaje": "SMTP caido",
      "estado": "incierto"
    },
    {
      "linea": 4,
      "operacion": "enviar_correo",
      "destinatario": "omitido@ejemplo.com",
      "mensaje": "No procesado",
      "estado": "no_procesado"
    }
  ],
  "diagnosticos": [
    {
      "etapa": "ejecucion",
      "codigo": "ERROR_CORREO",
      "mensaje": "La transacción de tareas ya se confirmó, pero el envío del correo es incierto. No reintentes el programa completo.",
      "linea": 3,
      "columna": 1
    }
  ]
}
```

### Cómo distinguir los tres casos

| Caso | `ok` | `partial` | `resultados` | Efectos en datos |
| --- | --- | --- | --- | --- |
| Éxito | `true` | Ausente | Operaciones realizadas | Confirmados |
| Error antes del commit | `false` | Ausente | `[]` | Revertidos; sin despachos |
| Error después del commit | `false` | `true` | Operaciones confirmadas y despachos | Tareas confirmadas; despachos inciertos/omitidos |

La consola web ya distingue el caso parcial y muestra un aviso para no reintentar el programa completo (`consola.js`).

---

## 8. Diferencia entre validar y ejecutar

| Aspecto | `/api/validar` | `/api/ejecutar` |
| --- | --- | --- |
| Léxico, parser, semántica | Sí | Sí |
| Generación de IR | Sí | Sí |
| Optimizador | Sí | Sí |
| Ejecutor | **No** | Sí |
| Escribe tareas | No | Sí, dentro de una transacción |
| Registra historial | No | Sí (operaciones y errores) |
| Notificaciones | No | Sí, después del commit |
| Correo SMTP | No | Sí, después del commit |
| `resultados` | Siempre `[]` | Resultados de las operaciones |
| `optimizaciones` | Sí, en éxito | No se incluye en la respuesta |

**Garantía comprobada:** validar no modifica la base de datos. La API de validación llama a `ejecutarPrograma(programa, { modo: 'validacion', servicios })`, y esa rama retorna antes de `ejecutarIR`. La prueba `tests/servidor.test.js` compara el estado de los servicios antes y después de validar.

---

## 9. Ejemplos de uso con `curl`

### 9.1 Salud

```bash
curl -s http://localhost:8080/api/salud
```

### 9.2 Tablero

```bash
curl -s http://localhost:8080/api/tablero
```

### 9.3 Validar un programa

```bash
curl -s -X POST http://localhost:8080/api/validar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CREAR TAREA \"Revisar documentación\" FECHA \"2026-11-30\"\nASIGNAR TAREA \"Revisar documentación\" A \"Yareli\""}'
```

### 9.4 Ejecutar y consultar el resultado

```bash
curl -s -X POST http://localhost:8080/api/ejecutar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CREAR TAREA \"Revisar documentación\" FECHA \"2026-11-30\"\nASIGNAR TAREA \"Revisar documentación\" A \"Yareli\"\nCAMBIAR ESTADO TAREA \"Revisar documentación\" A EN_PROGRESO\nCONSULTAR TAREA \"Revisar documentación\"\nLISTAR TAREAS"}'
```

### 9.5 Verificar que validar no crea la tarea

```bash
curl -s -X POST http://localhost:8080/api/validar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CREAR TAREA \"No debe existir\""}'

curl -s http://localhost:8080/api/tablero
```

La segunda llamada no debe mostrar «No debe existir».

### 9.6 Error léxico

```bash
curl -s -X POST http://localhost:8080/api/ejecutar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CREAR TAREA \"Led\" @"}'
```

### 9.7 Error sintáctico

```bash
curl -s -X POST http://localhost:8080/api/ejecutar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CREAR TAREA"}'
```

### 9.8 Error semántico

```bash
curl -s -X POST http://localhost:8080/api/ejecutar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CONSULTAR TAREA \"No existe\""}'
```

### 9.9 Error de ejecución con rollback

```bash
curl -s -X POST http://localhost:8080/api/ejecutar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"CREAR TAREA \"Rollback\"\nSI TAREA \"Preparar informe\" ESTA PENDIENTE ENTONCES CAMBIAR ESTADO TAREA \"Preparar informe\" A COMPLETADA\nCAMBIAR ESTADO TAREA \"Preparar informe\" A EN_PROGRESO"}'
```

### 9.10 Correo visible en Mailpit

```bash
curl -s -X POST http://localhost:8080/api/ejecutar \
  -H 'Content-Type: application/json' \
  -d '{"programa":"ENVIAR CORREO A \"prueba@ejemplo.com\" MENSAJE \"Hola desde AutoTask\""}'

curl -s http://localhost:8025/api/v1/messages
```

---

## 10. Evidencia de verificación

| Comprobación | Comando / archivo | Resultado |
| --- | --- | --- |
| Pruebas unitarias y de integración | `npm test` | 117/117 pruebas aprobadas antes de este cambio. |
| Suite E2E con Docker (captura histórica anterior a #46–#52) | `DATABASE_URL=postgresql://autotask:autotask_dev@localhost:55432/autotask npm run test:e2e` | 5/5 en aquella captura; ver matriz para 8/8 de integración. |
| Web y API disponibles | `curl http://localhost:8080/api/salud` | `{"ok":true,"almacenamiento":"postgres"}` |
| Validar no escribe | `tests/servidor.test.js` | Estado de servicios idéntico antes/después de validar. |
| Errores por etapa | `tests/servidor.test.js` | Cobertura léxica, sintáctica, semántica y de ejecución. |
| Contrato de fallo parcial | `tests/servidor.test.js`, `tests/ejecutor.test.js` | `partial: true`, estados `incierto` y `no_procesado`. |
| Correo real en Mailpit | `e2e/autotask.e2e.mjs` | Mensaje encontrado por destinatario en `/api/v1/messages`. |

Los ejemplos de este documento se capturaron contra el servidor de `src/api/servidor.js` usando servicios en memoria para no alterar la base demo, y contra PostgreSQL/Mailpit para la suite E2E.
