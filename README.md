# AutoTask · ProyectoAutomatas

Base inicial del proyecto integrador de Lenguajes y Autómatas II. AutoTask corresponde a la opción 3 de la consigna, enfocada en la automatización de tareas y procesos mediante instrucciones escritas.

El punto de partida es [TareasHogar en el commit `dfbc59b`](https://github.com/Angixs-zz/TareasHogar/commit/dfbc59bc014048cb72dc76ad32f896cdd86feabe), una aplicación web hecha con HTML, CSS y JavaScript.

## Qué funciona en esta base

- Calendario de tareas con turnos de fin de semana, filtros por persona y consulta del reparto.
- Rotaciones independientes por tarea. Si una persona ya tiene una tarea asignada ese fin de semana, su siguiente turno se aplaza y se conserva. Las tareas se procesan por prioridad.
- Panel para elegir participantes y tareas activas. El formulario permite añadir tareas con una rotación válida.
- Configuración y tareas añadidas guardadas en el navegador. La exportación `.ics` y los avisos compartibles se conservan como herramientas del calendario.

`schedule.js` contiene las rotaciones, sus validaciones y el cálculo de turnos. `app.js` conecta esa lógica con la interfaz. `tests/schedule.test.js` verifica las reglas existentes, incluidos los aplazamientos, la equidad y la exportación.

## Ejecutar localmente

Con Node.js 22 o superior, clona el repositorio, instala la dependencia de PostgreSQL y levanta la API con el frontend.

```sh
git clone https://github.com/Angixs-zz/ProyectoAutomatas.git
cd ProyectoAutomatas
npm install
npm start
```

Abre [http://localhost:8080](http://localhost:8080). Sin `DATABASE_URL` ni `SMTP_HOST`, la API usa almacenamiento y correo en memoria, suficiente para probar la interfaz. Para persistencia real y correo de prueba, usa Docker Compose o define `DATABASE_URL` y `SMTP_HOST`. Las pruebas se ejecutan con `npm test`.

## Estado de integración

El flujo completo de AutoTask descrito en [arquitectura-semana-1.md](arquitectura-semana-1.md) está integrado en `main`:

- **Lenguaje y compilador:** lexer (`src/lenguaje.js`), parser/AST (`src/lenguaje/parser.js`), tabla de símbolos (`src/semantica/tabla-simbolos.js`), validación semántica (`src/semantica/validador.js`), generador de IR (`src/ir/generador-ir.js`), optimizador de IR (`src/ir/optimizador.js`) y ejecutor transaccional (`src/ejecutor/ejecutor.js`).
- **API y servicios:** servidor Node.js (`src/api/servidor.js`, iniciado con `npm start`) con `/api/validar`, `/api/ejecutar`, `/api/tablero` y `/api/salud`, repositorio PostgreSQL (`src/persistencia/repositorio-postgres.js`, `src/persistencia/migraciones.js`, `db/init/`) con respaldo en memoria para pruebas locales, y cliente SMTP para Mailpit (`src/ejecutor/correo-smtp.js`).
- **Contrato HTTP:** solicitudes, respuestas, códigos de error, diagnósticos por etapa y comportamiento de `partial: true` en [docs/contrato-api.md](docs/contrato-api.md).
- **Interfaz:** consola de instrucciones (`consola.js`), tablero por estado e historial (`tablero.js`) y calendario de rotaciones (`app.js`, `schedule.js`).

### Documentación de entrega

- [Guía final](docs/guia-final.md): instalación, arquitectura, base de datos, pruebas y límites.
- [Matriz de requisitos](docs/matriz-requisitos.md): contraste del PDF con el código y evidencias.
- [Guion de demostración](docs/guion-demostracion.md): secuencia, capturas y presentadores.
- [Índice de documentación](docs/README.md): gramática, AST, semántica, IR, API y persistencia.

## Ejecutar con Docker Compose

1. Copia el archivo de variables de ejemplo (puedes dejar los valores estándar o ajustarlos si algún puerto está ocupado en tu máquina):

```sh
cp .env.example .env
```

2. Levanta los servicios (aplicación, PostgreSQL y Mailpit):

```sh
docker compose up --build
```

### Puertos y servicios

| Servicio | Puerto estándar | Descripción |
| --- | --- | --- |
| `app` | `8080` (`APP_PORT`) | Aplicación web en `http://localhost:8080` |
| `postgres` | `5432` (`POSTGRES_PORT`) | Base de datos PostgreSQL con volumen persistente `postgres_data` |
| `mailpit` | `1025` (`SMTP_PORT`) / `8025` (`MAILPIT_UI_PORT`) | Servidor SMTP de pruebas e interfaz web en `http://localhost:8025` |

### Variables de entorno y datos de ejemplo

Las variables disponibles se encuentran en `.env.example` (`APP_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`, `DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `MAILPIT_UI_PORT`, `SMTP_FROM`).

Los scripts `.sql` colocados en `db/init/` (`001_esquema.sql`, `002_datos_demo.sql`, `003_alinear_historial_notificaciones.sql`) se ejecutan automáticamente al inicializar el volumen de PostgreSQL por primera vez y mediante `aplicarMigraciones` al arrancar la aplicación. Para reiniciar desde cero incluyendo la base de datos:

```sh
docker compose down -v
```

### Pruebas automatizadas y verificación en Mailpit

1. **Pruebas unitarias y de integración en memoria (no requieren Docker):**

```sh
npm test
```

2. **Suite E2E opcional contra Docker Compose (PostgreSQL + Mailpit):**

Con los contenedores levantados (`docker compose up -d --build`, o definiendo `POSTGRES_PORT=55432` si el puerto `5432` del host está ocupado):

```sh
DATABASE_URL=postgresql://autotask:autotask_dev@localhost:5432/autotask npm run test:e2e
```

(Si usaste `POSTGRES_PORT=55432`, ajusta el puerto en `DATABASE_URL`.)

3. **Verificar el envío de correos en Mailpit:**

- Abre [http://localhost:8025](http://localhost:8025) en el navegador después de ejecutar un comando `ENVIAR CORREO A "..." MENSAJE "..."` desde la consola web ([http://localhost:8080](http://localhost:8080)) o tras correr `npm run test:e2e`.
- También puedes consultar la bandeja vía API: `curl http://localhost:8025/api/v1/messages`.
