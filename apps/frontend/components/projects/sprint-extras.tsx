'use client';

import { useState, type FormEvent } from 'react';
import { AlertCircle, Download, FileText, Handshake, Loader2, MessageSquareText, Sparkles } from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useReconocimientosSprint, useRetrospectivaSprint, useSprintReport } from '@/hooks/use-seguimiento';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { PROJECT_ACTION_BUTTON_CLASS } from '@/components/projects/project-action-button';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type { ReconocimientoDTO, RetrospectivaInput } from '@/lib/services/seguimiento';
import type { EstadoSprint } from '@/lib/types/sprints';

const MAX_MENSAJE = 280;
const MAX_RETRO = 1000;

function nombre(p: { nombre: string; apellido: string }) {
  return `${p.nombre} ${p.apellido}`;
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleDateString('es-GT', { year: 'numeric', month: 'short', day: 'numeric' });
}

function Titulo({ id, icon: Icon, children }: { id: string; icon: typeof Sparkles; children: React.ReactNode }) {
  return (
    <h2 id={id} className="type-section flex items-center gap-2">
      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
      {children}
    </h2>
  );
}

function ErrorSeccion({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <Empty tone="danger" size="compact" role="alert">
      <EmptyMedia variant="icon">
        <AlertCircle aria-hidden="true" className="size-6" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{mensaje}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" variant="outline" size="sm" onClick={onReintentar}>
          Reintentar
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/** MEJ-23: descarga del reporte del Sprint (solo el líder; el backend lo exige igual). */
export function SprintReportButtons({ idProyecto, idSprint }: { idProyecto: number; idSprint: number }) {
  const { csv, pdf } = useSprintReport(idProyecto, idSprint);
  const error = csv.isError ? csv.error : pdf.isError ? pdf.error : null;

  return (
    <div className="flex flex-col items-start gap-1.5" data-slot="sprint-report-buttons">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => csv.mutate()} disabled={csv.isPending} className={PROJECT_ACTION_BUTTON_CLASS}>
          {csv.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Download className="size-3.5" aria-hidden="true" />}
          {csv.isPending ? 'Generando...' : 'Reporte CSV'}
        </Button>
        <Button type="button" onClick={() => pdf.mutate()} disabled={pdf.isPending} className={PROJECT_ACTION_BUTTON_CLASS}>
          {pdf.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <FileText className="size-3.5" aria-hidden="true" />}
          {pdf.isPending ? 'Generando...' : 'Reporte PDF'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-error">
          {getApiErrorMessage(error, 'general', 'No se pudo generar el reporte. Intenta de nuevo.')}
        </p>
      )}
    </div>
  );
}

/** Tarjetas de los reconocimientos ya dados en el Sprint. */
export function ListaReconocimientos({ items }: { items: ReconocimientoDTO[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 md:[&>:last-child:nth-child(odd)]:col-span-2" aria-label="Reconocimientos del sprint">
      {items.map((r) => (
        <li key={r.idReconocimiento} className="card-base flex flex-col gap-1">
          <p className="type-body text-text-primary">&ldquo;{r.mensaje}&rdquo;</p>
          <p className="type-meta text-text-secondary">
            {nombre(r.autor)} reconoció a <span className="font-semibold text-text-primary">{nombre(r.receptor)}</span> · {fechaHora(r.creadoEn)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * MEJ-57: reconocimientos entre compañeros. Cada integrante da uno por Sprint mientras sigue
 * abierto; quien ya reconoció, o el Sprint cerrado, ve solo la lista.
 */
export interface CandidatoReconocimiento {
  idUsuario: number;
  nombre: string;
  apellido: string;
}

/** Líder e integrantes activos, sin repetidos ni la propia persona. */
export function candidatosAReconocer(
  creador: CandidatoReconocimiento | undefined,
  members: CandidatoReconocimiento[],
  idUsuarioActual: number | null,
): CandidatoReconocimiento[] {
  return [...(creador ? [creador] : []), ...members]
    .map(({ idUsuario, nombre, apellido }) => ({ idUsuario, nombre, apellido }))
    .filter((p, i, todos) => p.idUsuario !== idUsuarioActual && todos.findIndex((q) => q.idUsuario === p.idUsuario) === i);
}

export function SprintReconocimientos({
  idProyecto,
  idSprint,
  estado,
  idUsuarioActual,
  candidatos,
}: {
  idProyecto: number;
  idSprint: number;
  estado: EstadoSprint;
  idUsuarioActual: number | null;
  candidatos: CandidatoReconocimiento[];
}) {
  const { data, isLoading, isError, refetch, reconocer } = useReconocimientosSprint(idProyecto, idSprint);
  const [receptor, setReceptor] = useState('');
  const [mensaje, setMensaje] = useState('');
  const abierto = estado !== 'CERRADO';
  const puedeReconocer = abierto && !!data && !data.yaReconoci && idUsuarioActual !== null;
  const mensajeValido = mensaje.trim().length >= 3 && mensaje.length <= MAX_MENSAJE;

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!receptor || !mensajeValido) return;
    reconocer.mutate(
      { idReceptor: Number(receptor), mensaje: mensaje.trim() },
      {
        onSuccess: () => {
          setReceptor('');
          setMensaje('');
        },
      },
    );
  }

  return (
    <section aria-labelledby="sprint-reconocimientos" className="space-y-3" data-slot="sprint-reconocimientos">
      <Titulo id="sprint-reconocimientos" icon={Handshake}>
        Reconocimientos del equipo
      </Titulo>

      {isLoading ? (
        <SkeletonRegion label="Cargando reconocimientos" className="space-y-2">
          <Skeleton className="h-16 w-full rounded-card" />
        </SkeletonRegion>
      ) : isError || !data ? (
        <ErrorSeccion mensaje="No se pudieron cargar los reconocimientos." onReintentar={() => void refetch()} />
      ) : (
        <>
          {puedeReconocer && (
            <form onSubmit={enviar} className="card-base space-y-3" aria-label="Reconocer a un compañero">
              <p className="type-body text-text-secondary">
                Puedes reconocer a una persona del equipo en este sprint. Solo se permite un reconocimiento por persona y por sprint.
              </p>
              <Select value={receptor} onValueChange={setReceptor}>
                <SelectTrigger aria-label="Compañero a reconocer" className="w-full md:w-80">
                  <SelectValue placeholder="Elige a un compañero" />
                </SelectTrigger>
                <SelectContent>
                  {candidatos.map((c) => (
                    <SelectItem key={c.idUsuario} value={String(c.idUsuario)}>
                      {nombre(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div>
                <Textarea
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  maxLength={MAX_MENSAJE}
                  rows={3}
                  aria-label="Motivo del reconocimiento"
                  placeholder="¿Qué hizo que merezca este reconocimiento?"
                />
                <p className="mt-1 text-right text-xs text-text-secondary">
                  {mensaje.length}/{MAX_MENSAJE}
                </p>
              </div>
              {reconocer.isError && (
                <p role="alert" className="text-xs font-medium text-error">
                  {getApiErrorMessage(reconocer.error, 'general', 'No se pudo enviar el reconocimiento.')}
                </p>
              )}
              <Button type="submit" size="sm" disabled={!receptor || !mensajeValido || reconocer.isPending}>
                {reconocer.isPending ? 'Enviando...' : 'Enviar reconocimiento'}
              </Button>
            </form>
          )}

          {data.reconocimientos.length > 0 ? (
            <ListaReconocimientos items={data.reconocimientos} />
          ) : (
            <Empty tone="muted" size="compact" role="status">
              <EmptyMedia variant="icon">
                <Sparkles aria-hidden="true" className="size-6" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Todavía no hay reconocimientos en este sprint</EmptyTitle>
                <EmptyDescription>
                  {abierto
                    ? 'Sé la primera persona en reconocer el trabajo de un compañero.'
                    : 'El sprint ya cerró, por lo que no se pueden agregar más.'}
                </EmptyDescription>
              </EmptyHeader>
              {puedeReconocer && (
                <EmptyContent>
                  <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('sprint-reconocimientos')?.scrollIntoView({ block: 'center' })}>
                    Reconocer a alguien
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          )}
        </>
      )}
    </section>
  );
}

/** Versión conectada: toma al líder y al equipo del proyecto (para la vista del Sprint, que ya tiene el proyecto cargado). */
export function SprintReconocimientosEquipo(props: Omit<Parameters<typeof SprintReconocimientos>[0], 'candidatos'>) {
  const { data: proyecto } = useProjectDetail(props.idProyecto);
  const { members } = useProjectMembers(props.idProyecto);
  return <SprintReconocimientos {...props} candidatos={candidatosAReconocer(proyecto?.creador, members, props.idUsuarioActual)} />;
}

const CAMPOS_RETRO: { clave: keyof RetrospectivaInput; etiqueta: string; ayuda: string }[] = [
  { clave: 'quePaso', etiqueta: '¿Qué pasó en el sprint?', ayuda: 'Lo que salió bien y lo que no.' },
  { clave: 'quePodriaMejorar', etiqueta: '¿Qué podría mejorar?', ayuda: 'Aprendizajes para el siguiente sprint.' },
  { clave: 'acuerdos', etiqueta: 'Acuerdos del equipo', ayuda: 'Compromisos concretos para adelante.' },
];

/**
 * MEJ-24: retrospectiva opcional. La escribe el líder cuando el Sprint ya no está activo y queda
 * registrada en la bitácora del proyecto; el resto del equipo solo la lee.
 */
export function SprintRetrospectiva({
  idProyecto,
  idSprint,
  estado,
  esLider,
}: {
  idProyecto: number;
  idSprint: number;
  estado: EstadoSprint;
  esLider: boolean;
}) {
  const { data, isLoading, isError, refetch, guardar } = useRetrospectivaSprint(idProyecto, idSprint);
  const [editando, setEditando] = useState(false);
  const [valores, setValores] = useState<RetrospectivaInput>({ quePaso: '', quePodriaMejorar: '', acuerdos: '' });
  const puedeEscribir = esLider && estado !== 'ACTIVO';
  const valido = CAMPOS_RETRO.every(({ clave }) => valores[clave].trim().length >= 3);

  function abrirEditor() {
    setValores(data ? { quePaso: data.quePaso, quePodriaMejorar: data.quePodriaMejorar, acuerdos: data.acuerdos } : { quePaso: '', quePodriaMejorar: '', acuerdos: '' });
    setEditando(true);
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!valido) return;
    guardar.mutate(
      { quePaso: valores.quePaso.trim(), quePodriaMejorar: valores.quePodriaMejorar.trim(), acuerdos: valores.acuerdos.trim() },
      { onSuccess: () => setEditando(false) },
    );
  }

  return (
    <section aria-labelledby="sprint-retrospectiva" className="space-y-3" data-slot="sprint-retrospectiva">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Titulo id="sprint-retrospectiva" icon={MessageSquareText}>
          Retrospectiva (opcional)
        </Titulo>
        {puedeEscribir && data && !editando && (
          <Button type="button" variant="outline" size="sm" onClick={abrirEditor}>
            Editar
          </Button>
        )}
      </div>

      {isLoading ? (
        <SkeletonRegion label="Cargando la retrospectiva" className="space-y-2">
          <Skeleton className="h-28 w-full rounded-card" />
        </SkeletonRegion>
      ) : isError ? (
        <ErrorSeccion mensaje="No se pudo cargar la retrospectiva." onReintentar={() => void refetch()} />
      ) : editando ? (
        <form onSubmit={enviar} className="card-base space-y-4" aria-label="Retrospectiva del sprint">
          {CAMPOS_RETRO.map(({ clave, etiqueta, ayuda }) => (
            <div key={clave}>
              <label htmlFor={`retro-${clave}`} className="text-sm font-semibold text-text-primary">
                {etiqueta}
              </label>
              <p className="text-xs text-text-secondary">{ayuda}</p>
              <Textarea
                id={`retro-${clave}`}
                className="mt-1"
                rows={3}
                maxLength={MAX_RETRO}
                value={valores[clave]}
                onChange={(e) => setValores((v) => ({ ...v, [clave]: e.target.value }))}
              />
            </div>
          ))}
          {guardar.isError && (
            <p role="alert" className="text-xs font-medium text-error">
              {getApiErrorMessage(guardar.error, 'general', 'No se pudo guardar la retrospectiva.')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={!valido || guardar.isPending}>
              {guardar.isPending ? 'Guardando...' : 'Guardar retrospectiva'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : data ? (
        <dl className="card-base space-y-3">
          {CAMPOS_RETRO.map(({ clave, etiqueta }) => (
            <div key={clave}>
              <dt className="text-xs font-semibold text-text-secondary">{etiqueta}</dt>
              <dd className="type-body whitespace-pre-line text-text-primary">{data[clave]}</dd>
            </div>
          ))}
          <p className="type-meta text-text-secondary">Actualizada el {fechaHora(data.actualizadaEn)}</p>
        </dl>
      ) : (
        <Empty tone="muted" size="compact" role="status">
          <EmptyMedia variant="icon">
            <MessageSquareText aria-hidden="true" className="size-6" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Este sprint no tiene retrospectiva</EmptyTitle>
            <EmptyDescription>
              {puedeEscribir
                ? 'Es opcional: registra qué pasó, qué mejorar y los acuerdos del equipo.'
                : esLider
                  ? 'Podrás escribirla cuando finalices el sprint.'
                  : 'El líder puede escribirla al finalizar el sprint.'}
            </EmptyDescription>
          </EmptyHeader>
          {puedeEscribir && (
            <EmptyContent>
              <Button type="button" size="sm" onClick={abrirEditor}>
                Escribir retrospectiva
              </Button>
            </EmptyContent>
          )}
        </Empty>
      )}
    </section>
  );
}
