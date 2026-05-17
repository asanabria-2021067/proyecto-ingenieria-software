'use client';

import { useEffect, useCallback } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useCurrentUser } from '@/hooks/use-current-user';

export default function OnboardingTour() {
  const { data: user } = useCurrentUser();

  const startTour = useCallback((force = false) => {
    if (!user) return;

    const tourKey = `onboarding_seen_${user.idUsuario}`;
    const hasSeenTour = localStorage.getItem(tourKey);

    if (hasSeenTour && !force) {
      return;
    }

    // Esperar a que el DOM esté completamente listo y los IDs renderizados
    setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayColor: 'rgba(0, 7, 3, 0.65)', // Tono oscuro con un leve matiz verde institucional
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Atrás',
        doneBtnText: 'Entendido 🎉',
        steps: [
          {
            element: 'body',
            popover: {
              title: '¡Bienvenido a UVGenius! 🎉',
              description: 'Te damos la bienvenida a tu portal de proyectos. Vamos a darte un recorrido rápido por tu panel principal para que conozcas las herramientas disponibles.',
              side: 'over',
              align: 'center',
            },
          },
          {
            element: '#stats-container',
            popover: {
              title: 'Tus Horas y Progreso 📊',
              description: 'Aquí puedes ver de un vistazo el acumulado de tus Horas Beca y de Extensión, así como los proyectos que tienes activos actualmente. ¡Mantén un ojo en tu meta!',
              side: 'bottom',
              align: 'center',
            },
          },
          {
            element: '#nav-item-explorar-proyectos',
            popover: {
              title: 'Explorar Proyectos 🔍',
              description: 'Esta es la sección más importante. Aquí puedes buscar, filtrar y postularte a proyectos académicos, horas beca, voluntariados y extensión disponibles en la universidad.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#nav-item-mis-postulaciones',
            popover: {
              title: 'Seguimiento de Postulaciones 📑',
              description: 'Lleva el control de todas tus aplicaciones. Aquí podrás revisar si tu postulación ha sido aceptada, rechazada o sigue en revisión por los coordinadores.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#sidebar-notifications',
            popover: {
              title: 'Notificaciones al Instante 🔔',
              description: '¡Mantente al día! Aquí recibirás alertas en tiempo real cuando un proyecto te acepte o haya actualizaciones importantes en tus postulaciones.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#dashboard-profile-card',
            popover: {
              title: 'Completa tu Perfil 👤',
              description: '¡Tu carta de presentación! Asegúrate de mantener tus habilidades, carrera e intereses actualizados para que los directores de proyectos puedan encontrarte más fácilmente.',
              side: 'left',
              align: 'start',
            },
          },
        ],
        onDestroyed: () => {
          // Marcar el tour como visto cuando se complete o se cierre
          localStorage.setItem(tourKey, 'true');
        },
      });

      driverObj.drive();
    }, 500);
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

  return (
    <style dangerouslySetInnerHTML={{ __html: `
      /* Estilos Premium Personalizados para los Tooltips de driver.js */
      .driver-popover.driverjs-theme {
        background-color: var(--color-surface-container-lowest, #ffffff) !important;
        color: var(--color-on-surface, #1d1b20) !important;
        border-radius: 16px !important;
        border: 1px solid var(--color-outline-variant, #e6e1e5) !important;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
        padding: 20px !important;
        max-width: 320px !important;
        font-family: inherit !important;
      }

      .driver-popover-title {
        font-family: 'Outfit', sans-serif !important;
        font-size: 1.1rem !important;
        font-weight: 800 !important;
        color: var(--color-primary, #006735) !important;
        margin-bottom: 8px !important;
        letter-spacing: -0.025em !important;
      }

      .driver-popover-description {
        font-size: 0.875rem !important;
        line-height: 1.5 !important;
        color: var(--color-on-surface-variant, #49454f) !important;
      }

      .driver-popover-footer {
        margin-top: 16px !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        gap: 8px !important;
      }

      .driver-popover-progress-text {
        font-size: 0.75rem !important;
        font-weight: 700 !important;
        color: var(--color-tertiary, #49454f) !important;
      }

      .driver-popover-navigation-btns {
        display: flex !important;
        gap: 6px !important;
      }

      .driver-popover-btn {
        background-color: var(--color-surface-container-high, #e6e1e5) !important;
        color: var(--color-on-surface, #1d1b20) !important;
        border: none !important;
        border-radius: 8px !important;
        padding: 6px 12px !important;
        font-size: 0.75rem !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
        text-shadow: none !important;
      }

      .driver-popover-btn:hover {
        background-color: var(--color-surface-container-highest, #dcd8db) !important;
      }

      /* Botón de acción principal (Siguiente / Finalizar) */
      .driver-popover-next-btn, .driver-popover-next-btn:focus {
        background-color: var(--color-primary, #006735) !important;
        color: var(--color-on-primary, #ffffff) !important;
      }

      .driver-popover-next-btn:hover {
        background-color: #00542b !important;
      }

      .driver-popover-close-btn {
        color: var(--color-on-surface-variant, #49454f) !important;
        font-weight: 300 !important;
        transition: color 0.2s ease !important;
      }

      .driver-popover-close-btn:hover {
        color: var(--color-error, #ba1a1a) !important;
      }

      .driver-popover-arrow {
        border-color: var(--color-surface-container-lowest, #ffffff) !important;
      }

      /* Animación suave para el spotlight */
      .driverjs-active-element {
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), 
                    outline 0.2s ease !important;
        border-radius: 12px !important;
      }
    `}} />
  );
}
