import * as Location from "expo-location";

export interface UbicacionUsuario {
  latitud: number;
  longitud: number;
}

// Los tres resultados posibles al pedir la ubicación.
// La pantalla muestra algo distinto en cada caso.
export type ResultadoUbicacion =
  | { tipo: "ok"; ubicacion: UbicacionUsuario }
  | { tipo: "sin-permiso"; puedePreguntarDeNuevo: boolean }
  | { tipo: "no-disponible" };

// Si el GPS tarda más que esto, dejamos de esperar.
const TIEMPO_MAXIMO_UBICACION = 5000;

function esperarTimeout(): Promise<null> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(null);
    }, TIEMPO_MAXIMO_UBICACION);
  });
}

export async function obtenerUbicacionActual(): Promise<ResultadoUbicacion> {
  // 1) Permiso de primer plano ("mientras uso la app"). Nunca pedimos segundo plano.
  const permiso = await Location.requestForegroundPermissionsAsync();

  if (permiso.status !== "granted") {
    // canAskAgain = false significa que el usuario eligió "no volver a preguntar":
    // la única forma de darlo es desde los Ajustes del teléfono.
    return { tipo: "sin-permiso", puedePreguntarDeNuevo: permiso.canAskAgain };
  }

  try {
    // 2) Última posición conocida: es instantánea, aunque puede ser algo vieja.
    const ultimaUbicacion = await Location.getLastKnownPositionAsync();

    if (ultimaUbicacion) {
      return {
        tipo: "ok",
        ubicacion: {
          latitud: ultimaUbicacion.coords.latitude,
          longitud: ultimaUbicacion.coords.longitude,
        },
      };
    }

    // 3) Posición actual. Promise.race se queda con la primera promesa que termine:
    //    o llega la posición, o pasan 5 segundos y el timeout devuelve null.
    const ubicacion = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      esperarTimeout(),
    ]);

    if (!ubicacion) {
      return { tipo: "no-disponible" };
    }

    return {
      tipo: "ok",
      ubicacion: {
        latitud: ubicacion.coords.latitude,
        longitud: ubicacion.coords.longitude,
      },
    };
  } catch {
    // GPS apagado o el usuario rechazó activarlo: no rompemos la pantalla.
    return { tipo: "no-disponible" };
  }
}
