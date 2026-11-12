import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { rechazoSchema, type RechazoValues } from '../schemas';

type Props = {
  semanaId: string;
  ocupado: boolean;
  onConfirmar: (comentario: string) => void;
  onCancelar: () => void;
};

// RF-22: the comment is required before sending; the format check is only for the form.
export function FormRechazo({ semanaId, ocupado, onConfirmar, onCancelar }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RechazoValues>({ resolver: zodResolver(rechazoSchema), defaultValues: { comentario: '' } });
  const idCampo = `rechazo-${semanaId}`;

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => onConfirmar(rechazoSchema.parse(values).comentario))}
      className="flex flex-col gap-2"
    >
      <Label htmlFor={idCampo}>Motivo del rechazo</Label>
      <Textarea
        id={idCampo}
        aria-invalid={errors.comentario ? true : undefined}
        aria-describedby={errors.comentario ? `${idCampo}-error` : undefined}
        {...register('comentario')}
      />
      {errors.comentario && (
        <p id={`${idCampo}-error`} role="alert" className="text-destructive">
          {errors.comentario.message}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" variant="destructive" className="h-11 flex-1 text-base" disabled={ocupado}>
          Confirmar rechazo
        </Button>
        <Button type="button" variant="outline" className="h-11 flex-1 text-base" onClick={onCancelar} disabled={ocupado}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
