# Tabla de símbolos de tareas y usuarios

**Issue:** `#9` (`[S2 · SEM-1]`) · **Rama:** `feature/sem-1`

La tabla de símbolos permite que la validación semántica (#10) sepa si una tarea o un usuario existe, en qué estado está y en qué operaciones puede aparecer. Solo lee datos, nunca crea ni modifica tareas.

Código en `src/semantica/tabla-simbolos.js` y `src/semantica/repositorio-memoria.js`. Pruebas en `tests/tabla-simbolos.test.js`.

## Cómo se usa

```js
import { crearTablaSimbolos } from './src/semantica/tabla-simbolos.js';
import { crearRepositorioEnMemoria } from './src/semantica/repositorio-memoria.js';

const tabla = await crearTablaSimbolos(crearRepositorioEnMemoria());

tabla.resolverTarea('Preparar informe', nodo.inicio);
// { ok: true, simbolo: { tipo: 'tarea', id: 'task_1', estado: 'PENDIENTE', ... } }

tabla.resolverTarea('Informe', { linea: 1, columna: 17 });
// { ok: false, candidatos: [], diagnostico: { etapa: 'semantica', codigo: 'TAREA_INEXISTENTE',
//   mensaje: 'No existe la tarea «Informe».', linea: 1, columna: 17 } }
```

La tabla se arma una sola vez por programa: `crearTablaSimbolos` lee tareas y usuarios del repositorio y después todas las búsquedas son en memoria.

## Fuente de datos (repositorio)

Cualquier objeto con estas dos funciones sirve como fuente de datos:

| Función | Devuelve |
| --- | --- |
| `listarTareas()` | `Promise` con `[{ id, titulo, estado, responsableId }]` |
| `listarUsuarios()` | `Promise` con `[{ id, nombre, correo }]` |

En las pruebas se usa `crearRepositorioEnMemoria()`, que trae los mismos datos de ejemplo que la consola (`consola-ejemplos.js`) y acepta datos propios: `crearRepositorioEnMemoria({ tareas: [...], usuarios: [...] })`. El repositorio de PostgreSQL de #5 solo tiene que cumplir el mismo contrato, así que las pruebas unitarias no necesitan base de datos.

## Campos de cada símbolo

**Tarea**

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `tipo` | `'tarea'` | Tipo de símbolo. |
| `id` | `string` o `null` | ID del repositorio. Es `null` si la tarea la crea el mismo programa. |
| `titulo` | `string` | Título con el que la escribe el programa. |
| `estado` | `PENDIENTE`, `EN_PROGRESO`, `COMPLETADA` o `CANCELADA` | Estado actual. Una tarea creada en el programa empieza en `PENDIENTE`. |
| `responsableId` | `string` o `null` | ID del usuario asignado. |
| `origen` | `'repositorio'` o `'programa'` | De dónde salió la tarea. |
| `declaradaEn` | `{ linea, columna }` o `null` | Dónde la creó el programa (solo si `origen` es `'programa'`). |
| `operaciones` | `string[]` | `asignar`, `cambiar_estado`, `consultar`, `condicional`. |

**Usuario**

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `tipo` | `'usuario'` | Tipo de símbolo. |
| `id` | `string` | ID del repositorio. |
| `nombre` | `string` | Nombre con el que lo escribe el programa. |
| `correo` | `string` o `null` | Correo del usuario. |
| `operaciones` | `string[]` | `asignar` (como destino) y `notificar`. |

Los símbolos están congelados (`Object.freeze`): quien los reciba no puede cambiarlos por accidente.

## Formato de consulta

| Función | Resultado |
| --- | --- |
| `resolverTarea(titulo, ubicacion?)` | `{ ok: true, simbolo }` o `{ ok: false, diagnostico, candidatos }` |
| `resolverUsuario(nombre, ubicacion?)` | Igual que la anterior, con usuarios. |
| `buscarTareaPorId(id)` | El símbolo o `null`. |
| `buscarUsuarioPorId(id)` | El símbolo o `null`. |
| `declararTarea(titulo, ubicacion?)` | Registra una tarea creada por `CREAR TAREA` y devuelve su símbolo. No escribe en el repositorio. |

`ubicacion` es `{ linea, columna }` (base 1), por ejemplo el `inicio` de la cadena en el nodo del AST. Sin ubicación, el diagnóstico lleva `linea` y `columna` en `null`, como pide el formato de LT-1.

| Código | Cuándo |
| --- | --- |
| `TAREA_INEXISTENTE` | Ninguna tarea tiene ese título. |
| `TAREA_AMBIGUA` | Dos o más tareas tienen ese título. No se elige ninguna; `candidatos` trae todas. |
| `USUARIO_INEXISTENTE` | Ningún usuario tiene ese nombre. |
| `USUARIO_AMBIGUO` | Dos o más usuarios tienen ese nombre. Código nuevo, no estaba en la lista de LT-1. |

## Decisiones para confirmar

1. **Comparación exacta.** `"preparar informe"` no encuentra `"Preparar informe"` y `"Revisar gramatica"` no encuentra `"Revisar gramática"`. Si el equipo prefiere ignorar mayúsculas o acentos, se cambia en un solo lugar.
2. **Tareas creadas en el mismo programa.** Siguiendo la sección 4 de la gramática (#2), `CREAR TAREA` registra la tarea en la tabla con `id: null` para que las siguientes instrucciones la usen por su título. Si ya existía una tarea con ese título, las referencias posteriores quedan ambiguas.
3. **IDs y campos** (`task_N`, `user_N`, `responsableId`) son de ejemplo y deben coincidir con el esquema de #5.
4. **Ubicaciones:** la tabla recibe la ubicación que le pase la semántica; falta acordar con #4 qué nodo del AST trae la ubicación de cada cadena.
