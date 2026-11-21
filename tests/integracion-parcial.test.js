import test from 'node:test';
import assert from 'node:assert/strict';
import { validarPrograma } from '../src/semantica/validador.js';
import { crearRepositorioEnMemoria } from '../src/semantica/repositorio-memoria.js';
import { generarIR } from '../src/ir/generador-ir.js';
import { ejecutarIR } from '../src/ejecutor/ejecutor.js';
import { crearServiciosEnMemoria } from '../src/ejecutor/servicios-memoria.js';
import { programa, crear, correo, si } from './ayudantes/ast.js';

test('el generador IR y el ejecutor preservan la creación aun si falla el correo de un SI', async () => {
  const validado = await validarPrograma(programa(
    crear(1, 'Informe nuevo'),
    si(2, 'Informe nuevo', 'PENDIENTE', (columna) => correo(2, 'yareli@ejemplo.com', 'Listo', columna)),
  ), crearRepositorioEnMemoria());
  assert.equal(validado.ok, true);

  const servicios = crearServiciosEnMemoria();
  servicios.correo.enviarCorreo = async () => {
    throw new Error('SMTP: entrega desconocida');
  };
  const res = await ejecutarIR(generarIR(validado.programa), servicios);

  assert.equal(res.ok, false);
  assert.equal(res.partial, true);
  assert.equal(res.resultados[0].operacion, 'crear');
  assert.equal(res.resultados[1].operacion, 'condicional');
  assert.equal(res.resultados[1].condicion, true);
  assert.equal(res.resultados[1].accion.estado, 'incierto');
  assert.equal(res.diagnosticos[0].codigo, 'ERROR_CORREO');
  assert.equal(res.diagnosticos[0].linea, 2);
  assert.equal(servicios.obtenerEstado().tareas.at(-1).titulo, 'Informe nuevo');
});
