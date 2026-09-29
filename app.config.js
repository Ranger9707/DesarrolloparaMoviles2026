// Expo lee primero app.json y después este archivo, que recibe esa configuración
// en `config` y puede completarla con valores que NO deben quedar en el repositorio.
// La clave de Google Maps se carga como variable de entorno (en EAS, como secret).
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
    },
  },
});
