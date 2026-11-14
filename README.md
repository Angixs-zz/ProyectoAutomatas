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

Con Node.js 22 o superior y Python 3, clona el repositorio y levanta el servidor estático.

```sh
git clone https://github.com/Angixs-zz/ProyectoAutomatas.git
cd ProyectoAutomatas
npm start
```

Abre [http://localhost:8080](http://localhost:8080). Para ejecutar las pruebas del calendario, usa `npm test`. El proyecto base funciona sin instalar paquetes adicionales.

## Pendientes del equipo

El [borrador de arquitectura y contratos iniciales (LT-1)](arquitectura-semana-1.md) contiene el diagrama de ejecución, catálogo y formato de errores propuestos para revisar con Yareli y el equipo. Aún no están aprobados ni implementados.

- Definir el catálogo y la gramática de comandos para crear tareas, asignarlas, cambiar su estado y notificar, incluidas las instrucciones condicionales.
- Construir la consola y el lenguaje con lexer, parser, AST, tabla de símbolos y validación semántica.
- Implementar la representación intermedia, dos optimizaciones y el ejecutor. Integrar las acciones con el tablero, la persistencia, las notificaciones y el historial.
- Preparar las pruebas del lenguaje, el correo mediante SMTP de pruebas, Docker Compose, la documentación técnica y el tablero Kanban.
