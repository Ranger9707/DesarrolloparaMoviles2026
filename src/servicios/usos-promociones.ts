import { UsoDePromocion } from "../tipos/modelos";
import { pedir } from "./api";
import { obtenerBaseDatos } from "./base-datos";

/*
 * El ciclo de vida de un código de promoción vive en la API de la cátedra:
 * - el vecino GENERA su código con POST /promociones/:id/usos (uno por
 *   vecino y promoción; repetir devuelve el mismo código hasta usarlo);
 * - el comercio lo VALIDA con POST /mi-comercio/usos/validar { codigo },
 *   que registra el uso, devuelve validadoEn y recalcula el contador de
 *   usos de la promoción;
 * - GET /yo/usos lista los códigos propios, usados o no.
 * La tabla local de usos queda como registro de este dispositivo.
 */

/** Vecino: genera (o recupera) el código exclusivo de una promoción soloApp.
 * Si ya lo usó, lanza ErrorApi con código PROMO_YA_USADA. */
export async function generarMiCodigo(
  promocionId: string,
): Promise<UsoDePromocion> {
  return pedir<UsoDePromocion>(`/promociones/${promocionId}/usos`, {
    metodo: "POST",
    conSesion: true,
  });
}

/** Vecino: el código propio de una promoción, usado o no, si existe. */
export async function obtenerMiCodigo(
  promocionId: string,
): Promise<UsoDePromocion | null> {
  const usos = await pedir<UsoDePromocion[]>("/yo/usos?porPagina=100", {
    conSesion: true,
  });

  return usos.find((uso) => uso.promocionId === promocionId) ?? null;
}

/** Comercio: valida en el mostrador el código escaneado del cliente. */
export async function validarCodigoCliente(
  codigo: string,
): Promise<UsoDePromocion> {
  return pedir<UsoDePromocion>("/mi-comercio/usos/validar", {
    metodo: "POST",
    conSesion: true,
    cuerpo: { codigo },
  });
}

export async function registrarUsoPromocion(
  promocionId: string,
  usuarioId: string,
  codigo: string,
): Promise<UsoDePromocion> {
  const db = await obtenerBaseDatos();

  const usoExistente = await db.getFirstAsync<UsoDePromocion>(
    `
      SELECT
        id,
        promocion_id AS promocionId,
        usuario_id AS usuarioId,
        codigo,
        validado_en AS validadoEn
      FROM usos_promociones
      WHERE promocion_id = ? AND usuario_id = ?
      LIMIT 1
    `,
    promocionId,
    usuarioId,
  );

  if (usoExistente) {
    throw new Error("Esta promoción ya fue utilizada por este usuario.");
  }

  const nuevoUso: UsoDePromocion = {
    id: `uso-${Date.now()}`,
    promocionId,
    usuarioId,
    codigo,
    validadoEn: new Date().toISOString(),
  };

  await db.runAsync(
    `
      INSERT INTO usos_promociones (
        id,
        promocion_id,
        usuario_id,
        codigo,
        validado_en
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    nuevoUso.id,
    nuevoUso.promocionId,
    nuevoUso.usuarioId,
    nuevoUso.codigo,
    nuevoUso.validadoEn,
  );

  return nuevoUso;
}

export async function obtenerUsosPromocion(): Promise<UsoDePromocion[]> {
  const db = await obtenerBaseDatos();

  return db.getAllAsync<UsoDePromocion>(
    `
      SELECT
        id,
        promocion_id AS promocionId,
        usuario_id AS usuarioId,
        codigo,
        validado_en AS validadoEn
      FROM usos_promociones
      ORDER BY validado_en DESC
    `,
  );
}

export async function promocionYaUtilizada(
  promocionId: string,
  usuarioId: string,
): Promise<boolean> {
  const db = await obtenerBaseDatos();

  const resultado = await db.getFirstAsync<{ cantidad: number }>(
    `
      SELECT COUNT(*) AS cantidad
      FROM usos_promociones
      WHERE promocion_id = ? AND usuario_id = ?
    `,
    promocionId,
    usuarioId,
  );

  return (resultado?.cantidad ?? 0) > 0;
}
