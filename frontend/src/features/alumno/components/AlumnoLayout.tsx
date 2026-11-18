import { Outlet } from 'react-router';
import { Marca } from '@/components/Marca';
import { SelectorTema } from '@/components/SelectorTema';
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
      <header className="border-b border-encabezado-borde bg-encabezado text-encabezado-foreground">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <Marca />
            {nombre && (
              <p className="truncate text-sm font-medium leading-tight" title={nombre}>
                {nombre}
              </p>
            )}
            {usuario?.matricula && <p className="text-sm leading-tight text-encabezado-muted">{usuario.matricula}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SelectorTema />
            <SignOutButton enBarra />
          </div>
        </div>
      </header>
      <SincronizacionProvider>
        <Outlet />
      </SincronizacionProvider>
    </div>
  );
}
