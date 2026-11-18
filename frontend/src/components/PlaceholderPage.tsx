import type { ReactNode } from 'react';

type Props = { title: string; children?: ReactNode };

export function PlaceholderPage({ title, children }: Props) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-2 px-4 py-8">
      <h1 className="text-[1.75rem] font-extrabold">{title}</h1>
      <p className="text-muted-foreground">Pantalla en construcción.</p>
      {children}
    </main>
  );
}
