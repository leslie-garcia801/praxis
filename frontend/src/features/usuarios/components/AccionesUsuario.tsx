import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { PasswordTemporal } from '@/components/PasswordTemporal';
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
import { Label } from '@/components/ui/label';
import { Field } from '@/features/auth/components/Field';
import { messageOf } from '@/features/importaciones/archivo';
import { AMBAS_OFICINAS, NOMBRE_OFICINA } from '@/lib/oficinas';
import { useEditarUsuario, useRestablecerContrasenaUsuario, type UsuarioOficina } from '../api';
import { editarUsuarioSchema, type EditarUsuarioValues } from '../schemas';

const selectClass =
  'h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

type Dialogo = 'editar' | 'estado' | 'restablecer' | null;

function ErrorAlert({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  );
}

// Actions of one row (§4, "Gestionar usuarios de vinculación"). The admin cannot deactivate or reset
// their own account here: the server refuses both (409) and the password has its own screen.
export function AccionesUsuario({ usuario, esYo }: { usuario: UsuarioOficina; esYo: boolean }) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const cerrar = () => setDialogo(null);

  return (
    <div className="flex flex-wrap items-start gap-2">
      <Button type="button" variant="outline" size="sm" aria-label={`Editar ${usuario.nombre}`} onClick={() => setDialogo('editar')}>
        Editar
      </Button>
      {!esYo && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`${usuario.activo ? 'Desactivar' : 'Reactivar'} ${usuario.nombre}`}
            onClick={() => setDialogo('estado')}
          >
            {usuario.activo ? 'Desactivar' : 'Reactivar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Restablecer contraseña de ${usuario.nombre}`}
            onClick={() => setDialogo('restablecer')}
          >
            Restablecer contraseña
          </Button>
        </>
      )}
      {dialogo === 'editar' && <EditarDialogo usuario={usuario} onClose={cerrar} />}
      {dialogo === 'estado' && <EstadoDialogo usuario={usuario} onClose={cerrar} />}
      {dialogo === 'restablecer' && <RestablecerDialogo usuario={usuario} onClose={cerrar} />}
    </div>
  );
}

// Name and, for vinculación users only, the office ("Ambas oficinas" is sent as null, RN-03b).
function EditarDialogo({ usuario, onClose }: { usuario: UsuarioOficina; onClose: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const editar = useEditarUsuario(usuario.id);
  const conOficina = usuario.rol === 'VINCULACION';
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditarUsuarioValues>({
    resolver: zodResolver(editarUsuarioSchema),
    defaultValues: { nombre: usuario.nombre, oficina: usuario.oficina ?? 'AMBAS' },
  });

  function onSubmit(values: EditarUsuarioValues) {
    setFormError(null);
    const body = conOficina
      ? { nombre: values.nombre, oficina: values.oficina === 'AMBAS' ? null : values.oficina }
      : { nombre: values.nombre };
    editar.mutate(body, { onSuccess: onClose, onError: (e) => setFormError(messageOf(e)) });
  }

  return (
    <AlertDialog open onOpenChange={(abierto) => !abierto && !editar.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Editar usuario</AlertDialogTitle>
          <AlertDialogDescription>El correo no se puede cambiar: es con el que entra a la app.</AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="flex flex-col gap-4">
          <Field id="editar-nombre" label="Nombre" autoComplete="off" error={errors.nombre?.message} {...register('nombre')} />
          {conOficina && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editar-oficina">Oficina</Label>
              <select id="editar-oficina" className={selectClass} {...register('oficina')}>
                <option value="PRACTICAS">{NOMBRE_OFICINA.PRACTICAS}</option>
                <option value="SERVICIO_SOCIAL">{NOMBRE_OFICINA.SERVICIO_SOCIAL}</option>
                <option value="AMBAS">{AMBAS_OFICINAS}</option>
              </select>
            </div>
          )}
          {formError && <ErrorAlert message={formError} />}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={editar.isPending}>Cancelar</AlertDialogCancel>
            <Button type="submit" disabled={editar.isPending}>
              {editar.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// RF-29: asks first because deactivating also closes the open sessions.
function EstadoDialogo({ usuario, onClose }: { usuario: UsuarioOficina; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const editar = useEditarUsuario(usuario.id);
  const desactivar = usuario.activo;
  const verbo = desactivar ? 'Desactivar' : 'Reactivar';

  return (
    <AlertDialog open onOpenChange={(abierto) => !abierto && !editar.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            ¿{verbo} a {usuario.nombre}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {desactivar
              ? 'No podrá iniciar sesión y se cerrarán sus sesiones abiertas.'
              : 'Podrá iniciar sesión de nuevo con su contraseña.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <ErrorAlert message={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={editar.isPending}>Cancelar</AlertDialogCancel>
          <Button
            type="button"
            variant={desactivar ? 'destructive' : 'default'}
            disabled={editar.isPending}
            onClick={() => {
              setError(null);
              editar.mutate({ activo: !desactivar }, { onSuccess: onClose, onError: (e) => setError(messageOf(e)) });
            }}
          >
            {editar.isPending ? 'Guardando…' : verbo}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// RF-04: the temporary password lives only in this component's state; closing the dialog unmounts it.
function RestablecerDialogo({ usuario, onClose }: { usuario: UsuarioOficina; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const restablecer = useRestablecerContrasenaUsuario(usuario.id);

  function confirmar() {
    setError(null);
    restablecer.mutate(undefined, {
      onSuccess: ({ passwordTemporal }) => {
        setPassword(passwordTemporal);
        // Drop the response from the mutation cache as well.
        restablecer.reset();
      },
      onError: (e) => setError(messageOf(e)),
    });
  }

  return (
    <AlertDialog open onOpenChange={(abierto) => !abierto && !restablecer.isPending && onClose()}>
      <AlertDialogContent>
        {password ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Contraseña de {usuario.nombre}</AlertDialogTitle>
              <AlertDialogDescription>Entrégala a la persona; deberá cambiarla al entrar.</AlertDialogDescription>
            </AlertDialogHeader>
            <PasswordTemporal password={password} />
            <AlertDialogFooter>
              <Button type="button" onClick={onClose}>
                Listo
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Restablecer la contraseña de {usuario.nombre}?</AlertDialogTitle>
              <AlertDialogDescription>
                Se genera una contraseña temporal. La actual dejará de funcionar y se cerrarán sus sesiones abiertas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error && <ErrorAlert message={error} />}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={restablecer.isPending}>Cancelar</AlertDialogCancel>
              <Button type="button" disabled={restablecer.isPending} onClick={confirmar}>
                {restablecer.isPending ? 'Restableciendo…' : 'Restablecer'}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
