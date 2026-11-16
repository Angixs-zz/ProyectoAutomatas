// Tabla de símbolos de tareas y usuarios · [S2 · SEM-1] #9
// La validación semántica (#10) la usa para saber si una tarea o un usuario existe,
// en qué estado está y qué operaciones admite. Solo lee datos, nunca escribe.

export const ESTADOS = Object.freeze(['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA']);

// Operaciones de la gramática (#2) en las que puede aparecer cada tipo de símbolo.
export const OPERACIONES = Object.freeze({
  tarea: Object.freeze(['asignar', 'cambiar_estado', 'consultar', 'condicional']),
  usuario: Object.freeze(['asignar', 'notificar']),
});

function diagnostico(codigo, mensaje, ubicacion) {
  return {
    etapa: 'semantica',
    codigo,
    mensaje,
    linea: ubicacion?.linea ?? null,
    columna: ubicacion?.columna ?? null,
  };
}

function simboloTarea(tarea, origen, declaradaEn = null) {
  return Object.freeze({
    tipo: 'tarea',
    id: tarea.id ?? null,
    titulo: String(tarea.titulo),
    estado: tarea.estado ?? 'PENDIENTE',
    responsableId: tarea.responsableId ?? null,
    origen,
    declaradaEn,
    operaciones: OPERACIONES.tarea,
  });
}

function simboloUsuario(usuario) {
  return Object.freeze({
    tipo: 'usuario',
    id: usuario.id,
    nombre: String(usuario.nombre),
    correo: usuario.correo ?? null,
    operaciones: OPERACIONES.usuario,
  });
}

function agregar(indice, clave, simbolo) {
  const lista = indice.get(clave) ?? [];
  lista.push(simbolo);
  indice.set(clave, lista);
}

// Resultado común de una búsqueda por nombre: 0 coincidencias, 1 o varias.
function resolver(encontrados, texto, ubicacion, codigos) {
  if (encontrados.length === 1) {
    return { ok: true, simbolo: encontrados[0] };
  }
  if (encontrados.length === 0) {
    return {
      ok: false,
      diagnostico: diagnostico(codigos.inexistente, `No existe ${codigos.nombre} «${texto}».`, ubicacion),
      candidatos: [],
    };
  }
  return {
    ok: false,
    diagnostico: diagnostico(
      codigos.ambiguo,
      `Hay ${encontrados.length} ${codigos.plural} llamados «${texto}»; no se puede saber a cuál se refiere.`,
      ubicacion,
    ),
    candidatos: [...encontrados],
  };
}

export class TablaSimbolos {
  #tareasPorTitulo = new Map();
  #tareasPorId = new Map();
  #usuariosPorNombre = new Map();
  #usuariosPorId = new Map();

  constructor(tareas = [], usuarios = []) {
    for (const tarea of tareas) {
      const simbolo = simboloTarea(tarea, 'repositorio');
      agregar(this.#tareasPorTitulo, simbolo.titulo, simbolo);
      if (simbolo.id !== null) this.#tareasPorId.set(simbolo.id, simbolo);
    }
    for (const usuario of usuarios) {
      const simbolo = simboloUsuario(usuario);
      agregar(this.#usuariosPorNombre, simbolo.nombre, simbolo);
      this.#usuariosPorId.set(simbolo.id, simbolo);
    }
  }

  // Busca una tarea por su título exacto, como la escribe el programa.
  resolverTarea(titulo, ubicacion = null) {
    const texto = String(titulo);
    return resolver(this.#tareasPorTitulo.get(texto) ?? [], texto, ubicacion, {
      inexistente: 'TAREA_INEXISTENTE',
      ambiguo: 'TAREA_AMBIGUA',
      nombre: 'la tarea',
      plural: 'tareas',
    });
  }

  // Busca un usuario por su nombre exacto.
  resolverUsuario(nombre, ubicacion = null) {
    const texto = String(nombre);
    return resolver(this.#usuariosPorNombre.get(texto) ?? [], texto, ubicacion, {
      inexistente: 'USUARIO_INEXISTENTE',
      ambiguo: 'USUARIO_AMBIGUO',
      nombre: 'el usuario',
      plural: 'usuarios',
    });
  }

  buscarTareaPorId(id) {
    return this.#tareasPorId.get(id) ?? null;
  }

  buscarUsuarioPorId(id) {
    return this.#usuariosPorId.get(id) ?? null;
  }

  // Registra una tarea que crea el propio programa (CREAR TAREA) para que las
  // instrucciones siguientes puedan usarla por su título. No toca el repositorio:
  // la tarea solo existe en esta tabla y todavía no tiene id.
  declararTarea(titulo, ubicacion = null) {
    const declaradaEn = ubicacion ? { linea: ubicacion.linea, columna: ubicacion.columna } : null;
    const simbolo = simboloTarea({ titulo }, 'programa', declaradaEn);
    agregar(this.#tareasPorTitulo, simbolo.titulo, simbolo);
    return simbolo;
  }
}

// Lee tareas y usuarios del repositorio una sola vez y arma la tabla.
// El repositorio puede ser el de memoria (pruebas) o el de PostgreSQL (#5),
// siempre que tenga listarTareas() y listarUsuarios().
export async function crearTablaSimbolos(repositorio) {
  const [tareas, usuarios] = await Promise.all([
    repositorio.listarTareas(),
    repositorio.listarUsuarios(),
  ]);
  return new TablaSimbolos(tareas, usuarios);
}
