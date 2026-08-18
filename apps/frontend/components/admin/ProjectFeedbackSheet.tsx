'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MessageSquare, Eye } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdminProjectById, getProjectRevisions } from '@/lib/services/projects';
import { TIPO_LABEL, MODALIDAD_LABEL, NIVEL_LABEL } from '@/types';
import type { TipoProyecto, ModalidadProyecto, NivelHabilidad } from '@/types';
import type { RevisionProyectoDTO } from '@/lib/dto/project.dto';
import { RevisionHistoryPanel } from './RevisionHistoryPanel';

export interface ProjectFeedbackSheetProps {
  idProyecto: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

function SectionCommentReadonly({ comment }: { comment: string }) {
  return (
    <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
          Comentarios enviados al estudiante
        </span>
      </div>
      <div className="w-full rounded-lg border border-amber-500/30 bg-transparent px-3 py-2.5 text-sm min-h-18 text-on-surface whitespace-pre-wrap">
        {comment.trim() || <span className="text-outline-variant italic">Sin comentarios para esta sección.</span>}
      </div>
    </div>
  );
}

function parseComments(raw: string | null | undefined): { general: string; roles: string } {
  if (!raw) return { general: '', roles: '' };
  const hasHeaders = raw.includes('Información general:') || raw.includes('Roles y habilidades:');
  if (!hasHeaders) return { general: raw.trim(), roles: '' };
  const generalMatch = raw.match(/Información general:\n([\s\S]*?)(?=\n\nRoles y habilidades:|$)/);
  const rolesMatch = raw.match(/Roles y habilidades:\n([\s\S]*?)$/);
  return {
    general: generalMatch?.[1]?.trim() ?? '',
    roles: rolesMatch?.[1]?.trim() ?? '',
  };
}

export function ProjectFeedbackSheet({ idProyecto, open, onOpenChange }: ProjectFeedbackSheetProps) {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState<RevisionProyectoDTO | null>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        setVisible(true);
        setSelectedRevision(null);
      }, 0);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => setAnimating(false), 0);
      const t2 = setTimeout(() => setVisible(false), 350);
      return () => {
        clearTimeout(t);
        clearTimeout(t2);
      };
    }
  }, [open]);

  const { data: proyecto, isLoading: loadingProyecto } = useQuery({
    queryKey: ['adminProjectDetail', idProyecto],
    queryFn: () => getAdminProjectById(idProyecto!),
    enabled: open && idProyecto !== null,
    staleTime: 0,
  });

  const { data: revisiones, isLoading: loadingRevisiones } = useQuery({
    queryKey: ['projectRevisions', idProyecto],
    queryFn: () => getProjectRevisions(idProyecto!),
    enabled: open && idProyecto !== null,
    staleTime: 0,
  });

  const ultimaRevisionObservada = revisiones
    ?.filter((r) => r.estadoRevision === 'OBSERVADA')
    .sort((a, b) => (b.revisadaEn ?? '').localeCompare(a.revisadaEn ?? ''))
    .at(0) ?? null;

  const revisionesRevisadas = (revisiones ?? [])
    .filter((r) => r.estadoRevision !== 'PENDIENTE')
    .sort((a, b) => a.numeroEnvio - b.numeroEnvio);

  const comentarios = parseComments(ultimaRevisionObservada?.comentarioRevision);
  const isLoading = loadingProyecto || loadingRevisiones;

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
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">
            Administración · Retroalimentación enviada
          </p>
          <h1 className="font-headline text-lg font-black text-on-surface leading-tight truncate">
            {proyecto?.tituloProyecto ?? 'Retroalimentación'}
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
        {ultimaRevisionObservada?.revisadaEn && (
          <div className="shrink-0">
            <span className="text-xs text-tertiary">
              Revisado el {formatDate(ultimaRevisionObservada.revisadaEn)}
            </span>
          </div>
        )}
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
              {(comentarios.general || !comentarios.roles) && (
                <SectionCommentReadonly comment={comentarios.general} />
              )}
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
              <SectionCommentReadonly comment={comentarios.roles} />
            </section>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-outline-variant/30 bg-surface px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => onOpenChange(false)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-surface-container-high px-4 py-3 text-sm font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary"
          >
            Cerrar
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
