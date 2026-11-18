import { describe, expect, it } from 'vitest';
import css from '../index.css?raw';

// WCAG 2.1 (RNF-09): text needs 4.5:1 (SC 1.4.3) and the border that identifies a form field or a
// status needs 3:1 (SC 1.4.11) against the surfaces it sits on. Tokens are opaque oklch colors.

type Selector = ':root' | '.dark';

function bloque(selector: Selector): string {
  const inicio = css.indexOf(`\n${selector} {`);
  return css.slice(inicio, css.indexOf('\n}', inicio));
}

// oklch -> linear sRGB -> relative luminance (Oklab reference matrices).
function luminancia(selector: Selector, token: string): number {
  const valor = new RegExp(`--${token}:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`).exec(bloque(selector));
  if (!valor) throw new Error(`--${token} in ${selector} is not an opaque oklch color`);
  const [L, C, h] = [Number(valor[1]), Number(valor[2]), (Number(valor[3]) * Math.PI) / 180];
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const canal = (x: number) => Math.min(1, Math.max(0, x));
  const r = canal(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = canal(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = canal(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

function tono(selector: Selector, token: string): number {
  const valor = new RegExp(`--${token}:\\s*oklch\\([\\d.]+ [\\d.]+ ([\\d.]+)\\)`).exec(bloque(selector));
  return Number(valor?.[1] ?? 0);
}

function contraste(selector: Selector, a: string, b: string): number {
  const [x, y] = [luminancia(selector, a), luminancia(selector, b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const TEMAS = [':root', '.dark'] as const;
const FONDOS = ['background', 'card', 'muted'];

describe.each(TEMAS)('borde de los campos en %s', (selector) => {
  it.each(FONDOS)('RNF-09: --input tiene contraste 3:1 sobre --%s', (fondo) => {
    expect(contraste(selector, 'input', fondo)).toBeGreaterThanOrEqual(3);
  });
});

describe.each(TEMAS)('texto en %s', (selector) => {
  const pares: [string, string][] = [
    ['foreground', 'background'],
    ['card-foreground', 'card'],
    ['popover-foreground', 'popover'],
    ['primary-foreground', 'primary'],
    ['secondary-foreground', 'secondary'],
    ['accent-foreground', 'accent'],
    ['muted-foreground', 'background'],
    ['muted-foreground', 'card'],
    ['muted-foreground', 'muted'],
    ['destructive', 'background'],
    ['destructive', 'card'],
    ['destructive-foreground', 'destructive'],
    ['sidebar-foreground', 'sidebar'],
    ['sidebar-primary-foreground', 'sidebar-primary'],
    ['sidebar-accent-foreground', 'sidebar-accent'],
    ['encabezado-foreground', 'encabezado'],
    ['encabezado-muted', 'encabezado'],
  ];
  it.each(pares)('RNF-09: --%s tiene contraste 4.5:1 sobre --%s', (texto, fondo) => {
    expect(contraste(selector, texto, fondo)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['exito', 'aviso', 'info'])('RNF-09: --%s-foreground tiene 4.5:1 sobre --%s, --background y --card', (estado) => {
    for (const fondo of [estado, 'background', 'card']) {
      expect(contraste(selector, `${estado}-foreground`, fondo)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['exito', 'aviso', 'info'])('RNF-09: --%s-borde tiene 3:1 sobre --background y --card', (estado) => {
    for (const fondo of ['background', 'card']) {
      expect(contraste(selector, `${estado}-borde`, fondo)).toBeGreaterThanOrEqual(3);
    }
  });

  it('RNF-09: --ring es visible (3:1) sobre --background y --card', () => {
    expect(contraste(selector, 'ring', 'background')).toBeGreaterThanOrEqual(3);
    expect(contraste(selector, 'ring', 'card')).toBeGreaterThanOrEqual(3);
  });
});

describe.each(TEMAS)('paleta azul en %s', (selector) => {
  it.each(['background', 'primary', 'accent', 'ring', 'border', 'encabezado-muted', 'encabezado-borde', 'chart-1', 'chart-3', 'chart-5'])(
    'el tono de --%s se queda en el rango azul (230-265), nunca violeta',
    (token) => {
      expect(tono(selector, token)).toBeGreaterThanOrEqual(230);
      expect(tono(selector, token)).toBeLessThanOrEqual(265);
    },
  );
});
