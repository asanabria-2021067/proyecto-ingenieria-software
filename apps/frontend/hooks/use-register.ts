'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { register, type RegisterPayload } from '@/lib/services/auth';

export function useRegister() {
  const router = useRouter();

  return useMutation({
    mutationFn: (data: RegisterPayload) => register(data),
    onSuccess: (res) => {
      localStorage.setItem('token', res.accessToken);
      router.push('/dashboard');
    },
  });
}
