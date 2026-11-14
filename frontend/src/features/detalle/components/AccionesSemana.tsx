import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useResolverSemanaOficina } from '../api';
import { comentarioRechazoSchema, primerError } from '../schemas';
import { PanelAccion } from './PanelAccion';

type Panel = 'VALIDAR' | 'RECHAZAR';

// RF-22: the office resolves a week the supervisor left pending (ENVIADA). Both actions need a reason.
export function AccionesSemana({ semanaId }: { semanaId: string }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [comentario, setComentario] = useState('');
  const resolver = useResolverSemanaOficina(semanaId);

  function cerrar() {
    setPanel(null);
    setComentario('');
  }

  return (
    <div role="group" aria-label="Acciones de la semana" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" aria-expanded={panel === 'VALIDAR'} onClick={() => setPanel(panel === 'VALIDAR' ? null : 'VALIDAR')}>
          Validar en nombre del supervisor
        </Button>
        <Button type="button" variant="outline" aria-expanded={panel === 'RECHAZAR'} onClick={() => setPanel(panel === 'RECHAZAR' ? null : 'RECHAZAR')}>
          Rechazar
        </Button>
      </div>
      {panel === 'VALIDAR' && (
        <PanelAccion
          key="VALIDAR"
          titulo="Validar semana en nombre del supervisor"
          enviar="Validar semana"
          onEnviar={(motivo) => resolver.mutateAsync({ accion: 'VALIDAR', motivo })}
          onCerrar={cerrar}
        />
      )}
      {panel === 'RECHAZAR' && (
        <PanelAccion
          key="RECHAZAR"
          titulo="Rechazar semana"
          enviar="Rechazar semana"
          destructiva
          validarExtra={() => primerError(comentarioRechazoSchema, comentario)}
          onEnviar={(motivo) => resolver.mutateAsync({ accion: 'RECHAZAR', motivo, comentario: comentario.trim() })}
          onCerrar={cerrar}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comentario-rechazo">Comentario para el alumno</Label>
            <Textarea id="comentario-rechazo" className="min-h-20" value={comentario} onChange={(e) => setComentario(e.target.value)} />
          </div>
        </PanelAccion>
      )}
    </div>
  );
}
