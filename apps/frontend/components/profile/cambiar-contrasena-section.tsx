'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { aviso } from '@/lib/mensajes';
import { cambiarContrasena, sesionesQueryKey } from '@/lib/services/cuenta';
import { MAX_CONTRASENA, MIN_CONTRASENA } from '@/lib/validators/contrasena';

interface Campos {
  actual: string;
  nueva: string;
  confirmar: string;
}

const VACIOS: Campos = { actual: '', nueva: '', confirmar: '' };

/** Misma política que el registro y el restablecimiento (largo mínimo y máximo); el resto lo valida el servidor. */
function validar({ actual, nueva, confirmar }: Campos): Partial<Record<keyof Campos, string>> {
  const errores: Partial<Record<keyof Campos, string>> = {};
  if (!actual) errores.actual = 'Escribe tu contraseña actual.';
  if (nueva.length < MIN_CONTRASENA) errores.nueva = `La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres.`;
  else if (nueva.length > MAX_CONTRASENA) errores.nueva = `La contraseña no puede tener más de ${MAX_CONTRASENA} caracteres.`;
  else if (nueva === actual) errores.nueva = 'La nueva contraseña debe ser distinta de la actual.';
  if (!confirmar) errores.confirmar = 'Confirma la nueva contraseña.';
  else if (confirmar !== nueva) errores.confirmar = 'Las contraseñas no coinciden.';
  return errores;
}

/** MEJ-83: cambio de contraseña. Las cookies nuevas de esta sesión las fija el servidor; las demás sesiones se cierran. */
export function CambiarContrasenaSection() {
  const queryClient = useQueryClient();
  const [campos, setCampos] = useState<Campos>(VACIOS);
  const [errores, setErrores] = useState<Partial<Record<keyof Campos, string>>>({});
  const [errorServidor, setErrorServidor] = useState('');
  const [exito, setExito] = useState(false);

  const cambiar = useMutation({
    mutationFn: ({ actual, nueva }: Campos) => cambiarContrasena(actual, nueva),
    onSuccess: () => {
      setCampos(VACIOS);
      setExito(true);
      aviso.exito('Contraseña actualizada', 'Se cerraron tus otras sesiones.');
      void queryClient.invalidateQueries({ queryKey: sesionesQueryKey });
    },
    onError: (error: Error) =>
      setErrorServidor(
        getApiErrorStatus(error) === 429
          ? 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.'
          : getApiErrorMessage(error, 'general', 'No se pudo cambiar la contraseña.'),
      ),
  });

  const actualizar = (campo: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCampos((previos) => ({ ...previos, [campo]: e.target.value }));

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setExito(false);
    setErrorServidor('');
    const encontrados = validar(campos);
    setErrores(encontrados);
    if (Object.keys(encontrados).length === 0) cambiar.mutate(campos);
  };

  const campo = (clave: keyof Campos, id: string, etiqueta: string, autoComplete: string) => {
    const error = errores[clave] ?? (clave === 'actual' && errorServidor ? errorServidor : '');
    return (
      <div className="flex flex-col gap-tight">
        <Label htmlFor={id}>{etiqueta}</Label>
        <Input
          id={id}
          type="password"
          autoComplete={autoComplete}
          value={campos[clave]}
          onChange={actualizar(clave)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error && (
          <p id={`${id}-error`} role="alert" className="type-meta text-error">
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <section id="cambiar-contrasena" aria-labelledby="cambiar-contrasena-titulo" className="card-base scroll-mt-24 p-card">
      <h2 id="cambiar-contrasena-titulo" className="type-section">
        Cambiar contraseña
      </h2>
      <p className="type-body mt-tight max-w-2xl text-text-secondary">
        Al cambiarla, se cerrarán tus sesiones en los demás dispositivos. Esta sesión sigue abierta.
      </p>

      <form onSubmit={enviar} noValidate className="mt-stack flex max-w-md flex-col gap-stack">
        {campo('actual', 'contrasena-actual', 'Contraseña actual', 'current-password')}
        {campo('nueva', 'contrasena-nueva', 'Nueva contraseña', 'new-password')}
        {campo('confirmar', 'contrasena-confirmar', 'Confirmar nueva contraseña', 'new-password')}
        <div>
          <Button type="submit" disabled={cambiar.isPending}>
            {cambiar.isPending ? 'Guardando…' : 'Cambiar contraseña'}
          </Button>
        </div>
        <p role="status" aria-live="polite" className="type-meta">
          {exito ? 'Contraseña actualizada. Se cerraron tus otras sesiones.' : ''}
        </p>
      </form>
    </section>
  );
}
