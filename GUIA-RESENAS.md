# Reseñas — documentación de la parte

Parte del Trabajo Final Integrador (Directorio de Comercios, CCU — Concepción del Uruguay).
Este documento describe lo implementado, las decisiones tomadas y cómo demostrarlo.
**Estado: completo según el PRD (sección 4), con tests.**

---

## Qué cubre esta parte del PRD

> 4. Las reseñas: puntuación de 1 a 5 y comentario; ver las reseñas de un comercio de la más
> nueva a la más vieja y el promedio; editar o borrar la reseña propia; reportar una ofensiva;
> que el comercio responda una vez a cada reseña. Sin cuenta se miran; la cuenta hace falta
> para escribir. Lo que se muestra sin conexión tiene que avisar si quedó viejo.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/servicios/api.ts` | Cliente HTTP de la API: sobre `{datos, meta}` / `{error}`, token Bearer, `ErrorApi` (con `codigo`) y `ErrorRed` |
| `src/servicios/resenas.ts` | Leer (API + cache + pendientes locales mezclados), crear, editar, borrar, reportar, responder, sincronizar cola |
| `src/servicios/base-datos.ts` | Tablas `resenas_locales` (cola offline) y `resenas_cache` (lectura sin conexión) |
| `src/servicios/sesion.ts` | Token + usuario en `expo-secure-store` (del grupo; lo usa todo) |
| `src/utils/resenas.ts` | Lógica pura: `ordenarResenas`, `calcularPromedio`, `miResenaDeLista`, `validarResena` |
| `src/hooks/use-sincronizacion-resenas.ts` | Sube pendientes al volver la conexión y al volver a primer plano |
| `src/components/resenas/tarjeta-resena.tsx` | Tarjeta: acciones según propia/ajena, chip pendiente, respuesta del comercio |
| `src/components/resenas/formulario-resena.tsx` | Alta y edición: estrellas táctiles + comentario, validación compartida |
| `src/components/resenas/formulario-respuesta.tsx` | Respuesta del comercio (una sola vez) |
| `app/comercio/[id].tsx` | Integración: botón según sesión, refresco por foco, aviso de datos viejos, error con Reintentar |
| `__tests__/resenas-test.ts` | 13 tests de lógica pura (orden, promedio, mi reseña, validación) |
| `__tests__/tarjeta-resena-test.tsx` | 7 tests de componente: qué acciones ve cada rol |
| `__tests__/formulario-resena-test.tsx` | 4 tests de componente: títulos, precargado, validación, contador |

Total de la suite del proyecto: **38 tests** (`npm test`).

## Cómo funciona el modo sin conexión (el diseño)

1. **Leer**: se pide `GET /comercios/:id/resenas` a la API y se guarda en `resenas_cache`.
   Sin red o con la API caída, se muestra el cache **con aviso de que puede estar
   desactualizado** (el PRD: "avisar cuándo lo que muestra quedó viejo"). Las reseñas
   locales pendientes se muestran siempre — reseñar sin conexión tiene que verse.
2. **Escribir**: se guarda SIEMPRE primero en `resenas_locales` con `sincronizada = 0`
   y un **id generado por el teléfono** (`res-…`). Después se intenta el POST.
3. **Sincronizar**: el hook en `_layout` sube las pendientes cuando (a) vuelve la conexión
   (paso sin-red → con-red) y (b) la app pasa a primer plano. La API **acepta el id del
   teléfono y no duplica** si se reenvía — la cola puede reintentar sin riesgo.
4. Sin API, sin cache y sin pendientes locales: **error de carga con botón Reintentar**,
   distinto del estado vacío "sin reseñas".

## Endpoints de la API que usa esta parte

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/comercios/:id/resenas` | Listar (público, cacheada) |
| `POST` | `/comercios/:id/resenas` | Crear (acepta `id` local, `creadaEn` real, ignora `sincronizada`) |
| `PATCH` | `/resenas/:id` | Editar la propia |
| `DELETE` | `/resenas/:id` | Borrar la propia |
| `POST` | `/resenas/:id/reportes` | Reportar ofensiva |
| `POST` | `/resenas/:id/respuesta` | El comercio responde (una vez) |

Códigos de error manejados: `RESENA_YA_EXISTE` (409 → la ficha ofrece "Editar mi reseña"),
`REPORTE_PROPIO` (422 → la UI ni ofrece reportar la propia), `RESENA_YA_RESPONDIDA`
(409 → el botón Responder desaparece cuando hay respuesta). Los `mensaje` de la API se
muestran tal cual en pantalla.

## Decisiones tomadas

- **Autor**: "Vecino/a" para las ajenas y "Tu reseña" para la propia. Mostrar el nombre real
  exigiría que la API exponga el nombre en la reseña (hoy trae sólo `usuarioId`) y una
  preferencia de privacidad que el contrato no tiene. Pregunta hecha a la cátedra.
- **Una reseña por usuario y comercio**: lo aplica la API (`RESENA_YA_EXISTE`); la UI
  reacciona cambiando el botón a "Editar mi reseña".
- **Editar/borrar pendientes de subir**: se hace local (el POST lleva todo). Editar o borrar
  una reseña ya sincronizada requiere red.
- **"Foto para una reseña"** (mencionada en el bloque técnico del PRD): no implementable
  con este contrato — ni `Resena` ni la API tienen campo de imagen. Pregunta hecha.

## Tests

```bash
npm test          # toda la suite (38)
npx jest resenas  # sólo los tests de esta parte
```

Cobertura de esta parte: orden (más nueva primero, sin mutar la lista), promedio (0 con
lista vacía, nunca NaN), `miResenaDeLista`, validación (estrellas 1-5, comentario 1-1000),
y por componente: acciones por rol, chip de pendiente, respuesta visible, títulos del
formulario, precargado en edición, contador. **Nota de la v14 de Testing Library: `render`
es async (React 19) — siempre `await render(...)`.**

## Guion de demo para la defensa (≈ 4 minutos)

1. Sin sesión: la ficha muestra "Iniciá sesión para reseñar" → toca y manda a `/login`.
2. Ingresar (cuenta demo `nuevo@demo.ar` / `demo1234`) → "Escribir una reseña" →
   estrellas + comentario → guardar → "Tu reseña" visible al instante.
3. `RESENA_YA_EXISTE`: entrar a un comercio donde ya reseñé (o Marta en El Tornillo) →
   el botón dice "Editar mi reseña".
4. Editar y borrar la propia (con confirmación); reportar una ajena (desaparece).
5. **Offline** (para la API, `pnpm dev` frenado, o modo avión en el teléfono): crear una
   reseña → chip "Pendiente de enviar" → ver reseñas desde el cache con el aviso amarillo
   → volver la conexión → al volver a primer plano la cola sube sola → chip desaparece.
6. Respuesta del comercio: ingresar como `tornillo@demo.ar` / `demo1234` → ficha de
   El Tornillo → "Responder" en una reseña sin respuesta → enviar → bloque "Respuesta del
   comercio" bajo la reseña. El botón ya no aparece en esa reseña.
7. Estados: `X-Simular: demora-3000` en el pedido muestra la carga; comercio sin reseñas
   muestra el vacío; API caída sin cache muestra el error con "Reintentar".

## Pendientes conocidos (ninguno bloquea)

- Caso borde: reseñar offline teniendo ya una reseña sincronizada (la cola descarta la
  local en silencio al chocar con `RESENA_YA_EXISTE`). Aceptable; posible mejora: avisar.
- Los tests de la ficha completa (`app/comercio/[id].tsx`) requieren `expo-router/testing-library`
  (integración); el componente está cubierto por unidad + los componentes hijos.
