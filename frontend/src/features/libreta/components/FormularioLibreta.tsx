import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
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
import { Field } from '@/features/auth/components/Field';
import { ApiError } from '@/lib/api';
import { hoyMonterrey } from '@/lib/tiempo';
import { erroresPorFila, useCorregirLibreta, useEnviarLibreta, type SemanaLibreta } from '../api';
import { crearLibretaSchema, MAX_TURNOS_LIBRETA, type LibretaValues, type TurnoLibretaValues } from '../schemas';
import { VistaPreviaLibreta } from './VistaPreviaLibreta';

const ERROR_RED = 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.';

type Props = {
  // Correction of a rejected week: its id (PUT) and date range.
  correccion?: { semanaId: string; inicio: string; fin: string };
  inicial?: TurnoLibretaValues[];
  fechaInicio?: string;
  onEnviado: (semanas: SemanaLibreta[]) => void;
};

function turnoVacio(): TurnoLibretaValues {
  return { turnoId: crypto.randomUUID(), fecha: '', entrada: '', salida: '' };
}

// RF-17a, RN-19: rows of notebook shifts (date, entry, exit). The same form creates the weeks (POST)
// and replaces the shifts of a rejected week (PUT). The server decides every rule.
export function FormularioLibreta({ correccion, inicial, fechaInicio, onEnviado }: Props) {
  const enviarNuevo = useEnviarLibreta();
  const corregir = useCorregirLibreta(correccion?.semanaId ?? '');
  const [confirmando, setConfirmando] = useState<TurnoLibretaValues[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [erroresFila, setErroresFila] = useState<Record<number, string>>({});

  const schema = useMemo(
    () => crearLibretaSchema({ hoy: hoyMonterrey(), semana: correccion && { inicio: correccion.inicio, fin: correccion.fin } }),
    [correccion],
  );
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LibretaValues, unknown, LibretaValues>({
    resolver: zodResolver(schema),
    defaultValues: { turnos: inicial && inicial.length > 0 ? inicial : [turnoVacio()] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'turnos', keyName: 'clave' });
  const turnos = useWatch({ control, name: 'turnos' });
  const ocupado = enviarNuevo.isPending || corregir.isPending;

  async function enviar() {
    if (!confirmando) return;
    setError(null);
    setErroresFila({});
    const cuerpo = confirmando.map((t) => ({ id: t.turnoId, fecha: t.fecha, entrada: t.entrada, salida: t.salida }));
    try {
      const semanas = correccion
        ? [(await corregir.mutateAsync(cuerpo)).semana]
        : (await enviarNuevo.mutateAsync(cuerpo)).semanas;
      setConfirmando(null);
      onEnviado(semanas);
    } catch (e) {
      setConfirmando(null);
      if (e instanceof ApiError && e.code !== 'UNKNOWN_ERROR') {
        const porFila = erroresPorFila(e.details);
        if (Object.keys(porFila).length > 0) {
          setErroresFila(porFila);
          setError('Revisa los turnos marcados.');
        } else {
          setError(e.message);
        }
      } else {
        setError(ERROR_RED);
      }
    }
  }

  return (
    <>
      <form
        onSubmit={(e) => void handleSubmit((valores) => setConfirmando(valores.turnos))(e)}
        noValidate
        className="flex flex-col gap-4"
      >
        {fields.map((campo, i) => {
          const e = errors.turnos?.[i];
          return (
            <fieldset key={campo.clave} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
              <legend className="px-1 font-medium">{`Turno ${i + 1}`}</legend>
              <Field
                id={`turno-${i}-fecha`}
                label={`Fecha del turno ${i + 1}`}
                type="date"
                min={correccion?.inicio ?? fechaInicio}
                max={correccion?.fin}
                error={e?.fecha?.message ?? erroresFila[i]}
                {...register(`turnos.${i}.fecha`)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id={`turno-${i}-entrada`}
                  label={`Hora de entrada del turno ${i + 1}`}
                  type="time"
                  error={e?.entrada?.message}
                  {...register(`turnos.${i}.entrada`)}
                />
                <Field
                  id={`turno-${i}-salida`}
                  label={`Hora de salida del turno ${i + 1}`}
                  type="time"
                  error={e?.salida?.message}
                  {...register(`turnos.${i}.salida`)}
                />
              </div>
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 self-start"
                  aria-label={`Quitar turno ${i + 1}`}
                  onClick={() => remove(i)}
                >
                  Quitar
                </Button>
              )}
            </fieldset>
          );
        })}
        {errors.turnos?.root?.message && <p className="text-sm text-destructive">{errors.turnos.root.message}</p>}
        {errors.turnos?.message && <p className="text-sm text-destructive">{errors.turnos.message}</p>}
        <Button
          type="button"
          variant="outline"
          className="h-12"
          disabled={fields.length >= MAX_TURNOS_LIBRETA}
          onClick={() => append(turnoVacio())}
        >
          Agregar turno
        </Button>

        <VistaPreviaLibreta turnos={turnos ?? []} />

        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="h-12" disabled={ocupado}>
          Revisar y enviar
        </Button>
      </form>

      <AlertDialog open={confirmando !== null} onOpenChange={(abierto) => !ocupado && !abierto && setConfirmando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Enviar estas horas?</AlertDialogTitle>
            <AlertDialogDescription>
              Los turnos se enviarán por correo a tu supervisor en el resumen semanal del lunes, para que los valide. Solo
              cuentan cuando los valide.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Volver</AlertDialogCancel>
            <Button type="button" disabled={ocupado} onClick={() => void enviar()}>
              {ocupado ? 'Enviando…' : 'Enviar a mi supervisor'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
