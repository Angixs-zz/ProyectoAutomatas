# Generación de la representación intermedia (IR)

**Issue:** `#11` (`[S3 · SEM-3]`) · **Rama:** `feature/sem-3`

El generador traduce el programa validado por la semántica (#10) a la IR que ejecuta Edwin (#12). La forma de cada instrucción, el control de flujo y los efectos observables están en el contrato `docs/contrato-ir.md` de la rama `feature/ex-1`. Este documento explica cómo se traduce cada comando.

Código en `src/ir/generador-ir.js`. Pruebas en `tests/generador-ir.test.js`.

## Cómo se usa

```js
import { validarPrograma } from './src/semantica/validador.js';
import { generarIR, describirIR } from './src/ir/generador-ir.js';

const validado = await validarPrograma(ast, repositorio);
if (validado.ok) {
  const ir = generarIR(validado.programa);
  console.log(describirIR(ir));
}
```

`generarIR` es una función pura: no lee el repositorio, no crea tareas, no manda notificaciones ni correos. La IR que devuelve son objetos planos (sin los símbolos congelados de la tabla), así que se puede pasar a JSON, compararse en pruebas o mostrarse en la consola sin ejecutar nada. Si recibe un programa sin validar, lanza `TypeError`.

`describirIR` devuelve la IR como texto, una instrucción por renglón, para revisarla a ojo.

## Traducción por comando

| Comando | Instrucción IR |
| --- | --- |
| `CREAR TAREA "t" [FECHA "f"]` | `CREAR_TAREA` con `titulo`, `fecha` (o `null`) y `salidaRef` (`tmp_1`, `tmp_2`, …). |
| `ASIGNAR TAREA "t" A "u"` | `ASIGNAR_TAREA` con `tarea` (RefTarea) y `usuario` (`{ id, nombre, correo }`). |
| `CAMBIAR ESTADO TAREA "t" A E` | `CAMBIAR_ESTADO` con `tarea` y `estado`. |
| `CONSULTAR TAREA "t"` | `CONSULTAR_TAREA` con `tarea`. |
| `LISTAR TAREAS` | `LISTAR_TAREAS`. |
| `NOTIFICAR A "u" MENSAJE "m"` | `NOTIFICAR` con `usuario` y `mensaje`. |
| `ENVIAR CORREO A "d" MENSAJE "m"` | `ENVIAR_CORREO` con `destinatario` y `mensaje`. |
| `SI TAREA "t" ESTA E ENTONCES <acción>` | `EVALUAR_ESTADO`, `SALTAR_SI_FALSO`, la acción con `condicional: { temp, linea }` y `ETIQUETA`. |

Todas las instrucciones, menos `ETIQUETA`, llevan `linea` y `columna` del inicio de su nodo en el AST. En la acción de un `SI`, la columna es la de la acción, no la del `SI`.

**RefTarea:** si la tarea ya existía, `{ tipo: 'id', id, titulo }`. Si la crea el mismo programa, `{ tipo: 'temporal', ref: 'tmp_N', titulo }`, donde `tmp_N` es el `salidaRef` de su `CREAR_TAREA`. El generador asocia cada uso con su creación por el símbolo que dejó la semántica en `referencias.tarea`, no por el título.

Cada `SI` usa su propio temporal (`cond_1`, `cond_2`, …) y su propia etiqueta (`fin_si_1`, `fin_si_2`, …).

`metadatos.totalInstruccionesOriginales` es el número de instrucciones IR generadas, antes de optimizar. `metadatos.optimizacionesAplicadas` empieza vacío; lo llena el optimizador (#13).

## Ejemplos

Una tarea existente:

```text
ASIGNAR TAREA "Preparar informe" A "Yareli"
```

```js
{ op: 'ASIGNAR_TAREA',
  tarea: { tipo: 'id', id: 'task_1', titulo: 'Preparar informe' },
  usuario: { id: 'user_1', nombre: 'Yareli', correo: 'yareli@ejemplo.com' },
  linea: 1, columna: 1 }
```

Secuencia con condición (el mismo ejemplo de la sección 6 del contrato):

```text
CREAR TAREA "Preparar reporte" FECHA "2026-11-15"
ASIGNAR TAREA "Preparar reporte" A "Yareli"
SI TAREA "Preparar reporte" ESTA PENDIENTE ENTONCES NOTIFICAR A "Yareli" MENSAJE "Nueva tarea asignada"
```

Salida de `describirIR`:

```text
 1  CREAR_TAREA     "Preparar reporte" fecha 2026-11-15 -> tmp_1  ; línea 1
 2  ASIGNAR_TAREA   tmp_1 "Preparar reporte" a user_1 (Yareli)  ; línea 2
 3  EVALUAR_ESTADO  tmp_1 "Preparar reporte" == PENDIENTE -> cond_1  ; línea 3
 4  SALTAR_SI_FALSO cond_1 -> fin_si_1  ; línea 3
 5  NOTIFICAR       user_1 (Yareli) "Nueva tarea asignada"  [si cond_1]  ; línea 3
 6  fin_si_1:
```

Las pruebas comparan este ejemplo campo por campo con el JSON del contrato. La única diferencia es la columna de `NOTIFICAR`: aquí es 53, porque `SI TAREA "Preparar reporte" ESTA PENDIENTE ENTONCES ` ocupa 52 caracteres. En el contrato aparece 52.

Las demás traducciones (una por comando, dos `SI` seguidos y un `CREAR TAREA` dentro de un `SI`) están en `tests/generador-ir.test.js`.
