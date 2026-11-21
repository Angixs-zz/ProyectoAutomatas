import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { crearServicioCorreoSMTP } from '../src/ejecutor/correo-smtp.js';

function crearServidorSMTPPrueba() {
  const recibidos = [];
  const servidor = net.createServer((socket) => {
    let enData = false;
    let buffer = '';
    let actual = { from: '', to: '', data: '' };

    socket.write('220 mailpit.local ESMTP\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      while (true) {
        const idx = buffer.indexOf('\r\n');
        if (idx === -1) break;
        const linea = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        if (enData) {
          if (linea === '.') {
            enData = false;
            recibidos.push({ ...actual });
            socket.write('250 OK\r\n');
          } else {
            actual.data += `${linea}\n`;
          }
          continue;
        }

        if (linea.startsWith('EHLO')) socket.write('250-mailpit.local\r\n250 OK\r\n');
        else if (linea.startsWith('MAIL FROM:')) {
          actual.from = linea;
          socket.write('250 OK\r\n');
        } else if (linea.startsWith('RCPT TO:')) {
          actual.to = linea;
          socket.write('250 OK\r\n');
        } else if (linea === 'DATA') {
          enData = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (linea === 'QUIT') {
          socket.write('221 Bye\r\n');
          socket.end();
        } else {
          socket.write('500 Unknown\r\n');
        }
      }
    });
  });

  return { servidor, recibidos };
}

test('envía un correo de prueba a un servidor SMTP compatible con Mailpit', async () => {
  const { servidor, recibidos } = crearServidorSMTPPrueba();
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const { port } = servidor.address();

  try {
    const smtp = crearServicioCorreoSMTP({ host: '127.0.0.1', port, from: 'autotask@localhost' });
    const res = await smtp.enviarCorreo({
      destinatario: 'yareli@ejemplo.com',
      mensaje: 'Prueba SMTP\n.Línea con punto',
    });

    assert.equal(res.estado, 'en_cola');
    assert.equal(recibidos.length, 1);
    assert.equal(recibidos[0].from, 'MAIL FROM:<autotask@localhost>');
    assert.equal(recibidos[0].to, 'RCPT TO:<yareli@ejemplo.com>');
    assert.match(recibidos[0].data, /Prueba SMTP/);
    assert.match(recibidos[0].data, /\.\.Línea con punto/);
  } finally {
    await new Promise((r) => servidor.close(r));
  }
});

test('rechaza cuando el servidor SMTP no está disponible', async () => {
  const smtp = crearServicioCorreoSMTP({ host: '127.0.0.1', port: 1, timeoutMs: 500 });
  await assert.rejects(() => smtp.enviarCorreo({ destinatario: 'a@b.com', mensaje: 'Hola' }));
});
