import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useMe } from '@/features/auth/api';
import { SignOutButton } from '@/features/auth/components/SignOutButton';
import { etiquetaPerfil } from '@/lib/oficinas';

type Enlace = { to: string; label: string; end?: boolean };

const ENLACES: Enlace[] = [
  { to: '/vinculacion', label: 'Panel', end: true },
  { to: '/vinculacion/instituciones', label: 'Instituciones' },
  { to: '/vinculacion/importar/alumnos', label: 'Importar alumnos' },
  { to: '/vinculacion/importar/instituciones', label: 'Importar instituciones' },
];
const ENLACE_USUARIOS: Enlace = { to: '/vinculacion/usuarios/nuevo', label: 'Usuarios' };

const claseEnlace = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-lg px-3 py-2 text-sm font-medium',
    isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
  ].join(' ');

// Shell of every office screen (RN-03b): app name, menu, the office of the user and sign out.
// The Usuarios link is for the admin only; the route is also guarded.
export function VinculacionLayout() {
  const { data } = useMe();
  const [abierto, setAbierto] = useState(false);
  const enlaces = data?.usuario.rol === 'ADMIN' ? [...ENLACES, ENLACE_USUARIOS] : ENLACES;

  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className="text-lg font-bold">Praxis</span>
          <button
            type="button"
            aria-expanded={abierto}
            aria-controls="menu-vinculacion"
            onClick={() => setAbierto((v) => !v)}
            className="ml-auto min-h-10 rounded-lg border px-3 text-sm md:hidden"
          >
            Menú
          </button>
          <nav
            id="menu-vinculacion"
            aria-label="Principal"
            className={`${abierto ? 'flex' : 'hidden'} w-full flex-col gap-1 md:flex md:w-auto md:flex-1 md:flex-row`}
          >
            {enlaces.map((enlace) => (
              <NavLink key={enlace.to} to={enlace.to} end={enlace.end} className={claseEnlace}>
                {enlace.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 md:ml-auto">
            {data && (
              <p role="group" aria-label="Perfil" className="rounded-full bg-muted px-3 py-1 text-sm">
                {etiquetaPerfil(data.usuario)}
              </p>
            )}
            <SignOutButton />
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
