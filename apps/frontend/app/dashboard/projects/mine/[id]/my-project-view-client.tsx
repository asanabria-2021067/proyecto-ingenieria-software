'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageSquare, Pencil, X, Plus, Send, Save, Eye } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { TIPO_LABEL, MODALIDAD_LABEL, NIVEL_LABEL } from '@/types';
import type { TipoProyecto, ModalidadProyecto, NivelHabilidad } from '@/types';
import type { ProyectoDetalleDTO, RevisionProyectoDTO } from '@/lib/dto/project.dto';
import { getMyProjectById, updateProject, resubmitProject, getProjectRevisions } from '@/lib/services/projects';
import { getCarreras, getHabilidades } from '@/lib/services/catalogs';
import type { Carrera, Habilidad } from '@/lib/services/catalogs';
import uvgSwal from '@/lib/swal';
import {
  step1Schema, rolSchema, formSchema, zodToFieldErrors,
  newRol, newRequisito, safeId,
  type FormData, type RolFormItem, type RequisitoFormItem, type FieldErrors,
} from '../form/types';
import {
  ProjectGeneralInfoSection,
  ReadonlyField,
  SectionCommentReadonly,
} from '@/components/projects/detail/project-general-info-section';

interface Props { id: number; }

const labelClass = 'block text-[10px] font-black uppercase tracking-widest text-tertiary mb-1.5';
const inputClass = 'w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface placeholder:text-outline-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200';
const inputErrClass = 'border-error focus:border-error focus:ring-error/20';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
  } catch { return iso; }
}

function ViewSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-xl" />
      ))}
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

// ─── Read-only view ──────────────────────────────────────────────────────────

function ProjectReadOnlyView({
  proyecto,
  onEdit,
}: {
  proyecto: ProyectoDetalleDTO;
  onEdit: () => void;
}) {
  const ultimaRevision = proyecto.revisiones?.[0] ?? null;
  const comentarios = parseComments(ultimaRevision?.comentarioRevision);
  const esObservado = proyecto.estadoProyecto === 'OBSERVADO';

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">

      {esObservado && (
        <div className="rounded-2xl border border-amber-400 bg-amber-200 dark:bg-amber-500/25 dark:border-amber-500/60 px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-on-surface">
              Tu proyecto tiene observaciones del revisor
            </p>
            <p className="text-xs mt-0.5 text-on-surface/70">
              Revisa los comentarios de cada sección y aplica las correcciones necesarias.
            </p>
          </div>
          <button
            onClick={onEdit}
            className="shrink-0 flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar y corregir
          </button>
        </div>
      )}

      <ProjectGeneralInfoSection
        tituloProyecto={proyecto.tituloProyecto}
        descripcionProyecto={proyecto.descripcionProyecto}
        tipoProyecto={proyecto.tipoProyecto}
        modalidadProyecto={proyecto.modalidadProyecto}
        objetivosProyecto={proyecto.objetivosProyecto}
        contextoAcademico={proyecto.contextoAcademico}
        ubicacionProyecto={proyecto.ubicacionProyecto}
        fechaInicio={proyecto.fechaInicio}
        fechaFinEstimada={proyecto.fechaFinEstimada}
        urlRecursoExterno={proyecto.urlRecursoExterno}
        mostrarComentario={esObservado}
        comentario={comentarios.general}
      />

      <section>
        <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-5">
          Roles y habilidades
        </h2>
        {proyecto.roles.length === 0 ? (
          <p className="text-sm text-tertiary italic">Sin roles definidos.</p>
        ) : (
          <div className="space-y-4">
            {proyecto.roles.map((rol, i) => (
              <div key={rol.idRolProyecto} className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-5 space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-tertiary">Rol {i + 1}</p>
                <div className="grid grid-cols-2 gap-4">
                  <ReadonlyField label="Nombre del rol" value={rol.nombreRol} />
                  <ReadonlyField label="Cupos" value={String(rol.cupos)} />
                </div>
                {rol.descripcionRolProyecto && (
                  <ReadonlyField label="Descripción del rol" value={rol.descripcionRolProyecto} />
                )}
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
        {esObservado && <SectionCommentReadonly comment={comentarios.roles} />}
      </section>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function MyProjectViewClient({ id }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // Origen de la navegación: si venimos del detalle del proyecto
  // (/dashboard/projects/[id] → "Revisiones previas") llega `returnTo` con esa
  // ruta y el botón "Volver" regresa ahí. Sin el parámetro se conserva el flujo
  // admin-estudiante (desde la lista) que vuelve a "Mis Proyectos". Solo se
  // acepta una ruta interna del dashboard para evitar redirecciones abiertas.
  const returnToParam = searchParams.get('returnTo');
  const volverHref =
    returnToParam && returnToParam.startsWith('/dashboard/')
      ? returnToParam
      : '/dashboard/projects/mine';

  const [isEditing, setIsEditing] = useState(searchParams.get('edit') === 'true');
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState<RevisionProyectoDTO | null>(null);

  const [form, setForm] = useState<FormData>({
    tituloProyecto: '', descripcionProyecto: '', tipoProyecto: '' as TipoProyecto,
    modalidadProyecto: '' as ModalidadProyecto, objetivosProyecto: '', ubicacionProyecto: '',
    contextoAcademico: '', urlRecursoExterno: '', fechaInicio: '',
    fechaFinEstimada: '', roles: [],
  });

  const { data: proyecto, isLoading, error } = useQuery<ProyectoDetalleDTO>({
    queryKey: ['proyecto-owner-view', id],
    queryFn: () => getMyProjectById(id),
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: revisiones = [] } = useQuery<RevisionProyectoDTO[]>({
    queryKey: ['proyecto-revisiones', id],
    queryFn: () => getProjectRevisions(id),
    enabled: !!id,
    staleTime: 0,
  });

  const revisionesRevisadas = revisiones
    .filter((r) => r.estadoRevision !== 'PENDIENTE')
    .sort((a, b) => a.numeroEnvio - b.numeroEnvio);

  const { data: carreras = [] } = useQuery<Carrera[]>({
    queryKey: ['carreras'],
    queryFn: getCarreras,
    enabled: isEditing,
  });

  const { data: habilidades = [] } = useQuery<Habilidad[]>({
    queryKey: ['habilidades'],
    queryFn: getHabilidades,
    enabled: isEditing,
  });

  useEffect(() => {
    if (!proyecto || !isEditing) return;
    setForm({
      tituloProyecto: proyecto.tituloProyecto,
      descripcionProyecto: proyecto.descripcionProyecto ?? '',
      tipoProyecto: proyecto.tipoProyecto as TipoProyecto,
      modalidadProyecto: proyecto.modalidadProyecto as ModalidadProyecto,
      objetivosProyecto: proyecto.objetivosProyecto ?? '',
      ubicacionProyecto: proyecto.ubicacionProyecto ?? '',
      contextoAcademico: proyecto.contextoAcademico ?? '',
      urlRecursoExterno: proyecto.urlRecursoExterno ?? '',
      fechaInicio: proyecto.fechaInicio ? proyecto.fechaInicio.split('T')[0] : '',
      fechaFinEstimada: proyecto.fechaFinEstimada ? proyecto.fechaFinEstimada.split('T')[0] : '',
      roles: proyecto.roles.map((r) => ({
        id: safeId(),
        nombreRol: r.nombreRol,
        descripcionRolProyecto: r.descripcionRolProyecto ?? '',
        idCarreraRequerida: r.carreraRequerida?.idCarrera ?? null,
        cupos: r.cupos,
        horasSemanalesEstimadas: r.horasSemanalesEstimadas ?? '',
        requisitos: r.requisitos.map((req) => ({
          id: safeId(),
          idHabilidad: req.habilidad?.idHabilidad ?? null,
          nivelMinimo: req.nivelMinimo as NivelHabilidad,
          obligatorio: req.obligatorio,
        })),
      })),
    });
  }, [proyecto, isEditing]);

  const ultimaRevision = proyecto?.revisiones?.[0] ?? null;
  const comentarios = parseComments(ultimaRevision?.comentarioRevision);

  // ─── Form helpers ────────────────────────────────────────────────────────────

  const updateForm = (field: keyof Omit<FormData, 'roles'>, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const addRol = () => setForm((f) => ({ ...f, roles: [...f.roles, newRol()] }));
  const removeRol = (rid: string) => setForm((f) => ({ ...f, roles: f.roles.filter((r) => r.id !== rid) }));
  const updateRol = (rid: string, field: keyof Omit<RolFormItem, 'id' | 'requisitos'>, value: unknown) =>
    setForm((f) => ({ ...f, roles: f.roles.map((r) => r.id === rid ? { ...r, [field]: value } : r) }));

  const addRequisito = (rolId: string) =>
    setForm((f) => ({ ...f, roles: f.roles.map((r) => r.id === rolId ? { ...r, requisitos: [...r.requisitos, newRequisito()] } : r) }));
  const removeRequisito = (rolId: string, reqId: string) =>
    setForm((f) => ({ ...f, roles: f.roles.map((r) => r.id === rolId ? { ...r, requisitos: r.requisitos.filter((req) => req.id !== reqId) } : r) }));
  const updateRequisito = (rolId: string, reqId: string, field: keyof Omit<RequisitoFormItem, 'id'>, value: unknown) =>
    setForm((f) => ({ ...f, roles: f.roles.map((r) => r.id === rolId ? { ...r, requisitos: r.requisitos.map((req) => req.id === reqId ? { ...req, [field]: value } : req) } : r) }));

  // ─── Validation ──────────────────────────────────────────────────────────────

  const fieldErrors: FieldErrors = showErrors ? zodToFieldErrors(step1Schema.safeParse(form)) : {};
  const rolErrorsMap: Record<string, FieldErrors> = showErrors
    ? Object.fromEntries(form.roles.map((r) => [r.id, zodToFieldErrors(rolSchema.safeParse(r))]))
    : {};

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const buildPayload = () => ({
    tituloProyecto: form.tituloProyecto,
    descripcionProyecto: form.descripcionProyecto,
    tipoProyecto: form.tipoProyecto as TipoProyecto,
    modalidadProyecto: form.modalidadProyecto as ModalidadProyecto,
    objetivosProyecto: form.objetivosProyecto || undefined,
    ubicacionProyecto: form.ubicacionProyecto || undefined,
    contextoAcademico: form.contextoAcademico || undefined,
    urlRecursoExterno: form.urlRecursoExterno || undefined,
    fechaInicio: form.fechaInicio || undefined,
    fechaFinEstimada: form.fechaFinEstimada || undefined,
    roles: form.roles.length > 0
      ? form.roles.map((r) => ({
          nombreRol: r.nombreRol,
          descripcionRolProyecto: r.descripcionRolProyecto || undefined,
          idCarreraRequerida: r.idCarreraRequerida ?? undefined,
          cupos: Number(r.cupos),
          horasSemanalesEstimadas: r.horasSemanalesEstimadas ? Number(r.horasSemanalesEstimadas) : undefined,
          requisitos: r.requisitos
            .filter((req) => req.idHabilidad !== null && req.nivelMinimo !== '')
            .map((req) => ({
              idHabilidad: req.idHabilidad!,
              nivelMinimo: req.nivelMinimo as NivelHabilidad,
              obligatorio: req.obligatorio,
            })),
        }))
      : undefined,
  });

  const submit = async (accion: 'BORRADOR' | 'EN_REVISION') => {
    setShowErrors(true);

    if (accion === 'EN_REVISION') {
      const valid = formSchema.safeParse(form);
      if (!valid.success) {
        const issues = valid.error.issues.map((issue) => {
          const path = issue.path.join('.');
          const m = path.match(/^roles\.(\d+)\./);
          return m ? `Rol ${Number(m[1]) + 1}: ${issue.message}` : issue.message;
        });
        await uvgSwal.fire({
          icon: 'warning',
          title: 'Campos incompletos',
          html: `<ul class="text-left text-sm space-y-1">${issues.map((e) => `<li>• ${e}</li>`).join('')}</ul>`,
        });
        return;
      }
    }

    setSaving(true);
    try {
      await updateProject(id, buildPayload());
      void queryClient.invalidateQueries({ queryKey: ['proyecto-owner-view', id] });
      void queryClient.invalidateQueries({ queryKey: ['mis-proyectos'] });

      if (accion === 'EN_REVISION') {
        await resubmitProject(id);
        await uvgSwal.fire({
          icon: 'success',
          title: 'Correcciones enviadas',
          text: 'Tu proyecto ha sido enviado a revisión nuevamente.',
          timer: 2000,
          showConfirmButton: false,
        });
        router.push('/dashboard/projects/mine');
      } else {
        setIsEditing(false);
        setShowErrors(false);
        await uvgSwal.fire({
          icon: 'success',
          title: 'Cambios guardados',
          text: 'Los cambios han sido guardados correctamente.',
          timer: 1500,
          showConfirmButton: false,
        });
      }
    } catch (err: unknown) {
      await uvgSwal.fire({
        icon: 'error',
        title: 'No se pudo guardar',
        text: err instanceof Error ? err.message : 'Ocurrió un error al guardar el proyecto.',
      });
    } finally {
      setSaving(false);
    }
  };

  const enterEdit = () => {
    setShowErrors(false);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setShowErrors(false);
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-4 border-b border-outline-variant/30 bg-surface px-6 py-4">
        {isEditing ? (
          <>
            <button
              onClick={cancelEdit}
              className="flex items-center gap-2 rounded-xl bg-surface-container-high px-3 py-2 text-sm font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Cancelar
            </button>
            <div className="h-5 w-px bg-outline-variant/40" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                Mis Proyectos · Editando correcciones
              </p>
              <h1 className="font-headline text-lg font-black text-on-surface leading-tight truncate">
                {proyecto?.tituloProyecto ?? 'Mi proyecto'}
              </h1>
            </div>
          </>
        ) : (
          <>
            <Link
              href={volverHref}
              className="flex items-center gap-2 rounded-xl bg-surface-container-high px-3 py-2 text-sm font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Link>
            <div className="h-5 w-px bg-outline-variant/40" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                Mis Proyectos · Solicitud
              </p>
              <h1 className="font-headline text-lg font-black text-on-surface leading-tight truncate">
                {proyecto?.tituloProyecto ?? 'Mi solicitud'}
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
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && <ViewSkeleton />}

        {(error || (!isLoading && !proyecto)) && (
          <div className="max-w-3xl mx-auto px-6 py-16 text-center">
            <p className="text-error font-medium text-sm">No se pudo cargar el proyecto.</p>
            <Link href="/dashboard/projects/mine" className="mt-4 inline-block text-sm text-primary hover:underline">
              Volver a mis proyectos
            </Link>
          </div>
        )}

        {proyecto && !isEditing && (
          <ProjectReadOnlyView proyecto={proyecto} onEdit={enterEdit} />
        )}

        {proyecto && isEditing && (
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">

            {/* ── Sección 1: Información general ── */}
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-5">
                Información general
              </h2>
              <div className="space-y-5">
                <div>
                  <label className={labelClass}>Título del proyecto <span className="text-error">*</span></label>
                  <input
                    className={`${inputClass} ${fieldErrors.tituloProyecto ? inputErrClass : ''}`}
                    placeholder="Nombre descriptivo del proyecto"
                    value={form.tituloProyecto}
                    onChange={(e) => updateForm('tituloProyecto', e.target.value)}
                  />
                  {fieldErrors.tituloProyecto && <p className="text-xs text-error mt-1">{fieldErrors.tituloProyecto}</p>}
                </div>

                <div>
                  <label className={labelClass}>Descripción <span className="text-error">*</span></label>
                  <textarea
                    className={`${inputClass} resize-none ${fieldErrors.descripcionProyecto ? inputErrClass : ''}`}
                    rows={3}
                    placeholder="¿En qué consiste el proyecto?"
                    value={form.descripcionProyecto}
                    onChange={(e) => updateForm('descripcionProyecto', e.target.value)}
                  />
                  {fieldErrors.descripcionProyecto && <p className="text-xs text-error mt-1">{fieldErrors.descripcionProyecto}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Tipo <span className="text-error">*</span></label>
                    <Select value={form.tipoProyecto || '__NONE__'} onValueChange={(v) => updateForm('tipoProyecto', v === '__NONE__' ? '' : v)}>
                      <SelectTrigger className={`h-auto py-3 rounded-xl border-outline-variant/30 bg-surface-container-low text-sm focus-visible:ring-primary/20 ${fieldErrors.tipoProyecto ? 'border-error' : ''}`}>
                        <SelectValue placeholder="Selecciona un tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TIPO_LABEL).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldErrors.tipoProyecto && <p className="text-xs text-error mt-1">{fieldErrors.tipoProyecto}</p>}
                  </div>
                  <div>
                    <label className={labelClass}>Modalidad <span className="text-error">*</span></label>
                    <Select value={form.modalidadProyecto || '__NONE__'} onValueChange={(v) => updateForm('modalidadProyecto', v === '__NONE__' ? '' : v)}>
                      <SelectTrigger className={`h-auto py-3 rounded-xl border-outline-variant/30 bg-surface-container-low text-sm focus-visible:ring-primary/20 ${fieldErrors.modalidadProyecto ? 'border-error' : ''}`}>
                        <SelectValue placeholder="Selecciona modalidad" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(MODALIDAD_LABEL).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldErrors.modalidadProyecto && <p className="text-xs text-error mt-1">{fieldErrors.modalidadProyecto}</p>}
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Objetivos</label>
                  <textarea className={`${inputClass} resize-none`} rows={2} placeholder="Objetivos principales del proyecto" value={form.objetivosProyecto} onChange={(e) => updateForm('objetivosProyecto', e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Contexto académico</label>
                    <input className={inputClass} placeholder="ej. Tesis, proyecto de curso..." value={form.contextoAcademico} onChange={(e) => updateForm('contextoAcademico', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Ubicación</label>
                    <input className={inputClass} placeholder="Ciudad o lugar" value={form.ubicacionProyecto} onChange={(e) => updateForm('ubicacionProyecto', e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Fecha de inicio</label>
                    <input type="date" className={inputClass} value={form.fechaInicio} onChange={(e) => updateForm('fechaInicio', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Fecha fin estimada</label>
                    <input
                      type="date"
                      className={`${inputClass} ${fieldErrors.fechaFinEstimada ? inputErrClass : ''}`}
                      value={form.fechaFinEstimada}
                      onChange={(e) => updateForm('fechaFinEstimada', e.target.value)}
                    />
                    {fieldErrors.fechaFinEstimada && <p className="text-xs text-error mt-1">{fieldErrors.fechaFinEstimada}</p>}
                  </div>
                </div>

                <div>
                  <label className={labelClass}>URL recurso externo</label>
                  <input className={inputClass} placeholder="https://..." value={form.urlRecursoExterno} onChange={(e) => updateForm('urlRecursoExterno', e.target.value)} />
                </div>
              </div>

              {comentarios.general && <SectionCommentReadonly comment={comentarios.general} />}
            </section>

            {/* ── Sección 2: Roles y habilidades ── */}
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-5">
                Roles y habilidades
              </h2>
              <div className="space-y-4">
                {form.roles.length === 0 && (
                  <div className="text-center py-10 text-sm border-2 border-dashed rounded-xl border-outline-variant text-tertiary">
                    No hay roles definidos aún.
                  </div>
                )}

                {form.roles.map((rol, rolIdx) => {
                  const rolErrs = rolErrorsMap[rol.id] ?? {};
                  return (
                    <div key={rol.id} className="rounded-xl border border-outline-variant bg-surface-container-low p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-on-surface">Rol {rolIdx + 1}</span>
                        <button onClick={() => removeRol(rol.id)} className="text-tertiary hover:text-error transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Nombre del rol <span className="text-error">*</span></label>
                          <input
                            className={`${inputClass} ${rolErrs.nombreRol ? inputErrClass : ''}`}
                            placeholder="ej. Desarrollador Frontend"
                            value={rol.nombreRol}
                            onChange={(e) => updateRol(rol.id, 'nombreRol', e.target.value)}
                          />
                          {rolErrs.nombreRol && <p className="text-xs text-error mt-1">{rolErrs.nombreRol}</p>}
                        </div>
                        <div>
                          <label className={labelClass}>Cupos <span className="text-error">*</span></label>
                          <input
                            type="number" min={1}
                            className={`${inputClass} ${rolErrs.cupos ? inputErrClass : ''}`}
                            placeholder="1"
                            value={rol.cupos}
                            onChange={(e) => updateRol(rol.id, 'cupos', e.target.value === '' ? '' : Number(e.target.value))}
                          />
                          {rolErrs.cupos && <p className="text-xs text-error mt-1">{rolErrs.cupos}</p>}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className={labelClass}>Carrera requerida</label>
                          <Select
                            value={rol.idCarreraRequerida ? String(rol.idCarreraRequerida) : '__NONE__'}
                            onValueChange={(v) => updateRol(rol.id, 'idCarreraRequerida', v === '__NONE__' ? null : Number(v))}
                          >
                            <SelectTrigger className="w-full h-auto py-3 rounded-xl border-outline-variant/30 bg-surface-container-low text-sm">
                              <SelectValue placeholder="Cualquier carrera" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__NONE__">Cualquier carrera</SelectItem>
                              {carreras.map((c) => (
                                <SelectItem key={c.idCarrera} value={String(c.idCarrera)}>{c.nombreCarrera}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-40">
                          <label className={labelClass}>Horas semanales</label>
                          <input
                            type="number" min={1}
                            className={inputClass}
                            placeholder="ej. 10"
                            value={rol.horasSemanalesEstimadas}
                            onChange={(e) => updateRol(rol.id, 'horasSemanalesEstimadas', e.target.value === '' ? '' : Number(e.target.value))}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>Descripción del rol</label>
                        <textarea
                          className={`${inputClass} resize-none`}
                          rows={2}
                          placeholder="Responsabilidades y tareas principales"
                          value={rol.descripcionRolProyecto}
                          onChange={(e) => updateRol(rol.id, 'descripcionRolProyecto', e.target.value)}
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className={`${labelClass} mb-0`}>Habilidades requeridas</label>
                          <button
                            onClick={() => addRequisito(rol.id)}
                            className="flex items-center gap-1 text-xs text-primary font-bold hover:underline"
                          >
                            <Plus className="w-3 h-3" /> Agregar habilidad
                          </button>
                        </div>

                        {rol.requisitos.length > 0 && (
                          <div className="grid grid-cols-[1fr_8rem_auto_auto] gap-x-2 mb-1 px-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary">Habilidad</span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary">Nivel</span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary whitespace-nowrap">Obligatorio</span>
                            <span />
                          </div>
                        )}

                        <div className="space-y-2">
                          {rol.requisitos.map((req) => (
                            <div key={req.id} className="grid grid-cols-[1fr_8rem_auto_auto] items-center gap-2">
                              <Select
                                value={req.idHabilidad ? String(req.idHabilidad) : '__NONE__'}
                                onValueChange={(v) => updateRequisito(rol.id, req.id, 'idHabilidad', v === '__NONE__' ? null : Number(v))}
                              >
                                <SelectTrigger className="h-auto py-2 rounded-lg border-outline-variant/30 bg-surface-container-low text-sm">
                                  <SelectValue placeholder="Seleccionar habilidad" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__NONE__">Seleccionar habilidad</SelectItem>
                                  {habilidades.map((h) => (
                                    <SelectItem key={h.idHabilidad} value={String(h.idHabilidad)}>{h.nombreHabilidad}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <Select
                                value={req.nivelMinimo || '__NONE__'}
                                onValueChange={(v) => updateRequisito(rol.id, req.id, 'nivelMinimo', v === '__NONE__' ? '' : v)}
                              >
                                <SelectTrigger className="h-auto py-2 rounded-lg border-outline-variant/30 bg-surface-container-low text-sm">
                                  <SelectValue placeholder="Nivel" />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(NIVEL_LABEL).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <label className="flex items-center gap-1.5 text-xs text-tertiary whitespace-nowrap cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={req.obligatorio}
                                  onChange={(e) => updateRequisito(rol.id, req.id, 'obligatorio', e.target.checked)}
                                  className="accent-primary"
                                />
                                Obligatorio
                              </label>

                              <button
                                onClick={() => removeRequisito(rol.id, req.id)}
                                className="text-tertiary hover:text-error transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button
                  onClick={addRol}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-outline-variant text-sm font-bold text-primary hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <Plus className="w-4 h-4" /> Agregar rol
                </button>
              </div>

              {comentarios.roles && <SectionCommentReadonly comment={comentarios.roles} />}
            </section>
          </div>
        )}
      </div>

      {/* Footer – solo en modo edición */}
      {isEditing && (
        <div className="shrink-0 border-t border-outline-variant/30 bg-surface px-6 py-4">
          <div className="max-w-3xl mx-auto flex gap-3">
            <button
              disabled={saving}
              onClick={() => void submit('BORRADOR')}
              className="flex items-center justify-center gap-2 rounded-xl bg-surface-container-high px-5 py-3 text-sm font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4" />
              Guardar cambios
            </button>
            <button
              disabled={saving}
              onClick={() => void submit('EN_REVISION')}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
              {saving ? 'Enviando…' : 'Enviar correcciones'}
            </button>
          </div>
        </div>
      )}
      {/* Panel full-screen historial de revisión */}
      {selectedRevision && proyecto && (() => {
        const c = parseComments(selectedRevision.comentarioRevision);
        const snap = selectedRevision.snapshotProyecto;
        return (
          <div className="fixed inset-0 z-50 flex flex-col bg-surface overflow-hidden animate-in slide-in-from-right-full duration-300">
            {/* Panel header */}
            <div className="shrink-0 flex items-center gap-4 border-b border-outline-variant/30 bg-surface px-6 py-4">
              <button
                onClick={() => setSelectedRevision(null)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-on-surface transition-colors hover:bg-surface-container-high"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver
              </button>
              <div className="h-5 w-px bg-outline-variant/40" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                  Historial · Solo lectura · Revisión {selectedRevision.numeroEnvio}
                </p>
                <h1 className="font-headline text-lg font-black text-on-surface leading-tight truncate">
                  {snap?.tituloProyecto ?? proyecto.tituloProyecto}
                </h1>
              </div>
              {selectedRevision.revisadaEn && (
                <span className="shrink-0 text-xs text-tertiary">
                  Revisado el {formatDate(selectedRevision.revisadaEn)}
                </span>
              )}
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">

                {!snap && (
                  <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-5 py-4 text-sm text-tertiary">
                    Los datos del formulario de esta revisión no están disponibles (fue enviada antes de que se habilitara el historial de cambios).
                  </div>
                )}

                {/* Sección 1: Información general */}
                {snap && (
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
                    {c.general && (
                      <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <MessageSquare className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                            Comentarios del revisor
                          </span>
                        </div>
                        <p className="text-sm text-on-surface whitespace-pre-wrap">{c.general}</p>
                      </div>
                    )}
                  </section>
                )}

                {/* Comentarios generales cuando no hay snapshot */}
                {!snap && c.general && (
                  <section>
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-5">
                      Información general
                    </h2>
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <MessageSquare className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                          Comentarios del revisor
                        </span>
                      </div>
                      <p className="text-sm text-on-surface whitespace-pre-wrap">{c.general}</p>
                    </div>
                  </section>
                )}

                {/* Sección 2: Roles y habilidades */}
                {snap && (
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
                    {c.roles && (
                      <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <MessageSquare className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                            Comentarios del revisor
                          </span>
                        </div>
                        <p className="text-sm text-on-surface whitespace-pre-wrap">{c.roles}</p>
                      </div>
                    )}
                  </section>
                )}

                {/* Comentarios de roles cuando no hay snapshot */}
                {!snap && c.roles && (
                  <section>
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-5">
                      Roles y habilidades
                    </h2>
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <MessageSquare className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                          Comentarios del revisor
                        </span>
                      </div>
                      <p className="text-sm text-on-surface whitespace-pre-wrap">{c.roles}</p>
                    </div>
                  </section>
                )}

                {!snap && !c.general && !c.roles && (
                  <p className="text-sm text-tertiary italic">Esta revisión no tiene comentarios del revisor.</p>
                )}
                {snap && !c.general && !c.roles && (
                  <p className="text-sm text-tertiary italic">Esta revisión no tiene comentarios del revisor.</p>
                )}
              </div>
            </div>

            {/* Panel footer */}
            <div className="shrink-0 border-t border-outline-variant/30 bg-surface px-6 py-4">
              <div className="max-w-3xl mx-auto">
                <button
                  onClick={() => setSelectedRevision(null)}
                  className="w-full rounded-xl bg-surface-container-high px-4 py-3 text-sm font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
