# Validación semántica

**Issue:** `#10` (`[S2 · SEM-2]`) · **Rama:** `feature/sem-2`

La validación recibe el AST del parser (#4), revisa que el programa tenga sentido con los datos actuales y devuelve diagnósticos o el programa con sus referencias resueltas para la IR (#11). No crea, modifica ni borra tareas: solo lee el repositorio a través de la tabla de símbolos (#9).

Código en `src/semantica/validador.js`. Pruebas en `tests/validador.test.js`.

## Cómo se usa

```js
import { validarPrograma } from './src/semantica/validador.js';
import { crearRepositorioEnMemoria } from './src/semantica/repositorio-memoria.js';

const { ok, diagnosticos, programa } = await validarPrograma(ast, crearRepositorioEnMemoria());
```

- Si `ok` es `true`, `diagnosticos` está vacío y `programa` es una copia del AST donde cada instrucción tiene `referencias` con los símbolos que usa (`referencias.tarea`, `referencias.usuario`). En un `Condicional`, la acción trae sus propias `referencias`.
- Si `ok` es `false`, `programa` es `null` y `diagnosticos` trae todos los errores en el orden de las instrucciones.
- `validarPrograma` arma una tabla de símbolos nueva cada vez. Si se usa `validarAST(ast, tabla)` directamente, la tabla tiene que ser nueva para cada programa, porque ahí se registran las tareas que crea el programa.

El AST que se espera es el que se propuso en el issue #4. Mientras no existe el parser, las pruebas arman los AST a mano con esa forma.

## Qué se revisa

| Instrucción | Revisión |
| --- | --- |
| `CREAR TAREA` | Título no vacío. Si trae `FECHA`, que sea un día que exista (`2026-02-30` no). Registra la tarea en la tabla para las líneas siguientes. |
| `ASIGNAR TAREA` | La tarea y el usuario existen y no son ambiguos. La tarea no está `COMPLETADA` ni `CANCELADA`. |
| `CAMBIAR ESTADO` | La tarea existe, el estado es válido y el cambio está permitido (ver tabla de transiciones). |
| `CONSULTAR TAREA` | La tarea existe y no es ambigua. |
| `LISTAR TAREAS` | Nada. |
| `NOTIFICAR` | El usuario existe y el mensaje no está vacío. |
| `ENVIAR CORREO` | El destinatario tiene forma de correo y el mensaje no está vacío. |
| `SI ... ENTONCES` | La tarea de la condición existe, el estado es válido, la acción pasa su propia revisión y no hay un `SI` dentro de otro. |

Cada diagnóstico sigue el formato de LT-1 (`etapa`, `codigo`, `mensaje`, `linea`, `columna`). La ubicación apunta al argumento que falla, no al inicio de la línea. El mensaje empieza con el comando y termina diciendo cómo corregirlo, por ejemplo:

```text
CONSULTAR TAREA: No existe la tarea «Informe». Revisa el título o créala antes con CREAR TAREA.
```

## Códigos

| Código | Cuándo |
| --- | --- |
| `TAREA_INEXISTENTE`, `TAREA_AMBIGUA` | Vienen de la tabla de símbolos (#9). |
| `USUARIO_INEXISTENTE`, `USUARIO_AMBIGUO` | Vienen de la tabla de símbolos (#9). |
| `ESTADO_INVALIDO` | El estado no es `PENDIENTE`, `EN_PROGRESO`, `COMPLETADA` ni `CANCELADA`. |
| `TRANSICION_INVALIDA` | El cambio de estado no está permitido o la tarea ya está en ese estado. Nuevo. |
| `OPERACION_NO_PERMITIDA` | Asignar una tarea terminada, un `SI` dentro de otro o un tipo de nodo desconocido. Nuevo. |
| `CORREO_INVALIDO` | El destinatario de `ENVIAR CORREO` no tiene forma de correo. Ya lo usaba la consola de ejemplo. |
| `FECHA_INVALIDA` | La fecha tiene el formato correcto pero ese día no existe. Nuevo. |
| `TEXTO_VACIO` | Título o mensaje vacíos o solo con espacios. Nuevo. |

## Transiciones de estado (propuesta)

| Desde | Puede pasar a |
| --- | --- |
| `PENDIENTE` | `EN_PROGRESO`, `COMPLETADA`, `CANCELADA` |
| `EN_PROGRESO` | `PENDIENTE`, `COMPLETADA`, `CANCELADA` |
| `COMPLETADA` | ninguno |
| `CANCELADA` | ninguno |

Está en la constante `TRANSICIONES` de `validador.js`. Falta confirmarla con Diego (#5), porque los estados son parte de su esquema.

## Estado que cambia dentro de un programa

La validación lleva un estado previsto de cada tarea mientras recorre las líneas:

1. Una tarea creada con `CREAR TAREA` empieza en `PENDIENTE`.
2. Un `CAMBIAR ESTADO` fuera de un `SI` actualiza el estado previsto, así que `CAMBIAR ... A COMPLETADA` seguido de `CAMBIAR ... A EN_PROGRESO` sobre la misma tarea da error en la segunda línea.
3. Dentro de un `SI` sobre la misma tarea, la acción se revisa con el estado de la condición, porque solo se ejecuta si la tarea está en ese estado.
4. Después de un cambio dentro de un `SI`, el estado de esa tarea queda como desconocido y ya no se revisan sus transiciones en la validación. Lo mismo pasa con una tarea creada dentro de un `SI`.

En el caso 4, la validación no puede saber si la condición se va a cumplir. El ejecutor (#12) tiene que volver a revisar la transición al momento de ejecutar y reportar un error de etapa `ejecucion` si no está permitida. Esto queda por acordar con Edwin.
