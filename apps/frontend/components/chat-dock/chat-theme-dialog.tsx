'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CHAT_TEMAS } from '@/lib/chat-temas';
import type { ChatTemaColor } from '@/lib/types/chat';

const SIN_TEMA = 'predeterminado';

interface ChatThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ChatTemaColor | null;
  onChange: (tema: ChatTemaColor | null) => void;
}

/** Selector del tema propio: radiogroup con flechas/Tab de Radix y nombre textual de cada color. */
export function ChatThemeDialog({ open, onOpenChange, value, onChange }: ChatThemeDialogProps) {
  const opciones = [
    { clave: SIN_TEMA, nombre: 'Predeterminado', muestra: 'bg-primary' },
    ...(Object.keys(CHAT_TEMAS) as ChatTemaColor[]).map((clave) => ({
      clave,
      nombre: CHAT_TEMAS[clave].nombre,
      muestra: CHAT_TEMAS[clave].muestra,
    })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[380px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
          <DialogTitle className="text-xl font-bold text-on-surface">Tema de color</DialogTitle>
          <DialogDescription className="text-sm text-on-surface-variant">
            Solo cambia cómo ves esta conversación; las demás personas no se ven afectadas.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          aria-label="Tema de color de la conversación"
          value={value ?? SIN_TEMA}
          onValueChange={(clave) => onChange(clave === SIN_TEMA ? null : (clave as ChatTemaColor))}
          className="gap-1 px-4 py-4"
        >
          {opciones.map(({ clave, nombre, muestra }) => (
            <label
              key={clave}
              htmlFor={`chat-tema-${clave}`}
              className="flex cursor-pointer items-center gap-3 rounded-control px-2 py-2 text-sm text-on-surface hover:bg-on-surface/10"
            >
              <RadioGroupItem id={`chat-tema-${clave}`} value={clave} />
              <span aria-hidden="true" className={`size-5 shrink-0 rounded-full border border-outline-variant ${muestra}`} />
              {nombre}
            </label>
          ))}
        </RadioGroup>
      </DialogContent>
    </Dialog>
  );
}
