import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { useEffect, useRef, useState, type RefObject } from 'react';

export type MotivoErrorCamara = 'permiso' | 'sin-camara' | 'otro';

export type QrScannerState = {
  videoRef: RefObject<HTMLVideoElement | null>;
  estado: 'iniciando' | 'escaneando' | 'error';
  motivo?: MotivoErrorCamara;
};

export type QrScannerOptions = {
  // Called once with the first decoded text; the camera is stopped right after.
  onResult: (texto: string) => void;
};

function motivoDe(error: unknown): MotivoErrorCamara {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permiso';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') return 'sin-camara';
  return 'otro';
}

// Opens the rear camera into the <video> and reads QR codes with @zxing/browser (RF-14).
// The stream stops on the first result and when the component unmounts.
export function useQrScanner({ onResult }: QrScannerOptions): QrScannerState {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<Omit<QrScannerState, 'videoRef'>>({ estado: 'iniciando' });
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelado = false;
    let controls: IScannerControls | null = null;
    let leido = false;

    const reader = new BrowserQRCodeReader();
    reader
      .decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (result, _error, ctrl) => {
        if (!result || leido || cancelado) return;
        leido = true;
        ctrl.stop();
        onResultRef.current(result.getText());
      })
      .then((ctrl) => {
        if (cancelado || leido) {
          ctrl.stop();
          return;
        }
        controls = ctrl;
        setState({ estado: 'escaneando' });
      })
      .catch((error: unknown) => {
        if (!cancelado) setState({ estado: 'error', motivo: motivoDe(error) });
      });

    return () => {
      cancelado = true;
      controls?.stop();
    };
  }, []);

  return { videoRef, ...state };
}
