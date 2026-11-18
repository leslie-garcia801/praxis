import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { esPreferenciaTema, type PreferenciaTema } from '@/lib/tema';
import { useTema } from '@/lib/useTema';

const OPCIONES: { valor: PreferenciaTema; etiqueta: string; Icono: LucideIcon }[] = [
  { valor: 'claro', etiqueta: 'Claro', Icono: Sun },
  { valor: 'oscuro', etiqueta: 'Oscuro', Icono: Moon },
  { valor: 'sistema', etiqueta: 'Sistema', Icono: Monitor },
];

// Compact native select (keeps the 360 px header from crowding); the accessible name is "Tema".
// Native options cannot hold icons, so the icon of the current choice sits inside the select, on the left.
export function SelectorTema() {
  const { preferencia, setPreferencia } = useTema();
  const { Icono } = OPCIONES.find((o) => o.valor === preferencia) ?? OPCIONES[2]!;
  return (
    <div className="relative">
      <Icono
        aria-hidden="true"
        data-icono-tema={preferencia}
        className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-encabezado-foreground"
      />
      <select
        aria-label="Tema"
        value={preferencia}
        onChange={(e) => {
          if (esPreferenciaTema(e.target.value)) setPreferencia(e.target.value);
        }}
        className="h-11 rounded-lg border border-white/40 bg-white/10 pr-2 pl-7 text-sm text-encabezado-foreground outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70"
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
