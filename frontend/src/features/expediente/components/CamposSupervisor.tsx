import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { Field } from '@/features/auth/components/Field';
import type { NuevoSupervisorValues } from '../schemas';

// The data of a supervisor, shared by the student's "new supervisor" form and the office's edit form.
// `prefijo` keeps the field ids unique when two of these forms are on the same screen.
export function CamposSupervisor({
  prefijo,
  register,
  errors,
}: {
  prefijo: string;
  register: UseFormRegister<NuevoSupervisorValues>;
  errors: FieldErrors<NuevoSupervisorValues>;
}) {
  return (
    <>
      <Field id={`${prefijo}-nombre`} label="Nombre" autoComplete="off" error={errors.nombre?.message} {...register('nombre')} />
      <Field
        id={`${prefijo}-apellido-paterno`}
        label="Apellido paterno"
        autoComplete="off"
        error={errors.apellidoPaterno?.message}
        {...register('apellidoPaterno')}
      />
      <Field
        id={`${prefijo}-correo`}
        label="Correo"
        type="email"
        autoComplete="off"
        autoCapitalize="none"
        error={errors.correo?.message}
        {...register('correo')}
      />
      <Field id={`${prefijo}-titulo`} label="Título (opcional)" hint="Por ejemplo: Lic., Ing." error={errors.titulo?.message} {...register('titulo')} />
      <Field id={`${prefijo}-apellido-materno`} label="Apellido materno (opcional)" error={errors.apellidoMaterno?.message} {...register('apellidoMaterno')} />
      <Field id={`${prefijo}-puesto`} label="Puesto (opcional)" error={errors.puesto?.message} {...register('puesto')} />
      <Field id={`${prefijo}-departamento`} label="Departamento del supervisor (opcional)" error={errors.departamento?.message} {...register('departamento')} />
      <Field id={`${prefijo}-telefono`} label="Teléfono (opcional)" type="tel" error={errors.telefono?.message} {...register('telefono')} />
      <Field id={`${prefijo}-extension`} label="Extensión (opcional)" error={errors.extension?.message} {...register('extension')} />
    </>
  );
}
