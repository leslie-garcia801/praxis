import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { darDeBajaEsteDispositivo, pushKeys } from '@/features/recordatorios/push';
import { meKey, signOut } from '../api';

// enBarra: styled for the blue header bar; the default keeps the look on a light page.
export function SignOutButton({ enBarra = false }: { enBarra?: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleClick() {
    setPending(true);
    setFailed(false);
    // While the session is still valid: the server call needs it. Best effort; it never blocks signing out.
    await darDeBajaEsteDispositivo();
    const ok = await signOut();
    if (!ok) {
      // Signed-out failed but this device is no longer subscribed: let the reminders card notice.
      void queryClient.invalidateQueries({ queryKey: pushKeys.all });
      setPending(false);
      setFailed(true);
      return;
    }
    // Drop everything cached for the previous user, then record "signed out" so guards don't refetch.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== meKey[0] });
    queryClient.setQueryData(meKey, null);
    void navigate('/entrar', { replace: true });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        onClick={() => void handleClick()}
        disabled={pending}
        className={enBarra ? 'border-white/40 bg-transparent text-encabezado-foreground hover:border-white/60 hover:bg-white/10 hover:text-encabezado-foreground dark:border-white/40 dark:bg-transparent dark:hover:bg-white/10' : undefined}
      >
        Cerrar sesión
      </Button>
      {failed && (
        <p role="alert" className={enBarra ? 'text-sm font-medium text-encabezado-foreground' : 'text-sm text-destructive'}>
          No se pudo cerrar la sesión. Intenta de nuevo.
        </p>
      )}
    </div>
  );
}
