import CompleteProfileDialog from '@/components/profile/CompleteProfileDialog';
import ProfileCompletionCard, {
  profileCompletionPercent,
} from '@/components/profile/ProfileCompletionCard';
import type { UserProfile } from '@/lib/services/users';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: undefined }),
}));
vi.mock('@/lib/services/catalogs', () => ({
  getHabilidades: async () => [],
  getIntereses: async () => [],
  getCualidades: async () => [],
  createHabilidad: vi.fn(),
  createInteres: vi.fn(),
  createCualidad: vi.fn(),
}));
const updateProfileMock = vi.fn();
vi.mock('@/lib/services/users', () => ({
  updateProfile: (d: unknown) => updateProfileMock(d),
  replaceHabilidades: vi.fn(),
  replaceIntereses: vi.fn(),
  replaceCualidades: vi.fn(),
  addExperiencia: vi.fn(),
}));
vi.mock('@/lib/cloudinary', () => ({ uploadToCloudinary: vi.fn() }));

function renderDialog(onDefer?: () => void) {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <CompleteProfileDialog open onComplete={vi.fn()} onDefer={onDefer} />
    </QueryClientProvider>,
  );
}

describe('Asistente "Completa tu perfil" - aplazar y omitir', () => {
  it('"Hacerlo después" llama onDefer sin guardar nada', () => {
    const onDefer = vi.fn();
    renderDialog(onDefer);
    fireEvent.click(screen.getByRole('button', { name: 'Hacerlo después' }));
    expect(onDefer).toHaveBeenCalledTimes(1);
    expect(updateProfileMock).not.toHaveBeenCalled();
  });

  it('sin onDefer no muestra "Hacerlo después"', () => {
    renderDialog();
    expect(screen.queryByRole('button', { name: 'Hacerlo después' })).toBeNull();
  });

  it('"Omitir este paso" avanza sin guardar y desaparece en el último paso', () => {
    renderDialog();
    for (let paso = 2; paso <= 5; paso++) {
      fireEvent.click(screen.getByRole('button', { name: 'Omitir este paso' }));
      expect(screen.getByText(new RegExp(`Paso ${paso} de 5`))).toBeInTheDocument();
    }
    expect(updateProfileMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Omitir este paso' })).toBeNull();
  });
});

describe('ProfileCompletionCard', () => {
  const vacio = {
    fotoUrl: null,
    perfil: null,
    habilidades: [],
    intereses: [],
    cualidades: [],
  } as unknown as UserProfile;

  it('calcula el porcentaje sobre 6 criterios', () => {
    expect(profileCompletionPercent(vacio)).toBe(0);
    const parcial = {
      ...vacio,
      fotoUrl: 'x',
      perfil: { biografia: 'hola', githubUrl: 'https://github.com/a' },
      habilidades: [{}],
    } as unknown as UserProfile;
    expect(profileCompletionPercent(parcial)).toBe(67);
  });

  it('muestra el porcentaje y "Completar perfil" dispara onComplete', () => {
    const onComplete = vi.fn();
    render(<ProfileCompletionCard percent={33} onComplete={onComplete} />);
    expect(screen.getByText('Tu perfil está al 33%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    fireEvent.click(screen.getByRole('button', { name: 'Completar perfil' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
