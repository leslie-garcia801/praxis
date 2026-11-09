// TODO(specs §13, pregunta 7): replace this provisional text with the notice approved by the plantel.
// This is the only place the notice lives, so swapping it does not touch the activation screen.
export function AvisoPrivacidad() {
  return (
    <section
      aria-labelledby="aviso-privacidad-titulo"
      className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-sm"
    >
      <h2 id="aviso-privacidad-titulo" className="font-semibold">
        Aviso de privacidad
      </h2>
      <p className="text-xs font-medium text-destructive">Texto provisional pendiente de aprobación del plantel</p>
      <p>
        <strong>Responsable.</strong> El departamento de vinculación del CBTIS 258 es responsable del tratamiento de tus
        datos personales.
      </p>
      <p>
        <strong>Datos que se recaban.</strong> Matrícula, nombre, carrera, semestre, grupo, turno, correo (opcional) y
        tus registros de asistencia y bitácora.
      </p>
      <p>
        <strong>Finalidad.</strong> Controlar las horas de tu servicio social y de tus prácticas profesionales.
      </p>
      <p>
        <strong>Datos que no se recaban.</strong> No se recaban CURP, edad, sexo, servicio médico ni número de afiliación.
      </p>
    </section>
  );
}
