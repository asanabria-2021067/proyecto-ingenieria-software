import { useEffect, useCallback } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useCurrentUser, isProfileIncomplete } from '@/hooks/use-current-user';

export default function OnboardingTour() {
  const { data: user } = useCurrentUser();

  const startTour = useCallback((force = false) => {
    if (!user) return;

    // Si el perfil está incompleto (es decir, sale la pantalla de "Completa tu perfil"),
    // no mostramos el tour hasta que termine de completarlo, a menos que sea forzado (ej: clic en botón de ayuda)
    if (isProfileIncomplete(user) && !force) {
      return;
    }

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
        overlayColor: 'rgba(5, 12, 8, 0.75)', // Tono oscuro profundo con matiz de contraste
        nextBtnText: 'Siguiente ➔',
        prevBtnText: '← Atrás',
        doneBtnText: '¡Listo, a explorar! 🚀',
        steps: [
          {
            element: 'body',
            popover: {
              title: '¡Bienvenido a UVGenius! 🎉',
              description: 'Tu portal inteligente para gestionar proyectos, horas beca y extensión en la UVG. Permítenos darte un recorrido rápido de 1 minuto por tus herramientas principales.',
              side: 'over',
              align: 'center',
            },
          },
          {
            element: '#stats-container',
            popover: {
              title: 'Progreso y Horas Académicas 📊',
              description: 'Mantén el control en tiempo real de tus Horas Beca y de Extensión acumuladas. Aquí verás tu avance respecto a la meta y tus proyectos activos.',
              side: 'bottom',
              align: 'center',
            },
          },
          {
            element: '#nav-item-explorar-proyectos',
            popover: {
              title: 'Búsqueda de Proyectos 🔍',
              description: '¡La sección estrella! Explora la lista completa de proyectos disponibles en la universidad, fístralos por tus intereses y postúlate en un clic.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#nav-item-mis-postulaciones',
            popover: {
              title: 'Tus Postulaciones 📑',
              description: 'Lleva el control del estado de tus aplicaciones. Descubre de inmediato si has sido aceptado, si estás en revisión o si hay feedback de los directores.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#sidebar-notifications',
            popover: {
              title: 'Notificaciones 🔔',
              description: '¡Entérate al instante! Recibe alertas directas sobre postulaciones aceptadas, comentarios nuevos o recordatorios académicos importantes.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#dashboard-profile-card',
            popover: {
              title: 'Tu Perfil Profesional 👤',
              description: '¡Hazte notar! Mantén al día tus habilidades e intereses en esta sección para que los directores de proyectos puedan invitarte a colaborar.',
              side: 'left',
              align: 'start',
            },
          },
        ],
        onDestroyed: () => {
          // Marcar el tour como visto al finalizar o cerrar
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
      /* Estilos Premium y Animaciones para los Tooltips de driver.js */
      .driver-popover.driverjs-theme {
        background-color: var(--color-surface-container-lowest, #ffffff) !important;
        color: var(--color-on-surface, #181c20) !important;
        border-radius: 20px !important;
        border: 1px solid var(--color-outline-variant, rgba(189, 202, 189, 0.4)) !important;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
        padding: 24px !important;
        max-width: 340px !important;
        font-family: var(--font-family-body, 'Inter', sans-serif) !important;
        backdrop-filter: blur(12px) !important;
      }

      .driver-popover-title {
        font-family: var(--font-family-headline, 'Manrope', sans-serif) !important;
        font-size: 1.15rem !important;
        font-weight: 800 !important;
        color: var(--color-primary, #006735) !important;
        margin-bottom: 10px !important;
        letter-spacing: -0.02em !important;
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
      }

      .driver-popover-description {
        font-size: 0.9rem !important;
        line-height: 1.6 !important;
        color: var(--color-on-surface-variant, #3a3f3a) !important;
      }

      .driver-popover-footer {
        margin-top: 20px !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        gap: 12px !important;
      }

      .driver-popover-progress-text {
        font-size: 0.78rem !important;
        font-weight: 800 !important;
        color: var(--color-secondary, #416900) !important;
        background-color: var(--color-on-primary-container, #e3ffe5) !important;
        padding: 4px 10px !important;
        border-radius: 9999px !important;
        letter-spacing: 0.05em !important;
      }

      .driver-popover-navigation-btns {
        display: flex !important;
        gap: 8px !important;
      }

      .driver-popover-btn {
        background-color: var(--color-surface-container-high, #e5e8ee) !important;
        color: var(--color-on-surface, #181c20) !important;
        border: none !important;
        border-radius: 12px !important;
        padding: 8px 16px !important;
        font-size: 0.78rem !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02) !important;
        text-shadow: none !important;
      }

      .driver-popover-btn:hover {
        background-color: var(--color-surface-container-highest, #dfe3e8) !important;
        transform: translateY(-1px) !important;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05) !important;
      }

      /* Botón Siguiente / Finalizar con Gradiente UVG */
      .driver-popover-next-btn, .driver-popover-next-btn:focus {
        background: linear-gradient(135deg, var(--color-primary, #006735) 0%, var(--color-primary-container, #008345) 100%) !important;
        color: var(--color-on-primary, #ffffff) !important;
        box-shadow: 0 4px 12px rgba(0, 103, 53, 0.2) !important;
      }

      .driver-popover-next-btn:hover {
        filter: brightness(1.1) !important;
        box-shadow: 0 6px 16px rgba(0, 103, 53, 0.3) !important;
        transform: translateY(-1px) !important;
      }

      .driver-popover-close-btn {
        color: var(--color-outline, #6e7a6f) !important;
        font-weight: 400 !important;
        font-size: 1.1rem !important;
        transition: color 0.15s ease !important;
        padding: 4px !important;
      }

      .driver-popover-close-btn:hover {
        color: var(--color-error, #ba1a1a) !important;
      }

      .driver-popover-arrow {
        border-color: var(--color-surface-container-lowest, #ffffff) !important;
      }

      /* Animación de spotlight con pulso premium de color de marca */
      @keyframes pulse-spotlight {
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

      .driverjs-active-element {
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), 
                    outline 0.2s ease !important;
        border-radius: 16px !important;
        animation: pulse-spotlight 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite !important;
        outline: 3px solid var(--color-primary, #006735) !important;
        outline-offset: 2px !important;
      }
      
      /* Ajuste responsivo de tooltips */
      @media (max-width: 640px) {
        .driver-popover.driverjs-theme {
          max-width: 290px !important;
          padding: 16px !important;
        }
      }
    `}} />
  );
}
