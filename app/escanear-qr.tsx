import { CameraView, useCameraPermissions } from "expo-camera";
import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useTema } from "../src/contexto/tema";
import {
  confirmarAccionExitosa,
  informarError,
} from "../src/servicios/haptica";
import { notificarPromocionRegistrada } from "../src/servicios/notificaciones";
import { obtenerPromocionPorId } from "../src/servicios/promociones";
import { validarCodigoCliente } from "../src/servicios/usos-promociones";
import { Promocion, UsoDePromocion } from "../src/tipos/modelos";

type EstadoQr = "escaneando" | "validando" | "valido" | "invalido";

export default function EscanearQrScreen() {
  const { colores } = useTema();
  const styles = useMemo(() => crearEstilos(colores), [colores]);
  const [permiso, solicitarPermiso] = useCameraPermissions();

  const [estadoQr, setEstadoQr] = useState<EstadoQr>("escaneando");
  const [codigoLeido, setCodigoLeido] = useState<string | null>(null);
  const [uso, setUso] = useState<UsoDePromocion | null>(null);
  const [promocion, setPromocion] = useState<Promocion | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  if (!permiso) {
    return (
      <View style={styles.estadoContainer}>
        <ActivityIndicator size="large" color={colores.primario} />
        <Text style={styles.estadoTexto}>Verificando permiso de cámara...</Text>
      </View>
    );
  }

  if (!permiso.granted) {
    return (
      <>
        <Stack.Screen options={{ title: "Escanear QR" }} />

        <View style={styles.estadoContainer}>
          <Text style={styles.titulo}>Acceso a la cámara</Text>

          <Text style={styles.estadoTexto}>
            Para leer el código QR de una promoción, la aplicación necesita
            permiso para usar la cámara.
          </Text>

          <Pressable
            onPress={solicitarPermiso}
            style={styles.boton}
            accessibilityRole="button"
          >
            <Text style={styles.botonTexto}>Permitir cámara</Text>
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            style={styles.botonSecundario}
            accessibilityRole="button"
          >
            <Text style={styles.botonSecundarioTexto}>Volver</Text>
          </Pressable>
        </View>
      </>
    );
  }

  async function manejarCodigoLeido({ data }: { data: string }) {
    if (estadoQr !== "escaneando") {
      return;
    }

    const codigo = data.trim();

    setEstadoQr("validando");
    setCodigoLeido(codigo);
    setMensajeError(null);

    // El QR del vecino contiene el código generado por la API (POST
    // /promociones/:id/usos). El formato viejo PROMO|... ya no se emite.
    if (codigo.startsWith("PROMO|")) {
      await informarError();

      setEstadoQr("invalido");
      setMensajeError(
        "Este formato de código ya no se usa. Pedile al cliente que abra la promoción y muestre su código nuevo.",
      );
      return;
    }

    if (!codigo) {
      await informarError();

      setEstadoQr("invalido");
      setMensajeError("El código QR está vacío.");
      return;
    }

    try {
      const uso = await validarCodigoCliente(codigo);

      const promocionEncontrada = await obtenerPromocionPorId(uso.promocionId);

      setUso(uso);
      setPromocion(promocionEncontrada);

      await confirmarAccionExitosa();

      await notificarPromocionRegistrada(
        promocionEncontrada?.titulo ?? "Promoción",
        uso.codigo,
      );

      setEstadoQr("valido");
    } catch (errorDesconocido) {
      await informarError();

      setEstadoQr("invalido");
      setMensajeError(
        errorDesconocido instanceof Error
          ? errorDesconocido.message
          : "El código no pudo validarse.",
      );
    }
  }

  function volverAEscanear() {
    setEstadoQr("escaneando");
    setCodigoLeido(null);
    setUso(null);
    setPromocion(null);
    setMensajeError(null);
  }

  return (
    <>
      <Stack.Screen options={{ title: "Escanear QR" }} />

      <View style={styles.container}>
        {estadoQr === "escaneando" && (
          <>
            <CameraView
              style={styles.camara}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
              }}
              onBarcodeScanned={manejarCodigoLeido}
            />

            <View style={styles.instrucciones}>
              <Text style={styles.instruccionesTitulo}>Escanear código QR</Text>

              <Text style={styles.instruccionesTexto}>
                Ubicá el código dentro de la cámara. La lectura se realizará
                automáticamente.
              </Text>
            </View>
          </>
        )}

        {estadoQr === "validando" && (
          <View style={styles.estadoContainer}>
            <ActivityIndicator size="large" color={colores.primario} />
            <Text style={styles.estadoTexto}>Validando código...</Text>
          </View>
        )}

        {estadoQr === "valido" && uso && (
          <View style={styles.resultadoContainer}>
            <Text style={styles.titulo}>Uso registrado</Text>

            <Text style={styles.exito}>
              La promoción quedó registrada y su contador de usos se
              actualizó.
            </Text>

            <Text style={styles.label}>Promoción</Text>
            <Text style={styles.valor}>
              {promocion?.titulo ?? "Promoción"}
            </Text>

            <Text style={styles.label}>Código del cliente</Text>
            <Text style={styles.valor}>{uso.codigo}</Text>

            <Text style={styles.label}>Registrado</Text>
            <Text style={styles.valor}>
              {new Date(uso.validadoEn ?? Date.now()).toLocaleString("es-AR")}
            </Text>

            {mensajeError && <Text style={styles.error}>{mensajeError}</Text>}

            <Pressable
              onPress={volverAEscanear}
              style={styles.boton}
              accessibilityRole="button"
            >
              <Text style={styles.botonTexto}>Escanear otro código</Text>
            </Pressable>

            <Pressable
              onPress={() => router.back()}
              style={styles.botonSecundario}
              accessibilityRole="button"
            >
              <Text style={styles.botonSecundarioTexto}>Finalizar</Text>
            </Pressable>
          </View>
        )}

        {estadoQr === "invalido" && (
          <View style={styles.resultadoContainer}>
            <Text style={styles.titulo}>Código QR no válido</Text>

            <Text style={styles.error}>
              {mensajeError ?? "El código escaneado no es válido."}
            </Text>

            {codigoLeido && (
              <>
                <Text style={styles.label}>Contenido detectado</Text>
                <Text style={styles.valor}>{codigoLeido}</Text>
              </>
            )}

            <Pressable
              onPress={volverAEscanear}
              style={styles.boton}
              accessibilityRole="button"
            >
              <Text style={styles.botonTexto}>Escanear otro código</Text>
            </Pressable>

            <Pressable
              onPress={() => router.back()}
              style={styles.botonSecundario}
              accessibilityRole="button"
            >
              <Text style={styles.botonSecundarioTexto}>Finalizar</Text>
            </Pressable>
          </View>
        )}

      </View>
    </>
  );
}

function crearEstilos(colores: ReturnType<typeof useTema>["colores"]) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colores.fondo,
    },

    camara: {
      flex: 1,
    },

    instrucciones: {
      padding: 18,
      backgroundColor: colores.tarjeta,
    },

    instruccionesTitulo: {
      fontSize: 20,
      fontWeight: "700",
      marginBottom: 6,
      color: colores.texto,
    },

    instruccionesTexto: {
      fontSize: 15,
      lineHeight: 21,
      color: colores.secundario,
    },

    estadoContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 14,
      backgroundColor: colores.fondo,
    },

    estadoTexto: {
      fontSize: 16,
      lineHeight: 22,
      textAlign: "center",
      color: colores.secundario,
    },

    resultadoContainer: {
      flex: 1,
      justifyContent: "center",
      padding: 24,
      backgroundColor: colores.fondo,
    },

    titulo: {
      fontSize: 26,
      fontWeight: "700",
      marginBottom: 20,
      color: colores.texto,
    },

    label: {
      fontSize: 14,
      fontWeight: "700",
      marginTop: 10,
      marginBottom: 4,
      color: colores.secundario,
    },

    valor: {
      fontSize: 16,
      marginBottom: 8,
      color: colores.texto,
    },

    error: {
      fontSize: 15,
      lineHeight: 21,
      marginVertical: 12,
      color: colores.cerrado,
    },

    exito: {
      fontSize: 16,
      lineHeight: 22,
      marginBottom: 16,
      color: colores.abierto,
    },

    boton: {
      marginTop: 18,
      borderWidth: 1,
      borderColor: colores.primario,
      backgroundColor: colores.primario,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
    },

    botonDeshabilitado: {
      opacity: 0.6,
    },

    botonTexto: {
      fontSize: 16,
      fontWeight: "700",
      color: "#FFFFFF",
    },

    botonSecundario: {
      marginTop: 8,
      paddingVertical: 14,
      alignItems: "center",
    },

    botonSecundarioTexto: {
      fontSize: 15,
      fontWeight: "600",
      color: colores.primario,
    },
  });
}
