import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useQrScanner } from './useQrScanner';

type Callback = (result: { getText: () => string } | undefined, error: unknown, ctrl: { stop: () => void }) => void;

const zxing = vi.hoisted(() => ({
  decodeFromConstraints: vi.fn(),
}));

vi.mock('@zxing/browser', () => ({
  BrowserQRCodeReader: vi.fn(function () {
    return { decodeFromConstraints: zxing.decodeFromConstraints };
  }),
}));

function Scanner({ onResult }: { onResult: (texto: string) => void }) {
  const { videoRef, estado, motivo } = useQrScanner({ onResult });
  return (
    <>
      <video ref={videoRef} />
      <p data-testid="estado">{motivo ? `${estado}:${motivo}` : estado}</p>
    </>
  );
}

let callback: Callback | null;
let controls: { stop: Mock<() => void> };

beforeEach(() => {
  callback = null;
  controls = { stop: vi.fn() };
  zxing.decodeFromConstraints.mockReset();
  zxing.decodeFromConstraints.mockImplementation((_c: unknown, _v: unknown, cb: Callback) => {
    callback = cb;
    return Promise.resolve(controls);
  });
});

describe('useQrScanner', () => {
  // StrictMode mounts, unmounts and remounts in development. A second camera request on the same
  // <video> made zxing's stop() of the first one clear the active stream (black preview).
  it('opens the camera only once under StrictMode and keeps it running', async () => {
    render(
      <StrictMode>
        <Scanner onResult={vi.fn()} />
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('escaneando'));
    expect(zxing.decodeFromConstraints).toHaveBeenCalledTimes(1);
    expect(controls.stop).not.toHaveBeenCalled();
  });

  it('reports the first decoded text once and stops the camera', async () => {
    const onResult = vi.fn();
    render(<Scanner onResult={onResult} />);
    await waitFor(() => expect(callback).not.toBeNull());

    act(() => {
      callback?.({ getText: () => 'primero' }, undefined, controls);
      callback?.({ getText: () => 'segundo' }, undefined, controls);
    });

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith('primero');
    expect(controls.stop).toHaveBeenCalled();
  });

  it('stops the camera on unmount', async () => {
    const { unmount } = render(<Scanner onResult={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('escaneando'));

    unmount();

    expect(controls.stop).toHaveBeenCalledTimes(1);
  });

  it('does not open the camera if unmounted right away', async () => {
    const { unmount } = render(<Scanner onResult={vi.fn()} />);
    unmount();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(zxing.decodeFromConstraints).not.toHaveBeenCalled();
  });

  it('maps a denied permission to "permiso"', async () => {
    zxing.decodeFromConstraints.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    render(<Scanner onResult={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('error:permiso'));
  });
});
