# Contrato de Representación Intermedia (IR) y Ejecución

**Issues relacionados:** `#11` (`[S3 · SEM-3]`), `#12` (`[S3 · EX-1]`), `#13` (`[S3 · EX-2]`) · **Rama de trabajo:** `feature/ex-1`

Este documento define el contrato entre la generación de representación intermedia (**Ángel**, `#11`), el optimizador (**Edwin**, `#13`) y el ejecutor (**Edwin**, `#12`), alineado con `src/semantica/validador.js`, `src/semantica/tabla-simbolos.js`, `arquitectura-semana-1.md` y `consola-ejemplos.js`.

---

## 1. Entrada al generador de IR (`SEM-2` → `SEM-3`)

La entrada es `programa` cuando `validarPrograma(ast, repositorio)` devuelve `{ ok: true, diagnosticos: [], programa }`.

Cada nodo de `programa.instrucciones` conserva su `tipo`, ubicación (`inicio`, `fin`) y `referencias`:
- `referencias.tarea`: símbolo de tarea (`{ tipo: 'tarea', id, titulo, estado, responsableId, origen, ... }`).
  - Si la tarea ya existía en el repositorio: `id !== null` y `origen === 'repositorio'`.
  - Si la tarea se creó dentro del mismo programa con `CREAR TAREA`: `id === null` y `origen === 'programa'`. Las instrucciones posteriores comparten la misma referencia de símbolo.
- `referencias.usuario`: símbolo de usuario (`{ tipo: 'usuario', id, nombre, correo, ... }`).

---

## 2. Forma de un programa en IR (`SEM-3` → `EX-2` → `EX-1`)

```js
{
  tipo: 'ProgramaIR',
  version: 1,
  instrucciones: [
    // Lista plana de InstruccionIR en orden de ejecución
  ],
  metadatos: {
    totalInstruccionesOriginales: 4,
    optimizacionesAplicadas: [], // El optimizador (#13) agrega los nombres aplicados
  },
}
```

### 2.1 Referencias a tareas y usuarios en la IR

La IR no depende de objetos congelados de la tabla de símbolos: usa referencias serializables para poder inspeccionarse y probarse sin efectos externos (`#11`).

- **`RefTarea`**:
  - Tarea existente en repositorio: `{ tipo: 'id', id: 'task_1', titulo: 'Preparar informe' }`
  - Tarea creada dentro del mismo programa: `{ tipo: 'temporal', ref: 'tmp_1', titulo: 'Preparar reporte' }`
  *(El generador asigna `tmp_1`, `tmp_2`, ... en cada `CREAR_TAREA` usando el símbolo `referencias.tarea` para asociar las instrucciones siguientes).*
- **`RefUsuario`**:
  - `{ id: 'user_1', nombre: 'Yareli', correo: 'yareli@ejemplo.com' }`

### 2.2 Catálogo de instrucciones IR

Todas las instrucciones ejecutables incluyen `linea` y `columna` (base 1, tomadas de `nodo.inicio`) para reportar resultados y errores en etapa `ejecucion`.

| `op` | Campos específicos | Significado |
| --- | --- | --- |
| `CREAR_TAREA` | `titulo: string`, `fecha: string \| null`, `salidaRef: string` | Crea una tarea nueva en estado `PENDIENTE` y guarda su `id` real en la tabla de temporales bajo `salidaRef` (p. ej. `'tmp_1'`). |
| `ASIGNAR_TAREA` | `tarea: RefTarea`, `usuario: RefUsuario` | Asigna `usuario.id` como responsable de la tarea. |
| `CAMBIAR_ESTADO` | `tarea: RefTarea`, `estado: EstadoValido` | Cambia el estado de la tarea a `PENDIENTE`, `EN_PROGRESO`, `COMPLETADA` o `CANCELADA`. |
| `CONSULTAR_TAREA` | `tarea: RefTarea` | Lee el detalle actual de la tarea. |
| `LISTAR_TAREAS` | *(sin argumentos adicionales)* | Devuelve la lista actual de tareas. |
| `NOTIFICAR` | `usuario: RefUsuario`, `mensaje: string` | Encola una notificación interna para `usuario.id` (se confirma al cerrar sin errores). |
| `ENVIAR_CORREO` | `destinatario: string`, `mensaje: string` | Encola un correo SMTP de prueba (se envía solo si el programa termina sin errores). |
| `EVALUAR_ESTADO` | `tarea: RefTarea`, `estadoEsperado: EstadoValido`, `destinoTemp: string` | Evalúa en tiempo de ejecución si el estado actual de `tarea` es igual a `estadoEsperado` y guarda el booleano en `destinoTemp` (p. ej. `'cond_1'`). |
| `SALTAR_SI_FALSO` | `condicion: string`, `etiqueta: string` | Si el booleano en `condicion` es `false`, salta a la instrucción `ETIQUETA` con ese `nombre`. |
| `ETIQUETA` | `nombre: string` | Marca de destino de salto (no produce resultado observable). |

#### Traducción de `SI TAREA "t" ESTA E ENTONCES <accion>`

Se traduce como comparación + salto condicional + instrucción de la acción + etiqueta de cierre:

```js
[
  { op: 'EVALUAR_ESTADO', tarea: refTarea, estadoEsperado: 'COMPLETADA', destinoTemp: 'cond_1', linea: 3, columna: 1 },
  { op: 'SALTAR_SI_FALSO', condicion: 'cond_1', etiqueta: 'fin_si_1', linea: 3, columna: 1 },
  { op: 'NOTIFICAR', usuario: refUsuario, mensaje: 'Docker listo', linea: 3, columna: 46, condicional: { temp: 'cond_1', linea: 3 } },
  { op: 'ETIQUETA', nombre: 'fin_si_1' },
]
```

El campo opcional `condicional: { temp, linea }` en la instrucción interna permite al ejecutor emitir un resultado agrupado compatible con la consola (`{ linea, operacion: 'condicional', condicion: true|false, accion: ... }`), incluso si el bloque fue verdadero o falso. Si `SALTAR_SI_FALSO` salta a `fin_si_1`, el ejecutor registra `{ linea, operacion: 'condicional', condicion: false, accion: null }`.

---

## 3. Reglas para el optimizador (`#13 · EX-2`)

El optimizador recibe un `ProgramaIR`, devuelve un nuevo `ProgramaIR` sin mutar el original y registra qué reglas aplicó en `metadatos.optimizacionesAplicadas`:

1. **Simplificación de condiciones constantes y eliminación de código inalcanzable:**
   - Si justo antes de `EVALUAR_ESTADO` el optimizador conoce con certeza el estado actual de `tarea` (por ejemplo, tras `CREAR_TAREA` vale `PENDIENTE` o tras un `CAMBIAR_ESTADO` incondicional previo vale `E`):
     - Si la comparación es **siempre falsa**, se elimina todo el bloque (`EVALUAR_ESTADO`, `SALTAR_SI_FALSO`, la acción y `ETIQUETA`), conservando un registro equivalente de condicional falso si se requiere en la traza o evitando ejecutar código inalcanzable.
     - Si la comparación es **siempre verdadera**, se eliminan `EVALUAR_ESTADO`, `SALTAR_SI_FALSO` y `ETIQUETA`, dejando la acción directa.
2. **Eliminación de cambios de estado redundantes (dead store):**
   - Si dentro del mismo bloque lineal (sin `ETIQUETA`, `SALTAR_SI_FALSO`, `EVALUAR_ESTADO`, `CONSULTAR_TAREA`, `LISTAR_TAREAS`, `NOTIFICAR` ni `ENVIAR_CORREO` intermedios) existen dos `CAMBIAR_ESTADO` consecutivos sobre la misma tarea (`A -> E1` seguido de `A -> E2`) donde `E1` no es un estado final que habría fallado y la transición directa hacia `E2` es válida según `TRANSICIONES`, puede conservarse únicamente el cambio final a `E2`.

**Restricción de seguridad:** nunca eliminar ni reordenar `CONSULTAR_TAREA`, `LISTAR_TAREAS`, `NOTIFICAR` ni `ENVIAR_CORREO` que sí vayan a ejecutarse, ni ocultar errores de transición válidos.

---

## 4. Reglas del ejecutor (`#12 · EX-1`)

### 4.1 Política transaccional todo-o-nada (acordada con BE-4)
1. Todas las lecturas y escrituras de tareas (`CREAR_TAREA`, `ASIGNAR_TAREA`, `CAMBIAR_ESTADO`, `CONSULTAR_TAREA`, `LISTAR_TAREAS`) se ejecutan dentro de una **única transacción** (`ejecutarEnTransaccion`).
2. `NOTIFICAR` y `ENVIAR_CORREO` **no escriben ni envían correos inmediatamente**: se acumulan en una cola en memoria durante la corrida del programa.
3. Si cualquier instrucción falla en tiempo de ejecución:
   - Se revierte (`ROLLBACK`) toda la transacción en base de datos.
   - Se descarta la cola de notificaciones y correos (cero correos fantasma).
   - El ejecutor devuelve:
     ```js
     {
       ok: false,
       modo: 'ejecucion',
       resultados: [],
       diagnosticos: [{ etapa: 'ejecucion', codigo, mensaje, linea, columna }],
     }
     ```
4. Solo cuando todas las instrucciones terminan sin errores:
   - Se confirma (`COMMIT`) la transacción.
   - Se persisten las notificaciones acumuladas y se envían los correos pendientes por SMTP (Mailpit en pruebas).
   - Se devuelve `{ ok: true, modo: 'ejecucion', resultados, diagnosticos: [] }`.

### 4.2 Revalidación de estado en tiempo de ejecución (punto abierto en `docs/validacion-semantica.md`)
Cuando un `SI ... ENTONCES` modifica el estado de una tarea, la validación estática (`SEM-2`) deja el estado previsto de esa tarea como desconocido para líneas posteriores. Por eso el ejecutor **revalida en runtime** contra el estado real dentro de la transacción:
- En `ASIGNAR_TAREA`: si la tarea está en `COMPLETADA` o `CANCELADA`, falla en etapa `ejecucion` con código `OPERACION_NO_PERMITIDA`.
- En `CAMBIAR_ESTADO`: valida con `TRANSICIONES` (de `src/semantica/validador.js`) que el cambio desde el estado actual al nuevo estado sea permitido y no sea al mismo estado; si no lo es, falla en etapa `ejecucion` con código `TRANSICION_INVALIDA`.
- Si al consultar/modificar una `RefTarea` ya no existe en el repositorio: falla en etapa `ejecucion` con código `TAREA_INEXISTENTE`.
- Ante fallos del repositorio o SMTP: códigos `ERROR_PERSISTENCIA` o `ERROR_CORREO` (sin exponer stack traces ni secretos).

### 4.3 Formato de `resultados` por operación
Alineado con `arquitectura-semana-1.md` y `consola-ejemplos.js`:

| Operación IR | Objeto emitido en `resultados` |
| --- | --- |
| `CREAR_TAREA` | `{ linea, operacion: 'crear', tareaId, titulo, estado: 'PENDIENTE', fecha }` |
| `ASIGNAR_TAREA` | `{ linea, operacion: 'asignar', tareaId, titulo, responsableId, responsable }` |
| `CAMBIAR_ESTADO` | `{ linea, operacion: 'cambiar_estado', tareaId, titulo, estado }` |
| `CONSULTAR_TAREA` | `{ linea, operacion: 'consultar', tarea: { id, titulo, estado, responsableId, fecha } }` |
| `LISTAR_TAREAS` | `{ linea, operacion: 'listar', tareas: [...] }` |
| `NOTIFICAR` | `{ linea, operacion: 'notificar', usuarioId, destinatario, mensaje, estado: 'en_cola' }` |
| `ENVIAR_CORREO` | `{ linea, operacion: 'enviar_correo', destinatario, mensaje, estado: 'en_cola' }` |
| Bloque `SI` | `{ linea, operacion: 'condicional', condicion: true \| false, accion: Resultado \| null }` |

---

## 5. Contrato de servicios externos requerido por `EX-1` (`BE-1`, `BE-3` y mocks)

Para que el ejecutor funcione igual con servicios simulados en memoria (`#12`) y con PostgreSQL + Mailpit (`#5`, `#14`, `#15`), recibe un objeto `servicios`:

```js
// Repositorio transaccional de tareas (BE-1 / mock en memoria)
servicios.tareas = {
  async ejecutarEnTransaccion(callback) { /* pasa un txRepo con los métodos de abajo */ },
  async crearTarea({ titulo, fecha }) {},        // -> { id, titulo, estado, responsableId, fecha }
  async asignarTarea({ tareaId, usuarioId }) {}, // -> { id, titulo, estado, responsableId }
  async cambiarEstado({ tareaId, estado }) {},   // -> { id, titulo, estado, responsableId }
  async consultarTarea({ tareaId }) {},          // -> { id, titulo, estado, responsableId, fecha } | null
  async listarTareas() {},                       // -> Array<{ id, titulo, estado, responsableId, fecha }>
};

// Notificaciones internas y correo SMTP (BE-3 / mock en memoria)
servicios.notificaciones = {
  async registrarNotificacion({ usuarioId, mensaje }) {}, // -> { id, usuarioId, mensaje, estado }
};

servicios.correo = {
  async enviarCorreo({ destinatario, mensaje }) {},       // -> { aceptado: true, estado: 'en_cola' | 'enviado' }
};
```

---

## 6. Ejemplo completo de traducción

**Programa de entrada:**
```text
CREAR TAREA "Preparar reporte" FECHA "2026-11-15"
ASIGNAR TAREA "Preparar reporte" A "Yareli"
SI TAREA "Preparar reporte" ESTA PENDIENTE ENTONCES NOTIFICAR A "Yareli" MENSAJE "Nueva tarea asignada"
```

**IR generada (`SEM-3`):**
```json
{
  "tipo": "ProgramaIR",
  "version": 1,
  "instrucciones": [
    { "op": "CREAR_TAREA", "titulo": "Preparar reporte", "fecha": "2026-11-15", "salidaRef": "tmp_1", "linea": 1, "columna": 1 },
    { "op": "ASIGNAR_TAREA", "tarea": { "tipo": "temporal", "ref": "tmp_1", "titulo": "Preparar reporte" }, "usuario": { "id": "user_1", "nombre": "Yareli", "correo": "yareli@ejemplo.com" }, "linea": 2, "columna": 1 },
    { "op": "EVALUAR_ESTADO", "tarea": { "tipo": "temporal", "ref": "tmp_1", "titulo": "Preparar reporte" }, "estadoEsperado": "PENDIENTE", "destinoTemp": "cond_1", "linea": 3, "columna": 1 },
    { "op": "SALTAR_SI_FALSO", "condicion": "cond_1", "etiqueta": "fin_si_1", "linea": 3, "columna": 1 },
    { "op": "NOTIFICAR", "usuario": { "id": "user_1", "nombre": "Yareli", "correo": "yareli@ejemplo.com" }, "mensaje": "Nueva tarea asignada", "linea": 3, "columna": 52, "condicional": { "temp": "cond_1", "linea": 3 } },
    { "op": "ETIQUETA", "nombre": "fin_si_1" }
  ],
  "metadatos": {
    "totalInstruccionesOriginales": 6,
    "optimizacionesAplicadas": []
  }
}
```
