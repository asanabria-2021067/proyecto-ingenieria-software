import type { ReactNode } from 'react';
import { safeExternalHref } from '@/lib/security/safe-url';

/**
 * G07 (OWASP25-C027): enlace externo de un dato del usuario. Solo es
 * clicable si la URL es http(s); un valor guardado antes de la validación
 * del backend (p. ej. `javascript:`) se muestra como texto inerte, sin href.
 */
export function SafeExternalLink({ url, className, children }: { url: string | null | undefined; className?: string; children: ReactNode }) {
  const href = safeExternalHref(url);
  if (!href) {
    return (
      <span className={className} aria-disabled="true" title="Enlace no válido">
        {children}
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
