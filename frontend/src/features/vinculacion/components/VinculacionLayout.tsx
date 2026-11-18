import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { Marca } from '@/components/Marca';
import { SelectorTema } from '@/components/SelectorTema';
import { useMe } from '@/features/auth/api';
import { SignOutButton } from '@/features/auth/components/SignOutButton';
import { etiquetaPerfil } from '@/lib/oficinas';

type Enlace = { to: string; label: string; end?: boolean };

const ENLACES: Enlace[] = [
  { to: '/vinculacion', label: 'Panel', end: true },
  { to: '/vinculacion/correcciones', label: 'Correcciones' },
  { to: '/vinculacion/asignar', label: 'Asignar programa' },
  { to: '/vinculacion/instituciones', label: 'Instituciones' },
  { to: '/vinculacion/importar/alumnos', label: 'Importar alumnos' },
  { to: '/vinculacion/importar/instituciones', label: 'Importar instituciones' },
];
const ENLACES_ADMIN: Enlace[] = [
  { to: '/vinculacion/usuarios', label: 'Usuarios' },
  { to: '/vinculacion/oficinas/firmas', label: 'Firmas de las oficinas' },
];

const claseEnlace = ({ isActive }: { isActive: boolean }) =>
  [
    'flex min-h-11 items-center rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/70',
    isActive
      ? 'bg-white/15 text-encabezado-foreground shadow-[inset_0_-3px_0_0_currentColor]'
      : 'text-encabezado-foreground/90 hover:bg-white/10 hover:text-encabezado-foreground',
  ].join(' ');

// Shell of every office screen (RN-03b): app name, menu, the office of the user and sign out.
// The Usuarios and Firmas links are for the admin only; the route is also guarded.
export function VinculacionLayout() {
  const { data } = useMe();
  const [abierto, setAbierto] = useState(false);
  const enlaces = data?.usuario.rol === 'ADMIN' ? [...ENLACES, ...ENLACES_ADMIN] : ENLACES;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-encabezado-borde bg-encabezado text-encabezado-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Marca />
          <button
            type="button"
            aria-expanded={abierto}
            aria-controls="menu-vinculacion"
            onClick={() => setAbierto((v) => !v)}
            className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/40 px-3 text-sm font-medium text-encabezado-foreground outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 md:hidden"
          >
            {abierto ? <X aria-hidden="true" className="size-4" /> : <Menu aria-hidden="true" className="size-4" />}
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
          <div className="flex items-center gap-2 md:ml-auto">
            {data && (
              <p role="group" aria-label="Perfil" className="rounded-full bg-white/15 px-3 py-1 text-sm font-medium text-encabezado-foreground">
                {etiquetaPerfil(data.usuario)}
              </p>
            )}
            <SelectorTema />
            <SignOutButton enBarra />
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
