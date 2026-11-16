import { useState, type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router';
import { Button } from '@/components/ui/button';
import { esErrorDeRed, useEnLinea } from '@/lib/conexion';
import { destinationFor, homeFor, useMe, type Me, type Rol } from '../api';
import { leerUltimaSesion, type UltimaSesion } from '../sesionLocal';

function LoadingScreen() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <p role="status" className="text-muted-foreground">
        Cargando…
      </p>
    </main>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-3 px-4">
      <p role="alert">No se pudo cargar tu sesión. Revisa tu conexión e intenta de nuevo.</p>
      <Button onClick={onRetry}>Reintentar</Button>
    </main>
  );
}

type Guard = { blocked: ReactNode } | { me: Me | null } | { sinConexion: UltimaSesion };

// Reads the session once for a group of routes; renders the loading and error states itself so a
// guarded page never flashes before the redirect.
// RF-16: when /api/me cannot be reached (offline or fetch threw) and this device knows a student's
// last session, the student routes open in offline mode. That session is never proof for staff.
function useGuard(): Guard {
  const query = useMe();
  const enLinea = useEnLinea();
  // Once the network failed, stay in offline mode while /api/me is tried again: TanStack Query puts a
  // query without data back to "pending" on every refetch, and the routes must not unmount meanwhile.
  const [redCaida, setRedCaida] = useState(false);
  const sinDatos = query.data === undefined;
  const errorDeRed = query.isError && esErrorDeRed(query.error);
  const sinRed = sinDatos && (!enLinea || errorDeRed || (redCaida && query.isPending));
  if (sinRed && !redCaida) setRedCaida(true);
  if (redCaida && !sinRed && !query.isPending) setRedCaida(false);
  if (sinRed) {
    const ultima = leerUltimaSesion();
    if (ultima) return { sinConexion: ultima };
  }
  // A failed background refresh by network keeps the session already read.
  if (query.isError && (sinDatos || !esErrorDeRed(query.error))) {
    return { blocked: <LoadError onRetry={() => void query.refetch()} /> };
  }
  if (sinDatos) return { blocked: sinRed ? <LoadError onRetry={() => void query.refetch()} /> : <LoadingScreen /> };
  return { me: query.data };
}

// /entrar and /activar: a signed-in user has nothing to do here.
export function PublicOnly() {
  const guard = useGuard();
  if ('blocked' in guard) return guard.blocked;
  if ('sinConexion' in guard) return <Navigate to="/alumno" replace />;
  if (guard.me) return <Navigate to={destinationFor(guard.me)} replace />;
  return <Outlet />;
}

// /alumno and /vinculacion (RN-03b): only the given roles; a pending password change comes first.
export function RequireRole({ roles }: { roles: Rol[] }) {
  const guard = useGuard();
  if ('blocked' in guard) return guard.blocked;
  if ('sinConexion' in guard) {
    return roles.includes(guard.sinConexion.rol) ? <Outlet /> : <Navigate to="/alumno" replace />;
  }
  const { me } = guard;
  if (!me) return <Navigate to="/entrar" replace />;
  if (me.usuario.debeCambiar) return <Navigate to="/cambiar-contrasena" replace />;
  if (!roles.includes(me.usuario.rol)) return <Navigate to={homeFor(me.usuario.rol)} replace />;
  return <Outlet />;
}

// /cambiar-contrasena (RF-04): only while the change is pending.
export function RequirePendingChange() {
  const guard = useGuard();
  if ('blocked' in guard) return guard.blocked;
  // A remembered session is only kept for accounts with no pending change.
  if ('sinConexion' in guard) return <Navigate to="/alumno" replace />;
  const { me } = guard;
  if (!me) return <Navigate to="/entrar" replace />;
  if (!me.usuario.debeCambiar) return <Navigate to={homeFor(me.usuario.rol)} replace />;
  return <Outlet />;
}

// "/" goes to the right place for whoever is looking at it.
export function HomeRedirect() {
  const guard = useGuard();
  if ('blocked' in guard) return guard.blocked;
  if ('sinConexion' in guard) return <Navigate to="/alumno" replace />;
  return <Navigate to={guard.me ? destinationFor(guard.me) : '/entrar'} replace />;
}
