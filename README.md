# Directorio de Comercios

Aplicación móvil desarrollada como **Trabajo Integrador Final** de la asignatura **Desarrollo para Móviles — 2026**, Universidad Nacional de Entre Ríos (UNER).

Directorio móvil de comercios para **Concepción del Uruguay**: búsqueda y filtros, fichas completas, mapa con ubicación, promociones con QR, reseñas, favoritos y avisos locales. Con funcionalidades diferenciadas para vecinos y comercios, consumo de la API de la cátedra y persistencia local para uso sin conexión.

---

## Integrantes

| Integrante |
|---|
| Melina Johanna Lisette Casco |
| Daniel Marcelo Cisnero |
| José Ignacio Debuck |
| Marcos Gabriel Gainza |
| María Gabriela Olivares Contreras |
| Matías Vespa |

---

## Funcionalidades

### Vecino

- Listado de comercios con búsqueda por nombre o producto, filtro por rubro y por "abierto ahora".
- Ficha del comercio: fotos, video de presentación, horarios, teléfono, WhatsApp, Instagram y medios de pago.
- Mapa con la ubicación del usuario, filtro por rubro, ordenamiento por distancia y botón "Ir" (abre Google Maps para guiarte caminando o en auto).
- Promociones por estado (vigentes, próximas, por vencer) y filtro por rubro; QR "Mostrar mi código" para promos exclusivas de la app.
- Reseñas con estrellas y comentario, ordenadas de la más nueva a la más vieja; edición y borrado de la propia, reporte de reseñas ofensivas.
- Favoritos, rubros de interés y avisos locales (promo nueva de un favorito o rubro elegido, promo por vencer), con interruptor general para apagarlos.
- Registro e inicio de sesión, sesión persistente, reingreso con biometría, funcionamiento sin conexión con datos cacheados.

### Comercio

- Edición de datos generales y horarios del local.
- Gestión de fotos y video de presentación (cámara, galería, copia local y publicación vía API).
- Alta, edición y baja de promociones, con la cantidad de usos de cada una.
- Escaneo del QR del cliente para registrar el uso de una promoción.
- Respuesta a las reseñas de los clientes (una respuesta por reseña).

---

## Tecnologías

- **Expo SDK 54** · **React Native 0.81** · **React 19** · **TypeScript**
- **Expo Router** (navegación), **axios** (API), **StyleSheet** (estilos)
- **expo-location** + **react-native-maps**, **expo-camera**, **expo-image-picker**, **expo-video**
- **expo-sqlite** (+ kv-store), **expo-network**, **expo-secure-store** + **expo-local-authentication**
- **expo-notifications** (avisos locales), **expo-haptics**, **expo-file-system** (API nueva: `File`, `Directory`, `Paths`)
- Íconos: `@react-native-vector-icons/ionicons`

---

## Cómo correr el proyecto

**API de la cátedra** (la app no muestra datos sin ella):

1. Clonar el repo oficial de la cátedra y entrar a `api-directorio-comercios/`.
2. `pnpm install && pnpm dev` — queda en `http://localhost:3000`.

**App** (requiere Node 20+):

```bash
npm install
npx expo start
```

- En un emulador Android (Android Studio), instalar **Expo Go SDK 54** (la Play Store trae una versión más nueva que no sirve; el APK 54.0.8 está en los releases oficiales de `expo/expo-go-releases`). Luego `adb reverse tcp:8081 tcp:8081` y abrir `exp://10.0.2.2:8081`.
- `apiUrl` apunta a `10.0.2.2:3000` (el `localhost` de la máquina anfitriona visto desde el emulador) — configurado en `app.json` → `extra.apiUrl`.

**Verificación:**

```bash
npx tsc --noEmit   # TypeScript
npm run lint       # ESLint
npx jest --ci      # Tests (87 en 10 suites)
```

---

## Credenciales de desarrollo

> Corresponden únicamente al entorno de pruebas de la API de la cátedra. Contraseña `demo1234` para todas las cuentas.

| Rol | Correo |
|---|---|
| Vecino | `marta@mail.com` |
| Comercio | `tornillo@demo.ar` |
| Comercio | `otro.comercio@demo.ar` |
| Vecino | `nuevo@demo.ar` |

---

## Estructura del proyecto

```text
app/                  Pantallas (Expo Router): tabs + fichas + flujos de comercio
src/servicios/        Capa de acceso a API y datos (ninguna pantalla consume la API directo)
src/tipos/            Tipos compartidos (entidades del PRD)
src/utils/            Reglas puras: horarios, distancias, QR, validaciones
src/hooks/            Efectos globales (avisos, sincronización de reseñas)
src/contexto/         Tema claro/oscuro
__tests__/            87 tests en 10 suites
docs/                 CAMBIOS.md (detalle técnico por módulo) y HUECOS-PRD.md (huecos del PRD reportados al cliente)
```

---

## Licencia

MIT — ver [LICENSE](./LICENSE).
