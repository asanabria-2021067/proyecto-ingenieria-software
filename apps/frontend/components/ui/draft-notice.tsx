import { History } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/** Aviso de borrador recuperado, con la acción para descartarlo. */
export function DraftNotice({ onDescartar }: { onDescartar: () => void }) {
  return (
    <Alert variant="attention" role="status" className="items-center">
      <History aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>Recuperamos un borrador que no habías enviado.</span>
        <Button type="button" variant="ghost" size="sm" onClick={onDescartar}>
          Descartar borrador
        </Button>
      </AlertDescription>
    </Alert>
  );
}
