import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { borrarPlantel, crearPlantel, crearUsuario, iniciarSesion } from '../../test/factories.js';
import type { TipoPrograma } from '../generated/prisma/enums.js';
import { auth } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { errorHandler } from './errorHandler.js';
import { getAuth, requireOficina, requireRol, requireSession } from './auth.js';

function buildApp() {
  const app = express();
  app.all('/api/auth/*splat', toNodeHandler(auth));

  app.get('/privada', requireSession(), (req, res) => {
    res.json({ userId: getAuth(req).user.id });
  });
  app.get('/pendiente-ok', requireSession({ permitirCambioPendiente: true }), (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/solo-admin', requireSession(), requireRol('ADMIN'), (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/sin-sesion-previa', requireRol('ADMIN'), (_req, res) => {
    res.json({ ok: true });
  });
  app.get(
    '/expedientes/:tipo',
    requireSession(),
    requireRol('VINCULACION', 'ADMIN'),
    requireOficina(async (req) => {
      const tipo = req.params.tipo;
      return tipo === 'PRACTICAS' || tipo === 'SERVICIO_SOCIAL' ? (tipo as TipoPrograma) : null;
    }),
    (_req, res) => {
      res.json({ ok: true });
    },
  );

  app.use(errorHandler);
  return app;
}

describe('auth middlewares', () => {
  const app = buildApp();
  let plantelId: string;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    const usuarios = {
      alumno: await crearUsuario({ plantelId }),
      admin: await crearUsuario({ plantelId, rol: 'ADMIN' }),
      practicas: await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }),
      ambas: await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: null }),
      pendiente: await crearUsuario({ plantelId, debeCambiar: true }),
      inactivo: await crearUsuario({ plantelId }),
    };
    for (const [clave, usuario] of Object.entries(usuarios)) {
      cookies[clave] = await iniciarSesion(app, usuario);
    }
    // Deactivated after signing in: an existing session must stop working.
    await prisma.user.update({ where: { id: usuarios.inactivo.id }, data: { activo: false } });
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  describe('requireSession', () => {
    it('401 without a session cookie', async () => {
      const res = await request(app).get('/privada');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('401 with an invalid session cookie', async () => {
      const res = await request(app).get('/privada').set('Cookie', 'better-auth.session_token=falso.falso');

      expect(res.status).toBe(401);
    });

    it('exposes the signed-in user to the handler', async () => {
      const res = await request(app).get('/privada').set('Cookie', cookies.alumno!);

      expect(res.status).toBe(200);
      expect(res.body.userId).toEqual(expect.any(String));
    });

    it('403 for a deactivated account', async () => {
      const res = await request(app).get('/privada').set('Cookie', cookies.inactivo!);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CUENTA_INACTIVA');
      expect(res.body.error.message).toBe('Tu cuenta está desactivada. Acude a la Oficina de Prácticas Profesionales o a la de Servicio Social y Titulación.');
    });

    it('RF-04: 403 while the temporary password has not been changed', async () => {
      const res = await request(app).get('/privada').set('Cookie', cookies.pendiente!);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('DEBE_CAMBIAR_CONTRASENA');
    });

    it('RF-04: routes can opt in to users with a pending password change', async () => {
      const res = await request(app).get('/pendiente-ok').set('Cookie', cookies.pendiente!);

      expect(res.status).toBe(200);
    });
  });

  describe('requireRol', () => {
    it('403 for the wrong role', async () => {
      const res = await request(app).get('/solo-admin').set('Cookie', cookies.alumno!);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows the right role', async () => {
      const res = await request(app).get('/solo-admin').set('Cookie', cookies.admin!);

      expect(res.status).toBe(200);
    });

    it('401 when mounted without requireSession', async () => {
      const res = await request(app).get('/sin-sesion-previa').set('Cookie', cookies.admin!);

      expect(res.status).toBe(401);
    });
  });

  describe('requireOficina', () => {
    it('RN-03b: vinculación de Prácticas entra a expedientes de prácticas', async () => {
      const res = await request(app).get('/expedientes/PRACTICAS').set('Cookie', cookies.practicas!);

      expect(res.status).toBe(200);
    });

    it('RN-03b: vinculación de Prácticas no entra a expedientes de servicio social', async () => {
      const res = await request(app).get('/expedientes/SERVICIO_SOCIAL').set('Cookie', cookies.practicas!);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('RN-03b: vinculación sin oficina y el administrador entran a ambas', async () => {
      for (const cookie of [cookies.ambas!, cookies.admin!]) {
        for (const tipo of ['PRACTICAS', 'SERVICIO_SOCIAL']) {
          const res = await request(app).get(`/expedientes/${tipo}`).set('Cookie', cookie);
          expect(res.status).toBe(200);
        }
      }
    });

    it('404 when the resource does not exist', async () => {
      const res = await request(app).get('/expedientes/NO_EXISTE').set('Cookie', cookies.admin!);

      expect(res.status).toBe(404);
    });
  });
});
