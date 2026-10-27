import { Resena } from "../tipos/modelos";

/*
 * Lógica pura de reseñas: entra dato, sale dato. Sin red, sin base, sin
 * React — es la parte que se testea sola (y la que más se equivoca a mano).
 */

/** De la más nueva a la más vieja, sin mutar la lista que entra. */
export function ordenarResenas(resenas: Resena[]): Resena[] {
  return [...resenas].sort(
    (a, b) => new Date(b.creadaEn).getTime() - new Date(a.creadaEn).getTime(),
  );
}

/** Promedio de estrellas; 0 con lista vacía (nunca NaN). */
export function calcularPromedio(resenas: Resena[]): number {
  if (resenas.length === 0) {
    return 0;
  }

  const total = resenas.reduce((suma, resena) => suma + resena.estrellas, 0);

  return total / resenas.length;
}

/** La reseña del usuario en la lista, o null si no tiene / no hay sesión. */
export function miResenaDeLista(
  resenas: Resena[],
  usuarioId: string | null,
): Resena | null {
  if (!usuarioId) {
    return null;
  }

  return resenas.find((resena) => resena.usuarioId === usuarioId) ?? null;
}

/**
 * Valida una reseña antes de guardarla. Devuelve el mensaje de error,
 * o null si está bien. Las mismas reglas que aplica la API:
 * estrellas de 1 a 5, comentario de 1 a 1000 letras.
 */
export function validarResena(
  estrellas: number,
  comentario: string,
): string | null {
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
    return "Falta elegir las estrellas, de 1 a 5.";
  }

  const texto = comentario.trim();

  if (texto.length === 0) {
    return "Escribí un comentario para la reseña.";
  }

  if (texto.length > 1000) {
    return "El comentario tiene que tener entre 1 y 1000 letras.";
  }

  return null;
}
