// Agreed weekdays (1 = Monday … 7 = Sunday) written the way the Edumedia forms expect. Pure.

const ABREVIADOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function formatearDiasPactados(dias: number[]): string {
  const unicos = [...new Set(dias.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
  if (unicos.length === 7) return 'Todos los días';
  if (unicos.length === 5 && unicos.every((d, i) => d === i + 1)) return 'Lunes a viernes';
  return unicos.map((d) => ABREVIADOS[d - 1]).join(', ');
}
