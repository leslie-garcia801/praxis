import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { cn } from 'cn';
import { Field } from './Field';

type Props = Omit<ComponentProps<typeof Field>, 'type' | 'trailing'>;

// Password input with a show/hide toggle, so the user can check what was typed (useful on phones; RNF-09).
export function PasswordField({ className, ...props }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <Field
      {...props}
      type={visible ? 'text' : 'password'}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      className={cn('pr-12', className)}
      trailing={
        <button
          type="button"
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          className="flex size-11 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {visible ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
        </button>
      }
    />
  );
}
