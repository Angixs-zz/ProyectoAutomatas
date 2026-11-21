# Guía final de AutoTask

**Proyecto:** Sistema de interpretación y ejecución de instrucciones · Opción 3 **AutoTask**  
**Materia:** Lenguajes y Autómatas II  
**Repositorio:** <https://github.com/Angixs-zz/ProyectoAutomatas>  
**Tablero:** <https://github.com/users/Angixs-zz/projects/4/views/1>  
**Verificación de requisitos:** [matriz-requisitos.md](matriz-requisitos.md)

Esta guía describe el sistema entregado, cómo levantarlo, cómo probarlo y cuáles son sus límites reales. Está escrita para que otra persona pueda ejecutar AutoTask desde cero siguiendo los pasos, sin depender de datos locales del equipo.

---

## 1. Descripción y alcance

AutoTask es una aplicación web que recibe instrucciones escritas en un lenguaje propio, las analiza y ejecuta operaciones sobre tareas y usuarios simulados. El flujo completo es:

```text
texto → lexer → parser/AST → tabla de símbolos → validación semántica
      → generación de IR → optimización → ejecutor → PostgreSQL / notificaciones / SMTP
```

La aplicación permite:

- Crear tareas con título y fecha opcional.
- Asignar tareas a usuarios.
- Cambiar el estado de una tarea.
- Consultar una tarea o listar todas.
- Generar notificaciones internas.
- Enviar correos de prueba a Mailpit.
- Ejecutar una acción simple bajo una condición `SI … ENTONCES`.
- Ver el tablero por estado y el historial de operaciones.

### Decisión de alcance: opción 3

El PDF propone una aplicación de dispositivos (LEDs y alarmas) y, como alternativa, la opción 3 **AutoTask**: gestión de tareas. El equipo eligió la opción 3. Por eso **no existen** `ENCENDER led1`, `APAGAR led2`, `ACTIVAR alarma1` ni `DESACTIVAR alarma1`. Sus equivalentes son operaciones sobre tareas:

| Ejemplo del PDF | Equivalente AutoTask |
| --- | --- |
| `ENCENDER led1` | `CREAR TAREA "..."` y `CAMBIAR ESTADO ... A EN_PROGRESO` |
| `APAGAR led1` | `CAMBIAR ESTADO ... A COMPLETADA` |
| `ACTIVAR alarma1` | `CAMBIAR ESTADO ... A EN_PROGRESO` |
| `DESACTIVAR alarma1` | `CAMBIAR ESTADO ... A CANCELADA` |
| `CONSULTAR led1` | `CONSULTAR TAREA "..."` |
| `LISTAR DISPOSITIVOS` | `LISTAR TAREAS` |

`REPETIR` aparece como **no obligatoria** en el PDF y no se implementó. Está declarada como limitación, no como requisito pendiente.

---

## 2. Requisitos e instalación

### 2.1 Requisitos

| Herramienta | Versión usada | Uso |
| --- | --- | --- |
| Node.js | 22 o superior | API, motor y pruebas |
| npm | Incluido con Node | Dependencias y scripts |
| Docker | 24 o superior | Despliegue con Compose |
| Docker Compose | v2 (`docker compose`) | App + PostgreSQL + Mailpit |
| PostgreSQL | 16 (contenedor) | Persistencia real |
| Mailpit | Última imagen | SMTP de pruebas |

Opcional: `curl` para probar la API y un navegador moderno para la interfaz.

### 2.2 Instalación con Docker Compose (recomendada)

```sh
git clone https://github.com/Angixs-zz/ProyectoAutomatas.git
cd ProyectoAutomatas
cp .env.example .env
docker compose up --build
```

Servicios y puertos por defecto:

| Servicio | URL / puerto | Descripción |
| --- | --- | --- |
| `app` | <http://localhost:8080> | Frontend + API |
| `postgres` | `localhost:5432` | PostgreSQL con volumen `postgres_data` |
| `mailpit` | `http://localhost:8025` | Interfaz de correos de prueba |
| `mailpit` SMTP | `localhost:1025` | Puerto SMTP publicado |

Si un puerto está ocupado, edita `.env`:

```sh
APP_PORT=8090
POSTGRES_PORT=55432
SMTP_PORT=1125
MAILPIT_UI_PORT=8026
```

Después:

```sh
docker compose up --build
```

Verifica que la API usa PostgreSQL:

```sh
curl http://localhost:8090/api/salud
# {"ok":true,"almacenamiento":"postgres"}
```

Para detener sin borrar datos:

```sh
docker compose stop
```

Para reiniciar conservando el volumen:

```sh
docker compose start
```

Para borrar también la base de datos (acción destructiva, solo si se desea reiniciar desde cero):

```sh
docker compose down -v
```

> **No se debe ejecutar `docker compose down -v` sobre una base con datos que se quieran conservar.** La verificación de persistencia de la entrega se hizo con `stop`/`start`, sin `-v`.

### 2.3 Instalación local sin Docker

La API puede arrancar con almacenamiento en memoria si no se configuran PostgreSQL ni SMTP. Es útil para desarrollo y pruebas, pero **no demuestra persistencia**.

```sh
git clone https://github.com/Angixs-zz/ProyectoAutomatas.git
cd ProyectoAutomatas
npm install
npm start
```

Abre <http://localhost:8080>. El servidor indicará `AutoTask escuchando en http://localhost:8080 (memoria)`.

Para usar PostgreSQL local:

```sh
export DATABASE_URL=postgresql://autotask:autotask_dev@localhost:5432/autotask
npm start
```

Para usar Mailpit local, define `SMTP_HOST` y `SMTP_PORT`. El servidor solo activa SMTP si `SMTP_HOST` existe; si no, usa un correo simulado en memoria.

> `npm install` es necesario en la entrega final porque la API usa la dependencia `pg`. La base inicial del calendario no la necesitaba, pero el producto completo sí.

---

## 3. Arquitectura

```mermaid
flowchart LR
    UI[Consola y tablero\nindex.html · consola.js · tablero.js]
    API[API HTTP\nsrc/api/servidor.js]
    MOTOR[Orquestador\nsrc/motor/ejecutar-programa.js]
    LEX[Lexer\nsrc/lenguaje.js]
    PAR[Parser / AST\nsrc/lenguaje/parser.js]
    SIM[Tabla de símbolos\nsrc/semantica/tabla-simbolos.js]
    SEM[Validación semántica\nsrc/semantica/validador.js]
    IR[Generador de IR\nsrc/ir/generador-ir.js]
    OPT[Optimizador\nsrc/ir/optimizador.js]
    EXE[Ejecutor\nsrc/ejecutor/ejecutor.js]
    DB[(PostgreSQL\nusuarios · tareas · historial · notificaciones)]
    SMTP[SMTP de pruebas\nMailpit]

    UI -->|POST /api/validar o /api/ejecutar| API
    API --> MOTOR
    MOTOR --> LEX --> PAR --> SIM --> SEM --> IR --> OPT --> EXE
    EXE --> DB
    EXE --> SMTP
    EXE -->|resultados y diagnósticos| API
    API -->|JSON| UI
    UI -->|GET /api/tablero| API
```

### Modos de la API

- **Validación (`POST /api/validar`):** ejecuta lexer → parser → tabla de símbolos → semántica → IR → optimizador. **No llama al ejecutor y no escribe datos.**
- **Ejecución (`POST /api/ejecutar`):** ejecuta el mismo pipeline y después `ejecutarIR`.

La separación es deliberada: validar permite revisar errores y la IR sin efectos secundarios. La prueba `validar un programa correcto no devuelve resultados ni cambia nada` y la sección 4 de [contrato-api.md](contrato-api.md) lo verifican.

### Módulos principales

| Módulo | Archivo | Pruebas |
| --- | --- | --- |
| Lexer | `src/lenguaje.js` | `tests/lexer.test.js` |
| Parser / AST | `src/lenguaje/parser.js` | `tests/parser.test.js` |
| Tabla de símbolos | `src/semantica/tabla-simbolos.js` | `tests/tabla-simbolos.test.js` |
| Validación semántica | `src/semantica/validador.js` | `tests/validador.test.js` |
| Generador de IR | `src/ir/generador-ir.js` | `tests/generador-ir.test.js` |
| Optimizador | `src/ir/optimizador.js` | `tests/optimizador.test.js` |
| Ejecutor | `src/ejecutor/ejecutor.js` | `tests/ejecutor.test.js` |
| Orquestador | `src/motor/ejecutar-programa.js` | `tests/integracion.test.js` |
| API | `src/api/servidor.js` | `tests/servidor.test.js` |
| Persistencia | `src/persistencia/repositorio-postgres.js` | `tests/repositorio-postgres.test.js` |
| SMTP | `src/ejecutor/correo-smtp.js` | `tests/correo-smtp.test.js` |
| Consola | `consola.js` | `tests/consola-ejemplos.test.js` |
| Tablero | `tablero.js` | `tests/tablero-ejemplos.test.js` |
| Calendario heredado | `app.js`, `schedule.js` | `tests/schedule.test.js` |
| E2E Docker | `e2e/autotask.e2e.mjs` | `npm run test:e2e` |

El detalle de decisiones iniciales vs. implementación final está en [arquitectura-semana-1.md](../arquitectura-semana-1.md), sección 8. El contrato HTTP completo está en [contrato-api.md](contrato-api.md).

---

## 4. Lenguaje: gramática, tokens y errores

La gramática formal completa está en [gram_tica_formal_autotask.md](gram_tica_formal_autotask.md). Resumen:

```ebnf
programa           = { SALTO_LINEA }, [ instruccion, { SALTO_LINEA, { SALTO_LINEA }, instruccion } ], { SALTO_LINEA } ;
instruccion        = instruccion_simple | condicional ;
instruccion_simple = crear_tarea | asignar_tarea | cambiar_estado | consultar_tarea
                   | listar_tareas | notificar | enviar_correo ;

crear_tarea        = "CREAR", "TAREA", CADENA, [ "FECHA", FECHA ] ;
asignar_tarea      = "ASIGNAR", "TAREA", CADENA, "A", CADENA ;
cambiar_estado     = "CAMBIAR", "ESTADO", "TAREA", CADENA, "A", estado ;
consultar_tarea    = "CONSULTAR", "TAREA", CADENA ;
listar_tareas      = "LISTAR", "TAREAS" ;
notificar          = "NOTIFICAR", "A", CADENA, "MENSAJE", CADENA ;
enviar_correo      = "ENVIAR", "CORREO", "A", CADENA, "MENSAJE", CADENA ;
condicional        = "SI", "TAREA", CADENA, "ESTA", estado, "ENTONCES", instruccion_simple ;

estado             = "PENDIENTE" | "EN_PROGRESO" | "COMPLETADA" | "CANCELADA" ;
```

Reglas de escritura:

- Palabras clave y estados en **MAYÚSCULAS** y sin acentos.
- Cadenas con comillas dobles; no se permiten saltos de línea dentro de una cadena.
- Fechas ISO `"YYYY-MM-DD"` después de `FECHA`.
- Cada instrucción termina en salto de línea; las líneas vacías se ignoran.
- Los usuarios y tareas se referencian por **nombre o título exacto**; los IDs `task_N`/`user_N` son internos.

### Tokens principales

`CREAR`, `TAREA`, `TAREAS`, `ASIGNAR`, `CAMBIAR`, `ESTADO`, `CONSULTAR`, `LISTAR`, `NOTIFICAR`, `ENVIAR`, `CORREO`, `MENSAJE`, `FECHA`, `A`, `SI`, `ESTA`, `ENTONCES`, estados válidos, `CADENA`, `FECHA`, `SALTO_LINEA`.

### Etapas de error

| Etapa | Ejemplo | Código esperado |
| --- | --- | --- |
| Léxica | `LISTAR TAREAS @` | `CARACTER_INVALIDO` |
| Léxica | `CREAR TAREA "sin cerrar` | `CADENA_SIN_CERRAR` |
| Sintáctica | `CREAR TAREA` | `ARGUMENTO_FALTANTE` |
| Sintáctica | `ASIGNAR "t" A "u"` | `TOKEN_INESPERADO` |
| Semántica | `CONSULTAR TAREA "No existe"` | `TAREA_INEXISTENTE` |
| Semántica | `CAMBIAR ESTADO TAREA "Preparar informe" A COMPLETADA` sobre una tarea ya completada | Transición inválida |
| Ejecución | Fallo de persistencia o SMTP | `ERROR_PERSISTENCIA`, `ERROR_CORREO` |

Los errores de programa devuelven HTTP `200` con `ok: false` y `diagnosticos`; los códigos `400/404/405/500` son errores de la petición o del servidor. Ver [contrato-api.md](contrato-api.md) §6.

---

## 5. AST y tabla de símbolos

### AST

El parser produce un nodo `Programa` con instrucciones y ubicaciones (`inicio`/`fin`, base 1, fin exclusivo). Los nodos principales son:

- `CrearTarea`, `AsignarTarea`, `CambiarEstado`, `ConsultarTarea`, `ListarTareas`.
- `Notificar`, `EnviarCorreo`.
- `Condicional` con condición (`tarea`, `estado`) y acción simple.

El contrato y los ejemplos están en [ast-y-parser.md](ast-y-parser.md). El AST no ejecuta nada: solo representa la estructura.

### Tabla de símbolos

`crearTablaSimbolos(repositorio)` construye símbolos de solo lectura para tareas y usuarios. Cada símbolo incluye tipo, estado, operaciones permitidas y datos de la entidad. Detecta:

- `TAREA_INEXISTENTE` / `USUARIO_INEXISTENTE`.
- `TAREA_AMBIGUA` / `USUARIO_AMBIGUO` cuando hay títulos o nombres repetidos.
- Referencias exactas: mayúsculas y acentos cuentan.

Una tarea creada dentro del mismo programa se registra como símbolo temporal para las instrucciones siguientes. Una tarea creada **dentro de un `SI`** no se considera existente después del condicional, porque su creación es incierta. Ver [tabla-simbolos.md](tabla-simbolos.md) y las pruebas de `tests/tabla-simbolos.test.js`.

---

## 6. Validación semántica

El validador recibe el AST y la tabla de símbolos, resuelve referencias y comprueba:

- Existencia y ambigüedad de tareas/usuarios.
- Estados válidos y transiciones permitidas.
- Fechas reales y formato correcto.
- Operaciones compatibles (por ejemplo, no asignar una tarea completada).
- Condiciones y acciones del `SI`.
- Textos vacíos y correos con estructura válida.

Estados y transiciones:

```text
PENDIENTE → EN_PROGRESO → COMPLETADA
PENDIENTE → CANCELADA
EN_PROGRESO → CANCELADA
COMPLETADA y CANCELADA son finales
```

No se permite cambiar al mismo estado ni reabrir una tarea final. El detalle está en [validacion-semantica.md](validacion-semantica.md). La validación **no escribe** en el repositorio: cada ejecución parte de una tabla nueva.

---

## 7. Representación intermedia y optimizaciones

### IR

El generador produce un `ProgramaIR` de solo datos (serializable a JSON) con instrucciones como:

`CREAR_TAREA`, `ASIGNAR_TAREA`, `CAMBIAR_ESTADO`, `CONSULTAR_TAREA`, `LISTAR_TAREAS`, `NOTIFICAR`, `ENVIAR_CORREO`, `EVALUAR_ESTADO`, `SALTAR_SI_FALSO`, `ETIQUETA`.

Cada instrucción incluye operación, argumentos y ubicación. Las tareas creadas en el programa usan referencias temporales (`tmp`) para que las instrucciones siguientes no dependan de un ID que aún no existe en la base. El contrato completo está en [contrato-ir.md](contrato-ir.md) y la traducción por comando en [representacion-intermedia.md](representacion-intermedia.md).

### Optimizaciones implementadas

1. **Simplificación de condiciones constantes y eliminación de código inalcanzable.** Si el estado de una tarea se conoce en tiempo de compilación (por ejemplo, se acaba de crear y está `PENDIENTE`), una condición que siempre es verdadera se ejecuta directamente y una que siempre es falsa se elimina.
2. **Eliminación de cambios de estado redundantes (dead store).** En un bloque lineal sin lecturas observables, un `CAMBIAR_ESTADO` sobrescrito por otro posterior se elimina.

Ambas conservan el comportamiento porque el optimizador trata como **barreras** las operaciones observables: `CONSULTAR_TAREA`, `LISTAR_TAREAS`, `NOTIFICAR`, `ENVIAR_CORREO`, etiquetas, saltos y condicionales. Las operaciones con efectos externos no se eliminan ni se reordenan. Las pruebas `tests/optimizador.test.js` y el E2E 4 comparan IR sin optimizar vs. optimizada y verifican los mismos efectos.

---

## 8. Ejecutor, transacciones y `partial: true`

El ejecutor interpreta la IR optimizada y:

1. Identifica la operación.
2. Obtiene la tarea o usuario.
3. Revalida el estado en tiempo de ejecución.
4. Ejecuta la operación dentro de una transacción.
5. Registra el resultado y el historial.
6. Después del `COMMIT`, despacha notificaciones y correos.

### Garantía transaccional

Las operaciones sobre tareas se agrupan en una transacción. Si una instrucción falla antes del `COMMIT`, se revierte todo y no se envían correos. Esto evita correos “fantasma” y estados a medias.

### Fallo después del `COMMIT`

Un correo o una notificación no se puede revertir. Si el despacho falla después de confirmar los cambios, la API responde:

- `ok: false`
- `partial: true`
- `resultados` con lo que sí se confirmó
- estados `incierto` o `no_procesado` para los despachos afectados

La consola advierte que **no se debe reintentar el programa completo**. El contrato y un ejemplo real están en [contrato-api.md](contrato-api.md) §7. La prueba `fallo SMTP después del commit conserva tareas y distingue correos aceptados, inciertos y no procesados` cubre este caso.

### Condicional

`SI TAREA "t" ESTA E ENTONCES accion` se traduce a `EVALUAR_ESTADO`, `SALTAR_SI_FALSO`, la acción y una `ETIQUETA`. Si la condición es falsa, la acción no produce efectos y el resultado registra `condicion: false` y `accion: null`. No se permiten condicionales anidados.

---

## 9. Persistencia, API y correo

### Modelo de datos

```mermaid
erDiagram
  USUARIOS ||--o{ TAREAS : responsable_actual
  TAREAS ||--o{ HISTORIAL_TAREAS : registra
  USUARIOS o|--o{ HISTORIAL_TAREAS : actor_opcional
  USUARIOS ||--o{ NOTIFICACIONES : recibe
```

| Tabla | Contenido |
| --- | --- |
| `usuarios` | `id` (`user_N`), nombre, correo opcional |
| `tareas` | `id` (`task_N`), título, fecha, estado, `responsable_id` |
| `historial_tareas` | creación, asignación, cambios, consultas, listados, notificaciones, correos, condicionales y errores |
| `notificaciones` | mensajes internos y su estado de despacho |

Estados persistentes de notificación: `en_cola`, `enviado`, `fallido`, `incierto`, `no_procesado` (y el alias legado `error`). El detalle está en [persistencia.md](persistencia.md).

Los scripts de `db/init/` se ejecutan al crear el volumen por primera vez y también mediante `aplicarMigraciones` al arrancar la app:

- `001_esquema.sql`: tablas, restricciones e índices.
- `002_datos_demo.sql`: usuarios y tareas de ejemplo; es idempotente.
- `003_alinear_historial_notificaciones.sql`: alinea columnas y estados con el ejecutor.

### API

| Método | Ruta | Función |
| --- | --- | --- |
| `GET` | `/api/salud` | Estado y almacenamiento (`postgres` o `memoria`) |
| `GET` | `/api/tablero` | Tareas con responsable e historial |
| `POST` | `/api/validar` | Analiza, valida y optimiza sin escribir |
| `POST` | `/api/ejecutar` | Ejecuta y persiste |

Cuerpo: `{ "programa": "..." }` (alias `texto`). Respuesta de programa: HTTP `200` con `ok`, `modo`, `resultados`, `diagnosticos` y, si aplica, `partial`. El contrato completo, códigos y ejemplos `curl` están en [contrato-api.md](contrato-api.md).

### Correo de prueba

El cliente SMTP nativo envía a Mailpit. No requiere cuenta real. Para verificar:

```sh
curl -s http://localhost:8025/api/v1/messages
```

O abre <http://localhost:8025> después de ejecutar:

```text
ENVIAR CORREO A "prueba@ejemplo.com" MENSAJE "Hola desde AutoTask"
```

El resultado `en_cola` significa **aceptado**, no entrega confirmada. La confirmación real se observa en Mailpit.

---

## 10. Pruebas, resultados y limitaciones

### Comandos

```sh
# Pruebas unitarias y de integración en memoria (sin Docker)
npm test

# E2E contra Docker Compose
DATABASE_URL=postgresql://autotask:autotask_dev@localhost:5432/autotask npm run test:e2e
```

Si usaste puertos distintos:

```sh
AUTOTASK_URL=http://localhost:8090 \
MAILPIT_URL=http://localhost:8026 \
DATABASE_URL=postgresql://autotask:autotask_dev@localhost:55433/autotask \
npm run test:e2e
```

### Resultados de la entrega

| Suite | Resultado | Qué cubre |
| --- | --- | --- |
| `npm test` | **120/120** | Lexer, parser, AST, símbolos, semántica, IR, optimizador, ejecutor, API, persistencia, SMTP, consola, tablero y calendario |
| `npm run test:e2e` | **5/5** | Web + PostgreSQL + Mailpit, flujo completo, errores por etapa, rollback real, optimizaciones y `partial` |

La suite E2E crea datos con marca de tiempo; no borra los datos demo. La verificación de persistencia se hizo creando una tarea, deteniendo y arrancando el proyecto aislado sin `-v`, y confirmando que la tarea seguía en `/api/tablero`.

### Limitaciones declaradas

1. **No hay `REPETIR`**: el PDF la marca como opcional.
2. **No hay condicionales anidados** ni funciones, recursividad o variables definidas por el usuario.
3. **No hay dispositivos físicos ni LEDs**: AutoTask usa tareas y usuarios.
4. **Un solo servicio `app`** sirve frontend y API; no hay un servicio separado de frontend.
5. **La entrega de correo no se confirma**: `en_cola` solo indica aceptación; Mailpit muestra el mensaje.
6. **El tablero Kanban y las revisiones formales** requieren evidencia manual; ver [matriz-requisitos.md](matriz-requisitos.md) §7.

### Solución de problemas

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `npm start` falla con `Cannot find package 'pg'` | Falta `npm install` | Ejecuta `npm install`. |
| `/api/salud` devuelve `memoria` en Docker | `DATABASE_URL` o `PGHOST` no llegó al contenedor | Revisa `.env` y `docker compose config`. |
| La app no conecta a PostgreSQL | Contenedor aún iniciando o puerto ocupado | `docker compose ps`; espera el healthcheck; cambia `POSTGRES_PORT`. |
| No aparecen correos en Mailpit | `SMTP_HOST` no configurado o Mailpit no inició | Revisa `/api/salud` y `docker compose logs mailpit`. |
| `docker compose down -v` borró datos | Se usó `-v` | Es destructivo por diseño; recrea los datos demo con `docker compose up`. |
| E2E falla por conexión | Puertos o `DATABASE_URL` no coinciden | Usa `AUTOTASK_URL`, `MAILPIT_URL` y `DATABASE_URL` correctos. |

---

## Referencias

- [README](../README.md) · instalación rápida.
- [Matriz de requisitos](matriz-requisitos.md) · cumplimiento y pendientes.
- [Guion de demostración](guion-demostracion.md) · secuencia y evidencias.
- [Contrato de API](contrato-api.md) · endpoints, errores y `partial`.
- [Contrato de IR](contrato-ir.md) · IR, optimizaciones y ejecución.
- [Gramática formal](gram_tica_formal_autotask.md) · tokens y EBNF.
- [AST y parser](ast-y-parser.md) · nodos y diagnósticos.
- [Tabla de símbolos](tabla-simbolos.md) · resolución de referencias.
- [Validación semántica](validacion-semantica.md) · estados y operaciones.
- [Representación intermedia](representacion-intermedia.md) · traducción por comando.
- [Persistencia](persistencia.md) · modelo y estados.
- [Arquitectura inicial y contraste final](../arquitectura-semana-1.md) · decisiones y cambios.
