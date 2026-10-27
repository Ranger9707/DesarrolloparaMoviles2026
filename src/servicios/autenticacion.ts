import { pedir } from "./api";
import { usuariosMock } from "../mocks/usuarios";
import { Usuario } from "../tipos/modelos";

/*
 * Autenticación contra la API de la cátedra.
 *
 * Ojo: el campo de la contraseña viaja como "contrasena" (sin ñ) —
 * la API rechaza "password" con VALIDACION_FALLA.
 *
 * obtenerUsuarioPorId queda sobre los mocks mientras el resto de la app
 * migra: se usa para mostrar nombres de autores. La API no expone un
 * endpoint público de usuarios.
 */

interface ResultadoLogin {
  usuario: Usuario;
  token: string;
}

interface DatosRegistro {
  nombre: string;
  email: string;
  password: string;
}

interface RespuestaSesion {
  token: string;
  usuario: Usuario;
}

function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function iniciarSesion(
  email: string,
  password: string,
): Promise<ResultadoLogin> {
  const datos = await pedir<RespuestaSesion>("/auth/ingreso", {
    metodo: "POST",
    cuerpo: {
      email: normalizarEmail(email),
      contrasena: password,
    },
  });

  return { usuario: datos.usuario, token: datos.token };
}

export async function registrarUsuario(
  datos: DatosRegistro,
): Promise<ResultadoLogin> {
  const respuesta = await pedir<RespuestaSesion>("/auth/registro", {
    metodo: "POST",
    cuerpo: {
      nombre: datos.nombre.trim(),
      email: normalizarEmail(datos.email),
      contrasena: datos.password,
    },
  });

  return { usuario: respuesta.usuario, token: respuesta.token };
}

/** El usuario de la sesión, preguntándole a la API (GET /yo). */
export async function obtenerUsuarioActual(): Promise<Usuario | null> {
  try {
    return await pedir<Usuario>("/yo", { conSesion: true });
  } catch {
    return null;
  }
}

/** Búsqueda local por id (mocks): nombres de autores mientras migra el resto. */
export async function obtenerUsuarioPorId(id: string): Promise<Usuario | null> {
  return usuariosMock.find((usuario) => usuario.id === id) ?? null;
}
