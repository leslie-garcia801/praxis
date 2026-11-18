import { Link } from 'react-router';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { buttonVariants } from '@/components/ui/button';
import { useMe } from '@/features/auth/api';
import { messageOf } from '@/features/importaciones/archivo';
import { AMBAS_OFICINAS, NOMBRE_OFICINA } from '@/lib/oficinas';
import { useUsuarios, type UsuarioOficina } from '../api';
import { AccionesUsuario } from './AccionesUsuario';

const NOMBRE_ROL: Record<UsuarioOficina['rol'], string> = { VINCULACION: 'Vinculación', ADMIN: 'Administrador' };

function etiquetaOficina({ rol, oficina }: UsuarioOficina): string {
  if (rol === 'ADMIN') return '—';
  return oficina ? NOMBRE_OFICINA[oficina] : AMBAS_OFICINAS;
}

function Insignia({ children, tono = 'neutro' }: { children: string; tono?: 'neutro' | 'alerta' }) {
  const color = tono === 'alerta' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{children}</span>;
}

// On a phone each row is a card (data-label shows the column name); from md up it is a table.
const celda = 'block py-1 before:mr-2 before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:py-2 md:pr-3 md:before:content-none';

function Tabla({ usuarios, yoId }: { usuarios: UsuarioOficina[]; yoId: string | undefined }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="hidden md:table-header-group">
        <tr className="border-b border-border">
          <th scope="col" className="py-2 pr-3">Nombre</th>
          <th scope="col" className="py-2 pr-3">Correo</th>
          <th scope="col" className="py-2 pr-3">Rol</th>
          <th scope="col" className="py-2 pr-3">Oficina</th>
          <th scope="col" className="py-2 pr-3">Estado</th>
          <th scope="col" className="py-2">Acciones</th>
        </tr>
      </thead>
      <tbody className="flex flex-col gap-3 md:table-row-group">
        {usuarios.map((u) => {
          const esYo = u.id === yoId;
          return (
            <tr key={u.id} className="block rounded-lg border border-border p-3 align-top md:table-row md:rounded-none md:border-0 md:border-b md:p-0">
              <td className={`${celda} font-medium`}>
                {u.nombre}
                {esYo && <span className="ml-1 font-normal text-muted-foreground">(tú)</span>}
              </td>
              <td className={`${celda} break-all`} data-label="Correo:">{u.email}</td>
              <td className={celda} data-label="Rol:">{NOMBRE_ROL[u.rol]}</td>
              <td className={celda} data-label="Oficina:">{etiquetaOficina(u)}</td>
              <td className={celda}>
                <span className="flex flex-wrap gap-1">
                  <Insignia tono={u.activo ? 'neutro' : 'alerta'}>{u.activo ? 'Activo' : 'Desactivado'}</Insignia>
                  {u.debeCambiar && <Insignia>Debe cambiar contraseña</Insignia>}
                </span>
              </td>
              <td className="block pt-2 md:table-cell md:py-2">
                <AccionesUsuario usuario={u} esYo={esYo} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// §4 "Gestionar usuarios de vinculación" (ADMIN only), RF-04, RF-29, RN-03b.
export function UsuariosPage() {
  const { data: me } = useMe();
  const lista = useUsuarios();

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.75rem] font-extrabold">Usuarios</h1>
        <Link to="/vinculacion/usuarios/nuevo" className={buttonVariants({ className: 'h-11 px-4' })}>
          Nuevo usuario
        </Link>
      </header>

      {lista.isPending && (
        <p role="status" className="text-muted-foreground">
          Cargando usuarios…
        </p>
      )}
      {lista.isError && <ErrorConReintento message={messageOf(lista.error)} onRetry={() => void lista.refetch()} />}
      {lista.data && lista.data.length === 0 && <p>Todavía no hay usuarios.</p>}
      {lista.data && lista.data.length > 0 && <Tabla usuarios={lista.data} yoId={me?.usuario.id} />}
    </main>
  );
}
