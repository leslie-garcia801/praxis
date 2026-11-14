import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvisoTemporal } from './AvisoTemporal';

describe('AvisoTemporal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is announced as a status and disappears after its duration', () => {
    render(<AvisoTemporal duracionMs={3000}>Expediente guardado</AvisoTemporal>);
    expect(screen.getByRole('status')).toHaveTextContent('Expediente guardado');

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
