import { AMBAS_OFICINAS_DESTINO } from '@/lib/oficinas';
import { useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth';
import { MATRICULA_REGEX } from './schemas';

export type Rol = 'ALUMNO' | 'VINCULACION' | 'ADMIN';

// Shape of GET /api/me (backend/src/modules/me/me.service.ts). Only what the screens use is typed.
export type Me = {
  usuario: {
    id: string;
    nombre: string;
    email: string | null;
    matricula: string | null;
    rol: Rol;
    oficina: 'SERVICIO_SOCIAL' | 'PRACTICAS' | null;
    debeCambiar: boolean;
  };
  alumno: {
    nombre: string;
    apellidoPaterno: string;
    apellidoMaterno: string | null;
    carrera: string;
    semestre: number;
    grupo: string;
    turno: 'MATUTINO' | 'VESPERTINO';
  } | null;
  // Active case file (RN-03): at most one in PENDIENTE, EN_PROCESO or SUSPENDIDO. Dates are 'YYYY-MM-DD'.
  expedienteActivo: {
    id: string;
    tipo: 'SERVICIO_SOCIAL' | 'PRACTICAS';
    estado: 'PENDIENTE' | 'EN_PROCESO' | 'SUSPENDIDO';
    metaHoras: number;
    fechaInicio: string | null;
    fechaTermino: string | null;
    institucion: { id: string; nombre: string } | null;
  } | null;
};

export const meKey = ['me'] as const;

// 401 (no session) and 403 CUENTA_INACTIVA (deactivated after signing in) both mean "signed out".
export async function fetchMe(): Promise<Me | null> {
  try {
    return await apiFetch<Me>('/api/me');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.code === 'CUENTA_INACTIVA')) return null;
    throw error;
  }
}

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: fetchMe, staleTime: 30_000 });
}

export function homeFor(rol: Rol): string {
  return rol === 'ALUMNO' ? '/alumno' : '/vinculacion';
}

// Where a signed-in user belongs: the forced password change first, then the home of the role.
export function destinationFor(me: Me): string {
  return me.usuario.debeCambiar ? '/cambiar-contrasena' : homeFor(me.usuario.rol);
}

export type Outcome = { ok: true } | { ok: false; message: string };

const SIGN_IN_FALLBACK = 'No se pudo iniciar sesión. Intenta de nuevo.';
const RATE_LIMIT_MESSAGE = 'Demasiados intentos. Espera un minuto e intenta de nuevo.';
const INACTIVE_MESSAGE = `Tu cuenta está desactivada. Acude a ${AMBAS_OFICINAS_DESTINO}.`;

type AuthClientError = { status?: number; code?: string } | null | undefined;

function signInMessage(error: AuthClientError): string {
  if (error?.code === 'CUENTA_INACTIVA') return INACTIVE_MESSAGE;
  if (error?.status === 429) return RATE_LIMIT_MESSAGE;
  if (error?.status === 401 || error?.code?.startsWith('INVALID_')) return 'Matrícula, correo o contraseña incorrectos.';
  return SIGN_IN_FALLBACK;
}

// RF-03: a 14-digit value is a control number (students); anything else is an email (staff).
export async function signIn(identifier: string, password: string): Promise<Outcome> {
  const value = identifier.trim();
  try {
    const { error } = MATRICULA_REGEX.test(value)
      ? await authClient.signIn.username({ username: value, password })
      : await authClient.signIn.email({ email: value, password });
    return error ? { ok: false, message: signInMessage(error) } : { ok: true };
  } catch {
    return { ok: false, message: SIGN_IN_FALLBACK };
  }
}

export async function signOut(): Promise<boolean> {
  try {
    const { error } = await authClient.signOut();
    return !error;
  } catch {
    return false;
  }
}

// --- Activation (RF-02) -------------------------------------------------------------------

export type IdentityInput = { matricula: string; nombre: string; apellidoPaterno: string };

const ACTIVATION_MESSAGES: Record<string, string> = {
  // Exact copy from RF-02 (no trailing period).
  MATRICULA_NO_REGISTRADA: `Tu matrícula no está registrada; acude a ${AMBAS_OFICINAS_DESTINO}`,
  NOMBRE_NO_COINCIDE:
    `El nombre no coincide con el registrado. Revisa cómo lo escribiste o acude a ${AMBAS_OFICINAS_DESTINO}.`,
  CUENTA_INACTIVA: INACTIVE_MESSAGE,
  CUENTA_YA_ACTIVADA: 'Tu cuenta ya está activada; inicia sesión.',
  CORREO_EN_USO: 'Ese correo ya está registrado en otra cuenta.',
  DEMASIADOS_INTENTOS: RATE_LIMIT_MESSAGE,
};

export type ActivationFailure = { message: string; code?: string };

export function activationFailure(error: unknown): ActivationFailure {
  if (error instanceof ApiError) {
    const message = ACTIVATION_MESSAGES[error.code] ?? (error.status === 429 ? RATE_LIMIT_MESSAGE : undefined);
    if (message) return { message, code: error.code };
  }
  return { message: 'No se pudo completar la solicitud. Intenta de nuevo.' };
}

export function verifyIdentity(input: IdentityInput) {
  return apiFetch<{ ok: true }>('/api/auth/activar/verificar', { method: 'POST', body: JSON.stringify(input) });
}

export function activateAccount(input: IdentityInput & { password: string; email?: string }) {
  return apiFetch<{ ok: true }>('/api/auth/activar', { method: 'POST', body: JSON.stringify(input) });
}

// --- Password change (RF-04) --------------------------------------------------------------

export function changePassword(input: { passwordActual: string; passwordNueva: string }) {
  return apiFetch<{ ok: true }>('/api/me/cambiar-contrasena', { method: 'POST', body: JSON.stringify(input) });
}
