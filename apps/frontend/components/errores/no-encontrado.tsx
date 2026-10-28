'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CLASE_BOTON_PRINCIPAL, CLASE_BOTON_SECUNDARIO, PaginaError } from './pagina-error';
import { useRutaInicio } from './use-ruta-inicio';

export function NoEncontrado({ variante = 'pantalla' }: { variante?: 'pantalla' | 'seccion' }) {
  const inicio = useRutaInicio();
  const router = useRouter();

  function regresar() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(inicio);
    }
  }

  return (
    <PaginaError
      codigo="404"
      titulo="Página no encontrada"
      descripcion="La página que buscas no existe, cambió de dirección o ya no está disponible."
      variante={variante}
    >
      <Button asChild className={CLASE_BOTON_PRINCIPAL}>
        <Link href={inicio}>
          <Home aria-hidden="true" />
          Volver al inicio
        </Link>
      </Button>
      <Button type="button" variant="outline" onClick={regresar} className={CLASE_BOTON_SECUNDARIO}>
        <ArrowLeft aria-hidden="true" />
        Regresar
      </Button>
    </PaginaError>
  );
}
