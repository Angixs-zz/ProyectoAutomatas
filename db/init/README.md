# Scripts de inicialización de PostgreSQL

Los scripts numerados `.sql` de esta carpeta se ejecutan en orden al crear el volumen de PostgreSQL por primera vez (`/docker-entrypoint-initdb.d`). `001_esquema.sql` crea el esquema de AutoTask y `002_datos_demo.sql` carga usuarios y tareas de ejemplo de forma idempotente.

Estos scripts inicializan una base de datos nueva. Si ya existe un volumen, los scripts no se vuelven a ejecutar automáticamente; los cambios futuros del esquema requerirán migraciones explícitas.
