import { Outlet } from 'react-router';
import { SignOutButton } from '@/features/auth/components/SignOutButton';

// Shell of every student screen: app name and sign out (until the profile screen exists).
export function AlumnoLayout() {
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <span className="text-lg font-bold">Praxis</span>
          <SignOutButton />
        </div>
      </header>
      <Outlet />
    </div>
  );
}
