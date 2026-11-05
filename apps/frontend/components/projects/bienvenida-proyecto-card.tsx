'use client';

import { useState } from 'react';
import { MessageSquareHeart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useBienvenida, useGuardarBienvenida } from '@/hooks/use-perfil-portafolio';

const MAX_BIENVENIDA = 1000;

function Editor({ idProyecto, mensaje, porDefecto }: { idProyecto: number; mensaje: string | null; porDefecto: string }) {
  const [texto, setTexto] = useState(mensaje ?? '');
  const guardar = useGuardarBienvenida(idProyecto);
  const sinCambios = texto.trim() === (mensaje ?? '').trim();

  return (
    <div className="space-y-tight">
      <Textarea
        aria-label="Mensaje de bienvenida"
        value={texto}
        maxLength={MAX_BIENVENIDA}
        placeholder={porDefecto}
        onChange={(e) => setTexto(e.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-tight">
        <p className="type-meta">
          Usa {'{nombre}'} y {'{proyecto}'} para personalizarlo. Si lo dejas vacío se usa el mensaje por defecto. {texto.length}/{MAX_BIENVENIDA}
        </p>
        <div className="flex gap-tight">
          {mensaje && (
            <Button type="button" variant="ghost" size="sm" disabled={guardar.isPending} onClick={() => { setTexto(''); guardar.mutate(null); }}>
              Restablecer
            </Button>
          )}
          <Button type="button" size="sm" disabled={sinCambios || guardar.isPending} onClick={() => guardar.mutate(texto.trim() || null)}>
            Guardar mensaje
          </Button>
        </div>
      </div>
    </div>
  );
}

/** MEJ-102: el líder edita el texto que se envía a #general en su nombre cuando alguien entra al equipo. */
export function BienvenidaProyectoCard({ idProyecto }: { idProyecto: number }) {
  const { data, isLoading, isError } = useBienvenida(idProyecto);
  if (isLoading) return <Skeleton className="mb-6 h-32 rounded-card" aria-label="Cargando mensaje de bienvenida" />;
  if (isError || !data) return null;

  return (
    <section className="card-base mb-6 space-y-stack" aria-labelledby="bienvenida-titulo">
      <div className="space-y-micro">
        <h2 id="bienvenida-titulo" className="type-subtitle flex items-center gap-tight text-text-primary">
          <MessageSquareHeart className="size-4 text-primary" aria-hidden="true" />
          Mensaje de bienvenida
        </h2>
        <p className="type-meta">Al aceptar a alguien, se envía este mensaje al canal #general del proyecto como si lo escribieras tú.</p>
      </div>
      <Editor key={data.mensaje ?? 'defecto'} idProyecto={idProyecto} mensaje={data.mensaje} porDefecto={data.porDefecto} />
    </section>
  );
}
