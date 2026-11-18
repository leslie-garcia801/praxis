import { Clock, FileWarning, FileX2, UserCheck, UserCog } from 'lucide-react';
import { useState, type ElementType } from 'react';
import type { Alertas } from '../api';

import { CLAVES_ALERTA as CLAVES, TITULO_ALERTA, type ClaveAlerta } from '../alertas';

const claseTarjeta =
  'relative flex min-h-24 flex-col items-start gap-1 rounded-xl border border-border border-t-4 bg-card p-3 pr-10 text-left shadow-sm transition-colors outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none disabled:opacity-60 disabled:hover:bg-card aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary';

// The status color is only an accent (top border); the number and label keep the text color.
const DETALLE: Record<ClaveAlerta, { icono: ElementType; acento: string }> = {
  alumnosPorConfirmar: { icono: UserCheck, acento: 'border-t-info-borde' },
  sinRegistros: { icono: Clock, acento: 'border-t-aviso-borde' },
  semanasSinValidar: { icono: FileWarning, acento: 'border-t-aviso-borde' },
  turnosIncompletos: { icono: FileX2, acento: 'border-t-destructive' },
};

function IconoTarjeta({ icono: Icono }: { icono: ElementType }) {
  return <Icono aria-hidden="true" className="absolute top-3 right-3 size-5 text-muted-foreground" />;
}

type Props = {
  alertas: Alertas;
  activa: ClaveAlerta | null;
  onSeleccionar: (clave: ClaveAlerta | null) => void;
};

export function AlertasPanel({ alertas, activa, onSeleccionar }: Props) {
  const [verSupervisores, setVerSupervisores] = useState(false);
  const { supervisoresSinConfirmar } = alertas;

  return (
    <section aria-label="Alertas" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {CLAVES.map((clave) => {
          const seleccionada = activa === clave;
          return (
            <button
              key={clave}
              type="button"
              aria-pressed={seleccionada}
              disabled={alertas[clave].total === 0 && !seleccionada}
              onClick={() => onSeleccionar(seleccionada ? null : clave)}
              className={`${claseTarjeta} ${DETALLE[clave].acento}`}
            >
              <span className="font-heading text-3xl font-extrabold tabular-nums">{alertas[clave].total}</span>
              <span className="text-sm">{TITULO_ALERTA[clave]}</span>
              <IconoTarjeta icono={DETALLE[clave].icono} />
            </button>
          );
        })}
        <button
          type="button"
          aria-expanded={verSupervisores}
          aria-controls="supervisores-sin-confirmar"
          onClick={() => setVerSupervisores((v) => !v)}
          className={`${claseTarjeta} border-t-info-borde`}
        >
          <span className="font-heading text-3xl font-extrabold tabular-nums">{supervisoresSinConfirmar.total}</span>
          <span className="text-sm">Supervisores por confirmar</span>
          <IconoTarjeta icono={UserCog} />
        </button>
      </div>
      {verSupervisores && (
        <div id="supervisores-sin-confirmar" className="rounded-xl border border-border bg-card p-3 shadow-sm">
          {supervisoresSinConfirmar.supervisores.length === 0 ? (
            <p className="text-sm">No hay supervisores por confirmar.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {supervisoresSinConfirmar.supervisores.map((s) => (
                <li key={s.id}>
                  <span className="font-medium">{s.nombre}</span> · {s.institucion.nombre}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
