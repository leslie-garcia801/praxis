import { createBrowserRouter, Link, type RouteObject } from 'react-router';
import { InstitucionFormPage } from './features/instituciones/components/InstitucionFormPage';
import { InstitucionesPage } from './features/instituciones/components/InstitucionesPage';
import { ImportarInstitucionesPage } from './features/importaciones/components/ImportarInstitucionesPage';
import { ImportarAlumnosPage } from './features/importaciones/components/ImportarAlumnosPage';
import { AlumnoLayout } from './features/alumno/components/AlumnoLayout';
import { InicioAlumnoPage } from './features/avance/components/InicioAlumnoPage';
import { ExpedientePage } from './features/expediente/components/ExpedientePage';
import { HistorialPage } from './features/historial/components/HistorialPage';
import { RegistrarPage } from './features/escaneo/components/RegistrarPage';
import { PlaceholderPage } from './components/PlaceholderPage';
import { ActivarPage } from './features/auth/components/ActivarPage';
import { CambiarContrasenaPage } from './features/auth/components/CambiarContrasenaPage';
import { HomeRedirect, PublicOnly, RequirePendingChange, RequireRole } from './features/auth/components/guards';
import { LoginPage } from './features/auth/components/LoginPage';
import { SignOutButton } from './features/auth/components/SignOutButton';
import { AdminLink } from './features/usuarios/components/AdminLink';
import { CrearUsuarioPage } from './features/usuarios/components/CrearUsuarioPage';

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
        element: <AlumnoLayout />,
        children: [
          { index: true, element: <InicioAlumnoPage /> },
          { path: 'registrar', element: <RegistrarPage /> },
          { path: 'expediente', element: <ExpedientePage /> },
          { path: 'historial', element: <HistorialPage /> },
        ],
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
            <Link to="/vinculacion/instituciones" className="text-primary underline underline-offset-4">
              Instituciones
            </Link>
            <Link to="/vinculacion/importar/instituciones" className="text-primary underline underline-offset-4">
              Importar instituciones
            </Link>
            <AdminLink />
            <SignOutButton />
          </PlaceholderPage>
        ),
      },
      { path: '/vinculacion/importar/alumnos', element: <ImportarAlumnosPage /> },
      { path: '/vinculacion/importar/instituciones', element: <ImportarInstitucionesPage /> },
      { path: '/vinculacion/instituciones', element: <InstitucionesPage /> },
      { path: '/vinculacion/instituciones/nueva', element: <InstitucionFormPage /> },
      { path: '/vinculacion/instituciones/:id/editar', element: <InstitucionFormPage /> },
    ],
  },
  {
    element: <RequireRole roles={['ADMIN']} />,
    children: [{ path: '/vinculacion/usuarios/nuevo', element: <CrearUsuarioPage /> }],
  },
  // Public: the supervisor opens it from an email link (RF-21).
  { path: '/validar/:token', element: <PlaceholderPage title="Validar semanas" /> },
  { path: '*', element: <PlaceholderPage title="Página no encontrada" /> },
];

export const router = createBrowserRouter(routes);
