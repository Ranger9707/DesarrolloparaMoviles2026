import { pedir } from "./api";
import { Rubro } from "../tipos/modelos";

/*
 * Rubros desde la API de la cátedra (GET /rubros).
 * Se guardan en memoria: son 9 y no cambian durante la sesión.
 * Los ids de la API ("rub-ferreteria") no son los de los mocks viejos.
 */

let rubrosEnMemoria: Rubro[] | null = null;

export async function obtenerRubros(): Promise<Rubro[]> {
  if (!rubrosEnMemoria) {
    try {
      rubrosEnMemoria = await pedir<Rubro[]>("/rubros");
    } catch {
      rubrosEnMemoria = [];
    }
  }

  return [...rubrosEnMemoria].sort((a, b) => a.orden - b.orden);
}

export async function obtenerRubroPorId(id: string): Promise<Rubro | null> {
  const rubros = await obtenerRubros();

  return rubros.find((item) => item.id === id) ?? null;
}
