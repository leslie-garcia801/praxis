import { useState } from 'react';
import { Link } from 'react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { messageOf } from '../../importaciones/archivo';
import { useCarreras, useInstituciones, type Filtros, type Institucion, type TipoPrograma, type Turno } from '../api';
import { DescargarQrButton } from './DescargarQrButton';

const selectClass =
  'h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

type Borrador = { q: string; municipio: string; carrera: string; turno: string; tipo: string; conCupo: boolean };
const BORRADOR_VACIO: Borrador = { q: '', municipio: '', carrera: '', turno: '', tipo: '', conCupo: false };

function aFiltros(b: Borrador): Filtros {
  return {
    q: b.q.trim() || undefined,
    municipio: b.municipio.trim() || undefined,
    carrera: b.carrera || undefined,
    turno: (b.turno || undefined) as Turno | undefined,
    tipo: (b.tipo || undefined) as TipoPrograma | undefined,
    conCupo: b.conCupo ? true : undefined,
  };
}

// RF-05 / RF-06: catalog for vinculación. Filtering happens on the server.
export function InstitucionesPage() {
  const [borrador, setBorrador] = useState<Borrador>(BORRADOR_VACIO);
  const [filtros, setFiltros] = useState<Filtros>({});
  const carreras = useCarreras();
  const lista = useInstituciones(filtros);

  function set<K extends keyof Borrador>(key: K, value: Borrador[K]) {
    setBorrador((b) => ({ ...b, [key]: value }));
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <Link to="/vinculacion" className="text-sm text-primary underline-offset-4 hover:underline">
          Volver al panel
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Instituciones</h1>
          <div className="flex flex-wrap gap-2">
            <Link to="/vinculacion/importar/instituciones" className={buttonVariants({ variant: 'outline', className: 'h-11 px-4' })}>
              Importar instituciones
            </Link>
            <Link to="/vinculacion/instituciones/nueva" className={buttonVariants({ className: 'h-11 px-4' })}>
              Nueva institución
            </Link>
          </div>
        </div>
      </header>

      <form
        aria-label="Filtros"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          setFiltros(aFiltros(borrador));
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-q">Buscar</Label>
          <Input id="f-q" value={borrador.q} placeholder="Nombre, RFC o giro" onChange={(e) => set('q', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-municipio">Municipio</Label>
          <Input id="f-municipio" value={borrador.municipio} onChange={(e) => set('municipio', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-carrera">Carrera</Label>
          <select id="f-carrera" className={selectClass} value={borrador.carrera} onChange={(e) => set('carrera', e.target.value)}>
            <option value="">Todas</option>
            {carreras.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-turno">Turno</Label>
          <select id="f-turno" className={selectClass} value={borrador.turno} onChange={(e) => set('turno', e.target.value)}>
            <option value="">Todos</option>
            <option value="MATUTINO">Matutino</option>
            <option value="VESPERTINO">Vespertino</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-tipo">Tipo</Label>
          <select id="f-tipo" className={selectClass} value={borrador.tipo} onChange={(e) => set('tipo', e.target.value)}>
            <option value="">Todos</option>
            <option value="SERVICIO_SOCIAL">Servicio social</option>
            <option value="PRACTICAS">Prácticas</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={borrador.conCupo} onChange={(e) => set('conCupo', e.target.checked)} />
            Solo con cupo
          </label>
          <p className="text-xs text-slate-700">«Con cupo» no incluye las instituciones sin dato de cupo.</p>
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="submit" size="lg" className="h-11 px-6">
            Aplicar filtros
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11 px-6"
            onClick={() => {
              setBorrador(BORRADOR_VACIO);
              setFiltros({});
            }}
          >
            Limpiar
          </Button>
        </div>
      </form>

      {lista.isPending && (
        <p role="status" className="text-slate-700">
          Cargando instituciones…
        </p>
      )}
      {lista.isError && (
        <div className="flex flex-col items-start gap-2">
          <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {messageOf(lista.error)}
          </div>
          <Button variant="outline" onClick={() => void lista.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {lista.data && lista.data.length === 0 && <p>No se encontraron instituciones.</p>}
      {lista.data && lista.data.length > 0 && <Tabla instituciones={lista.data} />}
    </main>
  );
}

function Tabla({ instituciones }: { instituciones: Institucion[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-3">Nombre</th>
            <th scope="col" className="py-2 pr-3">Municipio</th>
            <th scope="col" className="py-2 pr-3">Cupo</th>
            <th scope="col" className="py-2 pr-3">Estado</th>
            <th scope="col" className="py-2 pr-3">Código corto</th>
            <th scope="col" className="py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {instituciones.map((i) => (
            <tr key={i.id} className="border-b border-border align-top">
              <td className="py-2 pr-3 font-medium">{i.nombre}</td>
              <td className="py-2 pr-3">{i.municipio}</td>
              <td className="py-2 pr-3">{i.cupo ?? 'Sin dato'}</td>
              <td className="py-2 pr-3">{i.activa ? 'Activa' : 'Inactiva'}</td>
              <td className="py-2 pr-3">
                <code className="font-mono">{i.codigoCorto}</code>
              </td>
              <td className="py-2">
                <div className="flex flex-wrap items-start gap-2">
                  <Link
                    to={`/vinculacion/instituciones/${i.id}/editar`}
                    aria-label={`Editar ${i.nombre}`}
                    className={buttonVariants({ variant: 'outline', size: 'sm', className: 'min-h-9' })}
                  >
                    Editar
                  </Link>
                  <DescargarQrButton id={i.id} nombre={i.nombre} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
