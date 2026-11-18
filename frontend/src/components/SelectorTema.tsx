import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { esPreferenciaTema, type PreferenciaTema } from '@/lib/tema';
import { useTema } from '@/lib/useTema';

const OPCIONES: { valor: PreferenciaTema; etiqueta: string; Icono: LucideIcon }[] = [
  { valor: 'claro', etiqueta: 'Claro', Icono: Sun },
  { valor: 'oscuro', etiqueta: 'Oscuro', Icono: Moon },
  { valor: 'sistema', etiqueta: 'Sistema', Icono: Monitor },
];

// Icon-only 44 px control: the icon of the current choice is drawn underneath and a transparent native select sits on
// top, so tapping opens the native picker with the text options. The accessible name is "Tema".
export function SelectorTema() {
  const { preferencia, setPreferencia } = useTema();
  const { Icono, etiqueta } = OPCIONES.find((o) => o.valor === preferencia) ?? OPCIONES[2]!;
  return (
    <div
      title={`Tema: ${etiqueta}`}
      className="relative flex size-11 items-center justify-center rounded-lg border border-white/40 bg-white/10 text-encabezado-foreground hover:bg-white/15 has-focus-visible:ring-2 has-focus-visible:ring-white/70"
    >
      <Icono aria-hidden="true" data-icono-tema={preferencia} className="pointer-events-none size-5" />
      <select
        aria-label="Tema"
        value={preferencia}
        onChange={(e) => {
          if (esPreferenciaTema(e.target.value)) setPreferencia(e.target.value);
        }}
        className="absolute inset-0 size-full cursor-pointer appearance-none rounded-lg opacity-0 outline-none"
      >
        {OPCIONES.map((o) => (
          <option key={o.valor} value={o.valor} className="bg-popover text-popover-foreground">
            {o.etiqueta}
          </option>
        ))}
      </select>
    </div>
  );
}
