'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Flag,
  Loader2,
  TriangleAlert,
} from 'lucide-react';
import {
  useAdjustSprintHours,
  useCloseSprint,
  useSprintClosingSummary,
} from '@/hooks/use-project-sprints';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import uvgSwal from '@/lib/swal';
import {
  buildParticipationBaselines,
  defaultSprintClosingFormValues,
  planParticipationAdjustments,
  sprintClosingFormSchema,
  type SprintClosingFormValues,
} from '@/components/projects/sprint-closing-form.schema';
import type { SprintClosingSummaryDto, SprintClosingSummaryParticipantDto } from '@/lib/types/sprints';

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function formatearHoras(horas: number): string {
  return horas.toLocaleString('es-GT', { maximumFractionDigits: 2 });
}

function mensajeDeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}

function ClosingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

/** Cabecera de una participación dentro del desglose multirol — solo lectura. */
function ParticipationHeaderCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-tertiary">{label}</p>
      <p className="text-sm font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function ParticipationEditRow({
  index,
  nombreRol,
  disabled,
}: {
  index: number;
  nombreRol: string;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 border-t border-outline-variant/30 py-3 first:border-t-0 sm:grid-cols-[1fr_auto_1fr] sm:items-start sm:gap-4">
      <p className="text-sm font-semibold text-on-surface sm:pt-2">{nombreRol}</p>
      <FormField
        name={`participaciones.${index}.horasAprobadas`}
        render={({ field }) => (
          <FormItem className="w-full sm:w-28">
            <FormControl>
              <Input
                {...field}
                type="number"
                step="0.01"
                min={0}
                disabled={disabled}
                aria-label={`Horas aprobadas — ${nombreRol}`}
                className="h-9 text-sm"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        name={`participaciones.${index}.justificacionAjuste`}
        render={({ field }) => (
          <FormItem className="w-full">
            <FormControl>
              <Textarea
                {...field}
                disabled={disabled}
                rows={1}
                placeholder="Sin ajustes"
                aria-label={`Justificación de ajuste — ${nombreRol}`}
                className="min-h-9 py-1.5 text-sm"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function ParticipantRow({
  participante,
  indexByParticipacion,
  totalAprobadas,
  disabled,
}: {
  participante: SprintClosingSummaryParticipantDto;
  indexByParticipacion: Map<number, number>;
  totalAprobadas: number;
  disabled: boolean;
}) {
  const [expandido, setExpandido] = useState(false);
  const esMultirol = participante.participaciones.length > 1;
  const primeraParticipacion = participante.participaciones[0];
  const primerIndex = primeraParticipacion ? indexByParticipacion.get(primeraParticipacion.idParticipacion) : undefined;

  return (
    <>
      <TableRow className="border-outline-variant/40 align-top">
        <TableCell className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Avatar className="size-8 shrink-0">
              {participante.fotoUrl && <AvatarImage src={participante.fotoUrl} alt="" />}
              <AvatarFallback className="bg-primary-container text-xs font-bold text-on-primary-container">
                {getInitials(participante.nombre, participante.apellido)}
              </AvatarFallback>
            </Avatar>
            <span className="whitespace-nowrap text-sm font-medium text-on-surface">
              {participante.nombre} {participante.apellido}
            </span>
          </div>
        </TableCell>
        <TableCell className="whitespace-normal px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {participante.roles.map((rol) => (
              <span
                key={rol.idRolProyecto}
                className="inline-flex items-center rounded-full bg-secondary-container/30 px-2 py-0.5 text-xs font-bold text-secondary"
              >
                {rol.nombreRol}
              </span>
            ))}
          </div>
        </TableCell>
        <TableCell className="px-4 py-3 text-sm text-on-surface">{participante.tareasRealizadas}</TableCell>
        <TableCell className="whitespace-nowrap px-4 py-3 text-sm text-on-surface">
          {formatearHoras(participante.horasReportadas)} h
        </TableCell>
        <TableCell className="whitespace-nowrap px-4 py-3 text-sm text-on-surface">
          {formatearHoras(participante.horasCalculadas)} h
        </TableCell>
        {esMultirol ? (
          <>
            <TableCell className="whitespace-nowrap px-4 py-3 text-sm font-bold text-on-surface">
              {formatearHoras(totalAprobadas)} h
            </TableCell>
            <TableCell className="px-4 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExpandido((v) => !v)}
                className="gap-1.5 rounded-lg border-outline-variant text-xs font-bold"
              >
                {expandido ? (
                  <>
                    Ocultar detalle por rol
                    <ChevronUp className="size-3.5" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    Ver detalle por rol
                    <ChevronDown className="size-3.5" aria-hidden="true" />
                  </>
                )}
              </Button>
            </TableCell>
          </>
        ) : primerIndex !== undefined ? (
          <>
            <TableCell className="px-4 py-3">
              <FormField
                name={`participaciones.${primerIndex}.horasAprobadas`}
                render={({ field }) => (
                  <FormItem className="w-28">
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="0.01"
                        min={0}
                        disabled={disabled}
                        aria-label={`Horas aprobadas — ${participante.nombre} ${participante.apellido}`}
                        className="h-9 text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TableCell>
            <TableCell className="px-4 py-3">
              <FormField
                name={`participaciones.${primerIndex}.justificacionAjuste`}
                render={({ field }) => (
                  <FormItem className="min-w-48">
                    <FormControl>
                      <Textarea
                        {...field}
                        disabled={disabled}
                        rows={1}
                        placeholder="Sin ajustes"
                        aria-label={`Justificación de ajuste — ${participante.nombre} ${participante.apellido}`}
                        className="min-h-9 py-1.5 text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TableCell>
          </>
        ) : (
          <TableCell colSpan={2} className="px-4 py-3 text-sm text-tertiary">
            Sin cálculo disponible
          </TableCell>
        )}
      </TableRow>
      {esMultirol && expandido && (
        <TableRow className="border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-low">
          <TableCell colSpan={7} className="px-4 py-4">
            <div className="space-y-1">
              <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <ParticipationHeaderCell label="Rol" value="" />
                <ParticipationHeaderCell label="Aprobadas" value="" />
                <ParticipationHeaderCell label="Justificación" value="" />
              </div>
              {participante.participaciones.map((participacion) => {
                const index = indexByParticipacion.get(participacion.idParticipacion);
                if (index === undefined) return null;
                if (participacion.horasCalculadas === null) {
                  return (
                    <div
                      key={participacion.idParticipacion}
                      className="border-t border-outline-variant/30 py-3 first:border-t-0"
                    >
                      <p className="text-sm font-semibold text-on-surface">{participacion.nombreRol}</p>
                      <p className="text-xs text-tertiary">Sin cálculo disponible para esta participación.</p>
                    </div>
                  );
                }
                return (
                  <ParticipationEditRow
                    key={participacion.idParticipacion}
                    index={index}
                    nombreRol={participacion.nombreRol}
                    disabled={disabled}
                  />
                );
              })}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function SprintClosingForm({
  idProyecto,
  idSprint,
  summary,
}: {
  idProyecto: number;
  idSprint: number;
  summary: SprintClosingSummaryDto;
}) {
  const router = useRouter();
  const adjustHours = useAdjustSprintHours(idProyecto, idSprint);
  const closeSprint = useCloseSprint(idProyecto);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const baseline = useMemo(() => buildParticipationBaselines(summary), [summary]);
  const participacionToUsuario = useMemo(() => {
    const map = new Map<number, number>();
    for (const participante of summary.participantes) {
      for (const participacion of participante.participaciones) {
        map.set(participacion.idParticipacion, participante.idUsuario);
      }
    }
    return map;
  }, [summary]);

  const form = useForm<SprintClosingFormValues>({
    resolver: zodResolver(sprintClosingFormSchema),
    defaultValues: defaultSprintClosingFormValues(summary),
  });

  const { fields } = useFieldArray({ control: form.control, name: 'participaciones' });
  const indexByParticipacion = useMemo(() => {
    const map = new Map<number, number>();
    fields.forEach((field, index) => map.set(field.idParticipacion, index));
    return map;
  }, [fields]);

  const filasVigiladas = useWatch({ control: form.control, name: 'participaciones' });
  const totalesAprobadasPorUsuario = useMemo(() => {
    const totales = new Map<number, number>();
    for (const fila of filasVigiladas ?? []) {
      const idUsuario = participacionToUsuario.get(fila.idParticipacion);
      if (idUsuario === undefined) continue;
      const valor = Number(fila.horasAprobadas);
      totales.set(idUsuario, (totales.get(idUsuario) ?? 0) + (Number.isFinite(valor) ? valor : 0));
    }
    return totales;
  }, [filasVigiladas, participacionToUsuario]);

  const disabled = isSubmitting || adjustHours.isPending || closeSprint.isPending;

  const onSubmit = async (values: SprintClosingFormValues) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const ajustes = planParticipationAdjustments(values, baseline);
      // Secuencial (no Promise.all): cada PATCH ya es independiente y seguro
      // en el backend (acota por idParticipacion+idSprint+proyecto, nunca
      // toca otra participación — ver A7.1), pero una secuencia explícita
      // simplifica razonar sobre un fallo parcial: si el ajuste N falla, los
      // N-1 anteriores ya quedaron persistidos en backend (correcto, A7 no
      // tiene rollback ni lo necesita) y el cierre simplemente no se alcanza.
      for (const ajuste of ajustes) {
        await adjustHours.mutateAsync(ajuste);
      }

      await closeSprint.mutateAsync(idSprint);

      void uvgSwal.fire({
        icon: 'success',
        title: 'Sprint cerrado',
        text: 'Las horas aprobadas y los aportes quedaron registrados en el historial del proyecto.',
        timer: 2200,
        timerProgressBar: true,
        showConfirmButton: false,
      });
      router.push(`/dashboard/proyectos/${idProyecto}`);
    } catch (error) {
      setSubmitError(mensajeDeError(error));
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest">
          <Table>
            <TableHeader>
              <TableRow className="border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-low">
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Integrante
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Roles
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Tareas realizadas
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Horas reportadas
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Horas calculadas
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Horas aprobadas
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Justificación de ajuste
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.participantes.map((participante) => (
                <ParticipantRow
                  key={participante.idUsuario}
                  participante={participante}
                  indexByParticipacion={indexByParticipacion}
                  totalAprobadas={
                    totalesAprobadasPorUsuario.get(participante.idUsuario) ?? participante.horasAprobadas
                  }
                  disabled={disabled}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        {submitError && (
          <p role="alert" className="text-sm font-medium text-error">
            {submitError}
          </p>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={disabled}
            className="gap-1.5 rounded-lg bg-primary px-6 text-sm font-bold text-on-primary hover:bg-primary/90"
          >
            {disabled && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {disabled ? 'Confirmando cierre...' : 'Confirmar cierre del Sprint'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/**
 * Sin participantes no hay nada que ajustar (A7 no aplica), pero A9 no
 * exige contribuciones para cerrar un Sprint — `closeSprint` solo valida
 * `estado === EN_FINALIZACION`. Por eso este estado vacío conserva la
 * acción de cierre en vez de bloquearla: reflejar el contrato real, no
 * inventar una prohibición que el backend no tiene.
 */
function EmptyParticipantsClose({ idProyecto, idSprint }: { idProyecto: number; idSprint: number }) {
  const router = useRouter();
  const closeSprint = useCloseSprint(idProyecto);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onConfirm = async () => {
    setSubmitError(null);
    try {
      await closeSprint.mutateAsync(idSprint);
      void uvgSwal.fire({
        icon: 'success',
        title: 'Sprint cerrado',
        text: 'El Sprint se cerró correctamente.',
        timer: 2200,
        timerProgressBar: true,
        showConfirmButton: false,
      });
      router.push(`/dashboard/proyectos/${idProyecto}`);
    } catch (error) {
      setSubmitError(mensajeDeError(error));
    }
  };

  return (
    <div className="space-y-4">
      <Empty tone="muted" role="status">
        <EmptyMedia variant="icon">
          <Flag aria-hidden="true" className="h-7 w-7" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Este Sprint no tiene contribuciones registradas.</EmptyTitle>
          <EmptyDescription>
            No hay participantes con tareas u horas asociadas a este Sprint todavía.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
      {submitError && (
        <p role="alert" className="text-sm font-medium text-error">
          {submitError}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={onConfirm}
          disabled={closeSprint.isPending}
          className="gap-1.5 rounded-lg bg-primary px-6 text-sm font-bold text-on-primary hover:bg-primary/90"
        >
          {closeSprint.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {closeSprint.isPending ? 'Confirmando cierre...' : 'Confirmar cierre del Sprint'}
        </Button>
      </div>
    </div>
  );
}

export default function SprintClosingPage() {
  const { id, sprintId } = useParams<{ id: string; sprintId: string }>();
  const idProyecto = Number(id);
  const idSprint = Number(sprintId);

  const { summary, isLoading, isError, error, refetch } = useSprintClosingSummary(idProyecto, idSprint);
  const volverHref = `/dashboard/proyectos/${id}`;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <Link
        href={volverHref}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-tertiary transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al proyecto
      </Link>

      {isLoading && <ClosingSkeleton />}

      {!isLoading && isError && (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{mensajeDeError(error) || 'No fue posible cargar el resumen de cierre.'}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
            >
              Reintentar
            </button>
          </EmptyContent>
        </Empty>
      )}

      {!isLoading && !isError && summary && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Flag className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
              <h1 className="font-headline text-3xl font-extrabold text-on-surface">Cierre de Sprint</h1>
            </div>
            <p className="mt-2 text-sm text-tertiary">
              Revisión final de horas y contribuciones antes de confirmar el cierre.
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
            <TriangleAlert
              className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Advertencia: al confirmar el cierre del Sprint, las horas aprobadas y los aportes quedarán
              bloqueados y formarán parte del resumen histórico.
            </p>
          </div>

          {summary.participantes.length === 0 ? (
            <EmptyParticipantsClose idProyecto={idProyecto} idSprint={idSprint} />
          ) : (
            <SprintClosingForm idProyecto={idProyecto} idSprint={idSprint} summary={summary} />
          )}
        </div>
      )}
    </div>
  );
}
