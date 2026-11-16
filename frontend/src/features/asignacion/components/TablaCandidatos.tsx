import { NOMBRE_PROGRAMA } from '@/lib/oficinas';
import { formatFechaLarga } from '@/lib/tiempo';
import type { Candidato } from '../api';

// On a phone each row is a card (data-label shows the column name); from md up it is a table.
const celda = 'block py-1 before:mr-2 before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:py-2 md:pr-3 md:before:content-none';

type Props = {
  candidatos: Candidato[];
  seleccionados: ReadonlySet<string>;
  onAlternar: (alumnoId: string) => void;
};

// RF-01, RN-03a: one row per student who finished the first program, with the program that comes next.
export function TablaCandidatos({ candidatos, seleccionados, onAlternar }: Props) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="hidden md:table-header-group">
        <tr className="border-b border-border">
          <th scope="col" className="w-10 py-2 pr-3">
            <span className="sr-only">Seleccionar</span>
          </th>
          <th scope="col" className="py-2 pr-3">Nombre</th>
          <th scope="col" className="py-2 pr-3">Matrícula</th>
          <th scope="col" className="py-2 pr-3">Carrera</th>
          <th scope="col" className="py-2 pr-3">Semestre y grupo</th>
          <th scope="col" className="py-2 pr-3">Terminó</th>
          <th scope="col" className="py-2">Programa a asignar</th>
        </tr>
      </thead>
      <tbody className="flex flex-col gap-3 md:table-row-group">
        {candidatos.map((c) => (
          <tr key={c.alumnoId} className="block rounded-lg border border-border p-3 align-top md:table-row md:rounded-none md:border-0 md:border-b md:p-0">
            <td className="block md:table-cell md:py-2 md:pr-3">
              <input
                type="checkbox"
                className="size-5"
                aria-label={`Seleccionar a ${c.nombre}`}
                checked={seleccionados.has(c.alumnoId)}
                onChange={() => onAlternar(c.alumnoId)}
              />
            </td>
            <td className={`${celda} font-medium`}>{c.nombre}</td>
            <td className={celda} data-label="Matrícula:">{c.matricula ?? 'Sin matrícula'}</td>
            <td className={celda} data-label="Carrera:">{c.carrera}</td>
            <td className={celda} data-label="Semestre y grupo:">{`${c.semestre}.º · ${c.grupo}`}</td>
            <td className={celda} data-label="Terminó:">
              {`${NOMBRE_PROGRAMA[c.programaTerminado]} · ${c.terminadoEn ? formatFechaLarga(c.terminadoEn) : '—'}`}
            </td>
            <td className={`${celda} font-medium`} data-label="Asignar:">{NOMBRE_PROGRAMA[c.tipoAsignable]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
