'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { getCarreras, getHabilidades, type Carrera, type Habilidad } from '@/lib/services/catalogs';
import uvgSwal from '@/lib/swal';
import { NIVEL_LABEL, type NivelHabilidad } from '@/types';
import type { ProjectRoleDTO, CreateRoleInput } from '@/lib/services/roles';
import type { useProjectRoles } from '@/hooks/use-project-roles';

type ProjectRolesHook = ReturnType<typeof useProjectRoles>;

const SIN_CARRERA = '__sin_carrera__';

let requisitoKeySeq = 0;
const nextRequisitoKey = () => `req-${requisitoKeySeq++}`;

const FIELD_STYLE =
  'h-10 rounded-md border-outline-variant/50 bg-surface-container-lowest text-sm text-on-surface placeholder:text-on-surface-variant/55 focus-visible:border-primary dark:bg-surface-container-low';
const FORM_LABEL_STYLE = 'text-sm font-semibold text-on-surface';
const FORM_SECTION_STYLE =
  'rounded-[10px] border border-outline-variant/45 bg-surface-container-lowest p-4 shadow-sm dark:bg-surface-container-low';

/** Con qué sección abre el Sheet: lista, creación directa o edición de un rol. */
export type RolesSheetIntent =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; role: ProjectRoleDTO };

type RoleSheetEntryContext = 'DIRECT' | 'MANAGER';
type RoleSheetView = 'LIST' | 'CREATE' | 'EDIT';

function mostrarAvisoRolGuardado(view: 'CREATE' | 'EDIT') {
  void uvgSwal.fire({
    toast: true,
    backdrop: false,
    icon: 'success',
    title: view === 'CREATE' ? 'Rol creado' : 'Cambios guardados',
    text:
      view === 'CREATE'
        ? 'El rol se agregó al proyecto.'
        : 'El rol se actualizó correctamente.',
    position: 'top-end',
    timer: 1800,
    timerProgressBar: true,
    showConfirmButton: false,
  });
}

interface ProjectRolesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: ProjectRoleDTO[];
  crearRol: ProjectRolesHook['crearRol'];
  editarRol: ProjectRolesHook['editarRol'];
  eliminarRol: ProjectRolesHook['eliminarRol'];
  /** Sección con la que abrir (Agregar rol → create, Editar rol → edit). */
  intent?: RolesSheetIntent;
}

interface RequisitoForm {
  key: string;
  idHabilidad: number | null;
  nivelMinimo: NivelHabilidad | '';
  obligatorio: boolean;
}

interface FormState {
  nombreRol: string;
  descripcionRolProyecto: string;
  idCarreraRequerida: string;
  cupos: string;
  horasSemanalesEstimadas: string;
  requisitos: RequisitoForm[];
}

const FORM_VACIO: FormState = {
  nombreRol: '',
  descripcionRolProyecto: '',
  idCarreraRequerida: SIN_CARRERA,
  cupos: '1',
  horasSemanalesEstimadas: '',
  requisitos: [],
};

function roleAFormState(role: ProjectRoleDTO): FormState {
  return {
    nombreRol: role.nombreRol,
    descripcionRolProyecto: role.descripcionRolProyecto ?? '',
    idCarreraRequerida:
      role.idCarreraRequerida != null ? String(role.idCarreraRequerida) : SIN_CARRERA,
    cupos: String(role.cupos),
    horasSemanalesEstimadas:
      role.horasSemanalesEstimadas != null ? String(role.horasSemanalesEstimadas) : '',
    requisitos: role.requisitos.map((req) => ({
      key: nextRequisitoKey(),
      idHabilidad: req.idHabilidad,
      nivelMinimo: (req.nivelMinimo as NivelHabilidad) ?? '',
      obligatorio: req.obligatorio,
    })),
  };
}

function formStateAInput(form: FormState): CreateRoleInput {
  const cupos = Number.parseInt(form.cupos, 10);
  const horas = form.horasSemanalesEstimadas.trim()
    ? Number.parseInt(form.horasSemanalesEstimadas, 10)
    : null;
  return {
    nombreRol: form.nombreRol.trim(),
    descripcionRolProyecto: form.descripcionRolProyecto.trim() || null,
    idCarreraRequerida:
      form.idCarreraRequerida === SIN_CARRERA ? null : Number.parseInt(form.idCarreraRequerida, 10),
    cupos,
    horasSemanalesEstimadas: horas,
    // Reemplaza el conjunto completo de habilidades (Sección 8): las que se
    // conservan siguen; las retiradas desaparecen. No expulsa participantes.
    requisitos: form.requisitos
      .filter((req) => req.idHabilidad != null && req.nivelMinimo !== '')
      .map((req) => ({
        idHabilidad: req.idHabilidad as number,
        nivelMinimo: req.nivelMinimo as NivelHabilidad,
        obligatorio: req.obligatorio,
      })),
  };
}

/**
 * Gestión de roles del líder en un Sheet (Sección 23). Campos reales soportados
 * por el backend: nombre, descripción, carrera/área, habilidades + nivel y
 * obligatoriedad, horas semanales y cupos. Carreras/habilidades/niveles vienen
 * de los catálogos reales (`getCarreras`/`getHabilidades`/`NIVEL_LABEL`) — nada
 * hardcodeado. Cada operación se guarda de inmediato; durante la mutación el
 * botón se deshabilita y muestra spinner; si falla, el formulario se conserva
 * con sus valores y se muestra el mensaje real.
 */
export function ProjectRolesSheet({
  open,
  onOpenChange,
  roles,
  crearRol,
  editarRol,
  eliminarRol,
  intent,
}: ProjectRolesSheetProps) {
  const [entryContext, setEntryContext] = useState<RoleSheetEntryContext>('MANAGER');
  const [view, setView] = useState<RoleSheetView>('LIST');
  const [rolEditando, setRolEditando] = useState<ProjectRoleDTO | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [rolAEliminar, setRolAEliminar] = useState<ProjectRoleDTO | null>(null);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const { data: carreras = [] } = useQuery<Carrera[]>({
    queryKey: ['carreras'],
    queryFn: getCarreras,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const { data: habilidades = [] } = useQuery<Habilidad[]>({
    queryKey: ['habilidades'],
    queryFn: getHabilidades,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const guardando = crearRol.isPending || editarRol.isPending;

  const resetSheetState = () => {
    setEntryContext('MANAGER');
    setView('LIST');
    setRolEditando(null);
    setForm(FORM_VACIO);
    setErrorForm(null);
    setRolAEliminar(null);
  };

  const abrirCrear = (context: RoleSheetEntryContext = entryContext) => {
    setEntryContext(context);
    setForm(FORM_VACIO);
    setRolEditando(null);
    setErrorForm(null);
    setView('CREATE');
  };
  const abrirEditar = (role: ProjectRoleDTO, context: RoleSheetEntryContext = entryContext) => {
    setEntryContext(context);
    setForm(roleAFormState(role));
    setRolEditando(role);
    setErrorForm(null);
    setView('EDIT');
  };
  const volverALista = () => {
    setView('LIST');
    setRolEditando(null);
    setForm(FORM_VACIO);
    setErrorForm(null);
  };
  const cerrarSheet = () => {
    resetSheetState();
    onOpenChange(false);
  };
  const cancelarFormulario = () => {
    if (entryContext === 'DIRECT') cerrarSheet();
    else volverALista();
  };
  const handleOperacionExitosa = () => {
    if (entryContext === 'DIRECT') cerrarSheet();
    else volverALista();
  };

  // Aplica la sección con la que el padre abrió el Sheet (Agregar rol / Editar
  // rol) una sola vez por apertura. Sin `intent`, abre en la lista.
  useEffect(() => {
    if (!open) return;
    if (!intent || intent.kind === 'list') {
      setEntryContext('MANAGER');
      volverALista();
    } else if (intent.kind === 'create') {
      abrirCrear('DIRECT');
    } else if (intent.kind === 'edit') {
      abrirEditar(intent.role, 'DIRECT');
    }
    // Solo al abrir: el padre fija `intent` antes de poner open=true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setCampo = <K extends keyof FormState>(campo: K, valor: FormState[K]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const agregarRequisito = () =>
    setForm((f) => ({
      ...f,
      requisitos: [
        ...f.requisitos,
        { key: nextRequisitoKey(), idHabilidad: null, nivelMinimo: '', obligatorio: false },
      ],
    }));
  const actualizarRequisito = (key: string, patch: Partial<RequisitoForm>) =>
    setForm((f) => ({
      ...f,
      requisitos: f.requisitos.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    }));
  const quitarRequisito = (key: string) =>
    setForm((f) => ({ ...f, requisitos: f.requisitos.filter((r) => r.key !== key) }));

  const validar = (input: CreateRoleInput): string | null => {
    if (!input.nombreRol) return 'El nombre del rol es requerido.';
    if (!Number.isInteger(input.cupos) || input.cupos < 1) return 'Los cupos deben ser al menos 1.';
    if (
      input.horasSemanalesEstimadas != null &&
      (!Number.isInteger(input.horasSemanalesEstimadas) || input.horasSemanalesEstimadas < 1)
    ) {
      return 'Las horas semanales deben ser un número mayor o igual a 1.';
    }
    // Cada fila de habilidad iniciada debe tener habilidad y nivel.
    const incompleta = form.requisitos.some(
      (r) => (r.idHabilidad != null) !== (r.nivelMinimo !== ''),
    );
    if (incompleta) return 'Completa la habilidad y su nivel en cada fila (o elimínala).';
    // Reducir cupos por debajo de los participantes activos ⇒ 400 en backend;
    // se anticipa aquí para no enviar una petición inútil.
    if (view === 'EDIT' && rolEditando && input.cupos < rolEditando.participantesActivos) {
      return `No puedes reducir los cupos a ${input.cupos}: el rol tiene ${rolEditando.participantesActivos} participante(s) activo(s).`;
    }
    return null;
  };

  const handleGuardar = () => {
    const input = formStateAInput(form);
    const errorValidacion = validar(input);
    if (errorValidacion) {
      setErrorForm(errorValidacion);
      return;
    }
    setErrorForm(null);

    const onError = (error: unknown) => setErrorForm(getApiErrorMessage(error, 'role'));
    if (view === 'CREATE') {
      crearRol.mutate(input, {
        onSuccess: () => {
          mostrarAvisoRolGuardado('CREATE');
          handleOperacionExitosa();
        },
        onError,
      });
    } else if (view === 'EDIT' && rolEditando) {
      editarRol.mutate(
        { roleId: rolEditando.idRolProyecto, input },
        {
          onSuccess: () => {
            mostrarAvisoRolGuardado('EDIT');
            handleOperacionExitosa();
          },
          onError,
        },
      );
    }
  };

  const handleEliminar = () => {
    if (!rolAEliminar) return;
    eliminarRol.mutate(
      { roleId: rolAEliminar.idRolProyecto },
      { onSuccess: () => setRolAEliminar(null) },
    );
  };

  const errorEliminar =
    eliminarRol.isError && rolAEliminar ? getApiErrorMessage(eliminarRol.error, 'role') : null;
  const sheetCopy = useMemo(() => {
    if (view === 'CREATE') {
      return {
        closeLabel: 'Cerrar formulario para agregar rol',
      };
    }
    if (view === 'EDIT') {
      return {
        closeLabel: 'Cerrar formulario para editar rol',
      };
    }
    return {
      closeLabel: 'Cerrar administración de roles',
    };
  }, [view]);

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          resetSheetState();
        }
        onOpenChange(nextOpen);
      }}
    >
      <SheetContent
        side="right"
        closeLabel={sheetCopy.closeLabel}
        // Evita que Radix enfoque/seleccione automáticamente el primer campo al
        // abrir (el nombre del rol aparecía preseleccionado en edición). Se
        // comporta como el formulario de crear/editar tarea.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[96vw] gap-0 overflow-hidden border-outline-variant bg-surface-container-lowest p-0 text-on-surface shadow-lg sm:w-[78vw] sm:max-w-[620px] lg:w-[600px]"
      >
        <SheetHeader className="shrink-0 border-b border-outline-variant/35 bg-surface-container-lowest px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-start gap-2 pr-10">
            {entryContext === 'MANAGER' && view !== 'LIST' && (
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                onClick={volverALista}
                aria-label="Volver a la lista de roles"
                className="-ml-2 -mt-1 rounded-md text-tertiary hover:bg-surface-container-high hover:text-on-surface"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Button>
            )}
            <div>
              <SheetTitle className="text-[21px] font-bold leading-tight">Gestionar roles</SheetTitle>
              <SheetDescription className="mt-1 max-w-[420px] text-sm leading-5 text-on-surface-variant">
                Crea, edita o elimina los roles del proyecto. Cada cambio se guarda por separado.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {view === 'LIST' ? (
            <div>
              <Button
                type="button"
                onClick={() => abrirCrear('MANAGER')}
                aria-label="Crear nuevo rol"
                className="mb-4 min-h-11 w-full gap-2 rounded-lg bg-primary text-sm font-semibold text-on-primary hover:bg-primary/90"
              >
                <Plus className="size-4" aria-hidden="true" />
                Nuevo rol
              </Button>

              {roles.length === 0 ? (
                <div className="rounded-lg border border-dashed border-outline-variant/50 bg-surface-container-low px-4 py-8 text-center">
                  <h3 className="text-sm font-bold text-on-surface">Aún no hay roles en este proyecto</h3>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-on-surface-variant">
                    Crea el primer rol para comenzar a organizar a los integrantes.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => abrirCrear('MANAGER')}
                    className="mt-4 rounded-lg bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
                  >
                    Crear primer rol
                  </Button>
                </div>
              ) : (
                <section className={FORM_SECTION_STYLE}>
                  <h3 className="mb-3 text-sm font-bold text-on-surface">Roles existentes</h3>
                  <ul className="space-y-2.5">
                  {roles.map((role) => (
                    <li
                      key={role.idRolProyecto}
                      data-testid="role-list-card"
                      className="min-h-[68px] rounded-lg border border-outline-variant/45 bg-surface-container-lowest px-3.5 py-3 transition-colors hover:bg-surface-container-low dark:bg-surface-container dark:hover:bg-surface-container-high"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold leading-5 text-on-surface">{role.nombreRol}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-tertiary">
                            <Users className="size-4" aria-hidden="true" />
                            {role.participantesActivos}/{role.cupos} ocupados
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Editar rol ${role.nombreRol}`}
                            onClick={() => abrirEditar(role, 'MANAGER')}
                            className="size-10 rounded-md hover:bg-primary/10 hover:text-primary"
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Eliminar rol ${role.nombreRol}`}
                            onClick={() => setRolAEliminar(role)}
                            className="size-10 rounded-md text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                  </ul>
                </section>
              )}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleGuardar();
              }}
              className="space-y-4"
            >
              <section className={FORM_SECTION_STYLE}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-on-surface">
                      {view === 'CREATE' ? 'Nueva posición' : 'Editar posición'}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                      {view === 'CREATE'
                        ? 'Completa los datos del rol disponible para los integrantes.'
                        : 'Actualiza la información detallada del rol seleccionado.'}
                    </p>
                  </div>
                  {view === 'EDIT' && rolEditando && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                      {rolEditando.participantesActivos}/{rolEditando.cupos} ocupados
                    </span>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="rol-nombre" className={FORM_LABEL_STYLE}>Nombre del rol</Label>
                    <Input
                      id="rol-nombre"
                      value={form.nombreRol}
                      onChange={(e) => setCampo('nombreRol', e.target.value)}
                      maxLength={255}
                      required
                      placeholder="Ej. Desarrollador Backend"
                      className={FIELD_STYLE}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="rol-descripcion" className={FORM_LABEL_STYLE}>Descripción</Label>
                    <Textarea
                      id="rol-descripcion"
                      value={form.descripcionRolProyecto}
                      onChange={(e) => setCampo('descripcionRolProyecto', e.target.value)}
                      rows={4}
                      placeholder="Describe las responsabilidades principales del rol."
                      className="min-h-[88px] resize-y rounded-md border-outline-variant/50 bg-surface-container-lowest text-sm text-on-surface placeholder:text-on-surface-variant/55 focus-visible:border-primary dark:bg-surface-container-low"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="rol-carrera" className={FORM_LABEL_STYLE}>Carrera / área</Label>
                    <Select
                      value={form.idCarreraRequerida}
                      onValueChange={(v) => setCampo('idCarreraRequerida', v)}
                    >
                      <SelectTrigger id="rol-carrera" aria-label="Carrera o área" className={FIELD_STYLE}>
                        <SelectValue placeholder="Sin carrera específica" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SIN_CARRERA}>Sin carrera específica</SelectItem>
                        {carreras.map((c) => (
                          <SelectItem key={c.idCarrera} value={String(c.idCarrera)}>
                            {c.nombreCarrera}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="rol-cupos" className={FORM_LABEL_STYLE}>Cupos</Label>
                      <Input
                        id="rol-cupos"
                        type="number"
                        min={1}
                        value={form.cupos}
                        onChange={(e) => setCampo('cupos', e.target.value)}
                        required
                        className={FIELD_STYLE}
                      />
                      {view === 'EDIT' && rolEditando && (
                        <p className="mt-1 text-xs text-tertiary">
                          {rolEditando.participantesActivos} activo(s); no puedes bajar de ese número.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rol-horas" className={FORM_LABEL_STYLE}>Horas / semana</Label>
                      <Input
                        id="rol-horas"
                        type="number"
                        min={1}
                        value={form.horasSemanalesEstimadas}
                        onChange={(e) => setCampo('horasSemanalesEstimadas', e.target.value)}
                        placeholder="Opcional"
                        className={FIELD_STYLE}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className={FORM_SECTION_STYLE}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Label className="mb-0 text-sm font-bold text-on-surface">Habilidades requeridas</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={agregarRequisito}
                    className="h-8 gap-1 rounded-md px-2 text-xs font-bold text-primary hover:bg-primary/10"
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    Agregar habilidad
                  </Button>
                </div>
                {form.requisitos.length === 0 ? (
                  <p className="rounded-md bg-surface-container-low px-3 py-3 text-xs text-tertiary">
                    Sin habilidades requeridas.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {form.requisitos.map((req, idx) => (
                      <li
                        key={req.key}
                        data-testid="role-skill-row"
                        className="grid grid-cols-1 gap-2 rounded-lg border border-outline-variant/35 bg-surface-container-low p-2.5 sm:grid-cols-[minmax(0,1fr)_150px_auto_40px] sm:items-center dark:bg-surface-container"
                      >
                        <Select
                          value={req.idHabilidad != null ? String(req.idHabilidad) : '__none__'}
                          onValueChange={(v) =>
                            actualizarRequisito(req.key, {
                              idHabilidad: v === '__none__' ? null : Number(v),
                            })
                          }
                        >
                          <SelectTrigger aria-label={`Habilidad ${idx + 1}`} className={FIELD_STYLE}>
                            <SelectValue placeholder="Habilidad" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Seleccionar habilidad</SelectItem>
                            {habilidades.map((h) => (
                              <SelectItem key={h.idHabilidad} value={String(h.idHabilidad)}>
                                {h.nombreHabilidad}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={req.nivelMinimo || '__none__'}
                          onValueChange={(v) =>
                            actualizarRequisito(req.key, {
                              nivelMinimo: v === '__none__' ? '' : (v as NivelHabilidad),
                            })
                          }
                        >
                          <SelectTrigger aria-label={`Nivel de la habilidad ${idx + 1}`} className={FIELD_STYLE}>
                            <SelectValue placeholder="Nivel" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(NIVEL_LABEL).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <label className="flex min-h-10 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-1 text-xs text-tertiary">
                          <input
                            type="checkbox"
                            checked={req.obligatorio}
                            onChange={(e) =>
                              actualizarRequisito(req.key, { obligatorio: e.target.checked })
                            }
                            className="accent-primary"
                            aria-label={`Habilidad ${idx + 1} obligatoria`}
                          />
                          Oblig.
                        </label>

                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Quitar habilidad ${idx + 1}`}
                          onClick={() => quitarRequisito(req.key)}
                          className="size-10 rounded-md text-tertiary hover:bg-surface-container-high hover:text-on-surface"
                        >
                          <X className="size-4" aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {errorForm && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                  {errorForm}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelarFormulario}
                  disabled={guardando}
                  aria-label={view === 'CREATE' ? 'Cancelar creación de rol' : `Cancelar edición del rol ${rolEditando?.nombreRol ?? ''}`}
                  className="h-10 rounded-md border-outline-variant bg-surface-container-lowest px-4 text-sm font-semibold text-on-surface hover:bg-surface-container-low dark:bg-surface-container dark:hover:bg-surface-container-high"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={guardando}
                  className="h-10 gap-1.5 rounded-md bg-primary px-5 text-sm font-semibold text-on-primary hover:bg-primary/90"
                >
                  {guardando && <Spinner className="size-3.5" />}
                  {view === 'CREATE' ? 'Crear rol' : 'Guardar cambios'}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Confirmación de eliminación (Sección 9: rechazo 400 si el rol tiene historial) */}
        <AlertDialog open={rolAEliminar !== null} onOpenChange={(o) => !o && setRolAEliminar(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar rol</AlertDialogTitle>
              <AlertDialogDescription>
                {rolAEliminar
                  ? `Se eliminará el rol "${rolAEliminar.nombreRol}". Solo es posible si nunca fue utilizado (sin participaciones, tareas ni postulaciones). Sus habilidades requeridas se eliminan junto con el rol.`
                  : ''}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {errorEliminar && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {errorEliminar}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={eliminarRol.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={eliminarRol.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  handleEliminar();
                }}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {eliminarRol.isPending ? 'Eliminando…' : 'Eliminar rol'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
