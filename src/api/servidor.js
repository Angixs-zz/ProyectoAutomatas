/**
 * Servidor HTTP y API de AutoTask · [S3 · BE-2 / #16]
 * Expone /api/salud, /api/validar, /api/ejecutar, /api/tablero y los archivos estáticos.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ejecutarPrograma } from '../motor/ejecutar-programa.js';
import { crearServiciosEnMemoria } from '../ejecutor/servicios-memoria.js';
import { crearServicioCorreoSMTP } from '../ejecutor/correo-smtp.js';

const RAIZ_PROYECTO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

function enviarJSON(res, codigo, carga) {
  const cuerpo = JSON.stringify(carga);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(cuerpo),
  });
  res.end(cuerpo);
}

async function leerCuerpoJSON(req) {
  const fragmentos = [];
  for await (const chunk of req) {
    fragmentos.push(chunk);
  }
  const texto = Buffer.concat(fragmentos).toString('utf8').trim();
  if (!texto) return {};
  return JSON.parse(texto);
}

function unirResponsables(tareas, usuarios) {
  const nombres = new Map(usuarios.map((u) => [u.id, u.nombre]));
  return tareas.map((t) => ({ ...t, responsable: nombres.get(t.responsableId) ?? null }));
}

function convertirResultadoAHistorial(resultado, lineasFuente, contador) {
  const fecha = new Date().toISOString();
  const instruccion = resultado.linea ? (lineasFuente[resultado.linea - 1] ?? '').trim() : '';

  if (resultado.operacion === 'condicional') {
    if (!resultado.condicion || !resultado.accion) {
      return {
        id: `hist_${contador()}`,
        fecha,
        tipo: 'operacion',
        operacion: 'condicional',
        instruccion,
        resultado: 'exito',
        detalle: 'Condición falsa: acción omitida.',
      };
    }
    return convertirResultadoAHistorial(resultado.accion, lineasFuente, contador);
  }

  if (resultado.operacion === 'notificar') {
    return {
      id: `hist_${contador()}`,
      fecha,
      tipo: 'notificacion',
      operacion: 'notificar',
      instruccion,
      usuarioId: resultado.usuarioId ?? null,
      resultado: resultado.estado ?? 'en_cola',
      detalle: `Notificación para ${resultado.destinatario}: "${resultado.mensaje}"`,
    };
  }

  if (resultado.operacion === 'enviar_correo') {
    return {
      id: `hist_${contador()}`,
      fecha,
      tipo: 'correo',
      operacion: 'enviar_correo',
      instruccion,
      resultado: resultado.estado ?? 'en_cola',
      detalle: `Correo de prueba para ${resultado.destinatario}`,
    };
  }

  const detalles = {
    crear: `Tarea «${resultado.titulo}» creada (${resultado.estado})`,
    asignar: `Tarea «${resultado.titulo}» asignada a ${resultado.responsable}`,
    cambiar_estado: `Tarea «${resultado.titulo}» cambió a ${resultado.estado}`,
    consultar: `Consulta de «${resultado.tarea?.titulo ?? ''}» (${resultado.tarea?.estado ?? ''})`,
    listar: `Listado de ${resultado.tareas?.length ?? 0} tareas`,
  };

  return {
    id: `hist_${contador()}`,
    fecha,
    tipo: 'operacion',
    operacion: resultado.operacion,
    instruccion,
    tareaId: resultado.tareaId ?? resultado.tarea?.id ?? null,
    resultado: 'exito',
    detalle: detalles[resultado.operacion] ?? `Operación ${resultado.operacion} completada`,
  };
}

/**
 * Crea el manejador HTTP de la aplicación AutoTask.
 */
export function crearAplicacion({
  servicios = crearServiciosEnMemoria(),
  historialInicial = [],
  almacenamiento = 'memoria',
  directorioPublico = RAIZ_PROYECTO,
} = {}) {
  const historial = historialInicial.map((h) => ({ ...h }));
  let secuenciaHistorial = historial.length + 1;
  const siguienteId = () => secuenciaHistorial++;

  return async function manejarPeticion(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const ruta = url.pathname;

    try {
      if (req.method === 'GET' && ruta === '/api/salud') {
        return enviarJSON(res, 200, { ok: true, almacenamiento });
      }

      if (req.method === 'GET' && ruta === '/api/tablero') {
        const [tareas, usuarios] = await Promise.all([
          servicios.tareas.listarTareas(),
          servicios.tareas.listarUsuarios(),
        ]);
        return enviarJSON(res, 200, {
          tareas: unirResponsables(tareas, usuarios),
          historial,
        });
      }

      if (req.method === 'POST' && (ruta === '/api/validar' || ruta === '/api/ejecutar')) {
        let cuerpo;
        try {
          cuerpo = await leerCuerpoJSON(req);
        } catch {
          return enviarJSON(res, 400, { error: 'El cuerpo debe ser JSON válido.' });
        }

        const programa = cuerpo.programa ?? cuerpo.texto;
        if (typeof programa !== 'string') {
          return enviarJSON(res, 400, { error: 'Se esperaba el campo «programa» como texto.' });
        }

        const modo = ruta === '/api/validar' ? 'validacion' : 'ejecucion';
        const respuesta = await ejecutarPrograma(programa, { modo, servicios });

        if (modo === 'ejecucion') {
          const lineas = programa.split(/\r?\n/);
          const nuevasEntradas = [];
          for (const r of respuesta.resultados ?? []) {
            nuevasEntradas.push(convertirResultadoAHistorial(r, lineas, siguienteId));
          }
          if (!respuesta.ok && !respuesta.partial && (respuesta.diagnosticos?.length ?? 0) > 0) {
            const diag = respuesta.diagnosticos[0];
            nuevasEntradas.push({
              id: `hist_${siguienteId()}`,
              fecha: new Date().toISOString(),
              tipo: 'operacion',
              operacion: 'error',
              instruccion: diag.linea ? (lineas[diag.linea - 1] ?? '').trim() : '',
              resultado: 'error',
              detalle: diag.mensaje,
            });
          }
          for (const entrada of nuevasEntradas) {
            historial.unshift(entrada);
          }
        }

        return enviarJSON(res, 200, respuesta);
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        const relativa = ruta === '/' ? 'index.html' : ruta.replace(/^\/+/, '');
        if (relativa.startsWith('.env') || relativa.startsWith('.git')) {
          res.writeHead(404);
          return res.end('No encontrado');
        }
        const destino = path.resolve(directorioPublico, relativa);
        if (!destino.startsWith(path.resolve(directorioPublico))) {
          res.writeHead(403);
          return res.end('Acceso denegado');
        }

        try {
          const contenido = await fs.readFile(destino);
          const ext = path.extname(destino).toLowerCase();
          res.writeHead(200, {
            'Content-Type': TIPOS_MIME[ext] ?? 'application/octet-stream',
            'Content-Length': contenido.length,
          });
          return res.end(req.method === 'HEAD' ? undefined : contenido);
        } catch {
          res.writeHead(404);
          return res.end('No encontrado');
        }
      }

      res.writeHead(405);
      return res.end('Método no permitido');
    } catch {
      return enviarJSON(res, 500, { error: 'Error interno del servidor.' });
    }
  };
}

async function inicializarServiciosDesdeEntorno() {
  const usaPostgres = Boolean(process.env.DATABASE_URL || process.env.PGHOST);
  const usaSMTP = Boolean(process.env.SMTP_HOST);

  if (!usaPostgres && !usaSMTP) {
    return { servicios: crearServiciosEnMemoria(), almacenamiento: 'memoria' };
  }

  const serviciosMemoria = crearServiciosEnMemoria();
  let tareas = serviciosMemoria.tareas;
  let notificaciones = serviciosMemoria.notificaciones;
  let almacenamiento = 'memoria';

  if (usaPostgres) {
    const [{ crearPoolPostgres }, { crearRepositorioPostgres }] = await Promise.all([
      import('../persistencia/pool-postgres.js'),
      import('../persistencia/repositorio-postgres.js'),
    ]);
    const pool = crearPoolPostgres();
    const repo = crearRepositorioPostgres(pool);
    tareas = repo;
    notificaciones = repo;
    almacenamiento = 'postgres';
  }

  const correo = usaSMTP ? crearServicioCorreoSMTP() : serviciosMemoria.correo;
  return {
    servicios: { tareas, notificaciones, correo },
    almacenamiento,
  };
}

const esEjecucionDirecta = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esEjecucionDirecta) {
  const puerto = Number(process.env.PORT ?? 8080);
  const { servicios, almacenamiento } = await inicializarServiciosDesdeEntorno();
  const servidor = http.createServer(crearAplicacion({ servicios, almacenamiento }));
  servidor.listen(puerto, () => {
    console.log(`AutoTask escuchando en http://localhost:${puerto} (${almacenamiento})`);
  });
}
