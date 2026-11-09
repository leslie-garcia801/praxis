import { createBrowserRouter, Link, type RouteObject } from 'react-router';
import { ImportarAlumnosPage } from './features/importaciones/components/ImportarAlumnosPage';
import { PlaceholderPage } from './components/PlaceholderPage';
import { ActivarPage } from './features/auth/components/ActivarPage';
import { CambiarContrasenaPage } from './features/auth/components/CambiarContrasenaPage';
import { HomeRedirect, PublicOnly, RequirePendingChange, RequireRole } from './features/auth/components/guards';
import { LoginPage } from './features/auth/components/LoginPage';
import { SignOutButton } from './features/auth/components/SignOutButton';

// Routes by role: /alumno, /vinculacion, /validar/:token (see frontend/CLAUDE.md).
// Screens are added iteration by iteration (docs/specs.md section 14).
export const routes: RouteObject[] = [
  { path: '/', element: <HomeRedirect /> },
  {
    // Signed-in users are redirected away from these.
    element: <PublicOnly />,
    children: [
      { path: '/entrar', element: <LoginPage /> },
      { path: '/activar', element: <ActivarPage /> },
    ],
  },
  { element: <RequirePendingChange />, children: [{ path: '/cambiar-contrasena', element: <CambiarContrasenaPage /> }] },
  {
    element: <RequireRole roles={['ALUMNO']} />,
    children: [
      {
        path: '/alumno',
        element: (
          <PlaceholderPage title="Mi avance">
            <SignOutButton />
          </PlaceholderPage>
        ),
      },
    ],
  },
  {
    element: <RequireRole roles={['VINCULACION', 'ADMIN']} />,
    children: [
      {
        path: '/vinculacion',
        element: (
          <PlaceholderPage title="Panel de vinculación">
            <Link to="/vinculacion/importar/alumnos" className="text-primary underline underline-offset-4">
              Importar alumnos
            </Link>
            <SignOutButton />
          </PlaceholderPage>
        ),
      },
      { path: '/vinculacion/importar/alumnos', element: <ImportarAlumnosPage /> },
    ],
  },
  // Public: the supervisor opens it from an email link (RF-21).
  { path: '/validar/:token', element: <PlaceholderPage title="Validar semanas" /> },
  { path: '*', element: <PlaceholderPage title="Página no encontrada" /> },
];

export const router = createBrowserRouter(routes);
