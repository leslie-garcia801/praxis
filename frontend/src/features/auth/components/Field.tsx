import type { ComponentProps, ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = Omit<ComponentProps<typeof Input>, 'id'> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  // Control placed inside the input, on the right (e.g. the show-password button).
  trailing?: ReactNode;
};

// Labelled input whose error and hint are linked with aria-describedby (RNF-09).
export function Field({ id, label, error, hint, trailing, ...inputProps }: Props) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  const input = <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...inputProps} />;

  return (
    // min-w-0 lets the field shrink inside grid/flex rows instead of overflowing into its neighbour.
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {trailing ? (
        <div className="relative">
          {input}
          <div className="absolute inset-y-0 right-0 flex items-center">{trailing}</div>
        </div>
      ) : (
        input
      )}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
