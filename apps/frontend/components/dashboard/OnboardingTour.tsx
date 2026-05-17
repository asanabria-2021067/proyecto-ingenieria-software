'use client';

import { useEffect, useState, useCallback } from 'react';
import { Joyride, STATUS } from 'react-joyride';
import { useCurrentUser, isProfileIncomplete } from '@/hooks/use-current-user';

// Custom Tooltip component for React Joyride
const CustomTooltip = ({
  index,
  step,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep,
  size,
}: any) => {
  return (
    <div
      {...tooltipProps}
      className="bg-surface-container-lowest border border-outline-variant/30 text-on-surface rounded-2xl shadow-2xl p-5 md:p-6 max-w-sm w-full backdrop-blur-md animate-fade-in relative border-l-6 border-l-primary focus:outline-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 select-none">
        <span className="text-[10px] font-black uppercase tracking-widest text-[#006735] bg-[#006735]/10 px-3 py-1 rounded-full font-headline">
          Guía UVGenius
        </span>
        <span className="text-[10px] font-black uppercase tracking-widest text-tertiary bg-surface-container-high px-2.5 py-1 rounded-full font-headline">
          Paso {index + 1} de {size}
        </span>
      </div>

      {/* Content */}
      <div className="space-y-2 mb-6">
        {step.title && (
          <h3 className="font-headline font-black text-base text-primary">
            {step.title}
          </h3>
        )}
        <div className="text-on-surface-variant text-xs md:text-sm leading-relaxed">
          {step.content}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="flex items-center justify-between gap-4 border-t border-outline-variant/20 pt-4">
        {/* Skip/Cerrar */}
        <button
          {...skipProps}
          className="text-xs font-bold text-tertiary hover:text-error transition-colors px-3 py-2 rounded-xl hover:bg-error/5 cursor-pointer outline-none"
        >
          {isLastStep ? 'Cerrar' : 'Saltar tour'}
        </button>

        <div className="flex items-center gap-2">
          {/* Back Button */}
          {index > 0 && (
            <button
              {...backProps}
              className="text-xs font-bold text-primary border border-primary hover:bg-primary/5 transition-all px-4 py-2 rounded-xl cursor-pointer outline-none"
            >
              Anterior
            </button>
          )}

          {/* Next/Last Button */}
          <button
            {...primaryProps}
            className="text-xs font-bold text-white bg-primary hover:bg-primary/95 transition-all px-4 py-2 rounded-xl shadow-md cursor-pointer outline-none"
          >
            {isLastStep ? 'Finalizar' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function OnboardingTour() {
  const { data: user } = useCurrentUser();
  const [run, setRun] = useState(false);

  const startTour = useCallback((force = false) => {
    if (!user) return;

    // Si el perfil está incompleto (sale la pantalla de "Completa tu perfil"),
    // no mostramos el tour hasta que termine de completarlo, a menos que sea forzado (ayuda)
    if (isProfileIncomplete(user) && !force) {
      return;
    }

    const tourKey = `onboarding_seen_${user.idUsuario}`;
    const hasSeenTour = localStorage.getItem(tourKey);

    if (hasSeenTour && !force) {
      return;
    }

    // Retardo para asegurar que los elementos del DOM estén completamente listos
    setTimeout(() => {
      setRun(true);
    }, 800);
  }, [user]);

  useEffect(() => {
    if (user) {
      startTour();
    }
  }, [user, startTour]);

  useEffect(() => {
    const handleStartTour = () => {
      startTour(true);
    };

    window.addEventListener('start-onboarding-tour', handleStartTour);
    return () => {
      window.removeEventListener('start-onboarding-tour', handleStartTour);
    };
  }, [startTour]);

  const handleJoyrideCallback = (data: any) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);
      if (user) {
        const tourKey = `onboarding_seen_${user.idUsuario}`;
        localStorage.setItem(tourKey, 'true');
      }
    }
  };

  const steps: any[] = [
    {
      target: 'body',
      title: '¡Bienvenido a UVGenius!',
      content: 'Tu portal inteligente para gestionar proyectos, horas beca y extensión en la UVG. Permítenos darte un recorrido rápido de 1 minuto por tus herramientas principales.',
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '#stats-container',
      title: 'Progreso y Horas Académicas',
      content: 'Mantén el control en tiempo real de tus Horas Beca y de Extensión acumuladas. Aquí verás tu avance respecto a la meta y tus proyectos activos.',
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '#nav-item-explorar-proyectos',
      title: 'Búsqueda de Proyectos',
      content: 'Explora la lista completa de proyectos disponibles en la universidad, fíltralos por tus intereses y postúlate fácilmente.',
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '#nav-item-mis-postulaciones',
      title: 'Tus Postulaciones',
      content: 'Lleva el control del estado de tus aplicaciones. Descubre de inmediato si has sido aceptado, si estás en revisión o si hay feedback de los directores.',
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '#dashboard-theme-toggle',
      title: 'Tema Claro / Oscuro',
      content: 'Cambia el aspecto visual de la aplicación según tu preferencia con un solo clic.',
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '#dashboard-profile-card',
      title: 'Tu Perfil Profesional',
      content: 'Mantén al día tus habilidades e intereses en esta sección para que los directores de proyectos puedan invitarte a colaborar.',
      placement: 'left',
      disableBeacon: true,
    },
  ];

  if (!user) return null;

  return (
    <>
      <Joyride
        run={run}
        steps={steps}
        continuous={true}
        showProgress={false}
        showSkipButton={true}
        callback={handleJoyrideCallback}
        tooltipComponent={(props: any) => <CustomTooltip {...props} size={steps.length} />}
        styles={{
          options: {
            overlayColor: 'rgba(5, 12, 8, 0.7)',
            zIndex: 10000,
          },
          spotlight: {
            borderRadius: '16px',
          },
        }}
      />
      <style dangerouslySetInnerHTML={{ __html: `
        /* Animación y estilos de spotlight personalizados para React Joyride */
        @keyframes pulse-joyride-spotlight {
          0% {
            box-shadow: 0 0 0 0 rgba(0, 103, 53, 0.4), 0 0 0 1px rgba(0, 103, 53, 0.2);
          }
          70% {
            box-shadow: 0 0 0 12px rgba(0, 103, 53, 0), 0 0 0 4px rgba(0, 103, 53, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(0, 103, 53, 0), 0 0 0 0 rgba(0, 103, 53, 0);
          }
        }

        .react-joyride__spotlight {
          animation: pulse-joyride-spotlight 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite !important;
          outline: 3px solid var(--color-primary, #006735) !important;
          outline-offset: 4px !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
      `}} />
    </>
  );
}
