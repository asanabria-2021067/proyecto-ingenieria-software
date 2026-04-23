'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { apiFetch, getUserIdFromToken } from '@/lib/api/client';
import { Proyecto } from '@/types';

const schema = z.object({
  justificacion: z
    .string()
    .min(40, 'La justificaciÃ³n debe tener al menos 40 caracteres.')
    .max(1000, 'La justificaciÃ³n no puede exceder 1000 caracteres.'),
});

type FormData = z.infer<typeof schema>;

export default function PostularPage() {
  const { id, rolId } = useParams<{ id: string; rolId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState('');

  const { data: proyecto, isLoading } = useQuery<Proyecto>({
    queryKey: ['proyecto', id],
    queryFn: () => apiFetch(`/proyectos/${id}`),
  });

  const rol = proyecto?.roles.find((r) => r.idRolProyecto === Number(rolId));

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const justificacion = useWatch({ control, name: 'justificacion', defaultValue: '' });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const userId = getUserIdFromToken();
      if (!userId) throw new Error('Tu sesiÃ³n ha expirado. Por favor inicia sesiÃ³n nuevamente.');
      return apiFetch('/postulaciones', {
        method: 'POST',
        body: JSON.stringify({
          idUsuarioPostulante: userId,
          idRolProyecto: Number(rolId),
          justificacion: data.justificacion,
        }),
      });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { message?: string })?.message ??
        'OcurriÃ³ un error al enviar tu postulaciÃ³n.';
      setErrorMsg(msg);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mis-postulaciones'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
      ]);
    },
  });

  if (mutation.isSuccess) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[80vh] px-8">
          <div className="text-center max-w-md">
            <CheckCircle className="w-16 h-16 text-primary mx-auto mb-4" />
            <h2 className="font-headline font-extrabold text-2xl text-on-surface mb-2">
              Â¡PostulaciÃ³n enviada!
            </h2>
            <p className="text-tertiary text-sm mb-6">
              Tu postulaciÃ³n fue recibida. El equipo del proyecto revisarÃ¡ tu solicitud y te
              notificarÃ¡ el resultado.
            </p>
            <Link
              href="/dashboard/mis-postulaciones"
              className="inline-flex items-center justify-center bg-primary text-on-primary px-6 py-3 rounded-xl text-sm font-bold hover:shadow-md transition-all"
            >
              Ver mis postulaciones
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="px-8 py-8 max-w-2xl mx-auto">
        <Link
          href={`/dashboard/proyectos/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-tertiary hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al proyecto
        </Link>

        {isLoading && (
          <div className="text-center py-16 text-tertiary text-sm">Cargando...</div>
        )}

        {proyecto && rol && (
          <>
            <div className="mb-8">
              <h1 className="font-headline font-extrabold text-2xl text-on-surface mb-1">
                Postularme como {rol.nombreRol}
              </h1>
              <p className="text-tertiary text-sm">
                Proyecto:{' '}
                <span className="font-semibold text-on-surface">{proyecto.tituloProyecto}</span>
              </p>
            </div>

            {rol.descripcionRolProyecto && (
              <div className="bg-surface-container-low rounded-xl border border-outline-variant p-4 mb-6">
                <p className="text-xs font-bold text-tertiary uppercase tracking-wide mb-1">
                  DescripciÃ³n del rol
                </p>
                <p className="text-on-surface text-sm leading-relaxed">
                  {rol.descripcionRolProyecto}
                </p>
                {rol.carreraRequerida && (
                  <p className="text-xs text-tertiary mt-2">
                    Carrera requerida:{' '}
                    <span className="font-semibold">{rol.carreraRequerida.nombreCarrera}</span>
                  </p>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1.5">
                  JustificaciÃ³n <span className="text-error">*</span>
                </label>
                <p className="text-xs text-tertiary mb-2">
                  Explica por quÃ© eres un buen candidato para este rol, tus experiencias relevantes
                  y motivaciÃ³n.
                </p>
                <textarea
                  {...register('justificacion')}
                  rows={8}
                  placeholder="Escribe tu justificaciÃ³n aquÃ­..."
                  className={`w-full px-4 py-3 rounded-xl border text-on-surface text-sm leading-relaxed outline-none resize-none transition-colors ${
                    errors.justificacion
                      ? 'border-error bg-error-container/10 focus:ring-2 focus:ring-error'
                      : 'border-outline-variant bg-surface-container-lowest focus:ring-2 focus:ring-primary'
                  }`}
                />
                <div className="flex items-start justify-between mt-1.5">
                  {errors.justificacion ? (
                    <p className="text-xs text-error">{errors.justificacion.message}</p>
                  ) : (
                    <span />
                  )}
                  <span className="text-xs text-tertiary ml-auto">
                    {justificacion?.length ?? 0} / 1000
                  </span>
                </div>
              </div>

              {mutation.isError && (
                <div className="flex items-start gap-2 bg-error-container text-error rounded-xl px-4 py-3 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {errorMsg}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Link
                  href={`/dashboard/proyectos/${id}`}
                  className="flex-1 text-center px-5 py-3 rounded-xl border border-outline-variant text-on-surface text-sm font-semibold hover:bg-surface-container transition-colors"
                >
                  Cancelar
                </Link>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="flex-1 bg-primary text-on-primary px-5 py-3 rounded-xl text-sm font-bold hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-60 disabled:scale-100 disabled:shadow-none"
                >
                  {mutation.isPending ? 'Enviando...' : 'Enviar PostulaciÃ³n'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

