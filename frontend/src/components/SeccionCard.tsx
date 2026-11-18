import type { ComponentProps, ElementType, ReactNode } from 'react';
import { cn } from 'cn';
import { Card, CardContent } from '@/components/ui/card';

// A landmark `section` drawn as one Card. The section keeps its own aria attributes; the Card is only the look.
export function SeccionCard({ className, children, ...props }: ComponentProps<'section'>) {
  return (
    <section {...props}>
      <Card>
        <CardContent className={cn('flex flex-col gap-3', className)}>{children}</CardContent>
      </Card>
    </section>
  );
}

// Heading row with a small decorative icon. The heading keeps its text (and level) as its accessible name.
export function TituloSeccion({
  icono: Icono,
  as: Tag = 'h2',
  className,
  children,
  ...props
}: Omit<ComponentProps<'h2'>, 'children'> & { icono?: ElementType; as?: 'h2' | 'h3'; children: ReactNode }) {
  return (
    <Tag className={cn('flex items-center gap-2 font-heading text-lg font-bold', className)} {...props}>
      {Icono && <Icono aria-hidden="true" className="size-5 shrink-0 text-primary" />}
      {children}
    </Tag>
  );
}
