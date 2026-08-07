import * as React from 'react';

import {cn} from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({className, ...props}, ref) => {
    return (
      <textarea
        className={cn(
          // Mesmo motivo do Input: radius fixo em vez de "rounded-md" (que
          // herdaria --radius: 2rem do tema) — em textareas compactas ou sem
          // padding próprio (ver documento-oficial-body.tsx), esse arredondamento
          // ficava maior que a caixa e cortava o texto nas pontas.
          'flex min-h-[40px] w-full rounded-[8px] border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export {Textarea};

    