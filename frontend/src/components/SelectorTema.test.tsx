import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAVE_TEMA, iniciarTema, reiniciarTema } from '@/lib/tema';
import { limpiarDocumentoTema, mockSistemaOscuro } from '../../test/tema';
import { SelectorTema } from './SelectorTema';

let detener: (() => void) | undefined;
beforeEach(() => {
  reiniciarTema();
  limpiarDocumentoTema();
  mockSistemaOscuro(false);
  detener = iniciarTema();
});
afterEach(() => {
  detener?.();
  vi.unstubAllGlobals();
  limpiarDocumentoTema();
});

describe('SelectorTema (RNF-09)', () => {
  it('RNF-09: tiene nombre accesible "Tema" y las tres opciones, con Sistema por defecto', () => {
    render(<SelectorTema />);
    const selector = screen.getByRole('combobox', { name: 'Tema' });
    expect(selector).toHaveValue('sistema');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Claro', 'Oscuro', 'Sistema']);
  });

  it('RNF-09: elegir Oscuro aplica el tema y lo recuerda', async () => {
    const user = userEvent.setup({ delay: null });
    render(<SelectorTema />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tema' }), 'Oscuro');
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('oscuro');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tema' }), 'Claro');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('RNF-09: muestra un sol con Claro, una luna con Oscuro y un monitor con Sistema', async () => {
    const user = userEvent.setup({ delay: null });
    const { container } = render(<SelectorTema />);
    const icono = () => container.querySelector('svg[data-icono-tema]')?.getAttribute('data-icono-tema');
    expect(icono()).toBe('sistema');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tema' }), 'Claro');
    expect(icono()).toBe('claro');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tema' }), 'Oscuro');
    expect(icono()).toBe('oscuro');
  });
});
