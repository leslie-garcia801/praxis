// Name comparison for account activation (RF-02). Pure logic: no Express or Prisma.

// Lowercase, without accents, dieresis or tilde (ñ → n), with single spaces.
export function normalizarNombre(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

type NombreYApellido = { nombre: string; apellidoPaterno: string };

// The student proves identity by typing their first name(s) and first surname as recorded.
export function nombresCoinciden(registro: NombreYApellido, escrito: NombreYApellido): boolean {
  return (
    normalizarNombre(registro.nombre) === normalizarNombre(escrito.nombre) &&
    normalizarNombre(registro.apellidoPaterno) === normalizarNombre(escrito.apellidoPaterno)
  );
}
