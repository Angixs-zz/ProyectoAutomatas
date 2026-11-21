# Documentación de AutoTask

Índice de la documentación técnica y de entrega. Si es tu primera vez en el proyecto, empieza por la guía final y después consulta el módulo que necesites.

## Entrega y evaluación

| Documento | Para qué sirve |
| --- | --- |
| [Guía final](guia-final.md) | Descripción, instalación, arquitectura, base de datos, pruebas, límites y solución de problemas. |
| [Matriz de requisitos](matriz-requisitos.md) | Contraste del PDF con el código: cumplido, adaptado, parcial o no aplica, con evidencias. |
| [Guion de demostración](guion-demostracion.md) | Secuencia de demo, capturas necesarias, presentadores y plan de contingencia. |
| [Contrato de API](contrato-api.md) | Endpoints, códigos HTTP, diagnósticos, `partial: true` y ejemplos `curl`. |

## Lenguaje y compilador

| Documento | Contenido |
| --- | --- |
| [Gramática formal](gram_tica_formal_autotask.md) | Reglas léxicas, EBNF, catálogo de tokens y errores. |
| [AST y parser](ast-y-parser.md) | Contrato del parser, nodos del AST y diagnósticos sintácticos. |
| [Tabla de símbolos](tabla-simbolos.md) | Resolución de tareas/usuarios, ambigüedad y contrato del repositorio. |
| [Validación semántica](validacion-semantica.md) | Referencias, estados, transiciones y códigos de error. |
| [Representación intermedia](representacion-intermedia.md) | Traducción por comando y ejemplos de IR. |
| [Contrato de IR y ejecución](contrato-ir.md) | Catálogo IR, optimizaciones, ejecutor y `partial`. |

## Infraestructura y datos

| Documento | Contenido |
| --- | --- |
| [Persistencia](persistencia.md) | Modelo PostgreSQL, historial, notificaciones y contratos del repositorio. |
| [Arquitectura inicial y contraste final](../arquitectura-semana-1.md) | Decisiones de la Semana 1 y sección 8 con la implementación verificada. |
| [README raíz](../README.md) | Arranque rápido con Docker y pruebas. |

## Orden sugerido de lectura

1. [Guía final](guia-final.md) §1–§3 para entender el producto y levantarlo.
2. [Gramática formal](gram_tica_formal_autotask.md) y [AST y parser](ast-y-parser.md) para el lenguaje.
3. [Tabla de símbolos](tabla-simbolos.md) y [Validación semántica](validacion-semantica.md) para el análisis.
4. [Representación intermedia](representacion-intermedia.md) y [Contrato de IR](contrato-ir.md) para la ejecución.
5. [Persistencia](persistencia.md) y [Contrato de API](contrato-api.md) para la integración.
6. [Matriz de requisitos](matriz-requisitos.md) y [Guion de demostración](guion-demostracion.md) para la entrega.

## Convenciones

- Los documentos conservan el texto original de cada responsable cuando existe; las correcciones y contrastes finales se agregan en secciones separadas.
- Los estados de requisitos usan: **Cumplido**, **Cumplido (adaptado)**, **Parcial**, **Pendiente** y **No aplica**.
- Las afirmaciones de pruebas se refieren a `npm test` (120/120) y `npm run test:e2e` (5/5) verificados sobre `main` antes de la entrega.
- No se documentan como terminados los puntos que dependen de capturas, permisos de GitHub Projects o revisión humana.
