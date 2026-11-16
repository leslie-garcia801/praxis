import { describe, expect, it } from 'vitest';
import css from '../index.css?raw';

// WCAG 2.1 SC 1.4.11 (RNF-09): the border that identifies a form field needs 3:1 against the
// surfaces it sits on. The tokens are neutral oklch grays, where relative luminance = L³.

function bloque(selector: ':root' | '.dark'): string {
  const inicio = css.indexOf(`${selector} {`);
  return css.slice(inicio, css.indexOf('}', inicio));
}

function luminancia(selector: ':root' | '.dark', token: string): number {
  const valor = new RegExp(`--${token}:\\s*oklch\\(([\\d.]+) 0 0\\)`).exec(bloque(selector));
  if (!valor) throw new Error(`--${token} in ${selector} is not an opaque neutral oklch color`);
  return Number(valor[1]) ** 3;
}

function contraste(a: number, b: number): number {
  const [claro, oscuro] = a > b ? [a, b] : [b, a];
  return (claro + 0.05) / (oscuro + 0.05);
}

describe.each([':root', '.dark'] as const)('borde de los campos en %s', (selector) => {
  it.each(['background', 'card', 'muted'])('RNF-09: --input tiene contraste 3:1 sobre --%s', (fondo) => {
    expect(contraste(luminancia(selector, 'input'), luminancia(selector, fondo))).toBeGreaterThanOrEqual(3);
  });
});
