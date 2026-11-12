import { useState } from 'react';
import type { Alertas } from '../api';

import { CLAVES_ALERTA as CLAVES, TITULO_ALERTA, type ClaveAlerta } from '../alertas';

const claseTarjeta =
  'flex min-h-20 flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left disabled:opacity-60 aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary';

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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CLAVES.map((clave) => {
          const seleccionada = activa === clave;
          return (
            <button
              key={clave}
              type="button"
              aria-pressed={seleccionada}
              disabled={alertas[clave].total === 0 && !seleccionada}
              onClick={() => onSeleccionar(seleccionada ? null : clave)}
              className={claseTarjeta}
            >
              <span className="text-2xl font-bold">{alertas[clave].total}</span>
              <span className="text-sm">{TITULO_ALERTA[clave]}</span>
            </button>
          );
        })}
        <button
          type="button"
          aria-expanded={verSupervisores}
          aria-controls="supervisores-sin-confirmar"
          onClick={() => setVerSupervisores((v) => !v)}
          className={claseTarjeta}
        >
          <span className="text-2xl font-bold">{supervisoresSinConfirmar.total}</span>
          <span className="text-sm">Supervisores por confirmar</span>
        </button>
      </div>
      {verSupervisores && (
        <div id="supervisores-sin-confirmar" className="rounded-lg border p-3">
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
