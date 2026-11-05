'use client';

import { PageTitle } from '@/components/ui/page-title';
import { Settings } from 'lucide-react';
import { NotificationPreferencesSection } from '@/components/profile/notification-preferences-section';
import { HorarioSilencioSection } from '@/components/profile/horario-silencio-section';
import { PushSection } from '@/components/profile/push-section';
import { SesionesSection } from '@/components/profile/sesiones-section';
import { CambiarContrasenaSection } from '@/components/profile/cambiar-contrasena-section';
import { MisDatosSection } from '@/components/profile/mis-datos-section';
import { DesactivacionSection } from '@/components/profile/desactivacion-section';
import { dashboardPage } from '@/components/layout/dashboard-page';

/**
 * Configuración de la cuenta. Contiene las preferencias de
 * notificación (T-328) y la seguridad de la cuenta (MEJ-81 a MEJ-85: sesiones,
 * contraseña, descarga de datos y desactivación); la bandeja de avisos recibidos sigue en
 * /dashboard/notificaciones. Ruta compartida por estudiantes y
 * administradores: el shell lo elige app/dashboard/layout.tsx.
 */
export default function ConfiguracionPage() {
  return (
    <div className={dashboardPage('py-section flex flex-col gap-section')}>
      <div className="flex items-center gap-stack">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-container/15 text-primary">
          <Settings className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <PageTitle className="type-display">Configuración</PageTitle>
          <p className="type-meta mt-micro">Administra tus notificaciones, tus sesiones y los datos de tu cuenta en UVGenius.</p>
        </div>
      </div>

      <NotificationPreferencesSection />
      <HorarioSilencioSection />
      <PushSection />
      <SesionesSection />
      <CambiarContrasenaSection />
      <MisDatosSection />
      <DesactivacionSection />
    </div>
  );
}
