'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { refreshAccessToken } from '@/lib/services/auth';
import { getAccessToken, getRefreshToken, setTokens, clearTokens, shouldShowExpiryWarning, getTimeUntilExpiry } from '@/lib/utils/token';
import uvgSwal from '@/lib/swal';

export function TokenRefreshManager() {
  const router = useRouter();
  const [warningShown, setWarningShown] = useState(false);

  const doRefresh = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearTokens();
      router.push('/login');
      return;
    }

    try {
      const response = await refreshAccessToken(refreshToken);
      setTokens(response.accessToken, response.refreshToken);
      setWarningShown(false);
    } catch {
      clearTokens();
      await uvgSwal.fire({
        icon: 'warning',
        title: 'Sesión expirada',
        text: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.',
        confirmButtonText: 'Ir al login',
      });
      router.push('/login');
    }
  }, [router]);

  useEffect(() => {
    const interval = setInterval(() => {
      const token = getAccessToken();
      if (!token) return;

      const timeLeft = getTimeUntilExpiry(token);
      if (timeLeft === null || timeLeft <= 0) {
        doRefresh();
        return;
      }

      if (shouldShowExpiryWarning(token) && !warningShown) {
        setWarningShown(true);
        uvgSwal.fire({
          icon: 'warning',
          title: 'Tu sesión está por expirar',
          text: 'Tu sesión expirará en menos de 5 minutos. ¿Deseas continuar?',
          showCancelButton: true,
          confirmButtonText: 'Sí, continuar',
          cancelButtonText: 'Cerrar sesión',
        }).then((result) => {
          if (result.isConfirmed) {
            doRefresh();
          } else {
            clearTokens();
            router.push('/login');
          }
        });
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [doRefresh, warningShown, router]);

  return null;
}
