// Consola AutoTask (#7): conecta el cuadro de texto y los botones con la API.
// Por ahora usa las respuestas de ejemplo de consola-ejemplos.js. En #16 enviarPrograma() llamará a la API real.
import { EJEMPLOS, enviarPrograma } from './consola-ejemplos.js';

const entrada = document.querySelector('#console-input');
const botonEjecutar = document.querySelector('#console-run');
const botonValidar = document.querySelector('#console-validate');
const estado = document.querySelector('#console-status');
const listaResultados = document.querySelector('#console-results');
const listaDiagnosticos = document.querySelector('#console-diagnostics');
const listaEjemplos = document.querySelector('#console-examples');
const casillaFallo = document.querySelector('#console-fail');

const NOMBRE_ETAPA = {
  lexica: 'Error léxico',
  sintactica: 'Error sintáctico',
  semantica: 'Error semántico',
  ejecucion: 'Error de ejecución',
};

let enCurso = false; 

function crear(etiqueta, clase, texto = '') {
  const elemento = document.createElement(etiqueta);
  elemento.className = clase;
  elemento.textContent = texto; 
  return elemento;
}

function plural(cantidad, singular, varios) {
  return `${cantidad} ${cantidad === 1 ? singular : varios}`;
}

function mostrarEstado(tipo, mensaje) {
  estado.dataset.estado = tipo; 
  estado.textContent = mensaje;
}

function limpiarSalida() {
  listaResultados.replaceChildren();
  listaDiagnosticos.replaceChildren();
}


function irA(linea, columna) {
  const lineas = entrada.value.split('\n');
  let posicion = 0;
  for (let i = 0; i < linea - 1; i++) posicion += lineas[i].length + 1;
  posicion += columna - 1;
  entrada.focus();
  entrada.setSelectionRange(posicion, posicion + 1);
}

function pintarDiagnosticos(diagnosticos) {
  listaDiagnosticos.replaceChildren(...diagnosticos.map((d) => {
    const item = crear('li', 'console-diagnostic');
    item.dataset.etapa = d.etapa;
    const encabezado = crear('div', 'console-item-head');
    encabezado.append(crear('span', 'console-badge', NOMBRE_ETAPA[d.etapa] ?? d.etapa), crear('code', 'console-code', d.codigo));
    if (d.linea == null) {
      encabezado.append(crear('span', 'console-location', 'sin ubicación'));
    } else {
      const ubicacion = crear('button', 'console-location console-goto', `Línea ${d.linea}, columna ${d.columna}`);
      ubicacion.type = 'button';
      ubicacion.title = 'Ir a este lugar en el texto';
      ubicacion.addEventListener('click', () => irA(d.linea, d.columna));
      encabezado.append(ubicacion);
    }
    item.append(encabezado, crear('p', 'console-message', d.mensaje));
    return item;
  }));
}


function describir(r) {
  switch (r.operacion) {
    case 'crear': return `Tarea «${r.titulo}» creada (${r.tareaId}) con estado ${r.estado}.`;
    case 'asignar': return `Tarea «${r.titulo}» asignada a ${r.responsable}.`;
    case 'cambiar_estado': return `Tarea «${r.titulo}» cambió a ${r.estado}.`;
    case 'consultar': return `«${r.tarea.titulo}»: ${r.tarea.estado}, responsable: ${r.tarea.responsable ?? 'sin asignar'}.`;
    case 'listar': return `${plural(r.tareas.length, 'tarea', 'tareas')}: ${r.tareas.map((t) => `${t.titulo} (${t.estado})`).join(', ')}.`;
    case 'notificar': return `Notificación para ${r.destinatario} en cola: "${r.mensaje}".`;
    case 'enviar_correo': return `Correo de prueba para ${r.destinatario} en cola (todavía no confirma la entrega).`;
    case 'condicional': return r.condicion ? `La condición se cumplió → ${describir(r.accion)}` : 'La condición no se cumplió: la acción no se ejecutó.';
    default: return `Operación ${r.operacion} realizada.`;
  }
}

function pintarResultados(resultados) {
  listaResultados.replaceChildren(...resultados.map((r) => {
    const item = crear('li', 'console-result');
    item.dataset.operacion = r.operacion;
    const encabezado = crear('div', 'console-item-head');
    encabezado.append(crear('span', 'console-badge', r.operacion.replace('_', ' ')), crear('span', 'console-location', `Línea ${r.linea}`));
    item.append(encabezado, crear('p', 'console-message', describir(r)));
    return item;
  }));
}

async function enviar(modo) {
  if (enCurso) return;
  const texto = entrada.value;
  limpiarSalida();
  if (texto.trim() === '') {
    mostrarEstado('vacio', 'Escribe al menos una instrucción antes de validar o ejecutar.');
    entrada.focus();
    return;
  }

  enCurso = true;
  botonEjecutar.disabled = true;
  botonValidar.disabled = true;
  mostrarEstado('cargando', modo === 'validacion' ? 'Validando el programa…' : 'Ejecutando el programa…');

  try {
    const respuesta = await enviarPrograma(texto, modo, { fallar: casillaFallo.checked });
    if (respuesta.ok) {
      pintarResultados(respuesta.resultados);
      mostrarEstado('exito', modo === 'validacion'
        ? 'El programa es válido. Al validar no se guarda ningún cambio.'
        : `Programa ejecutado: ${plural(respuesta.resultados.length, 'instrucción', 'instrucciones')}.`);
    } else {
      pintarDiagnosticos(respuesta.diagnosticos);
      mostrarEstado('error', `Se ${respuesta.diagnosticos.length === 1 ? 'encontró' : 'encontraron'} ${plural(respuesta.diagnosticos.length, 'error', 'errores')}. No se ejecutó ninguna instrucción.`);
    }
  } catch (error) {
    mostrarEstado('error', `No se pudo completar la solicitud. ${error.message} Intenta de nuevo.`);
  } finally {
    enCurso = false;
    botonEjecutar.disabled = false;
    botonValidar.disabled = false;
  }
}

botonEjecutar.addEventListener('click', () => enviar('ejecucion'));
botonValidar.addEventListener('click', () => enviar('validacion'));


entrada.addEventListener('keydown', (evento) => {
  if (evento.key === 'Enter' && (evento.ctrlKey || evento.metaKey)) {
    evento.preventDefault();
    enviar(evento.shiftKey ? 'validacion' : 'ejecucion');
  }
});


for (const ejemplo of EJEMPLOS) {
  const boton = crear('button', 'console-example', ejemplo.nombre);
  boton.type = 'button';
  boton.addEventListener('click', () => {
    entrada.value = ejemplo.texto;
    limpiarSalida();
    mostrarEstado('vacio', `Ejemplo cargado: ${ejemplo.nombre}. Presiona Validar o Ejecutar.`);
    entrada.focus();
  });
  listaEjemplos.append(boton);
}
