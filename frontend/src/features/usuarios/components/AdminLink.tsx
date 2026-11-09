import { Link } from 'react-router';
import { useMe } from '@/features/auth/api';

// Panel link visible only to ADMIN; the route itself is also guarded (RN-03b).
export function AdminLink() {
  const { data } = useMe();
  if (data?.usuario.rol !== 'ADMIN') return null;
  return (
    <Link to="/vinculacion/usuarios/nuevo" className="text-primary underline underline-offset-4">
      Crear usuario de vinculación
    </Link>
  );
}
