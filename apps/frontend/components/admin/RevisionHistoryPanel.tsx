'use client';

import { ArrowLeft, MessageSquare } from 'lucide-react';
import { TIPO_LABEL, MODALIDAD_LABEL, NIVEL_LABEL } from '@/types';
import type { TipoProyecto, ModalidadProyecto, NivelHabilidad } from '@/types';
import type { RevisionProyectoDTO } from '@/lib/dto/project.dto';

interface Props {
  revision: RevisionProyectoDTO;
  projectTitle: string;
  onClose: () => void;
}

const labelClass = 'block text-[10px] font-black uppercase tracking-widest text-tertiary mb-1.5';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
  } catch { return iso; }
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

function CommentBlock({ text }: { text: string }) {
  return (
    <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
          Comentarios del revisor
        </span>
      </div>
      <p className="text-sm text-on-surface whitespace-pre-wrap">{text}</p>
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

export function RevisionHistoryPanel({ revision, projectTitle, onClose }: Props) {
  const c = parseComments(revision.comentarioRevision);
  const snap = revision.snapshotProyecto;

  return (
    <div className="fixed inset-0 z-60 flex flex-col bg-surface overflow-hidden animate-in slide-in-from-right-full duration-300">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-4 border-b border-outline-variant/30 bg-surface px-6 py-4">
        <button
          onClick={onClose}
          className="flex items-center gap-2 rounded-xl bg-surface-container-high px-3 py-2 text-sm font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <div className="h-5 w-px bg-outline-variant/40" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">
            Historial · Solo lectura · Revisión {revision.numeroEnvio}
          </p>
          <h1 className="font-headline text-lg font-black text-on-surface leading-tight truncate">
            {snap?.tituloProyecto ?? projectTitle}
          </h1>
        </div>
        {revision.revisadaEn && (
          <span className="shrink-0 text-xs text-tertiary">
            Revisado el {formatDate(revision.revisadaEn)}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">

          {!snap && (
            <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-5 py-4 text-sm text-tertiary">
              Los datos del formulario de esta revisión no están disponibles (fue enviada antes de que se habilitara el historial de cambios).
            </div>
          )}

          {/* Información general */}
          {snap ? (
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-5">
                Información general
              </h2>
              <div className="space-y-4">
                <ReadonlyField label="Título del proyecto" value={snap.tituloProyecto} />
                <ReadonlyField label="Descripción" value={snap.descripcionProyecto} />
                <div className="grid grid-cols-2 gap-4">
                  <ReadonlyField label="Tipo" value={TIPO_LABEL[snap.tipoProyecto as TipoProyecto] ?? snap.tipoProyecto} />
                  <ReadonlyField label="Modalidad" value={MODALIDAD_LABEL[snap.modalidadProyecto as ModalidadProyecto] ?? snap.modalidadProyecto} />
                </div>
                <ReadonlyField label="Objetivos" value={snap.objetivosProyecto} />
                <div className="grid grid-cols-2 gap-4">
                  <ReadonlyField label="Contexto académico" value={snap.contextoAcademico} />
                  <ReadonlyField label="Ubicación" value={snap.ubicacionProyecto} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <ReadonlyField label="Fecha de inicio" value={formatDate(snap.fechaInicio)} />
                  <ReadonlyField label="Fecha fin estimada" value={formatDate(snap.fechaFinEstimada)} />
                </div>
                <ReadonlyField label="URL recurso externo" value={snap.urlRecursoExterno} />
              </div>
              {c.general && <CommentBlock text={c.general} />}
            </section>
          ) : c.general ? (
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-5">Información general</h2>
              <CommentBlock text={c.general} />
            </section>
          ) : null}

          {/* Roles y habilidades */}
          {snap ? (
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-5">
                Roles y habilidades
              </h2>
              {snap.roles.length === 0 ? (
                <p className="text-sm text-tertiary italic">Sin roles definidos.</p>
              ) : (
                <div className="space-y-4">
                  {snap.roles.map((rol, i) => (
                    <div key={rol.idRolProyecto} className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-5 space-y-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-tertiary">Rol {i + 1}</p>
                      <div className="grid grid-cols-2 gap-4">
                        <ReadonlyField label="Nombre del rol" value={rol.nombreRol} />
                        <ReadonlyField label="Cupos" value={String(rol.cupos)} />
                      </div>
                      {rol.descripcionRolProyecto && <ReadonlyField label="Descripción del rol" value={rol.descripcionRolProyecto} />}
                      <div className="grid grid-cols-2 gap-4">
                        {rol.carreraRequerida && <ReadonlyField label="Carrera requerida" value={rol.carreraRequerida.nombreCarrera} />}
                        {rol.horasSemanalesEstimadas != null && <ReadonlyField label="Horas semanales" value={String(rol.horasSemanalesEstimadas)} />}
                      </div>
                      {rol.requisitos.length > 0 && (
                        <div>
                          <label className={labelClass}>Habilidades requeridas</label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {rol.requisitos.map((req) => (
                              <span key={req.idRequisitoHabilidad} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-high px-3 py-1.5 text-xs font-medium text-on-surface">
                                {req.habilidad.nombreHabilidad}
                                <span className="text-tertiary">·</span>
                                <span className="text-tertiary">{NIVEL_LABEL[req.nivelMinimo as NivelHabilidad] ?? req.nivelMinimo}</span>
                                {req.obligatorio && <span className="text-error font-bold ml-0.5">*</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {c.roles && <CommentBlock text={c.roles} />}
            </section>
          ) : c.roles ? (
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-5">Roles y habilidades</h2>
              <CommentBlock text={c.roles} />
            </section>
          ) : null}

          {!snap && !c.general && !c.roles && (
            <p className="text-sm text-tertiary italic">Esta revisión no tiene comentarios del revisor.</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-outline-variant/30 bg-surface px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-surface-container-high px-4 py-3 text-sm font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
