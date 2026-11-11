import { Button } from '@/components/ui/button';

// Load error with a retry button; the message is already in Spanish.
export function ErrorConReintento({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p role="alert" className="text-destructive">
        {message}
      </p>
      <Button type="button" variant="outline" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
