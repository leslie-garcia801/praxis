import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { comentarioRechazoSchema, primerError } from '../../detalle/schemas';
import { messageOf } from '../../importaciones/archivo';
import { useResolverCorreccion } from '../api';

// RF-17: the office approves a pending request, or rejects it with the comment the student will read.
export function ResolverCorreccion({ correccionId }: { correccionId: string }) {
  const resolver = useResolverCorreccion(correccionId);
  const [rechazando, setRechazando] = useState(false);
  const [comentario, setComentario] = useState('');
  const [errorComentario, setErrorComentario] = useState<string | null>(null);
  const comentarioId = `comentario-correccion-${correccionId}`;

  function rechazar(e: FormEvent) {
    e.preventDefault();
    const error = primerError(comentarioRechazoSchema, comentario);
    setErrorComentario(error);
    if (!error) resolver.mutate({ accion: 'RECHAZAR', comentario: comentario.trim() });
  }

  return (
    <div role="group" aria-label="Resolver corrección" className="flex flex-col gap-2">
      {!rechazando ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={resolver.isPending} onClick={() => resolver.mutate({ accion: 'APROBAR' })}>
            {resolver.isPending ? 'Enviando…' : 'Aprobar corrección'}
          </Button>
          <Button type="button" variant="outline" disabled={resolver.isPending} onClick={() => setRechazando(true)}>
            Rechazar
          </Button>
        </div>
      ) : (
        <form onSubmit={rechazar} noValidate aria-label="Rechazar corrección" className="flex max-w-xl flex-col gap-2">
          <Label htmlFor={comentarioId}>Comentario para el alumno</Label>
          <Textarea
            id={comentarioId}
            className="min-h-20"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            aria-invalid={errorComentario ? true : undefined}
            aria-describedby={errorComentario ? `${comentarioId}-error` : undefined}
          />
          {errorComentario && (
            <p id={`${comentarioId}-error`} className="text-sm text-destructive">
              {errorComentario}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="destructive" disabled={resolver.isPending}>
              {resolver.isPending ? 'Enviando…' : 'Rechazar corrección'}
            </Button>
            <Button type="button" variant="outline" disabled={resolver.isPending} onClick={() => setRechazando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {resolver.isError && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {messageOf(resolver.error)}
        </p>
      )}
    </div>
  );
}
