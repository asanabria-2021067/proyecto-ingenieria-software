'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Search, UserPlus, UserCheck, UserX, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getIniciales } from '@/components/projects/available-project-card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  useAceptarSolicitudAmistad,
  useBuscarUsuarios,
  useCrearSolicitudAmistad,
  useDejarDeSeguir,
  useEliminarAmistad,
  useRechazarSolicitudAmistad,
  useSeguirUsuario,
  useSolicitudesAmistadPendientes,
} from '@/hooks/use-social';
import { getHabilidades, getIntereses } from '@/lib/services/catalogs';
import type { UsuarioBusquedaDto } from '@/lib/types/social';

const MAX_CHIPS_VISIBLES = 3;

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  const visibles = items.slice(0, MAX_CHIPS_VISIBLES);
  const restantes = items.length - visibles.length;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {visibles.map((item) => (
        <Badge key={item} variant="secondary" className="font-normal">
          {item}
        </Badge>
      ))}
      {restantes > 0 && (
        <Badge variant="outline" className="font-normal">
          +{restantes} más
        </Badge>
      )}
    </div>
  );
}

function UsuarioCard({ usuario }: { usuario: UsuarioBusquedaDto }) {
  const crearSolicitud = useCrearSolicitudAmistad();
  const aceptarSolicitud = useAceptarSolicitudAmistad();
  const eliminarAmistad = useEliminarAmistad();
  const seguirUsuario = useSeguirUsuario();
  const dejarDeSeguir = useDejarDeSeguir();

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-surface-container-lowest border border-outline-variant/30 p-4">
      <div className="flex items-start gap-3 min-w-0">
        <Avatar>
          {usuario.fotoUrl && <AvatarImage src={usuario.fotoUrl} alt={`${usuario.nombre} ${usuario.apellido}`} />}
          <AvatarFallback>{getIniciales(usuario.nombre, usuario.apellido)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-on-surface">
            {usuario.nombre} {usuario.apellido}
          </p>
          {usuario.carrera && (
            <p className="truncate text-xs text-on-surface-variant">{usuario.carrera}</p>
          )}
          <ChipList items={usuario.habilidades} />
          <ChipList items={usuario.intereses} />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {usuario.esAmigo ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => eliminarAmistad.mutate(usuario.idUsuario)}
            disabled={eliminarAmistad.isPending}
          >
            <Check className="h-4 w-4" /> Amigos
          </Button>
        ) : usuario.solicitudPendiente?.direccion === 'enviada' ? (
          <Button variant="outline" size="sm" disabled>
            Solicitud enviada
          </Button>
        ) : usuario.solicitudPendiente?.direccion === 'recibida' ? (
          <Button
            size="sm"
            onClick={() => aceptarSolicitud.mutate(usuario.idUsuario)}
            disabled={aceptarSolicitud.isPending}
          >
            <UserCheck className="h-4 w-4" /> Aceptar solicitud
          </Button>
        ) : (
          <Button
            size="sm"
            className="text-white hover:text-white"
            onClick={() => crearSolicitud.mutate(usuario.idUsuario)}
            disabled={crearSolicitud.isPending}
          >
            <UserPlus className="h-4 w-4" /> Agregar amigo
          </Button>
        )}

        {usuario.loSigo ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => dejarDeSeguir.mutate(usuario.idUsuario)}
            disabled={dejarDeSeguir.isPending}
          >
            Siguiendo
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => seguirUsuario.mutate(usuario.idUsuario)}
            disabled={seguirUsuario.isPending}
          >
            Seguir
          </Button>
        )}
      </div>
    </div>
  );
}

function ChipToggleGroup({
  opciones,
  seleccionados,
  onToggle,
}: {
  opciones: { id: number; nombre: string }[];
  seleccionados: number[];
  onToggle: (id: number) => void;
}) {
  if (opciones.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map((opcion) => {
        const isSelected = seleccionados.includes(opcion.id);
        return (
          <button
            key={opcion.id}
            type="button"
            onClick={() => onToggle(opcion.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              isSelected
                ? 'border-primary bg-primary text-on-primary'
                : 'border-outline-variant/30 bg-surface-container-low text-on-surface hover:bg-surface-container-high'
            }`}
          >
            {opcion.nombre}
          </button>
        );
      })}
    </div>
  );
}

export default function PersonasPage() {
  const [q, setQ] = useState('');
  const [carrera, setCarrera] = useState(false);
  const [amigosDeAmigos, setAmigosDeAmigos] = useState(false);
  const [habilidadesSel, setHabilidadesSel] = useState<number[]>([]);
  const [interesesSel, setInteresesSel] = useState<number[]>([]);

  const { data: habilidades = [] } = useQuery({ queryKey: ['catalogo-habilidades'], queryFn: getHabilidades });
  const { data: intereses = [] } = useQuery({ queryKey: ['catalogo-intereses'], queryFn: getIntereses });

  const { resultados, isLoading, enabled } = useBuscarUsuarios({
    q,
    carrera,
    amigosDeAmigos,
    habilidades: habilidadesSel,
    intereses: interesesSel,
  });
  const { solicitudes } = useSolicitudesAmistadPendientes();
  const aceptarSolicitud = useAceptarSolicitudAmistad();
  const rechazarSolicitud = useRechazarSolicitudAmistad();

  function toggleHabilidad(id: number) {
    setHabilidadesSel((prev) => (prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]));
  }

  function toggleInteres(id: number) {
    setInteresesSel((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  return (
    <div className="px-8 pb-12 pt-8">
      <section className="mb-8">
        <h1 className="font-headline text-3xl font-black tracking-tight text-on-surface">Personas</h1>
        <p className="mt-1 text-on-surface-variant">Busca compañeros, sigue su actividad y hazte amigos.</p>
      </section>

      {solicitudes.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 font-headline text-lg font-bold text-on-surface">Solicitudes pendientes</h2>
          <div className="space-y-3">
            {solicitudes.map((s) => (
              <div
                key={s.idAmistad}
                className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-lowest border border-outline-variant/30 p-4"
              >
                <div className="flex items-center gap-3">
                  <Avatar>
                    {s.solicitante.fotoUrl && (
                      <AvatarImage src={s.solicitante.fotoUrl} alt={`${s.solicitante.nombre} ${s.solicitante.apellido}`} />
                    )}
                    <AvatarFallback>{getIniciales(s.solicitante.nombre, s.solicitante.apellido)}</AvatarFallback>
                  </Avatar>
                  <p className="text-sm font-semibold text-on-surface">
                    {s.solicitante.nombre} {s.solicitante.apellido}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => aceptarSolicitud.mutate(s.idAmistad)}>
                    <UserCheck className="h-4 w-4" /> Aceptar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => rechazarSolicitud.mutate(s.idAmistad)}>
                    <UserX className="h-4 w-4" /> Rechazar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-6 space-y-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o apellido..."
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm font-medium text-on-surface">
              <Checkbox checked={carrera} onCheckedChange={(v) => setCarrera(v === true)} />
              Misma carrera
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-on-surface">
              <Checkbox checked={amigosDeAmigos} onCheckedChange={(v) => setAmigosDeAmigos(v === true)} />
              Amigos de amigos
            </label>
          </div>

          {habilidades.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-wider text-on-surface-variant">Habilidades</p>
              <ChipToggleGroup
                opciones={habilidades.map((h) => ({ id: h.idHabilidad, nombre: h.nombreHabilidad }))}
                seleccionados={habilidadesSel}
                onToggle={toggleHabilidad}
              />
            </div>
          )}

          {intereses.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-wider text-on-surface-variant">Intereses</p>
              <ChipToggleGroup
                opciones={intereses.map((i) => ({ id: i.idInteres, nombre: i.nombreInteres }))}
                seleccionados={interesesSel}
                onToggle={toggleInteres}
              />
            </div>
          )}
        </div>

        {enabled && !isLoading && resultados.length === 0 && (
          <Empty tone="muted" aria-live="polite">
            <EmptyMedia variant="compact">
              <Users aria-hidden="true" className="h-6 w-6" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle className="text-lg">Sin resultados</EmptyTitle>
              <EmptyDescription>No encontramos personas con esos filtros.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        <div className="space-y-3">
          {resultados.map((usuario) => (
            <UsuarioCard key={usuario.idUsuario} usuario={usuario} />
          ))}
        </div>
      </section>
    </div>
  );
}
