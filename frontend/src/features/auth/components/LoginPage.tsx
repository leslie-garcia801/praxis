import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { meKey, signIn } from '../api';
import { loginSchema, type LoginValues } from '../schemas';
import { AuthShell, FormAlert } from './AuthShell';
import { Field } from './Field';

// RF-03. On success the session query is refreshed; PublicOnly then redirects by role / debeCambiar.
export function LoginPage() {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { identificador: '', password: '' } });

  async function onSubmit({ identificador, password }: LoginValues) {
    setFormError(null);
    const result = await signIn(identificador, password);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: meKey });
  }

  return (
    <AuthShell title="Iniciar sesión" description="Entra con tu matrícula (alumnos) o con tu correo (vinculación).">
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="flex flex-col gap-4">
        <Field
          id="identificador"
          label="Matrícula o correo"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          error={errors.identificador?.message}
          {...register('identificador')}
        />
        <Field
          id="password"
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {formError && <FormAlert>{formError}</FormAlert>}
        <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
      <p className="text-center text-sm">
        <Link to="/activar" className="text-primary underline underline-offset-4">
          ¿Primera vez? Activa tu cuenta
        </Link>
      </p>
    </AuthShell>
  );
}
