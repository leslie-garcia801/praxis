import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { changePassword, meKey } from '../api';
import { cambiarContrasenaSchema, type CambiarContrasenaValues } from '../schemas';
import { AuthShell, FormAlert } from './AuthShell';
import { Field } from './Field';
import { SignOutButton } from './SignOutButton';

const GENERIC_MESSAGE = 'No se pudo completar la solicitud. Intenta de nuevo.';

// RF-04. The backend keeps the current session, so there is no new sign-in: refreshing the session
// query is enough for RequirePendingChange to send the user home.
export function CambiarContrasenaPage() {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CambiarContrasenaValues>({
    resolver: zodResolver(cambiarContrasenaSchema),
    defaultValues: { passwordActual: '', passwordNueva: '', confirmar: '' },
  });

  async function onSubmit({ passwordActual, passwordNueva }: CambiarContrasenaValues) {
    setFormError(null);
    try {
      await changePassword({ passwordActual, passwordNueva });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CONTRASENA_ACTUAL_INCORRECTA') {
        setError('passwordActual', { message: 'La contraseña actual no es correcta.' }, { shouldFocus: true });
      } else if (error instanceof ApiError && error.status === 401) {
        await queryClient.invalidateQueries({ queryKey: meKey });
      } else {
        setFormError(GENERIC_MESSAGE);
      }
      return;
    }
    await queryClient.invalidateQueries({ queryKey: meKey });
  }

  return (
    <AuthShell
      title="Cambiar contraseña"
      description="Tu contraseña es temporal. Crea una nueva para continuar."
    >
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="flex flex-col gap-4">
        <Field
          id="passwordActual"
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          error={errors.passwordActual?.message}
          {...register('passwordActual')}
        />
        <Field
          id="passwordNueva"
          label="Contraseña nueva"
          type="password"
          hint="Mínimo 8 caracteres."
          autoComplete="new-password"
          error={errors.passwordNueva?.message}
          {...register('passwordNueva')}
        />
        <Field
          id="confirmar"
          label="Confirmar contraseña nueva"
          type="password"
          autoComplete="new-password"
          error={errors.confirmar?.message}
          {...register('confirmar')}
        />
        {formError && <FormAlert>{formError}</FormAlert>}
        <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando…' : 'Cambiar contraseña'}
        </Button>
      </form>
      <SignOutButton />
    </AuthShell>
  );
}
