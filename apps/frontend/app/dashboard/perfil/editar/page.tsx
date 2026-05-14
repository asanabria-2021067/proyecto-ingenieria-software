'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Save } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCurrentUser } from '@/hooks/use-current-user';
import { updateProfile } from '@/lib/services/users';
import uvgSwal from '@/lib/swal';

export default function EditarPerfilPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useCurrentUser();

  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [biografia, setBiografia] = useState('');
  const [enlacePortafolio, setEnlacePortafolio] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [disponibilidadHorasSemana, setDisponibilidadHorasSemana] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setNombre(user.nombre || '');
      setApellido(user.apellido || '');
      setBiografia(user.perfil?.biografia || '');
      setEnlacePortafolio(user.perfil?.enlacePortafolio || '');
      setGithubUrl(user.perfil?.githubUrl || '');
      setLinkedinUrl(user.perfil?.linkedinUrl || '');
      setDisponibilidadHorasSemana(String(user.perfil?.disponibilidadHorasSemana || ''));
    }
  }, [user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      await updateProfile({
        nombre: nombre || undefined,
        apellido: apellido || undefined,
        biografia: biografia || undefined,
        enlacePortafolio: enlacePortafolio || undefined,
        githubUrl: githubUrl || undefined,
        linkedinUrl: linkedinUrl || undefined,
        disponibilidadHorasSemana: disponibilidadHorasSemana
          ? Number(disponibilidadHorasSemana)
          : undefined,
      });

      await queryClient.invalidateQueries({ queryKey: ['currentUser'] });

      await uvgSwal.fire({
        icon: 'success',
        title: 'Perfil actualizado',
        text: 'Tus cambios han sido guardados correctamente',
        timer: 2000,
        showConfirmButton: false,
      });

      router.push('/dashboard/perfil');
    } catch (error: any) {
      uvgSwal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'No se pudo actualizar el perfil',
      });
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl px-8 py-8">
        <div className="mb-8">
          <button
            onClick={() => router.push('/dashboard/perfil')}
            className="flex items-center gap-2 text-sm font-bold text-tertiary hover:text-on-surface transition-colors mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            Volver al perfil
          </button>
          <h1 className="text-4xl font-black tracking-tight text-on-surface">
            Editar perfil
          </h1>
          <p className="mt-2 text-tertiary">
            Actualiza tu informacion personal y academica
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="rounded-2xl bg-surface-container-lowest p-8 shadow-sm">
            <h2 className="text-xl font-black tracking-tight text-on-surface mb-6">
              Informacion personal
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-tertiary mb-2">
                  Nombre
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full rounded-xl border border-surface-container-highest bg-white px-4 py-3 font-body text-on-surface shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-tertiary mb-2">
                  Apellido
                </label>
                <input
                  type="text"
                  required
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  className="w-full rounded-xl border border-surface-container-highest bg-white px-4 py-3 font-body text-on-surface shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-surface-container-lowest p-8 shadow-sm">
            <h2 className="text-xl font-black tracking-tight text-on-surface mb-6">
              Biografia y disponibilidad
            </h2>
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-tertiary mb-2">
                  Biografia
                </label>
                <textarea
                  value={biografia}
                  onChange={(e) => setBiografia(e.target.value)}
                  rows={4}
                  placeholder="Cuentanos sobre ti, tus intereses y experiencia"
                  className="w-full rounded-xl border border-surface-container-highest bg-white px-4 py-3 font-body text-on-surface shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-tertiary mb-2">
                  Disponibilidad (horas/semana)
                </label>
                <input
                  type="number"
                  min="0"
                  max="168"
                  value={disponibilidadHorasSemana}
                  onChange={(e) => setDisponibilidadHorasSemana(e.target.value)}
                  className="w-full rounded-xl border border-surface-container-highest bg-white px-4 py-3 font-body text-on-surface shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-surface-container-lowest p-8 shadow-sm">
            <h2 className="text-xl font-black tracking-tight text-on-surface mb-6">
              Enlaces y redes
            </h2>
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-tertiary mb-2">
                  Portafolio
                </label>
                <input
                  type="url"
                  value={enlacePortafolio}
                  onChange={(e) => setEnlacePortafolio(e.target.value)}
                  placeholder="https://tu-portafolio.com"
                  className="w-full rounded-xl border border-surface-container-highest bg-white px-4 py-3 font-body text-on-surface shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-tertiary mb-2">
                  GitHub
                </label>
                <input
                  type="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/usuario"
                  className="w-full rounded-xl border border-surface-container-highest bg-white px-4 py-3 font-body text-on-surface shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-tertiary mb-2">
                  LinkedIn
                </label>
                <input
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/usuario"
                  className="w-full rounded-xl border border-surface-container-highest bg-white px-4 py-3 font-body text-on-surface shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          </section>

          <div className="flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() => router.push('/dashboard/perfil')}
              className="px-6 py-3 rounded-xl bg-surface-container-highest text-on-surface font-bold hover:bg-surface-container transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-on-primary font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
