// Tablero de tareas e historial (#8): muestra las tareas de AutoTask por estado y el historial de operaciones.
// Va separado del calendario de TareasHogar. Por ahora usa los datos de ejemplo de tablero-ejemplos.js;
// en #16 cargarTablero() pedirá los datos a la API real.
import { ESTADOS_TABLERO, agruparPorEstado, filtrarHistorial, cargarTablero } from './tablero-ejemplos.js';

const seccion = document.querySelector('#tablero');
const estado = document.querySelector('#board-status');
const columnas = document.querySelector('#board-columns');
const listaHistorial = document.querySelector('#history-list');
const botonActualizar = document.querySelector('#board-refresh');
const botonesFiltro = document.querySelectorAll('[data-filtro]');
const casillaFallo = document.querySelector('#board-fail');
const casillaVacio = document.querySelector('#board-empty');

const NOMBRE_ESTADO = { PENDIENTE: 'Pendiente', EN_PROGRESO: 'En progreso', COMPLETADA: 'Completada', CANCELADA: 'Cancelada' };
const NOMBRE_TIPO = { operacion: 'Operación', notificacion: 'Notificación', correo: 'Correo' };
const NOMBRE_OPERACION = {
  crear: 'Crear tarea', asignar: 'Asignar tarea', cambiar_estado: 'Cambiar estado', consultar: 'Consultar tarea',
  listar: 'Listar tareas', notificar: 'Notificar', enviar_correo: 'Enviar correo', condicional: 'Condicional',
};
// incierto y no_procesado vienen de la ejecución parcial del ejecutor (docs/contrato-ir.md, PR #30).
const NOMBRE_RESULTADO = {
  exito: 'Éxito', error: 'Error', en_cola: 'En cola', enviado: 'Enviado', fallido: 'Fallido', incierto: 'Incierto', no_procesado: 'No procesado',
};

let historial = [];
let filtro = 'todo';
let enCurso = false;
let recargarAlTerminar = false; // si algo cambia mientras carga, se vuelve a cargar al terminar

function crear(etiqueta, clase, texto = '') {
  const elemento = document.createElement(etiqueta);
  elemento.className = clase;
  elemento.textContent = texto;
  return elemento;
}

function mostrarEstado(tipo, mensaje) {
  estado.dataset.estado = tipo; // cargando | listo | vacio | error
  estado.textContent = mensaje;
}

function formatearFecha(texto, opciones) {
  if (!texto) return '';
  const fecha = new Date(texto.length === 10 ? `${texto}T12:00:00` : texto);
  return Number.isNaN(fecha.getTime()) ? texto : fecha.toLocaleString('es-MX', opciones);
}

function crearTarjeta(tarea) {
  const tarjeta = crear('li', 'board-card');
  tarjeta.append(crear('p', 'board-card-title', tarea.titulo));
  const datos = crear('div', 'board-card-meta');
  const responsable = crear('span', 'board-person', tarea.responsable ?? 'Sin asignar');
  if (!tarea.responsable) responsable.classList.add('is-empty');
  responsable.prepend(crear('span', 'board-avatar', tarea.responsable ? tarea.responsable[0] : '?'));
  datos.append(responsable);
  if (tarea.fecha) datos.append(crear('span', 'board-date', formatearFecha(tarea.fecha, { day: 'numeric', month: 'short' })));
  tarjeta.append(datos, crear('span', 'board-id', tarea.id));
  return tarjeta;
}

function pintarTablero(tareas) {
  const grupos = agruparPorEstado(tareas);
  columnas.replaceChildren(...ESTADOS_TABLERO.map((clave) => {
    const columna = crear('section', 'board-column');
    columna.dataset.estado = clave;
    const encabezado = crear('h3', 'board-column-title', NOMBRE_ESTADO[clave]);
    encabezado.append(crear('span', 'board-count', String(grupos[clave].length)));
    const lista = crear('ul', 'board-list');
    if (grupos[clave].length === 0) lista.append(crear('li', 'board-empty', 'Sin tareas'));
    else lista.append(...grupos[clave].map(crearTarjeta));
    columna.append(encabezado, lista);
    return columna;
  }));
}

function pintarHistorial() {
  const visibles = filtrarHistorial(historial, filtro);
  if (visibles.length === 0) {
    const mensaje = historial.length === 0 ? 'Todavía no hay operaciones en el historial.' : 'No hay movimientos de este tipo.';
    listaHistorial.replaceChildren(crear('li', 'history-empty', mensaje));
    return;
  }
  listaHistorial.replaceChildren(...visibles.map((h) => {
    const item = crear('li', 'history-item');
    item.dataset.tipo = h.tipo;
    const fecha = crear('time', 'history-time', formatearFecha(h.fecha, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
    fecha.dateTime = h.fecha;
    const encabezado = crear('div', 'history-head');
    const resultado = crear('span', 'history-result', NOMBRE_RESULTADO[h.resultado] ?? h.resultado);
    resultado.dataset.resultado = h.resultado;
    encabezado.append(
      crear('span', 'history-type', NOMBRE_TIPO[h.tipo] ?? h.tipo),
      crear('strong', 'history-operation', NOMBRE_OPERACION[h.operacion] ?? h.operacion),
      resultado,
    );
    item.append(fecha, encabezado);
    if (h.instruccion) item.append(crear('code', 'history-instruction', h.instruccion));
    if (h.detalle) item.append(crear('p', 'history-detail', h.detalle));
    return item;
  }));
}

function mostrarErrorDeCarga(error) {
  mostrarEstado('error', `No se pudieron cargar las tareas ni el historial. ${error.message} `);
  const reintentar = crear('button', 'board-retry', 'Reintentar');
  reintentar.type = 'button';
  reintentar.addEventListener('click', cargar);
  estado.append(reintentar);
  columnas.replaceChildren();
  listaHistorial.replaceChildren();
}

async function cargar() {
  if (enCurso) {
    recargarAlTerminar = true;
    return;
  }
  enCurso = true;
  seccion.setAttribute('aria-busy', 'true');
  botonActualizar.disabled = true;
  mostrarEstado('cargando', 'Cargando tareas e historial…');
  try {
    let datos;
    if (casillaFallo.checked || casillaVacio.checked) {
      datos = await cargarTablero({ fallar: casillaFallo.checked, vacio: casillaVacio.checked });
    } else {
      const peticion = await fetch('/api/tablero');
      if (!peticion.ok) {
        throw new Error(`La API respondió con estado ${peticion.status}.`);
      }
      datos = await peticion.json();
    }
    historial = datos.historial;
    pintarTablero(datos.tareas);
    pintarHistorial();
    if (datos.tareas.length === 0) {
      mostrarEstado('vacio', 'Todavía no hay tareas. Puedes crearlas desde la consola con CREAR TAREA "título".');
    } else {
      const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      mostrarEstado('listo', `${datos.tareas.length} ${datos.tareas.length === 1 ? 'tarea' : 'tareas'} · actualizado a las ${hora}`);
    }
  } catch (error) {
    mostrarErrorDeCarga(error);
  } finally {
    enCurso = false;
    seccion.removeAttribute('aria-busy');
    botonActualizar.disabled = false;
    if (recargarAlTerminar) {
      recargarAlTerminar = false;
      cargar();
    }
  }
}

botonActualizar.addEventListener('click', cargar);
casillaFallo.addEventListener('change', cargar);
casillaVacio.addEventListener('change', cargar);
window.addEventListener('autotask:programa-ejecutado', cargar);

for (const boton of botonesFiltro) {
  boton.addEventListener('click', () => {
    filtro = boton.dataset.filtro;
    for (const otro of botonesFiltro) otro.setAttribute('aria-pressed', String(otro === boton));
    pintarHistorial();
  });
}

cargar();
