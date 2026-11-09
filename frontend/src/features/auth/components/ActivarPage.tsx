import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  activateAccount,
  activationFailure,
  meKey,
  signIn,
  verifyIdentity,
  type ActivationFailure,
} from '../api';
import {
  contrasenaActivacionSchema,
  identidadSchema,
  type ContrasenaActivacionValues,
  type IdentidadValues,
} from '../schemas';
import { AuthShell, FormAlert } from './AuthShell';
import { AvisoPrivacidad } from './AvisoPrivacidad';
import { Field } from './Field';

const SIGN_IN_LINK = (
  <Link to="/entrar" className="font-medium underline underline-offset-4">
    Ir a iniciar sesión
  </Link>
);

function FailureAlert({ failure }: { failure: ActivationFailure }) {
  return (
    <FormAlert>
      {failure.message}
      {failure.code === 'CUENTA_YA_ACTIVADA' && <> {SIGN_IN_LINK}</>}
    </FormAlert>
  );
}

// RF-02: step 1 proves who the student is, step 2 creates the password. The server never returns
// the stored name (RNF-07), so step 1 only learns "ok" or why not.
export function ActivarPage() {
  const [identity, setIdentity] = useState<IdentidadValues | null>(null);
  // Kept outside the forms so "Volver" restores what the student typed.
  const [draft, setDraft] = useState<IdentidadValues>({ matricula: '', nombre: '', apellidoPaterno: '' });

  return (
    <AuthShell
      title="Activar cuenta"
      description={
        identity
          ? 'Paso 2 de 2: crea tu contraseña.'
          : 'Paso 1 de 2: confirma tus datos para activar tu cuenta de alumno.'
      }
    >
      {identity ? (
        <PasswordStep
          identity={identity}
          onBack={() => {
            setDraft(identity);
            setIdentity(null);
          }}
        />
      ) : (
        <IdentityStep initial={draft} onVerified={setIdentity} />
      )}
      <p className="text-center text-sm">
        <Link to="/entrar" className="text-primary underline underline-offset-4">
          ¿Ya activaste tu cuenta? Inicia sesión
        </Link>
      </p>
    </AuthShell>
  );
}

function IdentityStep({ initial, onVerified }: { initial: IdentidadValues; onVerified: (v: IdentidadValues) => void }) {
  const [failure, setFailure] = useState<ActivationFailure | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<IdentidadValues>({ resolver: zodResolver(identidadSchema), defaultValues: initial });

  async function onSubmit(values: IdentidadValues) {
    setFailure(null);
    try {
      await verifyIdentity(values);
      onVerified(values);
    } catch (error) {
      setFailure(activationFailure(error));
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="flex flex-col gap-4">
      <Field
        id="matricula"
        label="Matrícula"
        hint="Son 14 dígitos."
        inputMode="numeric"
        autoComplete="username"
        maxLength={14}
        error={errors.matricula?.message}
        {...register('matricula')}
      />
      <Field id="nombre" label="Nombre" autoComplete="given-name" error={errors.nombre?.message} {...register('nombre')} />
      <Field
        id="apellidoPaterno"
        label="Primer apellido"
        autoComplete="family-name"
        error={errors.apellidoPaterno?.message}
        {...register('apellidoPaterno')}
      />
      {failure && <FailureAlert failure={failure} />}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Verificando…' : 'Continuar'}
      </Button>
    </form>
  );
}

function PasswordStep({ identity, onBack }: { identity: IdentidadValues; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<ReactNode>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContrasenaActivacionValues>({
    resolver: zodResolver(contrasenaActivacionSchema),
    defaultValues: { password: '', confirmar: '', email: '', avisoPrivacidad: false },
  });

  async function onSubmit({ password, email }: ContrasenaActivacionValues) {
    setFailure(null);
    try {
      await activateAccount({ ...identity, password, ...(email ? { email } : {}) });
    } catch (error) {
      const result = activationFailure(error);
      setFailure(<FailureAlert failure={result} />);
      return;
    }
    // The activation route does not create a session: sign in with the new password.
    const result = await signIn(identity.matricula, password);
    if (!result.ok) {
      setFailure(
        <FormAlert>Tu cuenta quedó activada, pero no se pudo iniciar sesión. {SIGN_IN_LINK}</FormAlert>,
      );
      return;
    }
    await queryClient.invalidateQueries({ queryKey: meKey });
  }

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="flex flex-col gap-4">
      <Field
        id="password"
        label="Contraseña"
        type="password"
        hint="Mínimo 8 caracteres."
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Field
        id="confirmar"
        label="Confirmar contraseña"
        type="password"
        autoComplete="new-password"
        error={errors.confirmar?.message}
        {...register('confirmar')}
      />
      <Field
        id="email"
        label="Correo (opcional)"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        error={errors.email?.message}
        {...register('email')}
      />

      <AvisoPrivacidad />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <input
            id="avisoPrivacidad"
            type="checkbox"
            className="mt-0.5 size-5 shrink-0"
            aria-invalid={errors.avisoPrivacidad ? true : undefined}
            aria-describedby={errors.avisoPrivacidad ? 'avisoPrivacidad-error' : undefined}
            {...register('avisoPrivacidad')}
          />
          <Label htmlFor="avisoPrivacidad" className="leading-snug">
            He leído el aviso de privacidad
          </Label>
        </div>
        {errors.avisoPrivacidad && (
          <p id="avisoPrivacidad-error" className="text-sm text-destructive">
            {errors.avisoPrivacidad.message}
          </p>
        )}
      </div>

      {failure}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Activando…' : 'Activar cuenta'}
      </Button>
      <Button type="button" variant="ghost" onClick={onBack} disabled={isSubmitting}>
        Volver
      </Button>
    </form>
  );
}
