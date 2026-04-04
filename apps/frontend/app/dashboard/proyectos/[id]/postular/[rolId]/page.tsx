'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import apiClient, { getUserIdFromToken } from '@/lib/api/client';

type Rol = {
  idRolProyecto: number;
  nombreRol: string;
  descripcionRolProyecto?: string;
  cupos: number;
  carreraRequerida?: { nombreCarrera: string };
};

type Proyecto = {
  idProyecto: number;
  tituloProyecto: string;
  roles: Rol[];
};

const schema = z.object({
  justificacion: z
    .string()
    .min(40, 'La justificación debe tener al menos 40 caracteres.')
    .max(1000, 'La justificación no puede exceder 1000 caracteres.'),
});

type FormData = z.infer<typeof schema>;

export default function PostularPage() {
  const { id, rolId } = useParams<{ id: string; rolId: string }>();
  const router = useRouter();

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [rol, setRol] = useState<Rol | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const justificacion = watch('justificacion', '');

  useEffect(() => {
    apiClient
      .get(`/proyectos/${id}`)
      .then((res) => {
        const p: Proyecto = res.data;
        setProyecto(p);
        const r = p.roles.find((r) => r.idRolProyecto === Number(rolId));
        setRol(r ?? null);
      })
      .catch(() => setErrorMsg('No se pudo cargar la información del proyecto.'))
      .finally(() => setLoadingData(false));
  }, [id, rolId]);

  const onSubmit = async (data: FormData) => {
    const userId = getUserIdFromToken();
    if (!userId) {
      setErrorMsg('Tu sesión ha expirado. Por favor inicia sesión nuevamente.');
      setSubmitStatus('error');
      return;
    }

    try {
      await apiClient.post('/postulaciones', {
        idUsuarioPostulante: userId,
        idRolProyecto: Number(rolId),
        justificacion: data.justificacion,
      });
      setSubmitStatus('success');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Ocurrió un error al enviar tu postulación.';
      setErrorMsg(msg);
      setSubmitStatus('error');
    }
  };

  if (submitStatus === 'success') {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[80vh] px-8">
          <div className="text-center max-w-md">
            <CheckCircle className="w-16 h-16 text-primary mx-auto mb-4" />
            <h2 className="font-headline font-extrabold text-2xl text-on-surface mb-2">
              ¡Postulación enviada!
            </h2>
            <p className="text-tertiary text-sm mb-6">
              Tu postulación fue recibida. El equipo del proyecto revisará tu solicitud y te notificará el resultado.
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

        {loadingData && (
          <div className="text-center py-16 text-tertiary text-sm">Cargando...</div>
        )}

        {!loadingData && errorMsg && submitStatus !== 'error' && (
          <div className="text-center py-16 text-error text-sm">{errorMsg}</div>
        )}

        {!loadingData && proyecto && rol && (
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
                <p className="text-xs font-bold text-tertiary uppercase tracking-wide mb-1">Descripción del rol</p>
                <p className="text-on-surface text-sm leading-relaxed">{rol.descripcionRolProyecto}</p>
                {rol.carreraRequerida && (
                  <p className="text-xs text-tertiary mt-2">
                    Carrera requerida:{' '}
                    <span className="font-semibold">{rol.carreraRequerida.nombreCarrera}</span>
                  </p>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1.5">
                  Justificación <span className="text-error">*</span>
                </label>
                <p className="text-xs text-tertiary mb-2">
                  Explica por qué eres un buen candidato para este rol, tus experiencias relevantes y motivación.
                </p>
                <textarea
                  {...register('justificacion')}
                  rows={8}
                  placeholder="Escribe tu justificación aquí..."
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
                  <span
                    className={`text-xs ml-auto ${
                      (justificacion?.length ?? 0) < 40
                        ? 'text-error'
                        : (justificacion?.length ?? 0) > 900
                          ? 'text-tertiary'
                          : 'text-tertiary'
                    }`}
                  >
                    {justificacion?.length ?? 0} / 1000
                  </span>
                </div>
              </div>

              {submitStatus === 'error' && (
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
                  disabled={isSubmitting}
                  className="flex-1 bg-primary text-on-primary px-5 py-3 rounded-xl text-sm font-bold hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-60 disabled:scale-100 disabled:shadow-none"
                >
                  {isSubmitting ? 'Enviando...' : 'Enviar Postulación'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
