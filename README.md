# AutoTask · ProyectoAutomtas

Base inicial del proyecto integrador de Lenguajes y Autómatas II. AutoTask corresponde a la opción 3 de la consigna, enfocada en la automatización de tareas y procesos mediante instrucciones escritas.

El punto de partida es [TareasHogar en el commit `dfbc59b`](https://github.com/Angixs-zz/TareasHogar/commit/dfbc59bc014048cb72dc76ad32f896cdd86feabe), una aplicación web hecha con HTML, CSS y JavaScript.

## Qué funciona en esta base

- Calendario de tareas con turnos de fin de semana, filtros por persona y consulta del reparto.
- Rotaciones independientes por tarea. Si una persona ya tiene una tarea asignada ese fin de semana, su siguiente turno se aplaza y se conserva. Las tareas se procesan por prioridad.
- Panel para elegir participantes y tareas activas. El formulario permite añadir tareas con una rotación válida.
- Configuración y tareas añadidas guardadas en el navegador. La exportación `.ics` y los avisos compartibles se conservan como herramientas del calendario.

`schedule.js` contiene las rotaciones, sus validaciones y el cálculo de turnos. `app.js` conecta esa lógica con la interfaz. `tests/schedule.test.js` verifica las reglas existentes, incluidos los aplazamientos, la equidad y la exportación.

## Ejecutar localmente

Con Node.js 22 o superior y Python 3, clona el repositorio y levanta el servidor estático.

```sh
git clone https://github.com/Angixs-zz/ProyectoAutomtas.git
cd ProyectoAutomtas
npm start
```

Abre [http://localhost:8080](http://localhost:8080). Para ejecutar las pruebas del calendario, usa `npm test`. El proyecto base funciona sin instalar paquetes adicionales.

## Pendientes del equipo

- Definir el catálogo y la gramática de comandos para crear tareas, asignarlas, cambiar su estado y notificar, incluidas las instrucciones condicionales.
- Construir la consola y el lenguaje con lexer, parser, AST, tabla de símbolos y validación semántica.
- Implementar la representación intermedia, dos optimizaciones y el ejecutor. Integrar las acciones con el tablero, la persistencia, las notificaciones y el historial.
- Preparar las pruebas del lenguaje, el correo mediante SMTP de pruebas, Docker Compose, la documentación técnica y el tablero Kanban.

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

Los scripts `.sql` o `.sh` colocados en `db/init/` se ejecutan automáticamente al inicializar el volumen de PostgreSQL por primera vez (en espera del esquema y datos semilla del issue `#5`). Para reiniciar desde cero incluyendo la base de datos:

```sh
docker compose down -v
```
