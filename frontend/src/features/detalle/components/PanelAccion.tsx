import { useState, type FormEvent, type ReactNode } from 'react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { messageOf } from '../../importaciones/archivo';
import { motivoSchema, primerError } from '../schemas';

type Props = {
  titulo: string;
  enviar: string;
  destructiva?: boolean;
  // When present, a destructive action asks for confirmation before it is sent.
  confirmacion?: { titulo: string; descripcion: string };
  // Extra validation of the fields in `children`; returns an error message or null.
  validarExtra?: () => string | null;
  onEnviar: (motivo: string) => Promise<unknown>;
  onCerrar: () => void;
  children?: ReactNode;
};

// Inline disclosure with a form whose reason (motivo) is mandatory (RF-12). No generic dialog exists in the project.
export function PanelAccion({ titulo, enviar, destructiva, confirmacion, validarExtra, onEnviar, onCerrar, children }: Props) {
  const [motivo, setMotivo] = useState('');
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const [errorExtra, setErrorExtra] = useState<string | null>(null);
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, setPendiente] = useState(false);

  async function ejecutar() {
    setPendiente(true);
    setErrorApi(null);
    try {
      await onEnviar(motivo.trim());
      setConfirmando(false);
      onCerrar();
    } catch (e) {
      setConfirmando(false);
      setErrorApi(messageOf(e));
    } finally {
      setPendiente(false);
    }
  }

  function alEnviar(e: FormEvent) {
    e.preventDefault();
    const m = primerError(motivoSchema, motivo);
    const x = validarExtra?.() ?? null;
    setErrorMotivo(m);
    setErrorExtra(x);
    if (m || x) return;
    if (confirmacion) setConfirmando(true);
    else void ejecutar();
  }

  const id = `motivo-${titulo.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <form aria-label={titulo} onSubmit={alEnviar} noValidate className="flex max-w-xl flex-col gap-3 rounded-lg border p-3">
      <h3 className="text-base font-semibold">{titulo}</h3>
      {children}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>Motivo</Label>
        <Textarea
          id={id}
          className="min-h-20"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          aria-invalid={errorMotivo ? true : undefined}
          aria-describedby={errorMotivo ? `${id}-error` : undefined}
        />
        {errorMotivo && (
          <p id={`${id}-error`} className="text-sm text-destructive">
            {errorMotivo}
          </p>
        )}
      </div>
      {errorExtra && <p className="text-sm text-destructive">{errorExtra}</p>}
      {errorApi && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorApi}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={destructiva ? 'destructive' : 'default'} disabled={pendiente}>
          {pendiente ? 'Enviando…' : enviar}
        </Button>
        <Button type="button" variant="outline" disabled={pendiente} onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
      {confirmacion && (
        <AlertDialog open={confirmando} onOpenChange={(abierto) => !pendiente && setConfirmando(abierto)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmacion.titulo}</AlertDialogTitle>
              <AlertDialogDescription>{confirmacion.descripcion}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pendiente}>Volver</AlertDialogCancel>
              <Button type="button" variant="destructive" disabled={pendiente} onClick={() => void ejecutar()}>
                {pendiente ? 'Enviando…' : 'Sí, continuar'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </form>
  );
}
