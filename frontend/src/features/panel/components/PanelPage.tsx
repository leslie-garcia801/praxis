import { useSearchParams } from 'react-router';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { Button } from '@/components/ui/button';
import { useMe } from '@/features/auth/api';
import { ApiError } from '@/lib/api';
import { messageOf } from '../../importaciones/archivo';
import { tituloPanel } from '@/lib/oficinas';
import { CLAVES_FILTRO, usePanelAlumnos, type ClaveFiltro, type FiltrosPanel as Filtros } from '../api';
import { esClaveAlerta, TITULO_ALERTA } from '../alertas';
import { AlertasPanel } from './AlertasPanel';
import { FiltrosPanel } from './FiltrosPanel';
import { TablaAlumnos } from './TablaAlumnos';

const PARAM_ALERTA = 'alerta';

function textoContador(n: number): string {
  return n === 1 ? '1 alumno' : `${n} alumnos`;
}

// RF-23, RF-24: home of the office. Filters and the alert filter live in the URL (shareable, back button).
// The alert filter is local: the API already returns the `expedienteIds` of each alert.
export function PanelPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const me = useMe();

  const filtros: Filtros = {};
  for (const clave of CLAVES_FILTRO) {
    const valor = searchParams.get(clave);
    if (valor) filtros[clave] = valor;
  }
  const alertaParam = searchParams.get(PARAM_ALERTA);
  const alerta = esClaveAlerta(alertaParam) ? alertaParam : null;

  const panel = usePanelAlumnos(filtros);

  // RN-03b: only users who see both offices (oficina null) and the admin pick the program type.
  const usuario = me.data?.usuario;
  const mostrarTipo = usuario !== undefined && (usuario.oficina === null || usuario.rol === 'ADMIN');

  function cambiarParam(clave: string, valor: string | null) {
    const next = new URLSearchParams(searchParams);
    if (valor) next.set(clave, valor);
    else next.delete(clave);
    setSearchParams(next);
  }

  const alumnos = panel.data
    ? alerta
      ? panel.data.alumnos.filter((f) => panel.data.alertas[alerta].expedienteIds.includes(f.expediente.id))
      : panel.data.alumnos
    : [];

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
      <h1 className="text-2xl font-bold">{me.data ? tituloPanel(me.data.usuario) : 'Panel'}</h1>

      {panel.data && (
        <AlertasPanel alertas={panel.data.alertas} activa={alerta} onSeleccionar={(clave) => cambiarParam(PARAM_ALERTA, clave)} />
      )}

      <FiltrosPanel
        filtros={filtros}
        mostrarTipo={mostrarTipo}
        onCambiar={(clave: ClaveFiltro, valor) => cambiarParam(clave, valor)}
        onLimpiar={() => setSearchParams({})}
      />

      {panel.isPending && (
        <p role="status" className="text-slate-700">
          Cargando alumnos…
        </p>
      )}
      {panel.isError &&
        (panel.error instanceof ApiError && panel.error.status === 403 ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {panel.error.message}
          </p>
        ) : (
          <ErrorConReintento message={messageOf(panel.error)} onRetry={() => void panel.refetch()} />
        ))}
      {panel.data && (
        <section aria-busy={panel.isPlaceholderData} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-medium">{textoContador(alumnos.length)}</p>
            {alerta && (
              <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1 text-sm">
                <span>Mostrando: {TITULO_ALERTA[alerta]}</span>
                <span aria-hidden="true">·</span>
                <Button type="button" variant="link" className="h-auto p-0" onClick={() => cambiarParam(PARAM_ALERTA, null)}>
                  Quitar
                </Button>
              </p>
            )}
          </div>
          {alumnos.length === 0 ? <p>No hay alumnos con estos filtros</p> : <TablaAlumnos filas={alumnos} />}
        </section>
      )}
    </main>
  );
}
