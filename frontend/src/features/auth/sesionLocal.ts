import type { Me } from './api';

// RF-16: the last known student session, kept in localStorage so the app can open without
// connection. It holds only what the guard and the header need (RNF-07): role, name and user id.
// It is never proof of a session: it only lets a student reach the student routes offline.
export const ULTIMA_SESION_KEY = 'praxis.ultimaSesion';

export type UltimaSesion = { rol: 'ALUMNO'; nombre: string; usuarioId: string };

export function guardarUltimaSesion(usuario: Pick<Me['usuario'], 'id' | 'nombre' | 'rol'>): void {
  if (usuario.rol !== 'ALUMNO') return;
  const sesion: UltimaSesion = { rol: 'ALUMNO', nombre: usuario.nombre, usuarioId: usuario.id };
  try {
    localStorage.setItem(ULTIMA_SESION_KEY, JSON.stringify(sesion));
  } catch {
    // Storage blocked or full: the app just will not open offline.
  }
}

// Only a well-formed ALUMNO value counts; anything else (staff, corrupt data) is ignored.
export function leerUltimaSesion(): UltimaSesion | null {
  try {
    const crudo = localStorage.getItem(ULTIMA_SESION_KEY);
    if (!crudo) return null;
    const valor: unknown = JSON.parse(crudo);
    if (typeof valor !== 'object' || valor === null) return null;
    const { rol, nombre, usuarioId } = valor as Record<string, unknown>;
    if (rol !== 'ALUMNO' || typeof nombre !== 'string' || typeof usuarioId !== 'string') return null;
    return { rol, nombre, usuarioId };
  } catch {
    return null;
  }
}

export function borrarUltimaSesion(): void {
  try {
    localStorage.removeItem(ULTIMA_SESION_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
