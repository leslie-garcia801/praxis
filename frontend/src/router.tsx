import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { PlaceholderPage } from './components/PlaceholderPage';

// Routes by role: /alumno, /vinculacion, /validar/:token (see frontend/CLAUDE.md).
// Screens are added iteration by iteration (docs/specs.md section 14).
export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/entrar" replace /> },
  { path: '/entrar', element: <PlaceholderPage title="Iniciar sesión" /> },
  { path: '/alumno', element: <PlaceholderPage title="Mi avance" /> },
  { path: '/vinculacion', element: <PlaceholderPage title="Panel de vinculación" /> },
  { path: '/validar/:token', element: <PlaceholderPage title="Validar semanas" /> },
  { path: '*', element: <PlaceholderPage title="Página no encontrada" /> },
];

export const router = createBrowserRouter(routes);
