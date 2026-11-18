// RNF-07, specs §13 question 7: simplified privacy notice approved by the plantel (docs/aviso-privacidad-borrador.md).
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
      <p>
        El Centro de Bachillerato Tecnológico industrial y de servicios No. 258 (CBTIS 258), a través de su
        Departamento de Vinculación, es responsable del tratamiento de los datos personales que proporciones al usar
        esta aplicación.
      </p>
      <p>
        <strong>¿Para qué usamos tus datos?</strong> Para registrar tu asistencia, calcular y validar las horas de tu
        servicio social o de tus prácticas profesionales, enviar tus semanas a tu supervisor para que las valide,
        mandarte recordatorios si los activas y generar los reportes que necesita la oficina.
      </p>
      <p>
        <strong>¿Qué datos usamos?</strong> Tu número de control, nombre, carrera, semestre, grupo y turno; tu correo,
        si decides darlo; tus registros de entrada y salida, tu bitácora semanal y la institución y el supervisor donde
        realizas tu programa.
      </p>
      <p>
        <strong>No pedimos</strong> CURP, edad, sexo, servicio médico ni número de afiliación.
      </p>
      <p>
        <strong>¿Con quién los compartimos?</strong> Tu supervisor ve tus horas y tu bitácora para validarlas. No
        vendemos ni compartimos tus datos con terceros con fines distintos a los descritos.
      </p>
      <p>Puedes consultar el aviso de privacidad integral en las oficinas de vinculación del plantel.</p>
    </section>
  );
}
