/**
 * Cliente SMTP mínimo para envío de correos de prueba (Mailpit) · [#14]
 * Usa sockets TCP nativos de Node.js sin dependencias externas.
 */
import net from 'node:net';

function sanitizarLineaCabecera(valor) {
  return String(valor ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function escaparCuerpoSMTP(texto) {
  return String(texto ?? '')
    .replace(/\r?\n/g, '\r\n')
    .replace(/^\./gm, '..');
}

function leerRespuestaSMTP(socket) {
  return new Promise((resolver, rechazar) => {
    let buffer = '';

    const limpiar = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
    };

    const onError = (err) => {
      limpiar();
      rechazar(err);
    };

    const onClose = () => {
      limpiar();
      rechazar(new Error('La conexión SMTP se cerró inesperadamente.'));
    };

    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lineas = buffer.split('\r\n');
      if (lineas[lineas.length - 1] !== '') return;
      const completas = lineas.slice(0, -1);
      const ultima = completas[completas.length - 1];
      if (ultima && /^\d{3} /.test(ultima)) {
        limpiar();
        resolver({
          codigo: Number(ultima.slice(0, 3)),
          texto: completas.join('\n'),
        });
      }
    };

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
  });
}

async function enviarComando(socket, comando, codigoEsperado) {
  const promesa = leerRespuestaSMTP(socket);
  socket.write(`${comando}\r\n`);
  const respuesta = await promesa;
  if (respuesta.codigo !== codigoEsperado) {
    throw new Error(`SMTP respondió ${respuesta.codigo} (esperado ${codigoEsperado}).`);
  }
  return respuesta;
}

/**
 * Crea el adaptador de correo compatible con el ejecutor de AutoTask.
 * @param {{ host?: string, port?: number, from?: string, timeoutMs?: number }} config
 */
export function crearServicioCorreoSMTP(config = {}) {
  const host = config.host ?? process.env.SMTP_HOST ?? 'localhost';
  const port = Number(config.port ?? process.env.SMTP_PORT ?? 1025);
  const remitente = sanitizarLineaCabecera(config.from ?? process.env.SMTP_FROM ?? 'autotask@localhost');
  const timeoutMs = config.timeoutMs ?? 5000;

  return {
    async enviarCorreo({ destinatario, mensaje, asunto = 'Notificación de prueba · AutoTask' }) {
      const destino = sanitizarLineaCabecera(destinatario);
      if (!destino) {
        throw new Error('Destinatario de correo vacío.');
      }

      const socket = net.createConnection({ host, port });
      socket.setTimeout(timeoutMs, () => {
        socket.destroy(new Error('Tiempo de espera agotado al conectar con SMTP.'));
      });

      try {
        const saludo = await leerRespuestaSMTP(socket);
        if (saludo.codigo !== 220) {
          throw new Error(`Saludo SMTP inesperado: ${saludo.codigo}`);
        }

        await enviarComando(socket, 'EHLO autotask.local', 250);
        await enviarComando(socket, `MAIL FROM:<${remitente}>`, 250);
        await enviarComando(socket, `RCPT TO:<${destino}>`, 250);
        await enviarComando(socket, 'DATA', 354);

        const cuerpo = [
          `From: <${remitente}>`,
          `To: <${destino}>`,
          `Subject: ${sanitizarLineaCabecera(asunto)}`,
          'Content-Type: text/plain; charset=utf-8',
          '',
          escaparCuerpoSMTP(mensaje),
          '.',
        ].join('\r\n');

        await enviarComando(socket, cuerpo, 250);
        await enviarComando(socket, 'QUIT', 221);
        return { estado: 'en_cola' };
      } finally {
        if (!socket.destroyed) socket.end();
      }
    },
  };
}
