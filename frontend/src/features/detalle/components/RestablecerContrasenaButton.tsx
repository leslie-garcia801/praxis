import { useState } from 'react';
import { PasswordTemporal } from '@/components/PasswordTemporal';
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
import { useRestablecerContrasena } from '../api';

// RF-04: asks first, because the current password and every open session stop working.
export function RestablecerContrasenaButton({ alumnoId, nombre }: { alumnoId: string; nombre: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const restablecer = useRestablecerContrasena(alumnoId);

  function confirmar() {
    setError(null);
    restablecer.mutate(undefined, {
      onSuccess: ({ passwordTemporal }) => {
        setPassword(passwordTemporal);
        setOpen(false);
      },
      onError: (e) => setError(messageOf(e)),
    });
  }

  if (password) {
    return (
      <div className="flex flex-col items-start gap-3">
        <PasswordTemporal password={password} />
        <Button type="button" onClick={() => setPassword(null)}>
          Listo
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Restablecer contraseña
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !restablecer.isPending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restablecer la contraseña de {nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se genera una contraseña temporal. La actual dejará de funcionar y se cerrarán sus sesiones abiertas. Al
              entrar, el alumno tendrá que elegir una nueva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restablecer.isPending}>Cancelar</AlertDialogCancel>
            <Button type="button" disabled={restablecer.isPending} onClick={confirmar}>
              {restablecer.isPending ? 'Restableciendo…' : 'Restablecer'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
