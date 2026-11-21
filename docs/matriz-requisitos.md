# Matriz de requisitos y evidencias · AutoTask

**Entrega:** Proyecto integrador · Lenguajes y Autómatas II  
**Fecha de verificación:** 2026-11-20  
**Rama de entrega:** `docs/entrega-final` (integrada a `main` mediante PR)  
**Commit base verificado:** `7e4c742` (`main` después de los PR #36, #37 y #38)  
**Alcance:** AutoTask, opción 3 del PDF: automatización de tareas y procesos mediante instrucciones escritas.

> Esta matriz contrasta el PDF del proyecto con el código y las pruebas del repositorio. Un requisito solo se marca **Cumplido** cuando existe código, prueba o documento verificable. Las adaptaciones propias de la opción 3 se marcan como **Cumplido (adaptado)** y se explican; no se presentan como cumplimiento literal de los ejemplos de dispositivos del PDF.

## 1. Resumen de verificación

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Pruebas unitarias y de integración en memoria | **120/120** | `npm test` |
| Pruebas E2E contra Docker Compose | **5/5** | `DATABASE_URL=postgresql://autotask:autotask_dev@localhost:55432/autotask npm run test:e2e` |
| Arranque limpio con Docker Compose | Verificado | Proyecto aislado `autotask_verify`; `/api/salud` respondió `almacenamiento: "postgres"` |
| Persistencia tras reinicio de contenedores | Verificada | Tarea `Persistencia 1795230072` (`task_7`) conservada después de `docker compose stop`/`start` sin `-v` |
| Correo visible en Mailpit | Verificado | `GET http://localhost:8025/api/v1/messages`; prueba E2E de correo y `docs/contrato-api.md` §9.10 |
| Documentación técnica | Completa para los módulos implementados | `docs/` y este índice |

## 2. Requisitos mínimos del PDF (§15)

| Requisito del PDF | Estado | Implementación / evidencia | Observación |
| --- | --- | --- | --- |
| Aplicación web | **Cumplido** | `index.html`, `consola.js`, `tablero.js`, `src/api/servidor.js`; E2E 1 | Interfaz servida por el mismo servicio `app`. |
| Consola de instrucciones | **Cumplido** | `index.html`, `consola.js`; `tests/consola-ejemplos.test.js` | Validar y ejecutar contra la API real. |
| Panel visual de dispositivos | **Cumplido (adaptado)** | Tablero de tareas por estado e historial: `tablero.js`; `tests/tablero-ejemplos.test.js`, E2E 2 | En la opción 3 el panel visual es el tablero de tareas, no LEDs físicos. |
| Mínimo 3 dispositivos simulados | **Cumplido (adaptado)** | Datos demo con 4 tareas y 3 usuarios (`db/init/002_datos_demo.sql`); tablero con 4 columnas | La opción 3 sustituye dispositivos por tareas y usuarios simulados. No se alega cumplimiento literal de “3 LEDs”. |
| Comandos `ENCENDER` y `APAGAR` | **No aplica literalmente** | Equivalentes AutoTask: `CREAR TAREA`, `CAMBIAR ESTADO ... A EN_PROGRESO/COMPLETADA` | El PDF permite elegir la opción 3; su catálogo propio usa tareas. Ver §4. |
| Comandos `ACTIVAR` y `DESACTIVAR` | **No aplica literalmente** | Equivalentes: transiciones de estado y `CANCELAR` mediante `CAMBIAR ESTADO ... A CANCELADA` | No existen alarmas en AutoTask. |
| Comando `CONSULTAR` | **Cumplido (adaptado)** | `CONSULTAR TAREA "t"`; `tests/parser.test.js`, `tests/ejecutor.test.js` | Devuelve estado y responsable de la tarea. |
| Comando `LISTAR` | **Cumplido (adaptado)** | `LISTAR TAREAS`; `tests/generador-ir.test.js`, E2E 2 | Lista tareas, no dispositivos. |
| Comando `NOTIFICAR` | **Cumplido** | `NOTIFICAR A "usuario" MENSAJE "texto"`; `tests/ejecutor.test.js`, E2E 2 | Notificación interna persistida. |
| Análisis léxico | **Cumplido** | `src/lenguaje.js`; `tests/lexer.test.js` | Errores con línea/columna y recuperación por línea. |
| Análisis sintáctico | **Cumplido** | `src/lenguaje/parser.js`; `tests/parser.test.js` | Gramática EBNF en `docs/gram_tica_formal_autotask.md`. |
| AST | **Cumplido** | `src/lenguaje/parser.js`; `docs/ast-y-parser.md` | Nodos con ubicación y contrato documentado. |
| Tabla de símbolos | **Cumplido** | `src/semantica/tabla-simbolos.js`; `tests/tabla-simbolos.test.js` | Resuelve tareas/usuarios y detecta ambigüedad. |
| Validación semántica | **Cumplido** | `src/semantica/validador.js`; `tests/validador.test.js` | Referencias, fechas, estados y transiciones. |
| Generación de IR | **Cumplido** | `src/ir/generador-ir.js`; `tests/generador-ir.test.js`; `docs/contrato-ir.md` | IR de solo datos, serializable. |
| Dos optimizaciones | **Cumplido** | `src/ir/optimizador.js`; `tests/optimizador.test.js`; E2E 4 | (1) condiciones constantes/código inalcanzable; (2) eliminación de cambios de estado redundantes. |
| Motor de ejecución | **Cumplido** | `src/ejecutor/ejecutor.js`; `tests/ejecutor.test.js` | Transacción, revalidación y despachos posteriores al `COMMIT`. |
| Persistencia | **Cumplido** | `db/init/001_esquema.sql`, `src/persistencia/repositorio-postgres.js`; `tests/repositorio-postgres.test.js`; `docs/persistencia.md` | PostgreSQL 16; respaldo en memoria solo para pruebas. |
| Pruebas automatizadas | **Cumplido** | `npm test` (120) y `npm run test:e2e` (5) | Ver §1. |
| Git y Kanban | **Parcial** | Ramas, PR #21–#38, issues #1–#20 y tablero de GitHub Projects | El tablero existe, pero el token disponible no permite leerlo/actualizarlo; falta evidencia visual del estado final. Ver §7. |
| Docker Compose | **Cumplido** | `Dockerfile`, `docker-compose.yml`, `.env.example`; E2E 1–5 | `docker compose up --build`. |
| Envío de correo por SMTP de pruebas | **Cumplido** | `src/ejecutor/correo-smtp.js`; Mailpit; `tests/correo-smtp.test.js`, E2E 2 | Sin cuentas reales. |
| Condicional `SI … ENTONCES` | **Cumplido** | Parser, validador, IR y ejecutor; `tests/ejecutor.test.js`, E2E 2 | Sin anidamiento, documentado como límite. |
| Repetición `REPETIR` | **No aplica** | PDF §15 la marca como **No** obligatoria | No implementada; se declara como limitación, no como pendiente obligatorio. |

## 3. Aplicación de Lenguajes y Autómatas I y II (§8–§9)

| Tema del PDF | Estado | Evidencia |
| --- | --- | --- |
| Léxico: comandos, cadenas, fechas, estados, ubicaciones | **Cumplido** | `src/lenguaje.js`; `tests/lexer.test.js`; `docs/gram_tica_formal_autotask.md` §1–§3 |
| Error léxico `@` no reconocido | **Cumplido (adaptado)** | `LISTAR TAREAS @` → `CARACTER_INVALIDO`; `tests/lexer.test.js`, `tests/servidor.test.js` |
| Sintaxis: producciones y errores de orden/argumento | **Cumplido** | `src/lenguaje/parser.js`; `tests/parser.test.js`; `docs/ast-y-parser.md` §3 |
| AST de condicional y comandos | **Cumplido** | `tests/parser.test.js`; `docs/ast-y-parser.md` §2 |
| Tabla de símbolos con tipo, estado y operaciones | **Cumplido (adaptado)** | Tareas/usuarios en lugar de LEDs/alarmas; `src/semantica/tabla-simbolos.js`; `docs/tabla-simbolos.md` |
| Acciones semánticas y construcción de la instrucción | **Cumplido** | AST con referencias resueltas en `src/semantica/validador.js`; `docs/validacion-semantica.md` |
| IR mínima (`GET_STATE`, `SET_STATE`, `COMPARE`, `JUMP_IF_FALSE`, `NOTIFY`, `SEND_EMAIL`, `HALT`) | **Cumplido (adaptado)** | Catálogo equivalente: `CREAR_TAREA`, `ASIGNAR_TAREA`, `CAMBIAR_ESTADO`, `CONSULTAR_TAREA`, `LISTAR_TAREAS`, `NOTIFICAR`, `ENVIAR_CORREO`, `EVALUAR_ESTADO`, `SALTAR_SI_FALSO`, `ETIQUETA`; `docs/contrato-ir.md` §2.2 |
| Optimización 1: instrucciones redundantes | **Cumplido** | Eliminación de cambios de estado redundantes; `tests/optimizador.test.js` |
| Optimización 2: asignaciones sobrescritas / condiciones constantes | **Cumplido** | Simplificación de condiciones constantes y eliminación de código inalcanzable; E2E 4. La eliminación de “dead stores” cubre el caso de asignaciones sobrescritas en bloques lineales. |
| Justificación de conservación de comportamiento | **Cumplido** | `src/ir/optimizador.js` respeta barreras observables (`CONSULTAR`, `LISTAR`, `NOTIFICAR`, `ENVIAR_CORREO`, condicionales); prueba “no elimina cambios de estado si hay una consulta observable intermedia”. |
| No eliminar/reordenar efectos externos | **Cumplido** | `OPS_BARRERA_BLOQUE` y pruebas del optimizador; E2E 4 |
| Máquina virtual / ejecutor | **Cumplido (adaptado)** | `src/ejecutor/ejecutor.js` interpreta IR; no hay procesador físico. |
| Actualizar estado y notificar a la interfaz | **Cumplido** | Repositorio + evento `autotask:programa-ejecutado` + recarga del tablero |

## 4. Catálogo de la opción 3 (AutoTask)

| Instrucción del PDF (opción 3) | Estado | Implementación |
| --- | --- | --- |
| `CREAR TAREA "..."` | **Cumplido** | Crear tarea con fecha opcional. |
| `ASIGNAR TAREA "..." A usuario` | **Cumplido** | Asignación por título exacto y nombre de usuario. |
| `CAMBIAR ESTADO TAREA "..." A ...` | **Cumplido** | `PENDIENTE`, `EN_PROGRESO`, `COMPLETADA`, `CANCELADA` con transiciones validadas. |
| `NOTIFICAR usuario MENSAJE "..."` | **Cumplido** | Notificación interna persistida; sintaxis final `NOTIFICAR A "usuario" MENSAJE "..."`. |
| `SI TAREA "..." ESTA ... ENTONCES ...` | **Cumplido** | Condicional simple; sin anidamiento. |
| `CONSULTAR TAREA` / `LISTAR TAREAS` | **Cumplido** | Consulta individual y listado. |
| `ENVIAR CORREO A "..." MENSAJE "..."` | **Cumplido** | SMTP de pruebas (Mailpit). |

### Adaptaciones que no deben presentarse como cumplimiento literal

1. **Dispositivos, LEDs y alarmas:** AutoTask es la opción 3. El panel visual es un tablero de tareas y los comandos son operaciones sobre tareas/usuarios. No existen `ENCENDER led1`, `APAGAR led2`, `ACTIVAR alarma1` ni `DESACTIVAR alarma1`.
2. **Tres dispositivos simulados:** se sustituyen por tres usuarios y cuatro tareas demo. El requisito de “mínimo 3” se mantiene en cantidad de entidades simuladas, pero no en la forma literal de dispositivos.
3. **`REPETIR`:** el PDF la marca como no obligatoria; no se implementó.
4. **Frontend/backend separados:** el PDF recomienda servicios separados; la entrega usa un solo servicio `app` que sirve frontend y API, más PostgreSQL y Mailpit. Es una decisión justificada, no una omisión.

## 5. Pruebas funcionales obligatorias (§16)

Las entradas del PDF usan LEDs y alarmas. Se muestran sus equivalentes AutoTask y la evidencia real.

| Caso del PDF | Equivalente AutoTask | Resultado esperado | Evidencia | Estado |
| --- | --- | --- | --- | --- |
| `ENCENDER led1` | `CREAR TAREA "..."` + `CAMBIAR ESTADO ... A EN_PROGRESO` | Tarea creada/actualizada | `tests/ejecutor.test.js`, E2E 2 | **Cumplido (adaptado)** |
| `APAGAR led1` | `CAMBIAR ESTADO ... A COMPLETADA` | Estado final | `tests/ejecutor.test.js`, `tests/validador.test.js` | **Cumplido (adaptado)** |
| `ACTIVAR alarma1` | `CAMBIAR ESTADO ... A EN_PROGRESO` | Transición válida | `tests/validador.test.js` | **Cumplido (adaptado)** |
| `DESACTIVAR alarma1` | `CAMBIAR ESTADO ... A CANCELADA` | Transición válida | `tests/validador.test.js` | **Cumplido (adaptado)** |
| `CONSULTAR led1` | `CONSULTAR TAREA "..."` | Estado actual | `tests/ejecutor.test.js`, E2E 2 | **Cumplido (adaptado)** |
| `LISTAR DISPOSITIVOS` | `LISTAR TAREAS` | Lista de tareas | `tests/generador-ir.test.js`, E2E 2 | **Cumplido (adaptado)** |
| `ENCENDER dispositivo99` | `CONSULTAR TAREA "No existe"` | Error semántico | `tests/validador.test.js`, `tests/servidor.test.js` | **Cumplido (adaptado)** |
| `ENCENDER alarma1` | `ASIGNAR TAREA` a una tarea `COMPLETADA` o transición inválida | Error de operación incompatible | `tests/validador.test.js`, `tests/ejecutor.test.js` | **Cumplido (adaptado)** |
| `ENCENDER` | `CREAR TAREA` | Error sintáctico `ARGUMENTO_FALTANTE` | `tests/parser.test.js`, `tests/servidor.test.js` | **Cumplido (adaptado)** |
| `ENCENDER led1@` | `LISTAR TAREAS @` | Error léxico `CARACTER_INVALIDO` | `tests/lexer.test.js`, `tests/servidor.test.js` | **Cumplido (adaptado)** |
| `NOTIFICAR "Prueba"` | `NOTIFICAR A "Angel" MENSAJE "Prueba"` | Notificación registrada | `tests/ejecutor.test.js`, E2E 2 | **Cumplido (adaptado)** |
| `ENVIAR CORREO A ...` | `ENVIAR CORREO A "..." MENSAJE "..."` | Correo visible en Mailpit | `tests/correo-smtp.test.js`, E2E 2, `docs/contrato-api.md` §9.10 | **Cumplido** |
| `SI led1 == ENCENDIDO ENTONCES APAGAR led1` | `SI TAREA "..." ESTA COMPLETADA ENTONCES NOTIFICAR ...` | Ejecución condicional | `tests/ejecutor.test.js`, E2E 2 | **Cumplido (adaptado)** |
| Optimizaciones conservan resultados | IR sin optimizar vs. optimizada | Mismos efectos | `tests/optimizador.test.js`, E2E 4 | **Cumplido** |

## 6. Entregables finales (§17)

| Entregable | Estado | Ubicación |
| --- | --- | --- |
| Aplicación funcional | **Cumplido** | `index.html`, `consola.js`, `tablero.js`, API y Docker |
| Repositorio Git e historial de contribuciones | **Cumplido** | PR #21–#38; ramas y commits de los seis integrantes |
| Descripción del sistema y arquitectura | **Cumplido** | `arquitectura-semana-1.md`, `docs/guia-final.md` |
| Gramática formal y tokens | **Cumplido** | `docs/gram_tica_formal_autotask.md` |
| Diseño del AST | **Cumplido** | `docs/ast-y-parser.md` |
| Tabla de símbolos | **Cumplido** | `docs/tabla-simbolos.md` |
| Validaciones semánticas | **Cumplido** | `docs/validacion-semantica.md` |
| Representación intermedia | **Cumplido** | `docs/representacion-intermedia.md`, `docs/contrato-ir.md` |
| Optimizaciones | **Cumplido** | `src/ir/optimizador.js`, `tests/optimizador.test.js`, `docs/contrato-ir.md` §3 |
| Funcionamiento del ejecutor | **Cumplido** | `docs/contrato-ir.md` §4, `docs/contrato-api.md` §7 |
| Modelo de base de datos | **Cumplido** | `docs/persistencia.md`, `db/init/001_esquema.sql` |
| Instrucciones de instalación | **Cumplido** | `README.md`, `docs/guia-final.md` |
| Tablero Kanban | **Parcial** | GitHub Projects; falta evidencia visual final y el token no permite leerlo. Ver §7. |
| Configuración Docker | **Cumplido** | `Dockerfile`, `docker-compose.yml`, `.env.example` |
| Evidencia de pruebas | **Cumplido** | `npm test`, `npm run test:e2e`, `docs/contrato-api.md` §10, este documento |
| Demostración final | **Parcial** | Guion en `docs/guion-demostracion.md`; falta ejecutarla y capturar evidencias. |

## 7. Pendientes reales y evidencias manuales

Estos puntos no se marcan como cumplidos porque requieren una acción humana o un permiso que el repositorio no puede demostrar por sí solo:

1. **Tablero Kanban (#19):** el token de `gh` disponible tiene alcances `gist`, `read:org`, `repo` y `workflow`; no incluye `read:project`/`project`. Por eso no se pudo leer ni actualizar `https://github.com/users/Angixs-zz/projects/4/views/1`. Se necesita autorizar un token con alcance de Projects y mover las tarjetas a “Hecho”, o adjuntar capturas del tablero.
2. **Revisiones de código:** no hay aprobaciones formales registradas (`reviewDecision` vacío). Los PR fueron fusionados, pero “revisiones de código” debe presentarse como **parcial** hasta que existan aprobaciones o capturas de revisión.
3. **Demostración final (#20):** el guion está listo, pero falta ejecutarlo frente al grupo y guardar capturas de: consola, errores de las tres etapas, tablero, historial, Mailpit y comparación de optimizaciones.
4. **Evidencias visuales:** no se almacenan capturas en el repositorio. Deben agregarse a la entrega o al issue #20.
5. **Asignaciones del tablero:** no se modificaron responsables ni se cerraron #19/#20 porque sus criterios dependen de los puntos anteriores.

## 8. Conclusión

El producto implementa el lenguaje formal, el pipeline completo, dos optimizaciones, ejecución transaccional, persistencia PostgreSQL, SMTP de pruebas, Docker Compose y pruebas automatizadas. La adaptación a la opción 3 está justificada en el PDF. Los únicos incumplimientos literales son los comandos de dispositivos y `REPETIR`, que no aplican a AutoTask o son opcionales. Quedan pendientes de evidencia manual el tablero Kanban, las revisiones formales y la demostración.
