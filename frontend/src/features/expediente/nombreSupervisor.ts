import type { Supervisor } from './api';

export function nombreSupervisor(s: Pick<Supervisor, 'titulo' | 'nombre' | 'apellidoPaterno' | 'apellidoMaterno'>) {
  return [s.titulo, s.nombre, s.apellidoPaterno, s.apellidoMaterno].filter(Boolean).join(' ');
}
