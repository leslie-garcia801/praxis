import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { messageOf } from '../../importaciones/archivo';
import { useDescargarQr } from '../api';

// RF-13 / RF-15: downloading the QR sheet rotates the token and the short code, so it asks first.
export function DescargarQrButton({ id, nombre }: { id: string; nombre: string }) {
  const [open, setOpen] = useState(false);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const descargar = useDescargarQr(id);

  function confirmar() {
    setError(null);
    descargar.mutate(undefined, {
      onSuccess: (filename) => {
        setArchivo(filename);
        setOpen(false);
      },
      onError: (e) => setError(messageOf(e)),
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-9"
        aria-label={`Descargar QR de ${nombre}`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Descargar QR
      </Button>
      {archivo && (
        <p role="status" className="text-xs text-slate-700">
          Se descargó {archivo}. El código corto nuevo ya aparece en pantalla.
        </p>
      )}
      <AlertDialog open={open} onOpenChange={(next) => !descargar.isPending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Generar un QR nuevo para {nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se generan un QR y un código corto nuevos. El que ya imprimiste deja de funcionar, así que tendrás que
              reemplazarlo por el que descargues ahora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={descargar.isPending}>Cancelar</AlertDialogCancel>
            <Button type="button" disabled={descargar.isPending} onClick={confirmar}>
              {descargar.isPending ? 'Generando…' : 'Generar y descargar'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
