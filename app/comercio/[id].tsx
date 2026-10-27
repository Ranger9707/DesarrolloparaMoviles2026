import { Ionicons } from "@expo/vector-icons";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  router,
} from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { FormularioResena } from "../../src/components/resenas/formulario-resena";
import { FormularioRespuesta } from "../../src/components/resenas/formulario-respuesta";
import { TarjetaResena } from "../../src/components/resenas/tarjeta-resena";
import { obtenerComercioPorId } from "../../src/servicios/comercios";
import { obtenerUsuarioActual } from "../../src/servicios/autenticacion";
import { alternarFavorito, esFavorito } from "../../src/servicios/favoritos";
import { obtenerPromocionesPorComercio } from "../../src/servicios/promociones";
import {
  borrarResena,
  crearResena,
  editarResena,
  obtenerResenasPorComercio,
  reportarResena,
  responderResena,
} from "../../src/servicios/resenas";
import { obtenerRubroPorId } from "../../src/servicios/rubros";
import { obtenerUsuarioSesionId } from "../../src/servicios/sesion";
import { Comercio, Promocion, Resena, Rubro, Usuario } from "../../src/tipos/modelos";
import { miResenaDeLista } from "../../src/utils/resenas";
import { estaAbiertoAhora } from "../../src/utils/horarios";

const nombresDias = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

function VideoComercio({ videoUrl }: { videoUrl: string }) {
  const player = useVideoPlayer(videoUrl, (player) => {
    player.loop = false;
  });

  return (
    <View style={styles.seccion}>
      <Text style={styles.seccionTitulo}>Video de presentación</Text>

      <VideoView
        style={styles.video}
        player={player}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{
          enable: true,
        }}
      />
    </View>
  );
}

export default function ComercioDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [comercio, setComercio] = useState<Comercio | null>(null);
  const [rubro, setRubro] = useState<Rubro | null>(null);
  const [promocionVigente, setPromocionVigente] = useState<Promocion | null>(
    null,
  );
  const [favorito, setFavorito] = useState(false);
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Reseñas: sesión, formulario y acciones ---
  const [usuarioSesionId, setUsuarioSesionId] = useState<string | null>(null);
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);
  const [modalResenaVisible, setModalResenaVisible] = useState(false);
  const [resenaEditando, setResenaEditando] = useState<Resena | null>(null);
  const [errorResena, setErrorResena] = useState<string | null>(null);
  const [errorResenas, setErrorResenas] = useState<string | null>(null);
  const [resenasDesdeCache, setResenasDesdeCache] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [modalRespuestaVisible, setModalRespuestaVisible] = useState(false);
  const [resenaAResponder, setResenaAResponder] = useState<Resena | null>(null);

  const miResena = useMemo(
    () => miResenaDeLista(resenas, usuarioSesionId),
    [resenas, usuarioSesionId],
  );

  // El PRD: el comercio da su versión. Sólo el dueño de ESTE comercio
  // puede responder sus reseñas (la API igual lo verifica con 403).
  const esDueno =
    usuarioActual?.rol === "comercio" &&
    comercio !== null &&
    usuarioActual.comercioId === comercio.id;

  const cargarResenas = useCallback(async (comercioId: string) => {
    try {
      setErrorResenas(null);

      const { resenas: datos, desdeCache } = await obtenerResenasPorComercio(comercioId);

      setResenas(datos);
      setResenasDesdeCache(desdeCache);
    } catch {
      // Distinto de "sin reseñas": la API falló y no había datos guardados.
      setResenas([]);
      setResenasDesdeCache(false);
      setErrorResenas("No se pudieron cargar las reseñas.");
    }
  }, []);

  useEffect(() => {
    obtenerUsuarioSesionId().then(setUsuarioSesionId);
    obtenerUsuarioActual().then(setUsuarioActual);
  }, []);

  /*
   * La ficha sigue montada cuando se apila otra pantalla encima y vuelve:
   * el useEffect de arriba no se re-ejecuta. useFocusEffect refresca las
   * reseñas cada vez que la pantalla recupera el foco — salvo la primera,
   * porque el montaje ya las cargó (teoría: el "segundo reloj").
   */
  const esElPrimerFoco = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (esElPrimerFoco.current) {
        esElPrimerFoco.current = false;

        return;
      }

      if (typeof id === "string") {
        cargarResenas(id);
      }
    }, [id, cargarResenas]),
  );

  // El gesto de tirar para abajo refresca las reseñas: el vecino revisa si
  // hay novedades sin salir de la ficha.
  async function recargarResenas() {
    if (!comercio) {
      return;
    }

    setRefrescando(true);

    try {
      await cargarResenas(comercio.id);
    } finally {
      setRefrescando(false);
    }
  }

  useEffect(() => {
    async function cargarComercio() {
      try {
        setCargando(true);
        setError(null);

        const datos = await obtenerComercioPorId(id);

        if (!datos) {
          setComercio(null);
          return;
        }

        setComercio(datos);

        const [rubroDatos, favoritoActual, promociones] = await Promise.all([
          obtenerRubroPorId(datos.rubroId),
          esFavorito(datos.id),
          obtenerPromocionesPorComercio(datos.id),
        ]);

        setRubro(rubroDatos);
        setFavorito(favoritoActual);

        const hoy = new Date();

        const vigente =
          promociones.find((promocion) => {
            const desde = new Date(`${promocion.desde}T00:00:00`);
            const hasta = new Date(`${promocion.hasta}T23:59:59`);

            return hoy >= desde && hoy <= hasta;
          }) ?? null;

        setPromocionVigente(vigente);

        await cargarResenas(datos.id);
      } catch {
        setError("No fue posible cargar el comercio.");
      } finally {
        setCargando(false);
      }
    }

    cargarComercio();
  }, [id, cargarResenas]);

  function abrirFormularioResena(editando: Resena | null) {
    if (!usuarioSesionId) {
      // Sin sesión no se reseña: el PRD manda a loguearse primero.
      router.push("/login");

      return;
    }

    setErrorResena(null);
    setResenaEditando(editando);
    setModalResenaVisible(true);
  }

  async function guardarResena(
    estrellas: 1 | 2 | 3 | 4 | 5,
    comentario: string,
  ) {
    if (!comercio) {
      return;
    }

    try {
      if (resenaEditando) {
        await editarResena(resenaEditando.id, estrellas, comentario);
      } else {
        await crearResena(comercio.id, estrellas, comentario);
      }

      setModalResenaVisible(false);
      setResenaEditando(null);
      await cargarResenas(comercio.id);
    } catch (e) {
      const mensaje =
        e instanceof Error ? e.message : "No se pudo guardar la reseña.";

      // Si el servidor ya tenía una reseña nuestra, refrescamos y ofrecemos editar.
      if (e instanceof Object && "codigo" in e && (e as { codigo: string }).codigo === "RESENA_YA_EXISTE") {
        setModalResenaVisible(false);
        setResenaEditando(null);
        setErrorResena(mensaje);
        await cargarResenas(comercio.id);

        return;
      }

      throw new Error(mensaje);
    }
  }

  async function manejarBorrado(resena: Resena) {
    if (!comercio) {
      return;
    }

    try {
      await borrarResena(resena.id);
      await cargarResenas(comercio.id);
    } catch (e) {
      setErrorResena(e instanceof Error ? e.message : "No se pudo borrar.");
    }
  }

  async function manejarReporte(resena: Resena) {
    if (!comercio) {
      return;
    }

    try {
      await reportarResena(resena.id);
      await cargarResenas(comercio.id);
    } catch (e) {
      setErrorResena(e instanceof Error ? e.message : "No se pudo reportar.");
    }
  }

  function abrirFormularioRespuesta(resena: Resena) {
    setErrorResena(null);
    setResenaAResponder(resena);
    setModalRespuestaVisible(true);
  }

  async function enviarRespuesta(texto: string) {
    if (!resenaAResponder || !comercio) {
      return;
    }

    try {
      await responderResena(resenaAResponder.id, texto);

      setModalRespuestaVisible(false);
      setResenaAResponder(null);
      await cargarResenas(comercio.id);
    } catch (e) {
      // El formulario muestra el mensaje tal cual (incluye RESENA_YA_RESPONDIDA).
      throw new Error(
        e instanceof Error ? e.message : "No se pudo enviar la respuesta.",
      );
    }
  }

  const horariosAgrupados = useMemo(() => {
    if (!comercio) {
      return [];
    }

    const grupos = new Map<number, string[]>();

    comercio.horarios.forEach((horario) => {
      const franjas = grupos.get(horario.dia) ?? [];

      franjas.push(`${horario.abre} - ${horario.cierra}`);

      grupos.set(horario.dia, franjas);
    });

    return Array.from(grupos.entries())
      .sort(([diaA], [diaB]) => diaA - diaB)
      .map(([dia, franjas]) => ({
        dia,
        franjas,
      }));
  }, [comercio]);

  async function llamar() {
    if (!comercio?.telefono) return;

    await Linking.openURL(`tel:${comercio.telefono}`);
  }

  async function abrirWhatsApp() {
    if (!comercio?.whatsapp) return;

    await Linking.openURL(`https://wa.me/${comercio.whatsapp}`);
  }

  async function abrirMapa() {
    if (!comercio) return;

    const { latitud, longitud } = comercio.coordenadas;

    const url =
      `https://www.google.com/maps/search/?api=1&query=` +
      `${latitud},${longitud}`;

    await Linking.openURL(url);
  }

  async function abrirInstagram() {
    if (!comercio?.instagram) return;

    const usuario = comercio.instagram.replace("@", "");

    await Linking.openURL(`https://www.instagram.com/${usuario}/`);
  }

  async function cambiarFavorito() {
    if (!comercio) return;

    const nuevoEstado = await alternarFavorito(comercio.id);

    setFavorito(nuevoEstado);
  }

  if (cargando) {
    return (
      <View style={styles.estadoContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.estadoTexto}>Cargando comercio...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.estadoContainer}>
        <Text style={styles.errorTexto}>{error}</Text>
      </View>
    );
  }

  if (!comercio) {
    return (
      <View style={styles.estadoContainer}>
        <Text style={styles.estadoTexto}>Comercio no encontrado.</Text>
      </View>
    );
  }

  const abierto = estaAbiertoAhora(comercio.horarios);

  return (
    <>
      <Stack.Screen
        options={{
          title: comercio.nombre,
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={recargarResenas}
            colors={["#222222"]}
            tintColor="#222222"
          />
        }
      >
        <View style={styles.encabezado}>
          <View style={styles.tituloFila}>
            <Text style={styles.title}>{comercio.nombre}</Text>

            <Pressable
              onPress={cambiarFavorito}
              accessibilityRole="button"
              accessibilityLabel={
                favorito
                  ? "Quitar comercio de favoritos"
                  : "Agregar comercio a favoritos"
              }
              hitSlop={10}
            >
              <Ionicons name={favorito ? "heart" : "heart-outline"} size={28} />
            </Pressable>
          </View>

          <Text style={styles.rubro}>
            {rubro?.nombre ?? "Rubro no informado"}
          </Text>

          <View style={styles.estadoFila}>
            <View
              style={[
                styles.estadoChip,
                abierto ? styles.estadoAbierto : styles.estadoCerrado,
              ]}
            >
              <Text style={styles.estadoChipTexto}>
                {abierto ? "Abierto ahora" : "Cerrado ahora"}
              </Text>
            </View>

            <Text style={styles.valoracion}>
              ★ {comercio.puntaje.toFixed(1)} · {comercio.cantidadResenas}{" "}
              reseñas
            </Text>
          </View>
        </View>

        {comercio.videoUrl ? (
          <VideoComercio videoUrl={comercio.videoUrl} />
        ) : null}

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Sobre el comercio</Text>
          <Text style={styles.descripcion}>{comercio.descripcion}</Text>
        </View>

        {promocionVigente ? (
          <View style={styles.promocionCard}>
            <View style={styles.promocionEncabezado}>
              <Text style={styles.seccionTitulo}>Promoción vigente</Text>

              {promocionVigente.descuento !== null ? (
                <View style={styles.descuentoChip}>
                  <Text style={styles.descuentoTexto}>
                    {promocionVigente.descuento}% OFF
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.promocionTitulo}>
              {promocionVigente.titulo}
            </Text>

            <Text style={styles.text}>{promocionVigente.detalle}</Text>

            <Text style={styles.promocionVigencia}>
              Vigente hasta {promocionVigente.hasta}
            </Text>
          </View>
        ) : null}

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Contacto y ubicación</Text>

          <Text style={styles.label}>Dirección</Text>
          <Text style={styles.text}>{comercio.direccion}</Text>

          <View style={styles.acciones}>
            <Pressable
              style={[
                styles.botonAccion,
                !comercio.telefono && styles.botonDeshabilitado,
              ]}
              onPress={llamar}
              disabled={!comercio.telefono}
              accessibilityRole="button"
              accessibilityLabel="Llamar al comercio"
            >
              <View style={styles.botonContenido}>
                <Ionicons name="call-outline" size={18} />
                <Text style={styles.botonAccionTexto}>Llamar</Text>
              </View>
            </Pressable>

            <Pressable
              style={[
                styles.botonAccion,
                !comercio.whatsapp && styles.botonDeshabilitado,
              ]}
              onPress={abrirWhatsApp}
              disabled={!comercio.whatsapp}
              accessibilityRole="button"
              accessibilityLabel="Abrir WhatsApp del comercio"
            >
              <View style={styles.botonContenido}>
                <Ionicons name="logo-whatsapp" size={18} />
                <Text style={styles.botonAccionTexto}>WhatsApp</Text>
              </View>
            </Pressable>

            <Pressable
              style={styles.botonAccion}
              onPress={abrirMapa}
              accessibilityRole="button"
              accessibilityLabel="Cómo llegar al comercio"
            >
              <View style={styles.botonContenido}>
                <Ionicons name="navigate-outline" size={18} />
                <Text style={styles.botonAccionTexto}>Cómo llegar</Text>
              </View>
            </Pressable>
          </View>

          {comercio.instagram ? (
            <>
              <Text style={styles.label}>Instagram</Text>

              <Pressable
                onPress={abrirInstagram}
                accessibilityRole="link"
                accessibilityLabel={`Abrir Instagram ${comercio.instagram}`}
              >
                <View style={styles.instagramFila}>
                  <Ionicons name="logo-instagram" size={18} />
                  <Text style={styles.enlace}>{comercio.instagram}</Text>
                </View>
              </Pressable>
            </>
          ) : null}
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Horarios</Text>

          {horariosAgrupados.length === 0 ? (
            <Text style={styles.text}>Horarios no informados.</Text>
          ) : (
            horariosAgrupados.map(({ dia, franjas }) => (
              <View key={dia} style={styles.horarioFila}>
                <Text style={styles.horarioDia}>{nombresDias[dia]}</Text>

                <View style={styles.horarioFranjas}>
                  {franjas.map((franja) => (
                    <Text key={franja} style={styles.horarioHora}>
                      {franja}
                    </Text>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Medios de pago</Text>

          <View style={styles.chipsContainer}>
            {comercio.mediosDePago.map((medio) => (
              <View key={medio} style={styles.chip}>
                <Text style={styles.chipTexto}>{medio}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Reseñas</Text>

          <Pressable
            onPress={() => abrirFormularioResena(miResena)}
            style={styles.botonResena}
            accessibilityRole="button"
            accessibilityLabel={
              miResena ? "Editar mi reseña" : "Escribir una reseña"
            }
          >
            <Ionicons
              name={miResena ? "create-outline" : "chatbubble-ellipses-outline"}
              size={18}
              color="#FFF"
            />

            <Text style={styles.botonResenaTexto}>
              {miResena
                ? "Editar mi reseña"
                : usuarioSesionId
                  ? "Escribir una reseña"
                  : "Iniciá sesión para reseñar"}
            </Text>
          </Pressable>

          {errorResena ? (
            <Text style={styles.errorResena}>{errorResena}</Text>
          ) : null}

          {errorResenas ? (
            <View style={styles.errorResenasBloque}>
              <Text style={styles.errorResena}>{errorResenas}</Text>

              <Pressable
                onPress={() => comercio && cargarResenas(comercio.id)}
                style={styles.botonReintentar}
                accessibilityRole="button"
                accessibilityLabel="Reintentar cargar reseñas"
              >
                <Text style={styles.botonReintentarTexto}>Reintentar</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {resenasDesdeCache && resenas.length > 0 ? (
                <View style={styles.avisoDatosViejos}>
                  <Ionicons name="cloud-offline-outline" size={14} />

                  <Text style={styles.avisoDatosViejosTexto}>
                    Sin conexión: estás viendo reseñas guardadas, pueden estar
                    desactualizadas.
                  </Text>
                </View>
              ) : null}

              {resenas.length === 0 ? (
                <View style={styles.resenaVacia}>
                  <Ionicons name="chatbubble-outline" size={24} />

                  <Text style={styles.text}>
                    Este comercio todavía no tiene reseñas disponibles.
                  </Text>
                </View>
              ) : (
                resenas.map((resena) => (
                  <TarjetaResena
                    key={resena.id}
                    resena={resena}
                    esPropia={resena.usuarioId === usuarioSesionId}
                    puedeResponder={esDueno}
                    onEditar={(r) => abrirFormularioResena(r)}
                    onBorrar={manejarBorrado}
                    onReportar={manejarReporte}
                    onResponder={abrirFormularioRespuesta}
                  />
                ))
              )}
            </>
          )}
        </View>
      </ScrollView>

      <FormularioResena
        visible={modalResenaVisible}
        resenaExistente={resenaEditando}
        onGuardar={guardarResena}
        onCancelar={() => {
          setModalResenaVisible(false);
          setResenaEditando(null);
        }}
      />

      <FormularioRespuesta
        visible={modalRespuestaVisible}
        nombreComercio={comercio?.nombre ?? "el comercio"}
        onEnviar={enviarRespuesta}
        onCancelar={() => {
          setModalRespuestaVisible(false);
          setResenaAResponder(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },

  container: {
    padding: 20,
    paddingBottom: 40,
    gap: 20,
  },

  encabezado: {
    gap: 6,
  },

  tituloFila: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  title: {
    flex: 1,
    fontSize: 26,
    fontWeight: "700",
  },

  rubro: {
    fontSize: 15,
  },

  estadoFila: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },

  estadoChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  estadoAbierto: {
    backgroundColor: "#E6F4EA",
  },

  estadoCerrado: {
    backgroundColor: "#FCE8E6",
  },

  estadoChipTexto: {
    fontSize: 13,
    fontWeight: "700",
  },

  valoracion: {
    fontSize: 14,
  },

  seccion: {
    gap: 8,
  },

  seccionTitulo: {
    fontSize: 18,
    fontWeight: "700",
  },

  descripcion: {
    fontSize: 15,
    lineHeight: 21,
  },

  video: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
  },

  promocionCard: {
    gap: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#999",
    borderRadius: 12,
  },

  promocionEncabezado: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  promocionTitulo: {
    fontSize: 16,
    fontWeight: "700",
  },

  promocionVigencia: {
    fontSize: 13,
  },

  descuentoChip: {
    borderWidth: 1,
    borderColor: "#666",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },

  descuentoTexto: {
    fontSize: 12,
    fontWeight: "700",
  },

  label: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },

  text: {
    fontSize: 15,
    lineHeight: 21,
  },

  enlace: {
    fontSize: 15,
    lineHeight: 21,
    textDecorationLine: "underline",
  },

  acciones: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },

  botonContenido: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  instagramFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  botonAccion: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },

  botonDeshabilitado: {
    opacity: 0.4,
  },

  botonAccionTexto: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },

  horarioFila: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 5,
  },

  horarioDia: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },

  horarioFranjas: {
    flex: 1,
    alignItems: "flex-end",
    gap: 3,
  },

  horarioHora: {
    fontSize: 15,
    textAlign: "right",
  },

  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  chip: {
    borderWidth: 1,
    borderColor: "#999",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  chipTexto: {
    fontSize: 13,
  },

  resenaVacia: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },

  botonResena: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#222",
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 12,
  },

  botonResenaTexto: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
  },

  errorResena: {
    color: "#B3261E",
    fontWeight: "600",
    marginBottom: 10,
  },

  errorResenasBloque: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },

  botonReintentar: {
    borderWidth: 1,
    borderColor: "#B3261E",
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },

  botonReintentarTexto: {
    color: "#B3261E",
    fontWeight: "600",
  },

  avisoDatosViejos: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF6DE",
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },

  avisoDatosViejosTexto: {
    fontSize: 13,
    color: "#8A6D1F",
    flex: 1,
  },

  resenaCard: {
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#C7C7C7",
    borderRadius: 12,
  },

  resenaEncabezado: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },

  resenaAutorContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#999",
    alignItems: "center",
    justifyContent: "center",
  },

  resenaAutor: {
    fontSize: 14,
    fontWeight: "700",
  },

  resenaFecha: {
    fontSize: 12,
    marginTop: 2,
  },

  estrellasFila: {
    flexDirection: "row",
    gap: 2,
  },

  resenaComentario: {
    fontSize: 14,
    lineHeight: 20,
  },

  respuestaComercio: {
    gap: 6,
    padding: 10,
    borderRadius: 9,
    backgroundColor: "#F1F1F1",
  },

  respuestaTituloFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  respuestaTitulo: {
    fontSize: 13,
    fontWeight: "700",
  },

  respuestaTexto: {
    fontSize: 13,
    lineHeight: 19,
  },

  estadoContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },

  estadoTexto: {
    fontSize: 16,
    textAlign: "center",
  },

  errorTexto: {
    fontSize: 16,
    textAlign: "center",
    fontWeight: "600",
  },
});
