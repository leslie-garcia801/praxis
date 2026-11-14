import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PasswordField } from './components/PasswordField';

function setup() {
  const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
  const user = userEvent.setup();
  render(
    <form onSubmit={onSubmit}>
      <PasswordField id="password" label="Contraseña" hint="Mínimo 8 caracteres." autoComplete="current-password" />
    </form>,
  );
  return { user, onSubmit };
}

describe('PasswordField', () => {
  it('starts hidden and keeps the field props', () => {
    setup();
    const input = screen.getByLabelText('Contraseña');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'current-password');
    expect(input).toHaveAccessibleDescription('Mínimo 8 caracteres.');
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles between showing and hiding the password', async () => {
    const { user } = setup();
    const input = screen.getByLabelText('Contraseña');
    await user.type(input, 'Secreta123');

    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('Secreta123');
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('does not submit the form when toggling', async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
