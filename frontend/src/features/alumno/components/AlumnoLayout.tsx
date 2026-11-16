import { Outlet } from 'react-router';
import { useMe } from '@/features/auth/api';
import { SignOutButton } from '@/features/auth/components/SignOutButton';
import { leerUltimaSesion } from '@/features/auth/sesionLocal';
import { SincronizacionProvider } from '@/offline/SincronizacionProvider';

// Shell of every student screen: app name, who is signed in (name and control number) and sign out.
// It also runs the offline queue sync (RF-16). Offline, the name comes from the last known session.
export function AlumnoLayout() {
  const me = useMe();
  const usuario = me.data?.usuario;
  const nombre = usuario?.nombre ?? (me.data === undefined ? leerUltimaSesion()?.nombre : undefined);
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <span className="text-lg font-bold">Praxis</span>
            {nombre && (
              <p className="truncate text-sm font-medium" title={nombre}>
                {nombre}
              </p>
            )}
            {usuario?.matricula && <p className="text-sm text-slate-700">{usuario.matricula}</p>}
          </div>
          <SignOutButton />
        </div>
      </header>
      <SincronizacionProvider>
        <Outlet />
      </SincronizacionProvider>
    </div>
  );
}
