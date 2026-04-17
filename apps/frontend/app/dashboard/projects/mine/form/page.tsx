'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { createProject, updateProject, getMyProjectById, submitProjectForReview } from '@/lib/services/projects';
import { getCarreras, getHabilidades, type Carrera, type Habilidad } from '@/lib/services/catalogs';
import uvgSwal from '@/lib/swal';
import type { TipoProyecto, ModalidadProyecto, NivelHabilidad } from '@/types';
import { Step1 } from './Step1';
import { Step2 } from './Step2';
import { Step3 } from './Step3';
import {
  STEPS, newRol, newRequisito,
  type FormData, type RolFormItem, type RequisitoFormItem,
} from './types';

export default function NewProjectFormPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id') ? Number(searchParams.get('id')) : null;

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [saving, setSaving] = useState(false);
  const [triedStep1, setTriedStep1] = useState(false);
  const [triedStep2, setTriedStep2] = useState(false);

  const [form, setForm] = useState<FormData>({
    tituloProyecto: '', descripcionProyecto: '', tipoProyecto: '',
    modalidadProyecto: '', objetivosProyecto: '', ubicacionProyecto: '',
    contextoAcademico: '', urlRecursoExterno: '', fechaInicio: '',
    fechaFinEstimada: '', roles: [],
  });

  const { data: carreras = [] } = useQuery<Carrera[]>({ queryKey: ['carreras'], queryFn: getCarreras });
  const { data: habilidades = [] } = useQuery<Habilidad[]>({ queryKey: ['habilidades'], queryFn: getHabilidades });

  const { data: proyectoExistente, isLoading: loadingExistente } = useQuery({
    queryKey: ['proyecto-owner', editId],
    queryFn: () => getMyProjectById(editId!),
    enabled: editId !== null,
  });

  useEffect(() => {
    if (!proyectoExistente) return;
    const p = proyectoExistente;
    setForm({
      tituloProyecto: p.tituloProyecto,
      descripcionProyecto: p.descripcionProyecto ?? '',
      tipoProyecto: p.tipoProyecto as TipoProyecto,
      modalidadProyecto: p.modalidadProyecto as ModalidadProyecto,
      objetivosProyecto: p.objetivosProyecto ?? '',
      ubicacionProyecto: p.ubicacionProyecto ?? '',
      contextoAcademico: p.contextoAcademico ?? '',
      urlRecursoExterno: p.urlRecursoExterno ?? '',
      fechaInicio: p.fechaInicio ? p.fechaInicio.split('T')[0] : '',
      fechaFinEstimada: p.fechaFinEstimada ? p.fechaFinEstimada.split('T')[0] : '',
      roles: p.roles.map((r) => ({
        id: crypto.randomUUID(),
        nombreRol: r.nombreRol,
        descripcionRolProyecto: r.descripcionRolProyecto ?? '',
        idCarreraRequerida: r.carreraRequerida?.idCarrera ?? null,
        cupos: r.cupos,
        horasSemanalesEstimadas: r.horasSemanalesEstimadas ?? '',
        requisitos: r.requisitos.map((req) => ({
          id: crypto.randomUUID(),
          idHabilidad: req.habilidad?.idHabilidad ?? null,
          nivelMinimo: req.nivelMinimo as NivelHabilidad,
          obligatorio: req.obligatorio,
        })),
      })),
    });
  }, [proyectoExistente]);

  const isStep1Complete =
    form.tituloProyecto.trim() !== '' &&
    form.descripcionProyecto.trim() !== '' &&
    form.tipoProyecto !== '' &&
    form.modalidadProyecto !== '';

  const isStep2Complete =
    form.roles.length > 0 &&
    form.roles.every((r) => r.nombreRol.trim() !== '' && r.cupos !== '');

  const goTo = (target: number) => {
    if (target > step && step === 0) setTriedStep1(true);
    if (target > step && step === 1) setTriedStep2(true);
    if (target > step && step === 0 && !isStep1Complete) return;
    setDirection(target > step ? 'forward' : 'backward');
    setStep(target);
  };

  const updateForm = (field: keyof Omit<FormData, 'roles'>, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const addRol = () => setForm((f) => ({ ...f, roles: [...f.roles, newRol()] }));
  const removeRol = (id: string) => setForm((f) => ({ ...f, roles: f.roles.filter((r) => r.id !== id) }));
  const updateRol = (id: string, field: keyof Omit<RolFormItem, 'id' | 'requisitos'>, value: unknown) =>
    setForm((f) => ({ ...f, roles: f.roles.map((r) => r.id === id ? { ...r, [field]: value } : r) }));

  const addRequisito = (rolId: string) =>
    setForm((f) => ({ ...f, roles: f.roles.map((r) => r.id === rolId ? { ...r, requisitos: [...r.requisitos, newRequisito()] } : r) }));
  const removeRequisito = (rolId: string, reqId: string) =>
    setForm((f) => ({ ...f, roles: f.roles.map((r) => r.id === rolId ? { ...r, requisitos: r.requisitos.filter((req) => req.id !== reqId) } : r) }));
  const updateRequisito = (rolId: string, reqId: string, field: keyof Omit<RequisitoFormItem, 'id'>, value: unknown) =>
    setForm((f) => ({ ...f, roles: f.roles.map((r) => r.id === rolId ? { ...r, requisitos: r.requisitos.map((req) => req.id === reqId ? { ...req, [field]: value } : req) } : r) }));

  const buildDataPayload = () => ({
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
    roles: form.roles.length > 0 ? form.roles.map((r) => ({
      nombreRol: r.nombreRol,
      descripcionRolProyecto: r.descripcionRolProyecto || undefined,
      idCarreraRequerida: r.idCarreraRequerida ?? undefined,
      cupos: Number(r.cupos),
      horasSemanalesEstimadas: r.horasSemanalesEstimadas ? Number(r.horasSemanalesEstimadas) : undefined,
      requisitos: r.requisitos
        .filter((req) => req.idHabilidad !== null && req.nivelMinimo !== '')
        .map((req) => ({ idHabilidad: req.idHabilidad!, nivelMinimo: req.nivelMinimo as NivelHabilidad, obligatorio: req.obligatorio })),
    })) : undefined,
  });

  const validateBeforeSubmit = (): string[] => {
    const errors: string[] = [];
    if (form.tituloProyecto.trim() === '') errors.push('El título del proyecto es obligatorio.');
    else if (form.tituloProyecto.trim().length < 5) errors.push('El título debe tener al menos 5 caracteres.');
    if (form.descripcionProyecto.trim() === '') errors.push('La descripción del proyecto es obligatoria.');
    else if (form.descripcionProyecto.trim().length < 20) errors.push('La descripción debe tener al menos 20 caracteres.');
    if (!form.tipoProyecto) errors.push('Debes seleccionar un tipo de proyecto.');
    if (!form.modalidadProyecto) errors.push('Debes seleccionar una modalidad.');
    if (form.fechaInicio && form.fechaFinEstimada && form.fechaFinEstimada < form.fechaInicio)
      errors.push('La fecha de fin estimada no puede ser anterior a la fecha de inicio.');
    form.roles.forEach((r, i) => {
      if (r.nombreRol.trim() === '') errors.push(`Rol ${i + 1}: El nombre del rol es obligatorio.`);
      if (r.cupos === '') errors.push(`Rol ${i + 1}: La cantidad de cupos es obligatoria.`);
      else if (Number(r.cupos) < 1) errors.push(`Rol ${i + 1}: Los cupos deben ser al menos 1.`);
    });
    return errors;
  };

  const parseApiErrors = (raw: unknown): string => {
    const msgs: string[] = Array.isArray((raw as any)?.details)
      ? (raw as any).details
      : raw instanceof Error ? [raw.message] : ['No se pudo guardar el proyecto.'];

    const fieldMap: Record<string, string> = {
      nombreRol: 'Nombre del rol',
      cupos: 'Cupos',
      horasSemanalesEstimadas: 'Horas semanales',
      descripcionRolProyecto: 'Descripción del rol',
      idCarreraRequerida: 'Carrera requerida',
      tituloProyecto: 'Título del proyecto',
      descripcionProyecto: 'Descripción',
      tipoProyecto: 'Tipo de proyecto',
      modalidadProyecto: 'Modalidad',
      fechaInicio: 'Fecha de inicio',
      fechaFinEstimada: 'Fecha fin estimada',
    };

    const translated = msgs.map((msg) => {
      const roleMatch = msg.match(/^roles\.(\d+)\.(\w+)\s+(.+)$/);
      if (roleMatch) {
        const rolNum = Number(roleMatch[1]) + 1;
        const field = fieldMap[roleMatch[2]] ?? roleMatch[2];
        const issue = roleMatch[3]
          .replace('should not be empty', 'es obligatorio')
          .replace('must not be less than 1', 'debe ser al menos 1')
          .replace('must be an integer number', 'debe ser un número entero')
          .replace(/must be longer than or equal to (\d+) characters/, 'debe tener al menos $1 caracteres');
        return `Rol ${rolNum} — ${field}: ${issue}.`;
      }
      return msg
        .replace('tituloProyecto should not be empty', 'El título del proyecto es obligatorio.')
        .replace(/tituloProyecto must be longer than or equal to (\d+) characters/, 'El título debe tener al menos $1 caracteres.')
        .replace('descripcionProyecto should not be empty', 'La descripción es obligatoria.')
        .replace(/descripcionProyecto must be longer than or equal to (\d+) characters/, 'La descripción debe tener al menos $1 caracteres.')
        .replace(/tipoProyecto must be one of.*/, 'El tipo de proyecto seleccionado no es válido.')
        .replace(/modalidadProyecto must be one of.*/, 'La modalidad seleccionada no es válida.')
        .replace(/property \w+ should not exist/, '');
    }).filter(Boolean);

    return translated.join('\n') || 'No se pudo guardar el proyecto.';
  };

  const submit = async (accion: 'BORRADOR' | 'EN_REVISION') => {
    const clientErrors = validateBeforeSubmit();
    if (clientErrors.length > 0) {
      uvgSwal.fire({
        icon: 'warning',
        title: 'Campos incompletos',
        html: `<ul class="text-left text-sm space-y-1">${clientErrors.map(e => `<li>• ${e}</li>`).join('')}</ul>`,
      });
      return;
    }

    setSaving(true);
    try {
      if (editId) {
        await updateProject(editId, buildDataPayload());
        if (accion === 'EN_REVISION') {
          await submitProjectForReview(editId);
          await uvgSwal.fire({ icon: 'success', title: 'Proyecto enviado', text: 'Tu proyecto ha sido enviado a revisión.', timer: 2000, showConfirmButton: false });
        } else {
          await uvgSwal.fire({ icon: 'success', title: 'Borrador guardado', text: 'Los cambios han sido guardados.', timer: 1500, showConfirmButton: false });
        }
        await queryClient.invalidateQueries({ queryKey: ['proyecto-owner', editId] });
        await queryClient.invalidateQueries({ queryKey: ['mis-proyectos'] });
        router.push('/dashboard/projects/mine');
      } else {
        await createProject({ ...buildDataPayload(), accion });
        await queryClient.invalidateQueries({ queryKey: ['mis-proyectos'] });
        await uvgSwal.fire({
          icon: 'success',
          title: accion === 'BORRADOR' ? 'Borrador guardado' : 'Proyecto enviado',
          text: accion === 'BORRADOR' ? 'Tu proyecto ha sido guardado como borrador.' : 'Tu proyecto ha sido enviado a revisión.',
          timer: 2000,
          showConfirmButton: false,
        });
        router.push('/dashboard/projects/mine');
      }
    } catch (err: unknown) {
      uvgSwal.fire({
        icon: 'error',
        title: 'No se pudo guardar',
        html: `<p class="text-sm whitespace-pre-line">${parseApiErrors(err)}</p>`,
      });
    } finally {
      setSaving(false);
    }
  };

  const animClass = direction === 'forward'
    ? 'animate-in fade-in-0 slide-in-from-right-4 duration-200'
    : 'animate-in fade-in-0 slide-in-from-left-4 duration-200';

  if (loadingExistente) {
    return (
      <DashboardLayout>
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="bg-surface rounded-2xl border border-outline-variant shadow-2xl px-12 py-10 text-tertiary text-sm">
            Cargando proyecto...
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Scrim */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
        <div className="w-full max-w-2xl bg-surface rounded-2xl border border-outline-variant shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="px-8 pt-8 pb-4">
            <h1 className="font-headline text-xl font-extrabold text-on-surface">{editId ? 'Editar proyecto' : 'Crear proyecto'}</h1>
            <p className="text-tertiary text-sm mt-0.5">{STEPS[step]} — Paso {step + 1} de {STEPS.length}</p>
          </div>

          {/* Barra de progreso */}
          <div className="flex gap-2 px-8 pb-6">
            {STEPS.map((_, i) => (
              <button key={i} onClick={() => goTo(i)} className={`h-1.5 flex-1 rounded-full cursor-pointer transition-colors duration-200 ${i <= step ? 'bg-primary' : 'bg-surface-container-highest'}`} />
            ))}
          </div>

          {/* Contenido animado */}
          <div key={step} className={`px-8 pb-6 ${animClass}`}>
            {step === 0 && <Step1 form={form} update={updateForm} showErrors={triedStep1} />}
            {step === 1 && (
              <Step2
                roles={form.roles} carreras={carreras} habilidades={habilidades}
                showErrors={triedStep2}
                onAddRol={addRol} onRemoveRol={removeRol} onUpdateRol={updateRol}
                onAddRequisito={addRequisito} onRemoveRequisito={removeRequisito} onUpdateRequisito={updateRequisito}
              />
            )}
            {step === 2 && (
              <Step3
                form={form} saving={saving}
                isStep1Complete={isStep1Complete} isStep2Complete={isStep2Complete}
                onSubmit={submit}
              />
            )}
          </div>

          {/* Footer de navegación */}
          <div className="flex items-center justify-between px-8 py-5 border-t border-outline-variant">
            {/* Izquierda: Cancelar (paso 1) o Anterior (pasos 2-3) */}
            {step === 0 ? (
              <button
                onClick={() => router.push('/dashboard/projects/mine')}
                className="flex items-center gap-2 bg-transparent text-white border-2 border-error px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-error/10 transition-all duration-200"
              >
                <X className="w-4 h-4 text-error" />
                <span className="text-error">Cancelar</span>
              </button>
            ) : (
              <button
                onClick={() => goTo(step - 1)}
                className="flex items-center gap-2 text-sm font-bold text-tertiary hover:text-on-surface transition-all duration-200"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
            )}

            {/* Derecha: Siguiente o hint */}
            {step < 2 ? (
              <button
                onClick={() => goTo(step + 1)}
                className="flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-all duration-200"
              >
                Siguiente
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <span className="text-xs text-tertiary italic">Usa los botones de arriba para guardar</span>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
