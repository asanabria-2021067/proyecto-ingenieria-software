'use client';

import { Settings } from 'lucide-react';
import { NotificationPreferencesSection } from '@/components/profile/notification-preferences-section';
import { dashboardPage } from '@/components/layout/dashboard-page';

/**
 * Configuración de la cuenta. Hoy contiene solo las preferencias de
 * notificación (T-328); la bandeja de avisos recibidos sigue en
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
          <h1 className="type-display">Configuración</h1>
          <p className="type-meta mt-micro">Administra qué notificaciones deseas recibir en UVGenius.</p>
        </div>
      </div>

      <NotificationPreferencesSection />
    </div>
  );
}
