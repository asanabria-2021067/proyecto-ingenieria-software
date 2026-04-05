'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { login, type LoginPayload } from '@/lib/services/auth';

export function useLogin() {
  const router = useRouter();

  return useMutation({
    mutationFn: (data: LoginPayload) => login(data),
    onSuccess: (res) => {
      localStorage.setItem('token', res.accessToken);
      router.push('/dashboard');
    },
  });
}
