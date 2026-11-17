# Parser y Árbol Sintáctico Abstracto (AST) · AutoTask

**Issue:** `#4` (`[S1 · LEN-3]`)  
**Responsable:** Yareli (`@yareliyazmin16`)  
**Módulo:** [src/lenguaje/parser.js](../src/lenguaje/parser.js) (re-exportado en [src/lenguaje.js](../src/lenguaje.js))

---

## 1. Contrato de Entrada y Salida

```js
import { tokenizar, parsear } from './src/lenguaje.js';

const { tokens, diagnosticos: errLex } = tokenizar(codigo);
const { ast, diagnosticos: errSint } = parsear(tokens);
```

- **Entrada:** `tokens` (`Array<object>` generado por `tokenizar`).
- **Salida:** `{ ast, diagnosticos }`.
  - `ast`: nodo raíz `Programa` con las instrucciones válidas encontradas.
  - `diagnosticos`: lista de errores sintácticos con `{ etapa: 'sintactica', codigo, mensaje, linea, columna }`.
- **Ubicaciones (`inicio` y `fin`):** `{ linea, columna }` en base 1, con `inicio` inclusivo y `fin` exclusivo.
- **Recuperación por línea:** si una línea contiene un error sintáctico, se registra el diagnóstico, la línea con error **no** se agrega a `ast.instrucciones` y el parser sincroniza en el siguiente `SALTO_LINEA` para continuar analizando el resto del programa.

---

## 2. Nodos del AST

### Nodo Raíz
```json
{
  "tipo": "Programa",
  "instrucciones": [ /* ... */ ],
  "inicio": { "linea": 1, "columna": 1 },
  "fin": { "linea": 1, "columna": 1 }
}
```

### Nodos de Valores
Todos conservan la ubicación exacta del token original:

| Nodo | Propiedades | Ejemplo |
| :--- | :--- | :--- |
| `Cadena` | `tipo`, `valor`, `inicio`, `fin` | `{ tipo: 'Cadena', valor: 'Preparar informe', inicio, fin }` |
| `Fecha` | `tipo`, `valor`, `inicio`, `fin` | `{ tipo: 'Fecha', valor: '2026-11-15', inicio, fin }` |
| `Estado` | `tipo`, `valor`, `inicio`, `fin` | `{ tipo: 'Estado', valor: 'EN_PROGRESO', inicio, fin }` |

### Nodos de Instrucción

| Instrucción | `tipo` | Campos específicos |
| :--- | :--- | :--- |
| `CREAR TAREA "t" [FECHA "f"]` | `CrearTarea` | `titulo: Cadena`, `fecha: Fecha \| null` |
| `ASIGNAR TAREA "t" A "u"` | `AsignarTarea` | `tarea: Cadena`, `usuario: Cadena` |
| `CAMBIAR ESTADO TAREA "t" A E` | `CambiarEstado` | `tarea: Cadena`, `estado: Estado` |
| `CONSULTAR TAREA "t"` | `ConsultarTarea` | `tarea: Cadena` |
| `LISTAR TAREAS` | `ListarTareas` | *(sin campos extra)* |
| `NOTIFICAR A "u" MENSAJE "m"` | `Notificar` | `usuario: Cadena`, `mensaje: Cadena` |
| `ENVIAR CORREO A "d" MENSAJE "m"` | `EnviarCorreo` | `destinatario: Cadena`, `mensaje: Cadena` |
| `SI TAREA "t" ESTA E ENTONCES <accion>` | `Condicional` | `tarea: Cadena`, `estado: Estado`, `accion: <instruccion_simple>` |

---

## 3. Diagnósticos Sintácticos

- `ARGUMENTO_FALTANTE`: la instrucción terminó antes de completar los tokens obligatorios. `columna` señala la posición inmediata posterior al último token válido consumido (`ultimoToken.fin`).
- `TOKEN_INESPERADO`: apareció un token válido léxicamente en una posición que no coincide con la gramática EBNF (incluye comandos desconocidos, palabras en minúsculas, condicionales anidados o texto sobrante al final de una línea).

