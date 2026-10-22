'use client';

import { ErrorInesperado } from '@/components/errores/error-inesperado';
import { useRutaInicio } from '@/components/errores/use-ruta-inicio';

export default function ErrorDeAplicacion({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const inicio = useRutaInicio();
  return <ErrorInesperado error={error} reset={reset} inicio={inicio} />;
}
