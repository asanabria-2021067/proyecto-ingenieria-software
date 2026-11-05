'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Search, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { useAsistenteReuniones } from '@/hooks/use-perfil-portafolio';
import { buscarUsuarios } from '@/lib/services/social';
import type { AsistenteReuniones } from '@/lib/services/perfil-portafolio';
import type { UsuarioResumenDto } from '@/lib/types/social';
import { etiquetaHora } from '@/components/profile/disponibilidad-semanal';
import { iniciales } from './invitados-field';

export { etiquetaHora };

const MIN_BUSQUEDA = 2;
const MAX_INVITADOS = 10;
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** Fecha `YYYY-MM-DD` sin pasar por la zona horaria del navegador. */
function partesFecha(fecha: string) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return { diaSemana: new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay(), dia, mes };
}
export const etiquetaFecha = (fecha: string) => {
  const { diaSemana, dia, mes } = partesFecha(fecha);
  return `${DIAS_CORTOS[diaSemana]} ${dia}/${mes}`;
};

function Persona({ nombre, apellido, fotoUrl }: { nombre: string; apellido: string; fotoUrl: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-tight">
      <Avatar className="size-7 shrink-0">
        {fotoUrl && <AvatarImage src={fotoUrl} alt="" />}
        <AvatarFallback className="text-xs font-bold">{iniciales(nombre, apellido)}</AvatarFallback>
      </Avatar>
      <span className="type-body truncate text-text-primary">
        {nombre} {apellido}
      </span>
    </span>
  );
}

/** Cuadrícula de un día: una fila por persona, una celda por hora. Solo «libre» u «ocupado»: nunca el detalle de un evento. */
function VistaDia({ datos, fecha }: { datos: AsistenteReuniones; fecha: string }) {
  const horas = Array.from({ length: datos.horaFin - datos.horaInicio }, (_, i) => datos.horaInicio + i);
  return (
    <div className="overflow-x-auto" tabIndex={0} aria-label={`Disponibilidad del ${etiquetaFecha(fecha)}`}>
      <table className="w-full min-w-[40rem] border-separate border-spacing-px">
        <thead>
          <tr>
            <th scope="col" className="type-meta w-40 text-left font-medium">
              Persona
            </th>
            {horas.map((h) => (
              <th key={h} scope="col" className="type-meta text-center font-medium">
                {String(h).padStart(2, '0')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datos.personas.map((p) => {
            const dia = p.dias.find((d) => d.fecha === fecha);
            return (
              <tr key={p.idUsuario}>
                <th scope="row" className="w-40 py-micro pr-tight text-left font-normal">
                  <Persona nombre={p.nombre} apellido={p.apellido} fotoUrl={p.fotoUrl} />
                </th>
                {horas.map((h) => {
                  const libre = dia?.libres.includes(h) ?? false;
                  return (
                    <td key={h} className={`h-7 rounded-sm text-center ${libre ? 'bg-primary' : 'bg-surface-container-high'}`}>
                      <span className="sr-only">
                        {p.nombre} {etiquetaHora(h)}: {libre ? 'libre' : 'ocupado'}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="mt-tight flex flex-wrap gap-tight" aria-label="Tus fechas límite del día">
        {datos.personas
          .filter((p) => p.esYo && p.dias.find((d) => d.fecha === fecha)?.fechaLimite)
          .map((p) => (
            <li key={p.idUsuario}>
              <Tag tone="amber" size="sm">
                Tienes una fecha límite
              </Tag>
            </li>
          ))}
      </ul>
    </div>
  );
}

/** Resumen de la semana: horas libres por persona y día. */
function VistaSemana({ datos, onElegir }: { datos: AsistenteReuniones; onElegir: (fecha: string) => void }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} aria-label="Disponibilidad de la semana">
      <table className="w-full min-w-[34rem] border-separate border-spacing-px">
        <thead>
          <tr>
            <th scope="col" className="type-meta w-40 text-left font-medium">
              Persona
            </th>
            {datos.fechas.map((f) => (
              <th key={f} scope="col" className="type-meta text-center font-medium">
                <button type="button" className="rounded-sm px-1 hover:underline focus-visible:outline-2" onClick={() => onElegir(f)}>
                  {etiquetaFecha(f)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datos.personas.map((p) => (
            <tr key={p.idUsuario}>
              <th scope="row" className="w-40 py-micro pr-tight text-left font-normal">
                <Persona nombre={p.nombre} apellido={p.apellido} fotoUrl={p.fotoUrl} />
              </th>
              {p.dias.map((d) => (
                <td key={d.fecha} className={`type-meta h-8 rounded-sm text-center ${d.libres.length > 0 ? 'bg-primary/15 text-text-primary' : 'bg-surface-container-high'}`}>
                  {d.libres.length} h libres{d.fechaLimite && <span className="sr-only">, con fecha límite</span>}
                  {d.fechaLimite && <span aria-hidden="true"> *</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="type-meta mt-micro">* Tienes una fecha límite ese día.</p>
    </div>
  );
}

/**
 * MEJ-142: asistente para agendar reuniones. Eliges invitados, ves quién está libre por día o por semana
 * y se sugieren las primeras 3 franjas libres para todos. Considera eventos, no molestar y la disponibilidad
 * semanal del perfil; de los eventos ajenos solo se sabe que la persona está ocupada.
 */
export function AsistenteReunionesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [busqueda, setBusqueda] = useState('');
  const [invitados, setInvitados] = useState<UsuarioResumenDto[]>([]);
  const [desde, setDesde] = useState('');
  const [horas, setHoras] = useState(1);
  const [vista, setVista] = useState<'semana' | 'dia'>('semana');
  const [diaElegido, setDiaElegido] = useState<string | null>(null);

  const termino = busqueda.trim();
  const { data: encontrados, isFetching } = useQuery({
    queryKey: ['asistente-reuniones-busqueda', termino],
    queryFn: () => buscarUsuarios({ q: termino }),
    enabled: open && termino.length >= MIN_BUSQUEDA,
  });
  const disponibles = (encontrados?.items ?? []).filter((u) => !invitados.some((i) => i.idUsuario === u.idUsuario)).slice(0, 5);

  const { data, isLoading, isError } = useAsistenteReuniones({
    invitados: invitados.map((i) => i.idUsuario),
    desde: desde || undefined,
    dias: 7,
    horas,
  });
  const fechaActiva = diaElegido && data?.fechas.includes(diaElegido) ? diaElegido : data?.fechas[0];

  const elegirDia = (fecha: string) => {
    setDiaElegido(fecha);
    setVista('dia');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-tight">
            <CalendarClock className="size-5 text-primary" aria-hidden="true" />
            Buscar horario para una reunión
          </DialogTitle>
          <DialogDescription>
            Elige a quién invitar y mira cuándo están libres. Hora de Guatemala; de los eventos de otras personas solo se sabe si están ocupadas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-stack">
          <div className="space-y-tight">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar personas por nombre"
                aria-label="Buscar personas para invitar"
                className="pl-9"
                disabled={invitados.length >= MAX_INVITADOS}
              />
            </div>
            {termino.length >= MIN_BUSQUEDA && (
              <ul className="divide-y divide-outline-variant rounded-control border border-outline-variant" aria-label="Resultados">
                {isFetching && disponibles.length === 0 ? (
                  <li className="p-tight"><Skeleton className="h-7 w-full" /></li>
                ) : disponibles.length === 0 ? (
                  <li className="type-meta p-tight">Sin resultados.</li>
                ) : (
                  disponibles.map((u) => (
                    <li key={u.idUsuario}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-tight p-tight text-left hover:bg-surface-container"
                        onClick={() => {
                          setInvitados((prev) => [...prev, u]);
                          setBusqueda('');
                        }}
                      >
                        <Persona nombre={u.nombre} apellido={u.apellido} fotoUrl={u.fotoUrl} />
                        <span className="type-meta">Agregar</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
            {invitados.length > 0 && (
              <ul className="flex flex-wrap gap-tight" aria-label="Invitados">
                {invitados.map((u) => (
                  <li key={u.idUsuario} className="pill pill-accent inline-flex items-center gap-1 pr-1">
                    {u.nombre} {u.apellido}
                    <button
                      type="button"
                      aria-label={`Quitar a ${u.nombre} ${u.apellido}`}
                      onClick={() => setInvitados((prev) => prev.filter((i) => i.idUsuario !== u.idUsuario))}
                      className="inline-flex size-4 items-center justify-center rounded-sm hover:bg-on-surface/10"
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-stack">
            <label className="type-meta flex flex-col gap-micro">
              Desde
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Fecha inicial" className="w-44" />
            </label>
            <label className="type-meta flex flex-col gap-micro">
              Duración
              <Select value={String(horas)} onValueChange={(v) => setHoras(Number(v))}>
                <SelectTrigger aria-label="Duración de la reunión" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3].map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {h} {h === 1 ? 'hora' : 'horas'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="flex gap-micro rounded-control border border-outline-variant p-micro" role="group" aria-label="Tipo de vista">
              {(['semana', 'dia'] as const).map((v) => (
                <Button key={v} type="button" size="sm" variant={vista === v ? 'default' : 'ghost'} aria-pressed={vista === v} onClick={() => setVista(v)}>
                  {v === 'semana' ? 'Semana' : 'Día'}
                </Button>
              ))}
            </div>
          </div>

          {invitados.length === 0 ? (
            <p className="type-body text-text-secondary">Agrega al menos una persona para ver su disponibilidad.</p>
          ) : isLoading ? (
            <Skeleton className="h-40 w-full" aria-label="Cargando disponibilidad" />
          ) : isError || !data ? (
            <p role="alert" className="type-body text-error">No pudimos cargar la disponibilidad. Inténtalo de nuevo.</p>
          ) : (
            <>
              <section aria-labelledby="franjas-titulo" className="space-y-tight">
                <h3 id="franjas-titulo" className="type-subtitle">Franjas libres para todos</h3>
                {data.sugerencias.length === 0 ? (
                  <p className="type-body text-text-secondary">No hay una franja libre para todos en estos días. Prueba con otra fecha o una reunión más corta.</p>
                ) : (
                  <ul className="flex flex-wrap gap-tight">
                    {data.sugerencias.map((s) => (
                      <li key={`${s.fecha}-${s.horaInicio}`}>
                        <Button type="button" variant="outline" size="sm" onClick={() => elegirDia(s.fecha)}>
                          {etiquetaFecha(s.fecha)}, {etiquetaHora(s.horaInicio)} a {etiquetaHora(s.horaFin)}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {data.personas.some((p) => p.sinDisponibilidad) && (
                  <p className="type-meta">
                    Quien no ha marcado su disponibilidad semanal se toma como libre entre {etiquetaHora(data.horaInicio)} y {etiquetaHora(data.horaFin)}.
                  </p>
                )}
              </section>
              {vista === 'semana' || !fechaActiva ? (
                <VistaSemana datos={data} onElegir={elegirDia} />
              ) : (
                <VistaDia datos={data} fecha={fechaActiva} />
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
