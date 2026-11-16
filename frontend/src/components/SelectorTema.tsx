import { esPreferenciaTema, type PreferenciaTema } from '@/lib/tema';
import { useTema } from '@/lib/useTema';

const OPCIONES: { valor: PreferenciaTema; etiqueta: string }[] = [
  { valor: 'claro', etiqueta: 'Claro' },
  { valor: 'oscuro', etiqueta: 'Oscuro' },
  { valor: 'sistema', etiqueta: 'Sistema' },
];

// Compact native select (keeps the 360 px header from crowding); the accessible name is "Tema".
export function SelectorTema() {
  const { preferencia, setPreferencia } = useTema();
  return (
    <select
      aria-label="Tema"
      value={preferencia}
      onChange={(e) => {
        if (esPreferenciaTema(e.target.value)) setPreferencia(e.target.value);
      }}
      className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
    >
      {OPCIONES.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  );
}
