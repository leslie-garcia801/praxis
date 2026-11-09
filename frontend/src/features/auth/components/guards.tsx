import { Navigate, Outlet } from 'react-router';
import { Button } from '@/components/ui/button';
import { destinationFor, homeFor, useMe, type Rol } from '../api';

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

// Reads the session once for a group of routes; renders the loading and error states itself so a
// guarded page never flashes before the redirect.
function useGuard() {
  const query = useMe();
  if (query.isError) return { blocked: <LoadError onRetry={() => void query.refetch()} /> };
  if (query.data === undefined) return { blocked: <LoadingScreen /> };
  return { me: query.data };
}

// /entrar and /activar: a signed-in user has nothing to do here.
export function PublicOnly() {
  const { blocked, me } = useGuard();
  if (blocked) return blocked;
  if (me) return <Navigate to={destinationFor(me)} replace />;
  return <Outlet />;
}

// /alumno and /vinculacion (RN-03b): only the given roles; a pending password change comes first.
export function RequireRole({ roles }: { roles: Rol[] }) {
  const { blocked, me } = useGuard();
  if (blocked) return blocked;
  if (!me) return <Navigate to="/entrar" replace />;
  if (me.usuario.debeCambiar) return <Navigate to="/cambiar-contrasena" replace />;
  if (!roles.includes(me.usuario.rol)) return <Navigate to={homeFor(me.usuario.rol)} replace />;
  return <Outlet />;
}

// /cambiar-contrasena (RF-04): only while the change is pending.
export function RequirePendingChange() {
  const { blocked, me } = useGuard();
  if (blocked) return blocked;
  if (!me) return <Navigate to="/entrar" replace />;
  if (!me.usuario.debeCambiar) return <Navigate to={homeFor(me.usuario.rol)} replace />;
  return <Outlet />;
}

// "/" goes to the right place for whoever is looking at it.
export function HomeRedirect() {
  const { blocked, me } = useGuard();
  if (blocked) return blocked;
  return <Navigate to={me ? destinationFor(me) : '/entrar'} replace />;
}
