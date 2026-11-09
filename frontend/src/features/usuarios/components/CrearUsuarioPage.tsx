import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Field } from '@/features/auth/components/Field';
import { ApiError } from '@/lib/api';
import { crearUsuarioVinculacion, type Oficina, type UsuarioCreado } from '../api';
import { crearUsuarioSchema, type CrearUsuarioValues } from '../schemas';

const GENERIC_MESSAGE = 'No se pudo completar la solicitud. Intenta de nuevo.';

const OFICINA_LABEL: Record<Oficina, string> = { PRACTICAS: 'Prácticas', SERVICIO_SOCIAL: 'Servicio Social' };
const OPCIONES: { value: CrearUsuarioValues['oficina']; label: string }[] = [
  { value: 'PRACTICAS', label: 'Prácticas' },
  { value: 'SERVICIO_SOCIAL', label: 'Servicio Social' },
  { value: 'AMBAS', label: 'Ambas oficinas' },
];

function ResultView({ creado, onReset }: { creado: UsuarioCreado; onReset: () => void }) {
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'error'>('idle');
  const { usuario } = creado;

  async function copy() {
    try {
      await navigator.clipboard.writeText(creado.passwordTemporal);
      setCopyState('ok');
    } catch {
      setCopyState('error');
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="resultado-titulo">
      <h2 id="resultado-titulo" className="text-lg font-semibold">
        Usuario creado
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Nombre</dt>
        <dd>{usuario.nombre}</dd>
        <dt className="text-muted-foreground">Correo</dt>
        <dd className="break-all">{usuario.email}</dd>
        <dt className="text-muted-foreground">Oficina</dt>
        <dd>{usuario.oficina ? OFICINA_LABEL[usuario.oficina] : 'Ambas oficinas'}</dd>
      </dl>
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-sm font-medium">Contraseña temporal</p>
        <code className="select-all break-all rounded bg-muted px-2 py-1.5 font-mono text-base">
          {creado.passwordTemporal}
        </code>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => void copy()}>
            Copiar
          </Button>
          <span role="status" className="text-sm">
            {copyState === 'ok' && 'Copiada.'}
            {copyState === 'error' && 'No se pudo copiar. Selecciónala y cópiala manualmente.'}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Esta contraseña no se volverá a mostrar. La persona deberá cambiarla en su primer inicio de sesión.
        </p>
      </div>
      <Button type="button" onClick={onReset}>
        Crear otro usuario
      </Button>
    </section>
  );
}

// Matriz de permisos ("Gestionar usuarios de vinculación", ADMIN), RN-03b, RF-04.
export function CrearUsuarioPage() {
  const [creado, setCreado] = useState<UsuarioCreado | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<CrearUsuarioValues>({
    resolver: zodResolver(crearUsuarioSchema),
    defaultValues: { nombre: '', email: '' },
  });
  // gcTime 0 plus reset(): the temporary password must not linger in the mutation cache.
  const mutation = useMutation({ mutationFn: crearUsuarioVinculacion, gcTime: 0 });

  async function onSubmit(values: CrearUsuarioValues) {
    setFormError(null);
    try {
      const result = await mutation.mutateAsync({
        nombre: values.nombre,
        email: values.email,
        oficina: values.oficina === 'AMBAS' ? null : values.oficina,
      });
      setCreado(result);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CORREO_EN_USO') {
        setError('email', { message: error.message }, { shouldFocus: true });
      } else {
        setFormError(error instanceof ApiError ? error.message : GENERIC_MESSAGE);
      }
    } finally {
      mutation.reset();
    }
  }

  function resetAll() {
    setCreado(null);
    setFormError(null);
    reset({ nombre: '', email: '' });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-8">
      <Link to="/vinculacion" className="text-sm text-primary underline underline-offset-4">
        Volver al panel
      </Link>
      <h1 className="text-2xl font-bold">Crear usuario de vinculación</h1>
      {creado ? (
        <ResultView creado={creado} onReset={resetAll} />
      ) : (
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="flex flex-col gap-4">
          <Field id="nombre" label="Nombre" autoComplete="off" error={errors.nombre?.message} {...register('nombre')} />
          <Field
            id="email"
            label="Correo"
            type="email"
            autoComplete="off"
            error={errors.email?.message}
            {...register('email')}
          />
          <fieldset className="flex flex-col gap-2" aria-describedby={errors.oficina ? 'oficina-error' : undefined}>
            <legend className="mb-1 text-sm font-medium">Oficina</legend>
            {OPCIONES.map((op) => (
              <label key={op.value} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" value={op.value} className="size-4" {...register('oficina')} />
                {op.label}
              </label>
            ))}
            {errors.oficina && (
              <p id="oficina-error" className="text-sm text-destructive">
                {errors.oficina.message}
              </p>
            )}
          </fieldset>
          {formError && (
            <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </div>
          )}
          <Button type="submit" size="lg" className="h-11 w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creando…' : 'Crear usuario'}
          </Button>
        </form>
      )}
    </main>
  );
}
