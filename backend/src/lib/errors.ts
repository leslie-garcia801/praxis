// Single error contract for the API: { error: { code, message, details? } }.
// `message` is user-facing and always in Spanish.

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(message = 'Recurso no encontrado.') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static unauthorized(message = 'Inicia sesión para continuar.') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'No tienes permiso para realizar esta acción.') {
    return new AppError(403, 'FORBIDDEN', message);
  }
}
