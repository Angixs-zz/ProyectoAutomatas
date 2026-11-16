# Gramática Formal y Catálogo de Instrucciones · AutoTask

**Issue:** `#2` (`[S1 · LEN-1]`)  
**Responsable:** Yareli (`@yareliyazmin16`)  
**Rama:** `feature/len-1`  

---

## 1. Reglas Léxicas y de Escritura

1. **Mayúsculas estrictas:** Todas las palabras clave (`CREAR`, `TAREA`, `ASIGNAR`, etc.) y los estados válidos (`PENDIENTE`, `EN_PROGRESO`, `COMPLETADA`, `CANCELADA`) deben escribirse estrictamente en **MAYÚSCULAS** y sin acentos.
2. **Cadenas de texto (`CADENA`):** Se delimitan exclusivamente con comillas dobles (`"..."`). No se permiten saltos de línea dentro de una cadena abierta; si llega el fin de línea (`\n`) o de archivo (`EOF`) sin cerrar comillas, se reporta el error léxico `CADENA_SIN_CERRAR`.
3. **Fechas (`FECHA`):** Se escriben entre comillas dobles con formato ISO `"YYYY-MM-DD"` (por ejemplo, `"2026-11-15"`). La validación semántica verifica que la fecha exista.
4. **Espacios en blanco:** Los espacios (`' '`) y tabuladores (`'\t'`) actúan como separadores de tokens y se ignoran fuera de las cadenas de texto.
5. **Saltos de línea (`SALTO_LINEA`):** El carácter `\n` (o `\r\n`) delimita el final de cada instrucción. Las líneas vacías o que contienen únicamente espacios se ignoran.
6. **Ubicaciones (`inicio` y `fin`):** Todo token emitido por el lexer y todo nodo del AST generado por el parser incluye `inicio` y `fin` con el formato `{ "linea": N, "columna": M }` en base 1 (donde `fin` es exclusivo).

---

## 2. Gramática Formal en Notación EBNF

```ebnf
(* Regla inicial: programa con una o varias instrucciones separadas por saltos de línea *)
programa           = { SALTO_LINEA }, [ instruccion, { SALTO_LINEA, { SALTO_LINEA }, instruccion } ], { SALTO_LINEA } ;

instruccion        = instruccion_simple
                   | condicional ;

instruccion_simple = crear_tarea
                   | asignar_tarea
                   | cambiar_estado
                   | consultar_tarea
                   | listar_tareas
                   | notificar
                   | enviar_correo ;

(* Producciones por comando *)
crear_tarea        = "CREAR", "TAREA", CADENA, [ "FECHA", FECHA ] ;

asignar_tarea      = "ASIGNAR", "TAREA", CADENA, "A", CADENA ;

cambiar_estado     = "CAMBIAR", "ESTADO", "TAREA", CADENA, "A", estado ;

consultar_tarea    = "CONSULTAR", "TAREA", CADENA ;

listar_tareas      = "LISTAR", "TAREAS" ;

notificar          = "NOTIFICAR", "A", CADENA, "MENSAJE", CADENA ;

enviar_correo      = "ENVIAR", "CORREO", "A", CADENA, "MENSAJE", CADENA ;

condicional        = "SI", "TAREA", CADENA, "ESTA", estado, "ENTONCES", instruccion_simple ;

(* Valores permitidos para estados *)
estado             = "PENDIENTE"
                   | "EN_PROGRESO"
                   | "COMPLETADA"
                   | "CANCELADA" ;

(* Definiciones Léxicas *)
CADENA             = '"', { CARACTER_VALIDO }, '"' ;
FECHA              = '"', DIGITO, DIGITO, DIGITO, DIGITO, "-", DIGITO, DIGITO, "-", DIGITO, DIGITO, '"' ;
SALTO_LINEA        = "\n" | "\r\n" ;
DIGITO             = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;
CARACTER_VALIDO    = ? Cualquier carácter Unicode excepto '"' y salto de línea ? ;
```

---

## 3. Catálogo de Tokens

| Tipo de Token | Lexema(s) | Descripción |
| :--- | :--- | :--- |
| `KW_CREAR` | `CREAR` | Inicia la instrucción para registrar una nueva tarea. |
| `KW_TAREA` | `TAREA` | Indica que el operando siguiente corresponde a una tarea individual. |
| `KW_TAREAS` | `TAREAS` | Indica la colección completa de tareas. |
| `KW_ASIGNAR` | `ASIGNAR` | Inicia la asignación de una tarea a un participante. |
| `KW_CAMBIAR` | `CAMBIAR` | Inicia la modificación de propiedades de una tarea. |
| `KW_ESTADO` | `ESTADO` | Especifica el atributo de estado de la tarea. |
| `KW_CONSULTAR` | `CONSULTAR` | Solicita el detalle de una tarea específica. |
| `KW_LISTAR` | `LISTAR` | Solicita el listado general de tareas registradas. |
| `KW_NOTIFICAR` | `NOTIFICAR` | Genera una notificación interna para un usuario. |
| `KW_ENVIAR` | `ENVIAR` | Inicia una solicitud de envío externo. |
| `KW_CORREO` | `CORREO` | Especifica que la solicitud corresponde a correo electrónico de prueba (Mailpit). |
| `KW_MENSAJE` | `MENSAJE` | Introduce el texto del contenido de una notificación o correo. |
| `KW_FECHA` | `FECHA` | Introduce la fecha programada opcional al crear una tarea. |
| `KW_A` | `A` | Preposición que introduce el usuario destino o el nuevo estado. |
| `KW_SI` | `SI` | Inicia una estructura condicional. |
| `KW_ESTA` | `ESTA` | Operador de evaluación de estado actual de una tarea. |
| `KW_ENTONCES` | `ENTONCES` | Introduce la instrucción simple que se ejecutará si se cumple la condición. |
| `ESTADO_VAL` | `PENDIENTE`, `EN_PROGRESO`, `COMPLETADA`, `CANCELADA` | Estados válidos del ciclo de vida de una tarea. |
| `CADENA` | `"..."` | Literal de texto encerrado entre comillas dobles. |
| `FECHA` | `"YYYY-MM-DD"` | Literal de fecha en formato ISO entre comillas dobles. |
| `SALTO_LINEA` | `\n` o `\r\n` | Delimitador de fin de instrucción. |

---

## 4. Referencias dentro del Mismo Programa

* Al ejecutar `CREAR TAREA "Preparar informe"`, el sistema genera internamente su identificador único.
* Dentro del mismo programa, las instrucciones siguientes pueden referenciar esa tarea recién creada utilizando su **título exacto entre comillas** (por ejemplo: `ASIGNAR TAREA "Preparar informe" A "Yareli"`).
* Si existen dos o más tareas registradas con el mismo título, la fase semántica reportará el diagnóstico `TAREA_AMBIGUA`.

---

## 5. Ejemplos de Prueba

### 5.1 Programas Válidos

**Ejemplo 1: Creación, asignación, cambio de estado y consultas**
```text
CREAR TAREA "Preparar informe" FECHA "2026-11-15"
ASIGNAR TAREA "Preparar informe" A "Yareli"
CAMBIAR ESTADO TAREA "Preparar informe" A EN_PROGRESO
CONSULTAR TAREA "Preparar informe"
LISTAR TAREAS
```

**Ejemplo 2: Notificaciones, correo de prueba y condicional `SI ... ENTONCES`**
```text
NOTIFICAR A "Angel" MENSAJE "Revisa la estructura del AST"
ENVIAR CORREO A "diego@ejemplo.com" MENSAJE "Pruebas de consola listas"
SI TAREA "Preparar informe" ESTA COMPLETADA ENTONCES NOTIFICAR A "Angel" MENSAJE "Informe finalizado"
```

---

### 5.2 Casos Inválidos y Diagnósticos Esperados

#### Caso 1: Argumento faltante (Error Sintáctico)
**Entrada:**
```text
CREAR TAREA
```
**Diagnóstico esperado:**
```json
{
  "etapa": "sintactica",
  "codigo": "ARGUMENTO_FALTANTE",
  "mensaje": "Se esperaba una CADENA con el título de la tarea después de 'TAREA'.",
  "linea": 1,
  "columna": 12
}
```

#### Caso 2: Comillas incompletas (Error Léxico)
**Entrada:**
```text
CREAR TAREA "Limpiar cocina
```
**Diagnóstico esperado:**
```json
{
  "etapa": "lexica",
  "codigo": "CADENA_SIN_CERRAR",
  "mensaje": "La cadena de texto inició con '\"' pero llegó al fin de línea sin cerrarse.",
  "linea": 1,
  "columna": 13
}
```

#### Caso 3: Carácter inesperado (Error Léxico)
**Entrada:**
```text
LISTAR TAREAS @
```
**Diagnóstico esperado:**
```json
{
  "etapa": "lexica",
  "codigo": "CARACTER_INVALIDO",
  "mensaje": "Carácter '@' no reconocido fuera de una cadena de texto.",
  "linea": 1,
  "columna": 15
}
```

#### Caso 4: Token inesperado en orden gramatical (Error Sintáctico)
**Entrada:**
```text
ASIGNAR "Preparar informe" A "Yareli"
```
**Diagnóstico esperado:**
```json
{
  "etapa": "sintactica",
  "codigo": "TOKEN_INESPERADO",
  "mensaje": "Se esperaba la palabra clave 'TAREA' después de 'ASIGNAR', pero se encontró '\"Preparar informe\"'.",
  "linea": 1,
  "columna": 9
}
```

---

## 6. Catálogo y Formato de Errores Propuesto

1. **Estructura del diagnóstico:** Cada error detectado durante el análisis léxico o sintáctico se devuelve dentro de `diagnosticos` con la estructura:
   ```json
   {
     "etapa": "lexica | sintactica",
     "codigo": "CARACTER_INVALIDO | CADENA_SIN_CERRAR | TOKEN_INESPERADO | ARGUMENTO_FALTANTE",
     "mensaje": "Descripción legible del error.",
     "linea": 1,
     "columna": 1
   }
   ```
2. **Recuperación ante múltiples errores:** En lugar de detenerse en el primer fallo, el analizador sincroniza en el siguiente salto de línea (`\n`) para reportar todos los errores léxicos y sintácticos presentes en el programa en una sola pasada.
3. **Ubicación de fin de instrucción / argumento faltante:** Cuando una instrucción queda incompleta antes del salto de línea o fin de entrada (`EOF`), `linea` corresponde a la línea de la instrucción incompleta y `columna` señala la posición inmediata posterior al último token válido consumido.

| Etapa | Código | Causa |
| :--- | :--- | :--- |
| `lexica` | `CARACTER_INVALIDO` | Aparece un carácter no reconocido fuera de comillas (ej. `@`, `# Gramática Formal y Catálogo de Instrucciones · AutoTask

**Issue:** `#2` (`[S1 · LEN-1]`)  
**Responsable:** Yareli (`@yareliyazmin16`)  
**Rama:** `feature/len-1`  

---

## 1. Reglas Léxicas y de Escritura

1. **Mayúsculas estrictas:** Todas las palabras clave (`CREAR`, `TAREA`, `ASIGNAR`, etc.) y los estados válidos (`PENDIENTE`, `EN_PROGRESO`, `COMPLETADA`, `CANCELADA`) deben escribirse estrictamente en **MAYÚSCULAS** y sin acentos.
2. **Cadenas de texto (`CADENA`):** Se delimitan exclusivamente con comillas dobles (`"..."`). No se permiten saltos de línea dentro de una cadena abierta; si llega el fin de línea (`\n`) o de archivo (`EOF`) sin cerrar comillas, se reporta el error léxico `CADENA_SIN_CERRAR`.
3. **Fechas (`FECHA`):** Se escriben entre comillas dobles con formato ISO `"YYYY-MM-DD"` (por ejemplo, `"2026-11-15"`). La validación semántica verifica que la fecha exista.
4. **Espacios en blanco:** Los espacios (`' '`) y tabuladores (`'\t'`) actúan como separadores de tokens y se ignoran fuera de las cadenas de texto.
5. **Saltos de línea (`SALTO_LINEA`):** El carácter `\n` (o `\r\n`) delimita el final de cada instrucción. Las líneas vacías o que contienen únicamente espacios se ignoran.
6. **Ubicaciones (`inicio` y `fin`):** Todo token emitido por el lexer y todo nodo del AST generado por el parser incluye `inicio` y `fin` con el formato `{ "linea": N, "columna": M }` en base 1 (donde `fin` es exclusivo).

---

## 2. Gramática Formal en Notación EBNF

```ebnf
(* Regla inicial: programa con una o varias instrucciones separadas por saltos de línea *)
programa           = { SALTO_LINEA }, [ instruccion, { SALTO_LINEA, { SALTO_LINEA }, instruccion } ], { SALTO_LINEA } ;

instruccion        = instruccion_simple
                   | condicional ;

instruccion_simple = crear_tarea
                   | asignar_tarea
                   | cambiar_estado
                   | consultar_tarea
                   | listar_tareas
                   | notificar
                   | enviar_correo ;

(* Producciones por comando *)
crear_tarea        = "CREAR", "TAREA", CADENA, [ "FECHA", FECHA ] ;

asignar_tarea      = "ASIGNAR", "TAREA", CADENA, "A", CADENA ;

cambiar_estado     = "CAMBIAR", "ESTADO", "TAREA", CADENA, "A", estado ;

consultar_tarea    = "CONSULTAR", "TAREA", CADENA ;

listar_tareas      = "LISTAR", "TAREAS" ;

notificar          = "NOTIFICAR", "A", CADENA, "MENSAJE", CADENA ;

enviar_correo      = "ENVIAR", "CORREO", "A", CADENA, "MENSAJE", CADENA ;

condicional        = "SI", "TAREA", CADENA, "ESTA", estado, "ENTONCES", instruccion_simple ;

(* Valores permitidos para estados *)
estado             = "PENDIENTE"
                   | "EN_PROGRESO"
                   | "COMPLETADA"
                   | "CANCELADA" ;

(* Definiciones Léxicas *)
CADENA             = '"', { CARACTER_VALIDO }, '"' ;
FECHA              = '"', DIGITO, DIGITO, DIGITO, DIGITO, "-", DIGITO, DIGITO, "-", DIGITO, DIGITO, '"' ;
SALTO_LINEA        = "\n" | "\r\n" ;
DIGITO             = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;
CARACTER_VALIDO    = ? Cualquier carácter Unicode excepto '"' y salto de línea ? ;
```

---

## 3. Catálogo de Tokens

| Tipo de Token | Lexema(s) | Descripción |
| :--- | :--- | :--- |
| `KW_CREAR` | `CREAR` | Inicia la instrucción para registrar una nueva tarea. |
| `KW_TAREA` | `TAREA` | Indica que el operando siguiente corresponde a una tarea individual. |
| `KW_TAREAS` | `TAREAS` | Indica la colección completa de tareas. |
| `KW_ASIGNAR` | `ASIGNAR` | Inicia la asignación de una tarea a un participante. |
| `KW_CAMBIAR` | `CAMBIAR` | Inicia la modificación de propiedades de una tarea. |
| `KW_ESTADO` | `ESTADO` | Especifica el atributo de estado de la tarea. |
| `KW_CONSULTAR` | `CONSULTAR` | Solicita el detalle de una tarea específica. |
| `KW_LISTAR` | `LISTAR` | Solicita el listado general de tareas registradas. |
| `KW_NOTIFICAR` | `NOTIFICAR` | Genera una notificación interna para un usuario. |
| `KW_ENVIAR` | `ENVIAR` | Inicia una solicitud de envío externo. |
| `KW_CORREO` | `CORREO` | Especifica que la solicitud corresponde a correo electrónico de prueba (Mailpit). |
| `KW_MENSAJE` | `MENSAJE` | Introduce el texto del contenido de una notificación o correo. |
| `KW_FECHA` | `FECHA` | Introduce la fecha programada opcional al crear una tarea. |
| `KW_A` | `A` | Preposición que introduce el usuario destino o el nuevo estado. |
| `KW_SI` | `SI` | Inicia una estructura condicional. |
| `KW_ESTA` | `ESTA` | Operador de evaluación de estado actual de una tarea. |
| `KW_ENTONCES` | `ENTONCES` | Introduce la instrucción simple que se ejecutará si se cumple la condición. |
| `ESTADO_VAL` | `PENDIENTE`, `EN_PROGRESO`, `COMPLETADA`, `CANCELADA` | Estados válidos del ciclo de vida de una tarea. |
| `CADENA` | `"..."` | Literal de texto encerrado entre comillas dobles. |
| `FECHA` | `"YYYY-MM-DD"` | Literal de fecha en formato ISO entre comillas dobles. |
| `SALTO_LINEA` | `\n` o `\r\n` | Delimitador de fin de instrucción. |

---

## 4. Referencias dentro del Mismo Programa

* Al ejecutar `CREAR TAREA "Preparar informe"`, el sistema genera internamente su identificador único.
* Dentro del mismo programa, las instrucciones siguientes pueden referenciar esa tarea recién creada utilizando su **título exacto entre comillas** (por ejemplo: `ASIGNAR TAREA "Preparar informe" A "Yareli"`).
* Si existen dos o más tareas registradas con el mismo título, la fase semántica reportará el diagnóstico `TAREA_AMBIGUA`.

---

## 5. Ejemplos de Prueba

### 5.1 Programas Válidos

**Ejemplo 1: Creación, asignación, cambio de estado y consultas**
```text
CREAR TAREA "Preparar informe" FECHA "2026-11-15"
ASIGNAR TAREA "Preparar informe" A "Yareli"
CAMBIAR ESTADO TAREA "Preparar informe" A EN_PROGRESO
CONSULTAR TAREA "Preparar informe"
LISTAR TAREAS
```

**Ejemplo 2: Notificaciones, correo de prueba y condicional `SI ... ENTONCES`**
```text
NOTIFICAR A "Angel" MENSAJE "Revisa la estructura del AST"
ENVIAR CORREO A "diego@ejemplo.com" MENSAJE "Pruebas de consola listas"
SI TAREA "Preparar informe" ESTA COMPLETADA ENTONCES NOTIFICAR A "Angel" MENSAJE "Informe finalizado"
```

---

### 5.2 Casos Inválidos y Diagnósticos Esperados

#### Caso 1: Argumento faltante (Error Sintáctico)
**Entrada:**
```text
CREAR TAREA
```
**Diagnóstico esperado:**
```json
{
  "etapa": "sintactica",
  "codigo": "ARGUMENTO_FALTANTE",
  "mensaje": "Se esperaba una CADENA con el título de la tarea después de 'TAREA'.",
  "linea": 1,
  "columna": 12
}
```

#### Caso 2: Comillas incompletas (Error Léxico)
**Entrada:**
```text
CREAR TAREA "Limpiar cocina
```
**Diagnóstico esperado:**
```json
{
  "etapa": "lexica",
  "codigo": "CADENA_SIN_CERRAR",
  "mensaje": "La cadena de texto inició con '\"' pero llegó al fin de línea sin cerrarse.",
  "linea": 1,
  "columna": 13
}
```

#### Caso 3: Carácter inesperado (Error Léxico)
**Entrada:**
```text
LISTAR TAREAS @
```
**Diagnóstico esperado:**
```json
{
  "etapa": "lexica",
  "codigo": "CARACTER_INVALIDO",
  "mensaje": "Carácter '@' no reconocido fuera de una cadena de texto.",
  "linea": 1,
  "columna": 15
}
```

#### Caso 4: Token inesperado en orden gramatical (Error Sintáctico)
**Entrada:**
```text
ASIGNAR "Preparar informe" A "Yareli"
```
**Diagnóstico esperado:**
```json
{
  "etapa": "sintactica",
  "codigo": "TOKEN_INESPERADO",
  "mensaje": "Se esperaba la palabra clave 'TAREA' después de 'ASIGNAR', pero se encontró '\"Preparar informe\"'.",
  "linea": 1,
  "columna": 9
}
```

---

## 6. Catálogo y Formato de Errores Acordado

1. **Estructura del diagnóstico:** Cada error detectado durante el análisis léxico o sintáctico se devuelve dentro de `diagnosticos` con la estructura:
   ```json
   {
     "etapa": "lexica | sintactica",
     "codigo": "CARACTER_INVALIDO | CADENA_SIN_CERRAR | TOKEN_INESPERADO | ARGUMENTO_FALTANTE",
     "mensaje": "Descripción legible del error.",
     "linea": 1,
     "columna": 1
   }
   ```
2. **Recuperación ante múltiples errores:** En lugar de detenerse en el primer fallo, el analizador sincroniza en el siguiente salto de línea (`\n`) para reportar todos los errores léxicos y sintácticos presentes en el programa en una sola pasada.
3. **Ubicación de fin de instrucción / argumento faltante:** Cuando una instrucción queda incompleta antes del salto de línea o fin de entrada (`EOF`), `linea` corresponde a la línea de la instrucción incompleta y `columna` señala la posición inmediata posterior al último token válido consumido.

| Etapa | Código | Causa |
| :--- | :--- | :--- |
, `#`). Las palabras no reconocidas o en minúsculas se tokenizan como `IDENTIFICADOR` y deberá rechazarlas el parser cuando no correspondan a la gramática. |
| `lexica` | `CADENA_SIN_CERRAR` | Se abre una comilla doble `"` y se alcanza `\n` o `EOF` sin encontrar la comilla de cierre. |
| `sintactica` | `ARGUMENTO_FALTANTE` | La instrucción termina abruptamente cuando la regla gramatical aún exige más tokens (ej. `CREAR TAREA`). |
| `sintactica` | `TOKEN_INESPERADO` | Se recibe un token válido léxicamente, pero en una posición que viola el orden definido por la gramática EBNF. |
