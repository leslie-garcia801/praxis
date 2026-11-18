import { useEffect, useState, type ReactNode } from 'react';

// A confirmation that fades away on its own (what a toast would be), announced to screen readers.
export function AvisoTemporal({ children, duracionMs = 8000 }: { children: ReactNode; duracionMs?: number }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setVisible(false), duracionMs);
    return () => clearTimeout(id);
  }, [duracionMs]);

  if (!visible) return null;
  return (
    <p role="status" className="rounded-lg border-2 border-exito-borde bg-exito p-3 font-medium text-exito-foreground">
      {children}
    </p>
  );
}
