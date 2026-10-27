import { pedir, ErrorApi, ErrorRed } from "./api";
import { obtenerBaseDatos } from "./base-datos";
import { obtenerUsuarioSesionId } from "./sesion";
import { Resena } from "../tipos/modelos";
import { ordenarResenas, calcularPromedio } from "../utils/resenas";

/*
 * Reseñas: la API como fuente y una cola local en SQLite para el modo
 * sin conexión.
 *
 * - Leer: se pide a la API, se cachea por comercio y se le suman las
 *   reseñas locales pendientes. Sin red, se muestra el cache.
 * - Escribir: se guarda SIEMPRE local con sincronizada=0 y se intenta
 *   subir ya. La API acepta el id generado por el teléfono y no duplica
 *   si se reenvía, así que la cola puede reintentar tranquila.
 */

interface FilaResenaLocal {
  id: string;
  comercio_id: string;
  usuario_id: string;
  estrellas: number;
  comentario: string;
  respuesta: string | null;
  reportada: number;
  creada_en: string;
  sincronizada: number;
}

function aResena(fila: FilaResenaLocal): Resena {
  const estrellas = Math.min(5, Math.max(1, fila.estrellas)) as 1 | 2 | 3 | 4 | 5;

  return {
    id: fila.id,
    comercioId: fila.comercio_id,
    usuarioId: fila.usuario_id,
    estrellas,
    comentario: fila.comentario,
    respuesta: fila.respuesta,
    reportada: Boolean(fila.reportada),
    creadaEn: fila.creada_en,
    sincronizada: Boolean(fila.sincronizada),
  };
}

/** Id generado por el teléfono: "res-" + texto único. La API no duplica si se reenvía. */
function generarIdLocal(): string {
  return `res-l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* ----------------------------- cola local ----------------------------- */

async function leerLocales(comercioId: string): Promise<Resena[]> {
  const db = await obtenerBaseDatos();

  const filas = await db.getAllAsync<FilaResenaLocal>(
    "SELECT * FROM resenas_locales WHERE comercio_id = ?",
    comercioId,
  );

  return filas.map(aResena);
}

async function insertarLocal(resena: Resena): Promise<void> {
  const db = await obtenerBaseDatos();

  await db.runAsync(
    `INSERT OR REPLACE INTO resenas_locales
      (id, comercio_id, usuario_id, estrellas, comentario, respuesta, reportada, creada_en, sincronizada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    resena.id,
    resena.comercioId,
    resena.usuarioId,
    resena.estrellas,
    resena.comentario,
    resena.respuesta,
    resena.reportada ? 1 : 0,
    resena.creadaEn,
    resena.sincronizada ? 1 : 0,
  );
}

async function borrarLocal(id: string): Promise<void> {
  const db = await obtenerBaseDatos();

  await db.runAsync("DELETE FROM resenas_locales WHERE id = ?", id);
}

async function marcarSincronizada(id: string): Promise<void> {
  const db = await obtenerBaseDatos();

  await db.runAsync("UPDATE resenas_locales SET sincronizada = 1 WHERE id = ?", id);
}

/* ------------------------------ cache --------------------------------- */

async function guardarCache(comercioId: string, resenas: Resena[]): Promise<void> {
  const db = await obtenerBaseDatos();
  const actualizadoEn = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM resenas_cache WHERE comercio_id = ?", comercioId);

    for (const resena of resenas) {
      await db.runAsync(
        `INSERT OR REPLACE INTO resenas_cache (id, comercio_id, datos, actualizado_en)
         VALUES (?, ?, ?, ?)`,
        resena.id,
        comercioId,
        JSON.stringify(resena),
        actualizadoEn,
      );
    }
  });
}

async function leerCache(comercioId: string): Promise<Resena[]> {
  const db = await obtenerBaseDatos();

  const filas = await db.getAllAsync<{ datos: string }>(
    "SELECT datos FROM resenas_cache WHERE comercio_id = ?",
    comercioId,
  );

  return filas.map((fila) => JSON.parse(fila.datos) as Resena);
}

async function quitarDelCache(id: string): Promise<void> {
  const db = await obtenerBaseDatos();

  await db.runAsync("DELETE FROM resenas_cache WHERE id = ?", id);
}

/* --------------------------- lectura pública --------------------------- */

export async function obtenerResenasPorComercio(
  comercioId: string,
): Promise<{ resenas: Resena[]; desdeCache: boolean }> {
  let delServidor: Resena[];
  let desdeCache = false;

  try {
    delServidor = await pedir<Resena[]>(
      `/comercios/${comercioId}/resenas?porPagina=100`,
    );

    await guardarCache(comercioId, delServidor);
  } catch {
    desdeCache = true;

    delServidor = await leerCache(comercioId);

    const localesEnEspera = await leerLocales(comercioId);

    // Sin API, sin cache y sin locales: error de carga (no "lista vacía"),
    // para que la pantalla ofrezca reintentar. Con locales pendientes
    // se muestra lo que hay: reseñar sin conexión tiene que verse.
    if (delServidor.length === 0 && localesEnEspera.length === 0) {
      throw new Error("No se pudieron cargar las reseñas.");
    }
  }

  const locales = await leerLocales(comercioId);
  const idsServidor = new Set(delServidor.map((resena) => resena.id));

  // Las locales ya subidas también están en la respuesta del servidor.
  const pendientes = locales.filter(
    (resena) => !resena.sincronizada && !idsServidor.has(resena.id),
  );

  return {
    resenas: ordenarResenas(
      [...delServidor, ...pendientes].filter((resena) => !resena.reportada),
    ),
    desdeCache,
  };
}

export async function obtenerPromedioResenas(
  comercioId: string,
): Promise<number> {
  const { resenas } = await obtenerResenasPorComercio(comercioId);

  return calcularPromedio(resenas);
}

export async function obtenerCantidadResenas(
  comercioId: string,
): Promise<number> {
  const { resenas } = await obtenerResenasPorComercio(comercioId);

  return resenas.length;
}

/* ----------------------------- escritura ------------------------------ */

export async function crearResena(
  comercioId: string,
  estrellas: 1 | 2 | 3 | 4 | 5,
  comentario: string,
): Promise<Resena> {
  const usuarioId = await obtenerUsuarioSesionId();

  if (!usuarioId) {
    throw new Error("Necesitás iniciar sesión para dejar una reseña.");
  }

  const resena: Resena = {
    id: generarIdLocal(),
    comercioId,
    usuarioId,
    estrellas,
    comentario: comentario.trim(),
    respuesta: null,
    reportada: false,
    creadaEn: new Date().toISOString(),
    sincronizada: false,
  };

  // Se guarda local SIEMPRE: si no hay red, queda en la cola.
  await insertarLocal(resena);

  try {
    await pedir(`/comercios/${comercioId}/resenas`, {
      metodo: "POST",
      conSesion: true,
      cuerpo: {
        id: resena.id,
        estrellas,
        comentario: resena.comentario,
        creadaEn: resena.creadaEn,
      },
    });

    await marcarSincronizada(resena.id);

    return { ...resena, sincronizada: true };
  } catch (error) {
    if (error instanceof ErrorRed) {
      // Sin conexión: queda pendiente y sincroniza después.
      return resena;
    }

    if (error instanceof ErrorApi && error.codigo === "RESENA_YA_EXISTE") {
      // El servidor ya tiene una reseña nuestra: descartamos la local
      // y le avisamos a la UI para que ofrezca editar la existente.
      await borrarLocal(resena.id);

      throw error;
    }

    // Error de validación u otro: la local no debería quedarse.
    await borrarLocal(resena.id);

    throw error;
  }
}

export async function editarResena(
  id: string,
  estrellas: 1 | 2 | 3 | 4 | 5,
  comentario: string,
): Promise<void> {
  const db = await obtenerBaseDatos();

  const fila = await db.getFirstAsync<FilaResenaLocal>(
    "SELECT * FROM resenas_locales WHERE id = ?",
    id,
  );

  if (fila && !fila.sincronizada) {
    // Pendiente de subir: se edita la copia local y ya (el POST lleva todo).
    await db.runAsync(
      "UPDATE resenas_locales SET estrellas = ?, comentario = ? WHERE id = ?",
      estrellas,
      comentario.trim(),
      id,
    );

    return;
  }

  // Ya está en el servidor: se edita allá (hace falta red).
  await pedir(`/resenas/${id}`, {
    metodo: "PATCH",
    conSesion: true,
    cuerpo: { estrellas, comentario: comentario.trim() },
  });

  if (fila) {
    await db.runAsync(
      "UPDATE resenas_locales SET estrellas = ?, comentario = ? WHERE id = ?",
      estrellas,
      comentario.trim(),
      id,
    );
  }
}

export async function borrarResena(id: string): Promise<void> {
  const db = await obtenerBaseDatos();

  const fila = await db.getFirstAsync<FilaResenaLocal>(
    "SELECT * FROM resenas_locales WHERE id = ?",
    id,
  );

  if (fila && !fila.sincronizada) {
    await borrarLocal(id);

    return;
  }

  await pedir(`/resenas/${id}`, { metodo: "DELETE", conSesion: true });

  if (fila) {
    await borrarLocal(id);
  }

  await quitarDelCache(id);
}

export async function reportarResena(id: string): Promise<void> {
  await pedir(`/resenas/${id}/reportes`, { metodo: "POST", conSesion: true });

  await quitarDelCache(id);
}

/**
 * El comercio responde una reseña — una sola vez por reseña: repetir da
 * RESENA_YA_RESPONDIDA y el mensaje de la API se muestra tal cual.
 */
export async function responderResena(id: string, texto: string): Promise<void> {
  await pedir(`/resenas/${id}/respuesta`, {
    metodo: "POST",
    conSesion: true,
    cuerpo: { respuesta: texto.trim() },
  });

  await quitarDelCache(id);
}

/* --------------------------- sincronización --------------------------- */

export async function sincronizarResenasPendientes(): Promise<number> {
  const db = await obtenerBaseDatos();

  const filas = await db.getAllAsync<FilaResenaLocal>(
    "SELECT * FROM resenas_locales WHERE sincronizada = 0",
  );

  let subidas = 0;

  for (const fila of filas) {
    try {
      await pedir(`/comercios/${fila.comercio_id}/resenas`, {
        metodo: "POST",
        conSesion: true,
        cuerpo: {
          id: fila.id,
          estrellas: aResena(fila).estrellas,
          comentario: fila.comentario,
          creadaEn: fila.creada_en,
        },
      });

      await marcarSincronizada(fila.id);

      subidas += 1;
    } catch (error) {
      if (error instanceof ErrorApi && error.codigo === "RESENA_YA_EXISTE") {
        // El servidor ya la tiene (se subió en otro intento u otro dispositivo).
        await borrarLocal(fila.id);

        continue;
      }

      // Sin red u otro error: queda en la cola para el próximo intento.
    }
  }

  return subidas;
}
