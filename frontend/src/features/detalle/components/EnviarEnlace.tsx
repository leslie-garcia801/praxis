import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { messageOf } from '../../importaciones/archivo';
import { useEnviarEnlace, type ExpedienteDetalle } from '../api';

// RF-21, RF-21a: the office sends the supervisor's validation link now instead of waiting for the Monday email.
// The link carries every week the supervisor has pending, so the count can include other students.
export function EnviarEnlace({ expediente }: { expediente: ExpedienteDetalle }) {
  const enviar = useEnviarEnlace(expediente.id);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const { supervisor } = expediente;
  if (!supervisor || expediente.estado === 'CANCELADO') return null;

  function onClick() {
    setResultado(null);
    enviar.mutate(undefined, {
      onSuccess: ({ semanas }) =>
        setResultado({
          ok: true,
          texto: `Se envió el enlace a ${supervisor!.correo ?? 'el supervisor'} con ${semanas} ${semanas === 1 ? 'semana pendiente' : 'semanas pendientes'} de validar.`,
        }),
      onError: (e) => setResultado({ ok: false, texto: messageOf(e) }),
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="outline" disabled={enviar.isPending} onClick={onClick}>
        {enviar.isPending ? 'Enviando…' : 'Enviar enlace al supervisor'}
      </Button>
      <p className="text-sm text-muted-foreground">El correo se envía solo cada lunes; usa este botón para no esperar.</p>
      {resultado &&
        (resultado.ok ? (
          <p role="status">{resultado.texto}</p>
        ) : (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {resultado.texto}
          </p>
        ))}
    </div>
  );
}
