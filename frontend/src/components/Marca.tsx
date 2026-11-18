import { GraduationCap } from 'lucide-react';

// Praxis logotype shared by the student and office headers. The icon is decorative.
export function Marca() {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-white/15 text-encabezado-foreground">
        <GraduationCap className="size-5" />
      </span>
      <span className="font-heading text-xl font-extrabold tracking-tight">Praxis</span>
    </span>
  );
}
