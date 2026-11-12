import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCarreras, useInstituciones } from '../../instituciones/api';
import type { ClaveFiltro, FiltrosPanel as Filtros } from '../api';

const selectClass =
  'h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

// RN-01: only 5th semester or higher has a case file; the import accepts up to 12.
const SEMESTRES = [5, 6, 7, 8, 9, 10, 11, 12];

type Props = {
  filtros: Filtros;
  mostrarTipo: boolean;
  onCambiar: (clave: ClaveFiltro, valor: string) => void;
  onLimpiar: () => void;
};

// RF-23: the filters live in the URL (the parent owns them); an empty value means "no filter".
export function FiltrosPanel({ filtros, mostrarTipo, onCambiar, onLimpiar }: Props) {
  const carreras = useCarreras();
  const instituciones = useInstituciones({});
  // The group is free text: it is applied on Enter or blur, not on every keystroke.
  const [borradorGrupo, setBorradorGrupo] = useState<string | null>(null);

  function aplicarGrupo() {
    if (borradorGrupo === null) return;
    setBorradorGrupo(null);
    const valor = borradorGrupo.trim();
    if (valor !== (filtros.grupo ?? '')) onCambiar('grupo', valor);
  }

  const campo = (clave: ClaveFiltro) => ({
    value: filtros[clave] ?? '',
    onChange: (e: { target: { value: string } }) => onCambiar(clave, e.target.value),
  });

  return (
    <form aria-label="Filtros" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="p-estado">Estado</Label>
        <select id="p-estado" className={selectClass} {...campo('estado')}>
          <option value="">En proceso y suspendidos</option>
          <option value="PENDIENTE">Pendientes</option>
          <option value="EN_PROCESO">En proceso</option>
          <option value="SUSPENDIDO">Suspendidos</option>
          <option value="FINALIZADO">Finalizados</option>
          <option value="CANCELADO">Cancelados</option>
          <option value="TODOS">Todos</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="p-carrera">Carrera</Label>
        <select id="p-carrera" className={selectClass} {...campo('carreraId')}>
          <option value="">Todas</option>
          {carreras.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="p-semestre">Semestre</Label>
        <select id="p-semestre" className={selectClass} {...campo('semestre')}>
          <option value="">Todos</option>
          {SEMESTRES.map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="p-grupo">Grupo</Label>
        <Input
          id="p-grupo"
          value={borradorGrupo ?? filtros.grupo ?? ''}
          onChange={(e) => setBorradorGrupo(e.target.value)}
          onBlur={aplicarGrupo}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              aplicarGrupo();
            }
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="p-turno">Turno</Label>
        <select id="p-turno" className={selectClass} {...campo('turno')}>
          <option value="">Todos</option>
          <option value="MATUTINO">Matutino</option>
          <option value="VESPERTINO">Vespertino</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="p-institucion">Institución</Label>
        <select id="p-institucion" className={selectClass} {...campo('institucionId')}>
          <option value="">Todas</option>
          {instituciones.data?.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nombre}
            </option>
          ))}
        </select>
      </div>
      {mostrarTipo && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-tipo">Tipo</Label>
          <select id="p-tipo" className={selectClass} {...campo('tipo')}>
            <option value="">Todos</option>
            <option value="SERVICIO_SOCIAL">Servicio social</option>
            <option value="PRACTICAS">Prácticas</option>
          </select>
        </div>
      )}
      <label className="flex min-h-10 items-center gap-2 self-end text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={filtros.riesgo === 'EN_RIESGO'}
          onChange={(e) => onCambiar('riesgo', e.target.checked ? 'EN_RIESGO' : '')}
        />
        Solo en riesgo
      </label>
      <div className="flex items-end sm:col-span-2 lg:col-span-4">
        <Button type="button" variant="outline" size="lg" className="h-11 px-6" onClick={onLimpiar}>
          Limpiar filtros
        </Button>
      </div>
    </form>
  );
}
