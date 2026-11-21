# Guion de demostración y evidencias · AutoTask

**Duración objetivo:** 12–15 minutos  
**Verificación de requisitos:** [matriz-requisitos.md](matriz-requisitos.md)  
**Guía de instalación:** [guia-final.md](guia-final.md)

Este guion sirve para ensayar y ejecutar la demostración final. No inventa resultados: cada paso indica qué debe verse y qué evidencia debe capturarse.

---

## 1. Antes de la demo (checklist técnico)

Ejecutar al menos 30 minutos antes:

- [ ] `git switch main && git pull --ff-only origin main`
- [ ] `cp .env.example .env` (si no existe `.env`)
- [ ] `docker compose up -d --build`
- [ ] `curl http://localhost:8080/api/salud` → `{"ok":true,"almacenamiento":"postgres"}`
- [ ] Abrir <http://localhost:8080> y confirmar que se ven consola, tablero y calendario.
- [ ] Abrir <http://localhost:8025> y confirmar que Mailpit responde.
- [ ] Confirmar que el tablero muestra al menos `Preparar informe`, `Revisar gramática` y `Configurar Docker`.
- [ ] Ejecutar `npm test` → **120/120**.
- [ ] Ejecutar `DATABASE_URL=postgresql://autotask:autotask_dev@localhost:5432/autotask npm run test:e2e` → **5/5** (si los puertos son los de `.env`).
- [ ] Tener una pestaña con el repositorio y otra con el tablero de GitHub Projects.
- [ ] Limpiar la bandeja de Mailpit con el botón de la interfaz o `curl -X DELETE http://localhost:8025/api/v1/messages`.
- [ ] Tener preparadas las capturas de respaldo por si falla la red o Docker.

> Si usas puertos alternativos, ajusta `APP_PORT`, `POSTGRES_PORT`, `SMTP_PORT` y `MAILPIT_UI_PORT` en `.env`, y usa la URL correspondiente en la demo.

---

## 2. Secuencia de demostración (12–15 min)

### 2.1 Apertura y arquitectura (1.5 min)

**Responsable sugerido:** Miguel Ángel.

1. Presentar el problema: instrucciones escritas que se analizan y ejecutan.
2. Aclarar que se eligió la **opción 3 AutoTask**, no la aplicación de LEDs.
3. Mostrar el diagrama de arquitectura de [guia-final.md](guia-final.md) §3.
4. Mencionar el flujo: lexer → parser/AST → símbolos → semántica → IR → optimizador → ejecutor → PostgreSQL/SMTP.

**Evidencia:** captura del diagrama y de la pantalla inicial.

### 2.2 Lenguaje, lexer y parser (2.5 min)

**Responsable sugerido:** Yareli.

1. Abrir la consola y mostrar un programa válido:

```text
CREAR TAREA "Demo final" FECHA "2026-11-30"
ASIGNAR TAREA "Demo final" A "Yareli"
CAMBIAR ESTADO TAREA "Demo final" A EN_PROGRESO
CONSULTAR TAREA "Demo final"
LISTAR TAREAS
```

2. Presionar **Validar**. Debe verse “El programa es válido. Al validar no se guarda ningún cambio.”
3. Mostrar el tablero y confirmar que **no** aparece “Demo final” (validar no escribe).
4. Presionar **Ejecutar** y mostrar los resultados por instrucción.
5. Ir al tablero y confirmar que ahora sí aparece “Demo final” en `EN_PROGRESO`.
6. Mostrar el error léxico:

```text
LISTAR TAREAS @
```

Resultado esperado: `CARACTER_INVALIDO`, etapa `lexica`, línea y columna.

7. Mostrar el error sintáctico:

```text
CREAR TAREA
```

Resultado esperado: `ARGUMENTO_FALTANTE`, etapa `sintactica`.

**Evidencia:** captura de validar sin cambios, ejecución correcta, error léxico y error sintáctico.

### 2.3 Semántica, condicional e IR (2.5 min)

**Responsable sugerido:** Ángel.

1. Mostrar el error semántico:

```text
CONSULTAR TAREA "No existe"
```

Resultado esperado: `TAREA_INEXISTENTE`, etapa `semantica`.

2. Mostrar una operación incompatible: asignar una tarea completada:

```text
ASIGNAR TAREA "Configurar Docker" A "Yareli"
```

Resultado esperado: diagnóstico semántico; no se ejecuta.

3. Mostrar el condicional:

```text
SI TAREA "Configurar Docker" ESTA COMPLETADA ENTONCES NOTIFICAR A "Edwin" MENSAJE "Docker listo"
```

Resultado esperado: condición verdadera y acción ejecutada; la notificación aparece en el historial.

4. Mostrar un condicional falso:

```text
SI TAREA "Preparar informe" ESTA COMPLETADA ENTONCES NOTIFICAR A "Angel" MENSAJE "No debe enviarse"
```

Resultado esperado: `condicion: false`, `accion: null`, sin efectos.

5. Explicar la tabla de símbolos: tareas/usuarios por nombre exacto, ambigüedad y tareas creadas en el programa.
6. Explicar la IR: `EVALUAR_ESTADO`, `SALTAR_SI_FALSO`, acción, `ETIQUETA`; referencias temporales para tareas creadas en el mismo programa.

**Evidencia:** capturas de error semántico, condicional verdadero/falso e historial.

### 2.4 Optimizaciones y ejecutor (2 min)

**Responsable sugerido:** Edwin, con apoyo de Miguel en la integración del optimizador.

1. Explicar las dos optimizaciones:
   - Condiciones constantes y código inalcanzable.
   - Eliminación de cambios de estado redundantes en bloques lineales.
2. Mostrar la prueba que compara IR sin optimizar y optimizada:

```sh
DATABASE_URL=postgresql://autotask:autotask_dev@localhost:5432/autotask \
  npm run test:e2e
```

Señalar el caso **“compara ejecución de IR sin optimizar y optimizada preservando efectos”** (E2E 4).

3. Explicar por qué es seguro: las operaciones observables son barreras; no se eliminan correos ni notificaciones.
4. Explicar la transacción: si falla una operación antes del `COMMIT`, se revierte todo y no se envían correos.
5. Explicar `partial: true`: si falla un despacho después del `COMMIT`, las tareas quedan y el correo puede quedar `incierto` o `no_procesado`; no se debe reintentar el programa completo.

**Evidencia:** captura de la salida E2E 5/5 y del caso 4; captura o explicación del historial con `incierto`/`no_procesado` si se hizo la prueba.

### 2.5 Interfaz: consola, tablero e historial (1.5 min)

**Responsable sugerido:** Melody.

1. Mostrar la consola: ejemplos, atajos, estados de carga/error.
2. Mostrar el tablero con las cuatro columnas: `PENDIENTE`, `EN_PROGRESO`, `COMPLETADA`, `CANCELADA`.
3. Refrescar después de ejecutar y mostrar la nueva tarea y el historial.
4. Filtrar el historial por operación/notificación/correo.
5. Mostrar los estados vacío y error si el tiempo lo permite (casillas de simulación de la interfaz).

**Evidencia:** captura del tablero con la tarea nueva y el historial filtrado.

### 2.6 Persistencia, API y correo (1.5 min)

**Responsable sugerido:** Diego.

1. Mostrar `GET /api/salud` con `almacenamiento: "postgres"`.
2. Mostrar `GET /api/tablero` con tareas, responsables e historial.
3. Explicar el modelo: `usuarios`, `tareas`, `historial_tareas`, `notificaciones`.
4. Mostrar que los datos sobreviven a un reinicio **sin borrar el volumen**:

```sh
docker compose stop
docker compose start
curl http://localhost:8080/api/tablero
```

5. Enviar un correo:

```text
ENVIAR CORREO A "demo@ejemplo.com" MENSAJE "Correo de la demo final"
```

6. Abrir Mailpit y mostrar el mensaje. Aclarar que `en_cola` no confirma entrega; Mailpit sí muestra el correo recibido.

**Evidencia:** captura de `/api/salud`, `/api/tablero`, Mailpit con el correo y, si se hace, la tarea conservada tras el reinicio.

### 2.7 Cierre y límites (1 min)

**Responsable sugerido:** Miguel Ángel.

1. Resumir lo cumplido: lenguaje, lexer, parser/AST, símbolos, semántica, IR, dos optimizaciones, ejecutor, PostgreSQL, SMTP, Docker y 120+5 pruebas.
2. Declarar límites con honestidad:
   - No hay LEDs/alarmas: es la opción 3 AutoTask.
   - No hay `REPETIR` (opcional en el PDF).
   - No hay condicionales anidados.
   - Un solo servicio `app` sirve frontend y API.
3. Mencionar pendientes de evidencia: tablero Kanban y revisiones formales.
4. Cerrar con el repositorio y la matriz de requisitos.

**Evidencia:** captura de la matriz y del repositorio.

---

## 3. Evidencias que deben capturarse

Guardar las imágenes con nombres claros, por ejemplo en `docs/evidencias/` o en el issue #20. No se incluyen capturas inventadas.

| # | Evidencia | Qué debe verse | Dónde |
| --- | --- | --- | --- |
| 1 | Arranque y salud | `docker compose ps` sano + `/api/salud` con `postgres` | Terminal |
| 2 | Pantalla inicial | Consola, tablero y calendario | Navegador |
| 3 | Validar sin efectos | Mensaje “El programa es válido…” y tarea ausente del tablero | Consola + tablero |
| 4 | Ejecución correcta | Resultados por instrucción y tarea nueva en el tablero | Consola + tablero |
| 5 | Error léxico | `CARACTER_INVALIDO` con línea/columna | Consola |
| 6 | Error sintáctico | `ARGUMENTO_FALTANTE` con línea/columna | Consola |
| 7 | Error semántico | `TAREA_INEXISTENTE` o transición inválida | Consola |
| 8 | Condicional verdadero | Acción ejecutada y notificación en historial | Consola + tablero |
| 9 | Condicional falso | `condicion: false`, `accion: null` | Consola |
| 10 | Optimizaciones | E2E 5/5, caso “IR sin optimizar vs. optimizada” | Terminal |
| 11 | Historial | Operaciones, notificaciones y correos con filtros | Tablero |
| 12 | Correo | Mensaje visible en Mailpit | Mailpit |
| 13 | Persistencia | Tarea conservada tras `stop`/`start` | Terminal + tablero |
| 14 | Pruebas | `npm test` 120/120 y E2E 5/5 | Terminal |
| 15 | Git/Kanban | PRs fusionados, issues y tablero | GitHub |

---

## 4. Distribución de presentadores

Distribución basada en las contribuciones verificables del repositorio (commits y PR). No se atribuye trabajo que no esté en el historial.

| Integrante | Contribuciones principales | Parte de la demo | Tiempo |
| --- | --- | --- | --- |
| **Miguel Ángel** (`Angixs-zz`) | Arquitectura y contratos (#1/#21), integración del pipeline y API (#34), PostgreSQL (#35), corrección de `partial` (#30), E2E (#36), contrato API (#37), cierre de arquitectura (#38) | Apertura, arquitectura, cierre, coordinación | 2.5 min |
| **Yareli** (`yareliyazmin16`) | Gramática (#2/#22), lexer (#3/#23), parser/AST (#4/#33) | Lenguaje, lexer, parser y errores | 2.5 min |
| **Melody** (`Melody-Mendoza`) | Consola (#7/#25), tablero e historial (#8/#31), integración frontend (#16) | Interfaz, tablero e historial | 1.5 min |
| **Diego** (`diegooash`) | Esquema y repositorio PostgreSQL (#5/#32), API (#6), notificaciones/SMTP (#14), integración API-motor (#15) | Persistencia, API y correo | 1.5 min |
| **Ángel** (`Angel-2329`) | Tabla de símbolos (#9/#26), validación semántica (#10/#27), IR (#11/#29) | Semántica, condicional e IR | 2.5 min |
| **Edwin** (`noeEdwin`) | Ejecutor (#12/#28), Docker (#17/#24), E2E (#18/#36); contrato de IR y optimizaciones (#13). La integración final del optimizador quedó en el PR #34 de Miguel. | Ejecutor, optimizaciones, Docker y `partial` | 2 min |

> **Nota de honestidad:** el issue #13 (optimizaciones) estaba asignado a Edwin, pero el commit de integración del optimizador en `main` es de Miguel (`6b2fb3b`, PR #34). En la demo, Edwin presenta el contrato y la justificación; Miguel explica la integración. No se debe afirmar que una sola persona escribió todo el optimizador.

---

## 5. Preguntas probables y respuestas

| Pregunta | Respuesta breve |
| --- | --- |
| ¿Por qué no hay LEDs? | Se eligió la opción 3 AutoTask del PDF; el panel es un tablero de tareas. |
| ¿Dónde está `REPETIR`? | El PDF la marca como no obligatoria; no se implementó y se declara como límite. |
| ¿Validar modifica la base? | No. Validar ejecuta hasta el optimizador y no llama al ejecutor; hay prueba y ejemplo `curl`. |
| ¿Qué pasa si falla el correo? | Las tareas ya confirmadas se conservan; la respuesta trae `partial: true` y estados `incierto`/`no_procesado`. |
| ¿Cómo evitan correos fantasma? | Los correos se despachan después del `COMMIT`; si falla la transacción, no se envían. |
| ¿Las optimizaciones cambian el resultado? | No; respetan barreras observables y hay una prueba que compara IR sin optimizar vs. optimizada. |
| ¿Por qué un solo servicio `app`? | Sirve frontend y API; PostgreSQL y Mailpit siguen separados. Es una decisión de despliegue documentada. |
| ¿Dónde está el Kanban? | En GitHub Projects; falta la captura/actualización final por permisos del token. |

---

## 6. Plan de contingencia

1. **Docker no arranca:** usar `npm start` con memoria para mostrar la interfaz y los errores; aclarar que persistencia y Mailpit no se están demostrando en vivo. Mostrar las capturas de respaldo.
2. **Mailpit no recibe:** revisar `SMTP_HOST`, `docker compose logs mailpit` y usar la captura previa. No afirmar que el correo se envió si no se ve.
3. **Puertos ocupados:** cambiar `.env` a `8090/55432/1125/8026` y usar esas URLs.
4. **Falla la red:** tener el repositorio clonado y las capturas en local.
5. **Poco tiempo:** priorizar flujo válido, tres errores, condicional, tablero, Mailpit y cierre con límites.

---

## 7. Cierre de la demo

Al terminar:

- [ ] Confirmar que las 15 evidencias están capturadas o marcadas como no disponibles.
- [ ] Adjuntar las capturas al issue #20 o a la entrega.
- [ ] Actualizar el tablero Kanban si se cuenta con permisos.
- [ ] No cerrar #19/#20 hasta que las evidencias y el tablero estén completos.
- [ ] Registrar la fecha y el commit exacto de la demo.
