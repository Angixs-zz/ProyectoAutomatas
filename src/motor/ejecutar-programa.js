/**
 * Orquestador completo del compilador y ejecutor de AutoTask:
 * tokenizar -> parsear -> validarPrograma -> generarIR -> optimizarIR -> ejecutarIR.
 */
import { tokenizar, parsear } from '../lenguaje.js';
import { validarPrograma } from '../semantica/validador.js';
import { generarIR } from '../ir/generador-ir.js';
import { optimizarIR } from '../ir/optimizador.js';
import { ejecutarIR } from '../ejecutor/ejecutor.js';

/**
 * Compila y opcionalmente ejecuta un programa AutoTask.
 * @param {string} texto Código fuente del programa
 * @param {{ modo?: 'validacion' | 'ejecucion', servicios: object, repositorio?: object }} opciones
 */
export async function ejecutarPrograma(texto, { modo = 'validacion', servicios, repositorio } = {}) {
  const fuente = typeof texto === 'string' ? texto : '';
  const { tokens, diagnosticos: diagLexicos } = tokenizar(fuente);
  if (diagLexicos.length > 0) {
    return { ok: false, modo, resultados: [], diagnosticos: diagLexicos };
  }

  const { ast, diagnosticos: diagSintacticos } = parsear(tokens);
  if (diagSintacticos.length > 0) {
    return { ok: false, modo, resultados: [], diagnosticos: diagSintacticos };
  }

  const repoLectura = repositorio ?? servicios?.tareas;
  const validacion = await validarPrograma(ast, repoLectura);
  if (!validacion.ok) {
    return { ok: false, modo, resultados: [], diagnosticos: validacion.diagnosticos };
  }

  const ir = generarIR(validacion.programa);
  const irOptimizada = optimizarIR(ir);

  if (modo === 'validacion') {
    return {
      ok: true,
      modo: 'validacion',
      resultados: [],
      diagnosticos: [],
      optimizaciones: irOptimizada.metadatos.optimizacionesAplicadas,
    };
  }

  return ejecutarIR(irOptimizada, servicios);
}
