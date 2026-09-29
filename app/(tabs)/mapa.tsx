import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, Region } from "react-native-maps";

import { obtenerComercios } from "../../src/servicios/comercios";
import {
  obtenerUbicacionActual,
  UbicacionUsuario,
} from "../../src/servicios/ubicacion";
import { Comercio } from "../../src/tipos/modelos";
import {
  calcularDistanciaKm,
  formatearDistancia,
} from "../../src/utils/distancias";

// Zona que se muestra si no tenemos la ubicación del usuario.
const REGION_CONCEPCION: Region = {
  latitude: -32.484,
  longitude: -58.231,
  latitudeDelta: 0.03, // "zoom": cuántos grados entran en la pantalla
  longitudeDelta: 0.03,
};

// Margen (en píxeles) que se deja alrededor de los marcadores al encuadrar.
const MARGEN_ENCUADRE = { top: 60, right: 60, bottom: 60, left: 60 };

type EstadoUbicacion =
  | "buscando"
  | "ok"
  | "sin-permiso"
  | "sin-permiso-definitivo"
  | "no-disponible";

interface ComercioEnLista {
  comercio: Comercio;
  distanciaKm: number | null; // null cuando no sabemos dónde está el usuario
}

export default function MapaScreen() {
  // Referencia al mapa para moverlo por código (no redibuja la pantalla).
  const mapaRef = useRef<MapView>(null);

  const [mapaListo, setMapaListo] = useState(false);

  const [comercios, setComercios] = useState<Comercio[]>([]);

  const [cargando, setCargando] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [ubicacionUsuario, setUbicacionUsuario] =
    useState<UbicacionUsuario | null>(null);

  const [estadoUbicacion, setEstadoUbicacion] =
    useState<EstadoUbicacion>("buscando");

  async function cargarComercios() {
    try {
      setCargando(true);
      setError(null);

      const comerciosObtenidos = await obtenerComercios();

      setComercios(comerciosObtenidos);
    } catch {
      setError("No fue posible cargar los comercios.");
    } finally {
      setCargando(false);
    }
  }

  // La ubicación se pide aparte: si falla, los comercios se muestran igual.
  async function cargarUbicacion() {
    setEstadoUbicacion("buscando");

    const resultado = await obtenerUbicacionActual();

    if (resultado.tipo === "ok") {
      setUbicacionUsuario(resultado.ubicacion);
      setEstadoUbicacion("ok");
      return;
    }

    setUbicacionUsuario(null);

    if (resultado.tipo === "sin-permiso") {
      setEstadoUbicacion(
        resultado.puedePreguntarDeNuevo
          ? "sin-permiso"
          : "sin-permiso-definitivo",
      );
    } else {
      setEstadoUbicacion("no-disponible");
    }
  }

  // Al abrir la pantalla: cargamos comercios y ubicación en paralelo.
  useEffect(() => {
    cargarComercios();
    cargarUbicacion();
    // Solo queremos que corra una vez, al montar la pantalla.
  }, []);

  // Cada vez que cambian los comercios o la ubicación, ajustamos el zoom
  // para que entren todos los marcadores (y el usuario, si lo tenemos).
  useEffect(() => {
    if (!mapaListo) {
      return;
    }

    const puntos = comercios.map((comercio) => ({
      latitude: comercio.coordenadas.latitud,
      longitude: comercio.coordenadas.longitud,
    }));

    if (ubicacionUsuario) {
      puntos.push({
        latitude: ubicacionUsuario.latitud,
        longitude: ubicacionUsuario.longitud,
      });
    }

    if (puntos.length === 0) {
      return;
    }

    mapaRef.current?.fitToCoordinates(puntos, {
      edgePadding: MARGEN_ENCUADRE,
      animated: true,
    });
  }, [mapaListo, comercios, ubicacionUsuario]);

  // Lista de abajo: ordenada por distancia si sabemos dónde está el usuario,
  // o por nombre si no. useMemo evita recalcularla en cada render.
  const comerciosEnLista = useMemo<ComercioEnLista[]>(() => {
    if (!ubicacionUsuario) {
      return [...comercios]
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map((comercio) => ({ comercio, distanciaKm: null }));
    }

    return comercios
      .map((comercio) => ({
        comercio,
        distanciaKm: calcularDistanciaKm(
          ubicacionUsuario,
          comercio.coordenadas,
        ),
      }))
      .sort((a, b) => a.distanciaKm - b.distanciaKm);
  }, [comercios, ubicacionUsuario]);

  if (cargando) {
    return (
      <View style={styles.estadoContainer}>
        <ActivityIndicator size="large" />

        <Text style={styles.estadoTexto}>Cargando mapa...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.estadoContainer}>
        <Text style={styles.error}>{error}</Text>

        <Pressable style={styles.boton} onPress={cargarComercios}>
          <Text style={styles.botonTexto}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapaRef}
        style={styles.mapa}
        initialRegion={REGION_CONCEPCION}
        onMapReady={() => setMapaListo(true)}
        showsUserLocation={estadoUbicacion === "ok"}
        showsMyLocationButton={estadoUbicacion === "ok"}
      >
        {comercios.map((comercio) => (
          <Marker
            key={comercio.id}
            coordinate={{
              latitude: comercio.coordenadas.latitud,
              longitude: comercio.coordenadas.longitud,
            }}
            title={comercio.nombre}
            description={comercio.direccion}
            onCalloutPress={() => router.push(`/comercio/${comercio.id}`)}
          />
        ))}
      </MapView>

      <View style={styles.panel}>
        <AvisoUbicacion
          estado={estadoUbicacion}
          onReintentar={cargarUbicacion}
        />

        <Text style={styles.panelTitulo}>
          {ubicacionUsuario ? "Comercios cercanos" : "Comercios"}
        </Text>

        {comerciosEnLista.length === 0 ? (
          <Text style={styles.avisoTexto}>No hay comercios para mostrar.</Text>
        ) : (
          <ScrollView contentContainerStyle={styles.listaContenido}>
            {comerciosEnLista.map(({ comercio, distanciaKm }) => (
              <Pressable
                key={comercio.id}
                style={styles.comercioItem}
                onPress={() => router.push(`/comercio/${comercio.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Abrir ${comercio.nombre}`}
              >
                <View style={styles.comercioInformacion}>
                  <Text style={styles.comercioNombre}>{comercio.nombre}</Text>

                  <Text style={styles.comercioDireccion}>
                    {comercio.direccion}
                  </Text>
                </View>

                {distanciaKm !== null && (
                  <Text style={styles.comercioDistancia}>
                    {formatearDistancia(distanciaKm)}
                  </Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

// Componente chico que muestra el aviso según el estado de la ubicación.
function AvisoUbicacion({
  estado,
  onReintentar,
}: {
  estado: EstadoUbicacion;
  onReintentar: () => void;
}) {
  if (estado === "ok") {
    return null; // todo bien: no mostramos nada
  }

  if (estado === "buscando") {
    return (
      <View style={styles.aviso}>
        <ActivityIndicator size="small" />
        <Text style={styles.avisoTexto}>Buscando tu ubicación...</Text>
      </View>
    );
  }

  const mensajes: Record<Exclude<EstadoUbicacion, "ok" | "buscando">, string> =
    {
      "sin-permiso":
        "No diste permiso de ubicación. Podés ver todos los comercios igual.",
      "sin-permiso-definitivo":
        "El permiso de ubicación está desactivado. Podés activarlo desde los ajustes.",
      "no-disponible":
        "No pudimos obtener tu ubicación. Revisá que el GPS esté activado.",
    };

  return (
    <View style={styles.aviso}>
      <Text style={styles.avisoTexto}>{mensajes[estado]}</Text>

      {estado === "sin-permiso-definitivo" ? (
        <Pressable onPress={() => Linking.openSettings()}>
          <Text style={styles.avisoAccion}>Abrir ajustes</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onReintentar}>
          <Text style={styles.avisoAccion}>Reintentar</Text>
        </Pressable>
      )}
    </View>
  );
}

const TEXTO = "#1a1a1a";

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  mapa: {
    flex: 3,
  },

  panel: {
    flex: 2,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: "white",
  },

  panelTitulo: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 10,
    color: TEXTO,
  },

  aviso: {
    backgroundColor: "#fff4e5",
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 6,
  },

  avisoTexto: {
    fontSize: 14,
    lineHeight: 20,
    color: TEXTO,
  },

  avisoAccion: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1565c0",
  },

  listaContenido: {
    paddingBottom: 12,
    gap: 8,
  },

  comercioItem: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  comercioInformacion: {
    flex: 1,
  },

  comercioNombre: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
    color: TEXTO,
  },

  comercioDireccion: {
    fontSize: 13,
    color: TEXTO,
  },

  comercioDistancia: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXTO,
  },

  estadoContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "white",
  },

  estadoTexto: {
    fontSize: 16,
    color: TEXTO,
  },

  error: {
    fontSize: 16,
    textAlign: "center",
    color: TEXTO,
  },

  boton: {
    backgroundColor: "#1565c0",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },

  botonTexto: {
    color: "white",
    fontWeight: "700",
  },
});
