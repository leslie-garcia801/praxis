import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, type ApiErrorBody } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(AppError.notFound('La ruta solicitada no existe.'));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const { status, body } = toApiError(err);
  if (status >= 500) console.error(err);
  res.status(status).json(body);
};

function toApiError(err: unknown): { status: number; body: ApiErrorBody } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, details: err.details } },
    };
  }

  if (err instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Los datos enviados no son válidos.',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
    };
  }

  // Malformed JSON body from express.json()
  if (isBodyParserError(err, 'entity.parse.failed')) {
    return {
      status: 400,
      body: { error: { code: 'INVALID_JSON', message: 'El cuerpo de la petición no es JSON válido.' } },
    };
  }

  // express.raw() / express.json() over their size limit
  if (isBodyParserError(err, 'entity.too.large')) {
    return {
      status: 413,
      body: { error: { code: 'PAYLOAD_TOO_LARGE', message: 'El archivo o los datos enviados superan el tamaño permitido.' } },
    };
  }

  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado. Intenta de nuevo.' } },
  };
}

function isBodyParserError(err: unknown, type: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err as { type?: unknown }).type === type
  );
}
