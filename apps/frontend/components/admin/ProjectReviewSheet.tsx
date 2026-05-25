'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, SendHorizonal, MessageSquare, Eye } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdminProjectById, getProjectRevisions, resolverRevision } from '@/lib/services/projects';
import { TIPO_LABEL, MODALIDAD_LABEL, NIVEL_LABEL } from '@/types';
import type { TipoProyecto, ModalidadProyecto, NivelHabilidad } from '@/types';
import type { RevisionProyectoDTO } from '@/lib/dto/project.dto';
import { RevisionHistoryPanel } from './RevisionHistoryPanel';
import uvgSwal from '@/lib/swal';

export interface ProjectReviewSheetProps {
  idProyecto: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}

const labelClass = 'block text-[10px] font-black uppercase tracking-widest text-tertiary mb-1.5';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ReadonlyField({ label, value }: { label: string; value: string | null | undefined }) {
  const display = value == null || value === '' ? '—' : value;
  const isEmpty = display === '—';
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className={`w-full rounded-xl border px-4 py-3 text-sm whitespace-pre-wrap min-h-11 ${
        isEmpty
          ? 'border-outline-variant/20 bg-surface-container-lowest text-tertiary italic'
          : 'border-outline-variant/30 bg-surface-container-low/60 text-on-surface'
      }`}>
        {display}
      </div>
    </div>
  );
}

function SectionComment({
  sectionKey,
  value,
  onChange,
}: {
  sectionKey: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <label
          htmlFor={`comment-${sectionKey}`}
          className="text-[10px] font-black uppercase tracking-widest text-amber-600"
        >
          Comentarios del revisor
        </label>
      </div>
      <textarea
        id={`comment-${sectionKey}`}
        rows={3}
        placeholder="Escribe aquí los comentarios para el estudiante sobre esta sección..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-amber-500/30 bg-transparent px-3 py-2.5 text-sm text-on-surface placeholder:text-outline-variant focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all duration-200 resize-none"
      />
    </div>
  );
}

export function ProjectReviewSheet({
  idProyecto,
  open,
  onOpenChange,
  onResolved,
}: ProjectReviewSheetProps) {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [comments, setComments] = useState({ general: '', roles: '' });
  const [submitting, setSubmitting] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState<RevisionProyectoDTO | null>(null);

  // Maneja la animación de entrada y salida
  useEffect(() => {
    if (open) {
      setVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
    } else {
      setAnimating(false);
      const t = setTimeout(() => setVisible(false), 350);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (open) { setComments({ general: '', roles: '' }); setSelectedRevision(null); }
  }, [idProyecto, open]);

  const { data: proyecto, isLoading } = useQuery({
    queryKey: ['adminProjectDetail', idProyecto],
    queryFn: () => getAdminProjectById(idProyecto!),
    enabled: open && idProyecto !== null,
  });

  const { data: revisiones = [] } = useQuery<RevisionProyectoDTO[]>({
    queryKey: ['projectRevisions', idProyecto],
    queryFn: () => getProjectRevisions(idProyecto!),
    enabled: open && idProyecto !== null,
    staleTime: 0,
  });

  const revisionesRevisadas = revisiones
    .filter((r) => r.estadoRevision !== 'PENDIENTE')
    .sort((a, b) => a.numeroEnvio - b.numeroEnvio);

  function buildComentario(): string | undefined {
    const parts: string[] = [];
    if (comments.general.trim()) {
      parts.push(`Información general:\n${comments.general.trim()}`);
    }
    if (comments.roles.trim()) {
      parts.push(`Roles y habilidades:\n${comments.roles.trim()}`);
    }
    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }

  async function handleResolve(resultado: 'APROBADA' | 'OBSERVADA') {
    if (!idProyecto) return;

    if (resultado === 'OBSERVADA') {
      const comentario = buildComentario();
      if (!comentario) {
        await uvgSwal.fire({
          icon: 'warning',
          title: 'Comentario requerido',
          text: 'Debes escribir al menos un comentario en alguna sección antes de mandar correcciones.',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#b45309',
        });
        return;
      }
      const { isConfirmed } = await uvgSwal.fire({
        icon: 'warning',
        title: 'Mandar correcciones',
        text: 'Se enviará una notificación al estudiante con los comentarios que has escrito.',
        showCancelButton: true,
        confirmButtonText: 'Confirmar y enviar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#b45309',
      });
      if (!isConfirmed) return;
      setSubmitting(true);
      try {
        await resolverRevision(idProyecto, { resultado, comentario });
        void queryClient.invalidateQueries({ queryKey: ['projectRevisions', idProyecto] });
        onOpenChange(false);
        onResolved();
      } finally {
        setSubmitting(false);
      }
    } else {
      const { isConfirmed } = await uvgSwal.fire({
        icon: 'success',
        title: 'Aprobar proyecto',
        text: '¿Confirmas que el proyecto cumple con los requisitos?',
        showCancelButton: true,
        confirmButtonText: 'Aprobar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#006735',
      });
      if (!isConfirmed) return;
      setSubmitting(true);
      try {
        await resolverRevision(idProyecto, { resultado });
        void queryClient.invalidateQueries({ queryKey: ['projectRevisions', idProyecto] });
        onOpenChange(false);
        onResolved();
      } finally {
        setSubmitting(false);
      }
    }
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-surface overflow-hidden"
      style={{
        transform: animating ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 350ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center gap-4 border-b border-outline-variant/30 bg-surface px-6 py-4">
        <button
          onClick={() => onOpenChange(false)}
          className="flex items-center gap-2 rounded-xl bg-surface-container-high px-3 py-2 text-sm font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <div className="h-5 w-px bg-outline-variant/40" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">
            Administración · Revisiones
          </p>
          <h1 className="font-headline text-lg font-black text-on-surface leading-tight truncate">
            {proyecto?.tituloProyecto ?? 'Revisión de proyecto'}
          </h1>
          {revisionesRevisadas.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {revisionesRevisadas.map((r) => (
                <button
                  key={r.idRevisionProyecto}
                  onClick={() => setSelectedRevision(r)}
                  className="inline-flex items-center gap-1 rounded-lg bg-surface-container-high px-2.5 py-1 text-[10px] font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary"
                >
                  <Eye className="h-3 w-3" />
                  Ver Revisión {r.numeroEnvio}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-xl" />
            ))}
          </div>
        )}

        {proyecto && (
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">

            {/* ── Sección 1: Información general ── */}
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-5">
                Información general
              </h2>
              <div className="space-y-4">
                <ReadonlyField label="Título del proyecto" value={proyecto.tituloProyecto} />
                <ReadonlyField label="Descripción" value={proyecto.descripcionProyecto} />
                <div className="grid grid-cols-2 gap-4">
                  <ReadonlyField
                    label="Tipo"
                    value={TIPO_LABEL[proyecto.tipoProyecto as TipoProyecto] ?? proyecto.tipoProyecto}
                  />
                  <ReadonlyField
                    label="Modalidad"
                    value={MODALIDAD_LABEL[proyecto.modalidadProyecto as ModalidadProyecto] ?? proyecto.modalidadProyecto}
                  />
                </div>
                <ReadonlyField label="Objetivos" value={proyecto.objetivosProyecto} />
                <div className="grid grid-cols-2 gap-4">
                  <ReadonlyField label="Contexto académico" value={proyecto.contextoAcademico} />
                  <ReadonlyField label="Ubicación" value={proyecto.ubicacionProyecto} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <ReadonlyField label="Fecha de inicio" value={formatDate(proyecto.fechaInicio)} />
                  <ReadonlyField label="Fecha fin estimada" value={formatDate(proyecto.fechaFinEstimada)} />
                </div>
                <ReadonlyField label="URL recurso externo" value={proyecto.urlRecursoExterno} />
              </div>
              <SectionComment
                sectionKey="general"
                value={comments.general}
                onChange={(v) => setComments((c) => ({ ...c, general: v }))}
              />
            </section>

            {/* ── Sección 2: Roles y habilidades ── */}
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-5">
                Roles y habilidades
              </h2>
              {proyecto.roles.length === 0 ? (
                <p className="text-sm text-tertiary italic">Sin roles definidos.</p>
              ) : (
                <div className="space-y-4">
                  {proyecto.roles.map((rol, i) => (
                    <div
                      key={rol.idRolProyecto}
                      className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-5 space-y-4"
                    >
                      <p className="text-[10px] font-black uppercase tracking-widest text-tertiary">
                        Rol {i + 1}
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <ReadonlyField label="Nombre del rol" value={rol.nombreRol} />
                        <ReadonlyField label="Cupos" value={String(rol.cupos)} />
                      </div>
                      {rol.descripcionRolProyecto && (
                        <ReadonlyField label="Descripción del rol" value={rol.descripcionRolProyecto} />
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        {rol.carreraRequerida && (
                          <ReadonlyField label="Carrera requerida" value={rol.carreraRequerida.nombreCarrera} />
                        )}
                        {rol.horasSemanalesEstimadas != null && (
                          <ReadonlyField label="Horas semanales" value={String(rol.horasSemanalesEstimadas)} />
                        )}
                      </div>
                      {rol.requisitos.length > 0 && (
                        <div>
                          <label className={labelClass}>Habilidades requeridas</label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {rol.requisitos.map((req) => (
                              <span
                                key={req.idRequisitoHabilidad}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-high px-3 py-1.5 text-xs font-medium text-on-surface"
                              >
                                {req.habilidad.nombreHabilidad}
                                <span className="text-tertiary">·</span>
                                <span className="text-tertiary">
                                  {NIVEL_LABEL[req.nivelMinimo as NivelHabilidad] ?? req.nivelMinimo}
                                </span>
                                {req.obligatorio && (
                                  <span className="text-error font-bold ml-0.5">*</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <SectionComment
                sectionKey="roles"
                value={comments.roles}
                onChange={(v) => setComments((c) => ({ ...c, roles: v }))}
              />
            </section>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-outline-variant/30 bg-surface px-6 py-4">
        <div className="max-w-3xl mx-auto flex gap-3">
          <button
            disabled={submitting || !proyecto}
            onClick={() => void handleResolve('APROBADA')}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-surface-container-high px-4 py-3 text-sm font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="h-4 w-4" />
            Aprobar proyecto
          </button>
          <button
            disabled={submitting || !proyecto}
            onClick={() => void handleResolve('OBSERVADA')}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SendHorizonal className="h-4 w-4" />
            Mandar correcciones
          </button>
        </div>
      </div>

      {selectedRevision && (
        <RevisionHistoryPanel
          revision={selectedRevision}
          projectTitle={proyecto?.tituloProyecto ?? ''}
          onClose={() => setSelectedRevision(null)}
        />
      )}
    </div>
  );
}
