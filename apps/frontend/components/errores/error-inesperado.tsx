'use client';

import Link from 'next/link';
import { Home, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CLASE_BOTON_PRINCIPAL, CLASE_BOTON_SECUNDARIO, PaginaError } from './pagina-error';

export interface ErrorInesperadoProps {
  error: Error & { digest?: string };
  reset: () => void;
  inicio: string;
}

export function ErrorInesperado({ error, reset, inicio }: ErrorInesperadoProps) {
  return (
    <PaginaError
      codigo="500"
      titulo="Algo salió mal"
      descripcion="Ocurrió un error inesperado al mostrar esta página. Puedes reintentar o volver al inicio."
      referencia={error.digest}
    >
      <Button type="button" onClick={() => reset()} className={CLASE_BOTON_PRINCIPAL}>
        <RotateCcw aria-hidden="true" />
        Reintentar
      </Button>
      <Button asChild variant="outline" className={CLASE_BOTON_SECUNDARIO}>
        <Link href={inicio}>
          <Home aria-hidden="true" />
          Volver al inicio
        </Link>
      </Button>
    </PaginaError>
  );
}
