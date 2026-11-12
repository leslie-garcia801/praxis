import { createBrowserRouter, type RouteObject } from 'react-router';
import { InstitucionFormPage } from './features/instituciones/components/InstitucionFormPage';
import { InstitucionesPage } from './features/instituciones/components/InstitucionesPage';
import { ImportarInstitucionesPage } from './features/importaciones/components/ImportarInstitucionesPage';
import { ImportarAlumnosPage } from './features/importaciones/components/ImportarAlumnosPage';
import { AlumnoLayout } from './features/alumno/components/AlumnoLayout';
import { InicioAlumnoPage } from './features/avance/components/InicioAlumnoPage';
import { ExpedientePage } from './features/expediente/components/ExpedientePage';
import { HistorialPage } from './features/historial/components/HistorialPage';
import { DetalleAlumnoPage } from './features/detalle/components/DetalleAlumnoPage';
import { PanelPage } from './features/panel/components/PanelPage';
import { RegistrarPage } from './features/escaneo/components/RegistrarPage';
import { ValidarSemanasPage } from './features/validacion/components/ValidarSemanasPage';
import { PlaceholderPage } from './components/PlaceholderPage';
import { VinculacionLayout } from './features/vinculacion/components/VinculacionLayout';
import { ActivarPage } from './features/auth/components/ActivarPage';
import { CambiarContrasenaPage } from './features/auth/components/CambiarContrasenaPage';
import { HomeRedirect, PublicOnly, RequirePendingChange, RequireRole } from './features/auth/components/guards';
import { LoginPage } from './features/auth/components/LoginPage';
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
        element: <VinculacionLayout />,
        children: [
          { path: '/vinculacion', element: <PanelPage /> },
          { path: '/vinculacion/expedientes/:id', element: <DetalleAlumnoPage /> },
          { path: '/vinculacion/importar/alumnos', element: <ImportarAlumnosPage /> },
          { path: '/vinculacion/importar/instituciones', element: <ImportarInstitucionesPage /> },
          { path: '/vinculacion/instituciones', element: <InstitucionesPage /> },
          { path: '/vinculacion/instituciones/nueva', element: <InstitucionFormPage /> },
          { path: '/vinculacion/instituciones/:id/editar', element: <InstitucionFormPage /> },
          {
            element: <RequireRole roles={['ADMIN']} />,
            children: [{ path: '/vinculacion/usuarios/nuevo', element: <CrearUsuarioPage /> }],
          },
        ],
      },
    ],
  },
  // Public: the supervisor opens it from an email link (RF-21).
  { path: '/validar/:token', element: <ValidarSemanasPage /> },
  { path: '*', element: <PlaceholderPage title="Página no encontrada" /> },
];

export const router = createBrowserRouter(routes);
