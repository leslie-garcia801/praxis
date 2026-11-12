// Alerts that filter the table by their `expedienteIds` (RF-24).
export type ClaveAlerta = 'sinRegistros' | 'semanasSinValidar' | 'turnosIncompletos';

export const TITULO_ALERTA: Record<ClaveAlerta, string> = {
  sinRegistros: 'Sin registros en 7 días',
  semanasSinValidar: 'Semanas sin validar (más de 7 días)',
  turnosIncompletos: 'Turnos incompletos',
};

export const CLAVES_ALERTA: ClaveAlerta[] = ['sinRegistros', 'semanasSinValidar', 'turnosIncompletos'];

export function esClaveAlerta(valor: string | null): valor is ClaveAlerta {
  return valor !== null && (CLAVES_ALERTA as string[]).includes(valor);
}
