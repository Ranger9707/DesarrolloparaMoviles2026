import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { sincronizarResenasPendientes } from "../servicios/resenas";
import { useEstadoRed } from "./use-estado-red";

/*
 * Sube las reseñas que quedaron pendientes cuando:
 *   1. vuelve la conexión (paso de sin red → con red), y
 *   2. la app vuelve a primer plano (AppState → "active").
 *
 * Si no hay pendientes, sincronizarResenasPendientes() no hace nada:
 * llamarlo de más es barato.
 */
export function useSincronizacionResenas() {
  const estadoRed = useEstadoRed();

  const hayConexion = estadoRed.conectado && estadoRed.tieneInternet;

  const conexionAnterior = useRef<boolean | null>(null);

  useEffect(() => {
    if (!hayConexion) {
      conexionAnterior.current = false;

      return;
    }

    // Primera vez que sabemos que hay red, o recién volvió la conexión.
    if (conexionAnterior.current !== true) {
      sincronizarResenasPendientes().catch(() => {});
    }

    conexionAnterior.current = true;
  }, [hayConexion]);

  useEffect(() => {
    const suscripcion = AppState.addEventListener("change", (estado) => {
      if (estado === "active") {
        sincronizarResenasPendientes().catch(() => {});
      }
    });

    return () => suscripcion.remove();
  }, []);
}
