import { Outlet } from 'react-router';
import { useMe } from '@/features/auth/api';
import { SignOutButton } from '@/features/auth/components/SignOutButton';

// Shell of every student screen: app name, who is signed in (name and control number) and sign out.
export function AlumnoLayout() {
  const me = useMe();
  const usuario = me.data?.usuario;
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <span className="text-lg font-bold">Praxis</span>
            {usuario && (
              <>
                <p className="truncate text-sm font-medium" title={usuario.nombre}>
                  {usuario.nombre}
                </p>
                {usuario.matricula && <p className="text-sm text-slate-700">{usuario.matricula}</p>}
              </>
            )}
          </div>
          <SignOutButton />
        </div>
      </header>
      <Outlet />
    </div>
  );
}
