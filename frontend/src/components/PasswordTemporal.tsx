import { useState } from 'react';
import { Button } from '@/components/ui/button';

// RF-04: a temporary password is shown only once, with a copy button. Used when the admin creates
// a vinculación user and when vinculación resets a student's password.
export function PasswordTemporal({ password }: { password: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'error'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopyState('ok');
    } catch {
      setCopyState('error');
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Contraseña temporal</p>
      <code className="select-all break-all rounded bg-muted px-2 py-1.5 font-mono text-base">{password}</code>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" onClick={() => void copy()}>
          Copiar
        </Button>
        <span role="status" className="text-sm">
          {copyState === 'ok' && 'Copiada.'}
          {copyState === 'error' && 'No se pudo copiar. Selecciónala y cópiala manualmente.'}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Esta contraseña no se volverá a mostrar. La persona deberá cambiarla en su primer inicio de sesión.
      </p>
    </div>
  );
}
