import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { messageOf } from '../../importaciones/archivo';
import { etiquetaFaltante } from '../../expediente/schemas';
import { SelectorInstitucion } from '../../expediente/components/SelectorInstitucion';
import {
  useCambiarEstado,
  useConfirmarExpediente,
  useTransferirExpediente,
  type AccionEstado,
  type ExpedienteDetalle,
} from '../api';
import { PanelAccion } from './PanelAccion';

type Panel = AccionEstado | 'TRANSFERIR';

const TITULO: Record<Panel, string> = {
  SUSPENDER: 'Suspender expediente',
  REACTIVAR: 'Reactivar expediente',
  CANCELAR: 'Cancelar expediente',
  TRANSFERIR: 'Transferir expediente',
};

// RF-12: what the office can do depends on the state of the case file. FINALIZADO and CANCELADO have no actions.
const ACCIONES: Record<ExpedienteDetalle['estado'], Panel[]> = {
  PENDIENTE: ['CANCELAR'],
  EN_PROCESO: ['SUSPENDER', 'CANCELAR', 'TRANSFERIR'],
  SUSPENDIDO: ['REACTIVAR', 'CANCELAR', 'TRANSFERIR'],
  FINALIZADO: [],
  CANCELADO: [],
};

const TEXTO_BOTON: Record<Panel, string> = {
  SUSPENDER: 'Suspender',
  REACTIVAR: 'Reactivar',
  CANCELAR: 'Cancelar',
  TRANSFERIR: 'Transferir',
};

function faltantesDe(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.code !== 'EXPEDIENTE_INCOMPLETO') return [];
  const detalles = error.details as { faltantes?: unknown } | undefined;
  return Array.isArray(detalles?.faltantes) ? detalles.faltantes.map(String) : [];
}

// RF-10: the office confirms a PENDIENTE case file. The API takes no reason; the 409 lists what is missing.
function ConfirmarExpediente({ expedienteId }: { expedienteId: string }) {
  const confirmar = useConfirmarExpediente(expedienteId);
  const faltantes = faltantesDe(confirmar.error);
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" disabled={confirmar.isPending} onClick={() => confirmar.mutate()}>
        {confirmar.isPending ? 'Confirmando…' : 'Confirmar'}
      </Button>
      {confirmar.isError && (
        <div role="alert" className="max-w-xl rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <p>{messageOf(confirmar.error)}</p>
          {faltantes.length > 0 && (
            <>
              <p className="mt-1 font-medium">Falta capturar:</p>
              <ul className="list-disc pl-5">
                {faltantes.map((campo) => (
                  <li key={campo}>{etiquetaFaltante(campo)}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PanelEstado({ expedienteId, accion, onCerrar }: { expedienteId: string; accion: AccionEstado; onCerrar: () => void }) {
  const cambiar = useCambiarEstado(expedienteId);
  const destructiva = accion === 'CANCELAR';
  return (
    <PanelAccion
      titulo={TITULO[accion]}
      enviar={TITULO[accion]}
      destructiva={destructiva}
      confirmacion={
        destructiva
          ? { titulo: '¿Cancelar el expediente?', descripcion: 'El alumno causa baja de este expediente. Esta acción no se puede deshacer.' }
          : undefined
      }
      onEnviar={(motivo) => cambiar.mutateAsync({ accion, motivo })}
      onCerrar={onCerrar}
    />
  );
}

// RN-12: move the case file to another institution, keeping the validated hours or not.
function PanelTransferir({ expediente, onCerrar }: { expediente: ExpedienteDetalle; onCerrar: () => void }) {
  const transferir = useTransferirExpediente(expediente.id);
  const navigate = useNavigate();
  const [institucionId, setInstitucionId] = useState('');
  const [conservarHoras, setConservarHoras] = useState(true);

  return (
    <PanelAccion
      titulo={TITULO.TRANSFERIR}
      enviar={TITULO.TRANSFERIR}
      destructiva
      confirmacion={{
        titulo: '¿Transferir el expediente?',
        descripcion: 'Se cierra este expediente y se abre uno nuevo en la institución elegida. Esta acción no se puede deshacer.',
      }}
      validarExtra={() => (institucionId ? null : 'Elige la institución nueva.')}
      onEnviar={async (motivo) => {
        const { nuevo } = await transferir.mutateAsync({ institucionId, conservarHoras, motivo });
        void navigate(`/vinculacion/expedientes/${nuevo.id}`);
      }}
      onCerrar={onCerrar}
    >
      <SelectorInstitucion tipo={expediente.tipo} valueId={institucionId} guardada={null} onChange={setInstitucionId} />
      <label className="flex items-center gap-3">
        <input type="checkbox" className="size-5" checked={conservarHoras} onChange={(e) => setConservarHoras(e.target.checked)} />
        <span>Conservar horas validadas</span>
      </label>
    </PanelAccion>
  );
}

// RF-11, RF-12, RN-12: office actions on the case file, shown in the header of the detail.
export function AccionesExpediente({ expediente }: { expediente: ExpedienteDetalle }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const acciones = ACCIONES[expediente.estado];
  const puedeConfirmar = expediente.estado === 'PENDIENTE';
  if (acciones.length === 0) return null;

  return (
    <div role="group" aria-label="Acciones del expediente" className="mt-2 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {puedeConfirmar && <ConfirmarExpediente expedienteId={expediente.id} />}
        {acciones.map((accion) => (
          <Button key={accion} type="button" variant="outline" aria-expanded={panel === accion} onClick={() => setPanel(panel === accion ? null : accion)}>
            {TEXTO_BOTON[accion]}
          </Button>
        ))}
      </div>
      {panel === 'TRANSFERIR' && <PanelTransferir expediente={expediente} onCerrar={() => setPanel(null)} />}
      {panel !== null && panel !== 'TRANSFERIR' && (
        <PanelEstado expedienteId={expediente.id} accion={panel} onCerrar={() => setPanel(null)} />
      )}
    </div>
  );
}
