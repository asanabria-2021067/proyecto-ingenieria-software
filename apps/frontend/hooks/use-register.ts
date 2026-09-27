'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { register, type RegisterPayload } from '@/lib/services/auth';

// T-263 (redisenio login/registro): mismo cambio que useLogin, el feedback
// de exito/error se muestra inline con el componente Alert (T-219) en vez
// de SweetAlert.
export function useRegister() {
  const router = useRouter();

  return useMutation({
    mutationFn: (data: RegisterPayload) => register(data),
    onSuccess: () => {
      setTimeout(() => router.push('/dashboard'), 1500);
    },
  });
}
