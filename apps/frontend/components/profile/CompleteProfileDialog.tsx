'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Plus, X, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  getHabilidades,
  getIntereses,
  getCualidades,
  createHabilidad,
  createInteres,
  createCualidad,
  type Habilidad,
  type Interes,
  type Cualidad,
} from '@/lib/services/catalogs';
import {
  updateProfile,
  replaceHabilidades,
  replaceIntereses,
  replaceCualidades,
  addExperiencia,
} from '@/lib/services/users';
import { useCurrentUser } from '@/hooks/use-current-user';
import { uploadToCloudinary } from '@/lib/cloudinary';

interface Props {
  open: boolean;
  onComplete: () => void;
}

type NivelHabilidad = 'BASICO' | 'INTERMEDIO' | 'AVANZADO';

interface SelectedHabilidad {
  idHabilidad: number;
  nivelHabilidad: NivelHabilidad;
}

interface ExperienciaForm {
  tituloProyectoExperiencia: string;
  rolDesempenado: string;
  tipoExperiencia: string;
}

export default function CompleteProfileDialog({ open, onComplete }: Props) {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [biografia, setBiografia] = useState('');
  const [disponibilidad, setDisponibilidad] = useState<number>(10);
  const [requiereHorasBeca, setRequiereHorasBeca] = useState<boolean>(false);
  const [horasBecaRequeridas, setHorasBecaRequeridas] = useState<number>(150);
  const [requiereHorasExtension, setRequiereHorasExtension] = useState<boolean>(false);
  const [horasExtensionRequeridas, setHorasExtensionRequeridas] = useState<number>(40);

  // Steps 2-4
  const [catalogHabilidades, setCatalogHabilidades] = useState<Habilidad[]>([]);
  const [catalogIntereses, setCatalogIntereses] = useState<Interes[]>([]);
  const [catalogCualidades, setCatalogCualidades] = useState<Cualidad[]>([]);
  const [selectedHabilidades, setSelectedHabilidades] = useState<SelectedHabilidad[]>([]);
  const [selectedIntereses, setSelectedIntereses] = useState<number[]>([]);
  const [selectedCualidades, setSelectedCualidades] = useState<number[]>([]);
  const [habilidadesInput, setHabilidadesInput] = useState('');
  const [interesesInput, setInteresesInput] = useState('');
  const [cualidadesInput, setCualidadesInput] = useState('');
  const [habilidadesMatchInfo, setHabilidadesMatchInfo] = useState('');
  const [interesesMatchInfo, setInteresesMatchInfo] = useState('');
  const [cualidadesMatchInfo, setCualidadesMatchInfo] = useState('');

  // Step 5
  const [githubUrl, setGithubUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [enlacePortafolio, setEnlacePortafolio] = useState('');
  const [cv, setCv] = useState<File | null>(null);
  const [cvName, setCvName] = useState('');
  const [experiencias, setExperiencias] = useState<ExperienciaForm[]>([]);

  const refreshCatalogs = useCallback(async () => {
    const [h, i, c] = await Promise.all([getHabilidades(), getIntereses(), getCualidades()]);
    setCatalogHabilidades(h);
    setCatalogIntereses(i);
    setCatalogCualidades(c);
  }, []);

  useEffect(() => {
    if (!open) return;
    refreshCatalogs().catch(() => {});
  }, [open, refreshCatalogs]);

  useEffect(() => {
    if (!open || !currentUser) return;
    setBiografia(currentUser.perfil?.biografia ?? '');
    setDisponibilidad(currentUser.perfil?.disponibilidadHorasSemana ?? 10);
    setRequiereHorasBeca((currentUser.perfil?.horasBecaRequeridas ?? 0) > 0);
    setHorasBecaRequeridas(currentUser.perfil?.horasBecaRequeridas ?? 150);
    setRequiereHorasExtension((currentUser.perfil?.horasExtensionRequeridas ?? 0) > 0);
    setHorasExtensionRequeridas(currentUser.perfil?.horasExtensionRequeridas ?? 40);
    setEnlacePortafolio(currentUser.perfil?.enlacePortafolio ?? '');
    setGithubUrl(currentUser.perfil?.githubUrl ?? '');
    setLinkedinUrl(currentUser.perfil?.linkedinUrl ?? '');
    setSelectedHabilidades(
      currentUser.habilidades.map((h) => ({
        idHabilidad: h.idHabilidad,
        nivelHabilidad: h.nivelHabilidad as NivelHabilidad,
      })),
    );
    setSelectedIntereses(currentUser.intereses.map((i) => i.idInteres));
    setSelectedCualidades(currentUser.cualidades.map((c) => c.idCualidad));
  }, [open, currentUser]);

  const normalizeText = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

  const splitInputTokens = (value: string) =>
    value
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean);

  const findBestMatch = <T,>(
    token: string,
    items: T[],
    getName: (item: T) => string,
  ): T | null => {
    const normalized = normalizeText(token);
    const exact = items.find((item) => normalizeText(getName(item)) === normalized);
    if (exact) return exact;
    const partialMatches = items.filter((item) =>
      normalizeText(getName(item)).includes(normalized),
    );
    return partialMatches.length === 1 ? partialMatches[0] : null;
  };

  const applyTypedHabilidades = async () => {
    const tokens = splitInputTokens(habilidadesInput);
    if (tokens.length === 0) return;
    const matched: string[] = [];
    const created: string[] = [];
    const matchedIds: number[] = [];
    for (const token of tokens) {
      const match = findBestMatch(token, catalogHabilidades, (h) => h.nombreHabilidad);
      if (match) {
        matched.push(match.nombreHabilidad);
        matchedIds.push(match.idHabilidad);
        continue;
      }
      try {
        const createdItem = await createHabilidad(token);
        created.push(createdItem.nombreHabilidad);
        matchedIds.push(createdItem.idHabilidad);
      } catch {
        continue;
      }
    }
    if (matchedIds.length > 0) {
      setSelectedHabilidades((prev) => {
        const existing = new Set(prev.map((item) => item.idHabilidad));
        const additions = matchedIds
          .filter((id) => !existing.has(id))
          .map((id) => ({ idHabilidad: id, nivelHabilidad: 'BASICO' as NivelHabilidad }));
        return [...prev, ...additions];
      });
    }
    const info: string[] = [];
    if (matched.length > 0) info.push(`Seleccionadas: ${matched.join(', ')}`);
    if (created.length > 0) info.push(`Creadas: ${created.join(', ')}`);
    setHabilidadesMatchInfo(info.join(' | '));
    setHabilidadesInput('');
    await refreshCatalogs();
  };

  const applyTypedIntereses = async () => {
    const tokens = splitInputTokens(interesesInput);
    if (tokens.length === 0) return;
    const matched: string[] = [];
    const created: string[] = [];
    const matchedIds: number[] = [];
    for (const token of tokens) {
      const match = findBestMatch(token, catalogIntereses, (i) => i.nombreInteres);
      if (match) {
        matched.push(match.nombreInteres);
        matchedIds.push(match.idInteres);
        continue;
      }
      try {
        const createdItem = await createInteres(token);
        created.push(createdItem.nombreInteres);
        matchedIds.push(createdItem.idInteres);
      } catch {
        continue;
      }
    }
    if (matchedIds.length > 0) {
      setSelectedIntereses((prev) => Array.from(new Set([...prev, ...matchedIds])));
    }
    const info: string[] = [];
    if (matched.length > 0) info.push(`Seleccionados: ${matched.join(', ')}`);
    if (created.length > 0) info.push(`Creados: ${created.join(', ')}`);
    setInteresesMatchInfo(info.join(' | '));
    setInteresesInput('');
    await refreshCatalogs();
  };

  const applyTypedCualidades = async () => {
    const tokens = splitInputTokens(cualidadesInput);
    if (tokens.length === 0) return;
    const matched: string[] = [];
    const created: string[] = [];
    const matchedIds: number[] = [];
    for (const token of tokens) {
      const match = findBestMatch(token, catalogCualidades, (c) => c.nombreCualidad);
      if (match) {
        matched.push(match.nombreCualidad);
        matchedIds.push(match.idCualidad);
        continue;
      }
      try {
        const createdItem = await createCualidad(token);
        created.push(createdItem.nombreCualidad);
        matchedIds.push(createdItem.idCualidad);
      } catch {
        continue;
      }
    }
    if (matchedIds.length > 0) {
      setSelectedCualidades((prev) => Array.from(new Set([...prev, ...matchedIds])));
    }
    const info: string[] = [];
    if (matched.length > 0) info.push(`Seleccionadas: ${matched.join(', ')}`);
    if (created.length > 0) info.push(`Creadas: ${created.join(', ')}`);
    setCualidadesMatchInfo(info.join(' | '));
    setCualidadesInput('');
    await refreshCatalogs();
  };

  const handleFotoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFoto(file);
    setFotoPreview(URL.createObjectURL(file));
  }, []);

  const toggleHabilidad = (id: number) => {
    setSelectedHabilidades((prev) => {
      const exists = prev.find((h) => h.idHabilidad === id);
      if (exists) return prev.filter((h) => h.idHabilidad !== id);
      return [...prev, { idHabilidad: id, nivelHabilidad: 'BASICO' }];
    });
  };

  const setNivelHabilidad = (id: number, nivel: NivelHabilidad) => {
    setSelectedHabilidades((prev) =>
      prev.map((h) => (h.idHabilidad === id ? { ...h, nivelHabilidad: nivel } : h)),
    );
  };

  const toggleInteres = (id: number) => {
    setSelectedIntereses((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleCualidad = (id: number) => {
    setSelectedCualidades((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const addExpForm = () => {
    setExperiencias((prev) => [
      ...prev,
      { tituloProyectoExperiencia: '', rolDesempenado: '', tipoExperiencia: 'OTRO' },
    ]);
  };

  const removeExp = (idx: number) => {
    setExperiencias((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateExp = (idx: number, field: keyof ExperienciaForm, value: string) => {
    setExperiencias((prev) =>
      prev.map((exp, i) => (i === idx ? { ...exp, [field]: value } : exp)),
    );
  };

  const saveStep = async () => {
    setSaving(true);
    try {
      if (step === 0) {
        let fotoUrl: string | undefined;
        if (foto) {
          const res = await uploadToCloudinary(foto, 'profile-photos');
          fotoUrl = res.url;
        }
        await updateProfile({
          biografia: biografia || undefined,
          disponibilidadHorasSemana: disponibilidad,
          horasBecaRequeridas: requiereHorasBeca ? horasBecaRequeridas : null,
          horasExtensionRequeridas: requiereHorasExtension
            ? horasExtensionRequeridas
            : null,
          ...(fotoUrl && { fotoUrl }),
        });
      } else if (step === 1) {
        await replaceHabilidades(selectedHabilidades);
      } else if (step === 2) {
        await replaceIntereses(selectedIntereses);
      } else if (step === 3) {
        await replaceCualidades(selectedCualidades);
      } else if (step === 4) {
        let urlCv: string | undefined;
        if (cv) {
          const res = await uploadToCloudinary(cv, 'cvs');
          urlCv = res.url;
        }
        await updateProfile({
          githubUrl: githubUrl || undefined,
          linkedinUrl: linkedinUrl || undefined,
          enlacePortafolio: enlacePortafolio || undefined,
          ...(urlCv && { urlCv }),
        });
        for (const exp of experiencias) {
          if (exp.tituloProyectoExperiencia.trim()) {
            await addExperiencia(exp);
          }
        }
        queryClient.invalidateQueries({ queryKey: ['currentUser'] });
        onComplete();
        return;
      }
      setStep((s) => s + 1);
    } catch (err) {
      console.error('Error saving profile:', err);
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    'Datos personales',
    'Habilidades',
    'Intereses',
    'Cualidades',
    'Links y experiencia',
  ];

  const inputClass =
    'w-full rounded-xl border border-surface-container-highest bg-white px-4 py-3 text-sm text-on-surface placeholder:text-outline-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-surface"
      >
        <DialogHeader>
          <DialogTitle className="font-headline text-xl font-extrabold text-on-surface">
            Completa tu perfil
          </DialogTitle>
          <DialogDescription className="text-tertiary">
            {steps[step]} - Paso {step + 1} de {steps.length}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <div className="flex gap-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-primary' : 'bg-surface-container-highest'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Datos personales */}
        {step === 0 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-4">
              <div className="relative">
                {fotoPreview ? (
                  // blob: URL from createObjectURL - cannot be optimized by next/image
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fotoPreview}
                    alt=""
                    className="h-20 w-20 rounded-full object-cover border-2 border-primary"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-surface-container-high flex items-center justify-center">
                    <Upload className="h-6 w-6 text-tertiary" />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFotoChange}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </div>
              <div>
                <p className="text-sm font-bold text-on-surface">Foto de perfil</p>
                <p className="text-xs text-tertiary">Click para subir una imagen</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-tertiary">
                Biografia
              </label>
              <textarea
                value={biografia}
                onChange={(e) => setBiografia(e.target.value)}
                placeholder="Cuentanos sobre ti, tus intereses academicos..."
                rows={3}
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-tertiary">
                Disponibilidad (horas/semana)
              </label>
              <input
                type="number"
                min={1}
                max={40}
                value={disponibilidad}
                onChange={(e) => setDisponibilidad(Number(e.target.value))}
                className={inputClass}
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-widest text-tertiary">
                Que tipo de horas necesitas
              </label>
              <p className="text-[11px] text-tertiary -mt-2">
                Selecciona las que apliquen a tu caso. Puedes dejar ambas sin marcar.
              </p>

              <label className="flex items-start gap-3 rounded-xl border border-surface-container-highest bg-white p-3 cursor-pointer hover:border-primary/40 transition-colors">
                <input
                  type="checkbox"
                  checked={requiereHorasBeca}
                  onChange={(e) => setRequiereHorasBeca(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <div className="flex-1 space-y-2">
                  <div>
                    <p className="text-sm font-bold text-on-surface">Horas beca</p>
                    <p className="text-[11px] text-tertiary">
                      Requeridas por tu beca academica
                    </p>
                  </div>
                  {requiereHorasBeca && (
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={horasBecaRequeridas}
                      onChange={(e) => setHorasBecaRequeridas(Number(e.target.value))}
                      placeholder="Total de horas beca"
                      className={inputClass}
                    />
                  )}
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-surface-container-highest bg-white p-3 cursor-pointer hover:border-primary/40 transition-colors">
                <input
                  type="checkbox"
                  checked={requiereHorasExtension}
                  onChange={(e) => setRequiereHorasExtension(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <div className="flex-1 space-y-2">
                  <div>
                    <p className="text-sm font-bold text-on-surface">Horas de extension</p>
                    <p className="text-[11px] text-tertiary">
                      Para actividades extracurriculares
                    </p>
                  </div>
                  {requiereHorasExtension && (
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={horasExtensionRequeridas}
                      onChange={(e) =>
                        setHorasExtensionRequeridas(Number(e.target.value))
                      }
                      placeholder="Total de horas de extension"
                      className={inputClass}
                    />
                  )}
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Step 2: Habilidades */}
        {step === 1 && (
          <div className="space-y-5 py-2">
            <p className="text-sm text-tertiary">
              Esto nos ayudara a mostrarte proyectos mas relacionados a tu perfil
            </p>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-tertiary">
                Habilidades
              </label>
              <div className="space-y-2">
                <input
                  type="text"
                  value={habilidadesInput}
                  onChange={(e) => setHabilidadesInput(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      await applyTypedHabilidades();
                    }
                  }}
                  placeholder="Escribe habilidades (ej: React, Python, Scrum) y presiona Enter"
                  className={inputClass}
                />
                {habilidadesMatchInfo && (
                  <p className="text-[11px] text-tertiary">{habilidadesMatchInfo}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {catalogHabilidades.map((h) => {
                  const sel = selectedHabilidades.find((s) => s.idHabilidad === h.idHabilidad);
                  return (
                    <div key={h.idHabilidad} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleHabilidad(h.idHabilidad)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          sel
                            ? 'bg-primary text-on-primary'
                            : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                        }`}
                      >
                        {h.nombreHabilidad}
                      </button>
                      {sel && (
                        <select
                          value={sel.nivelHabilidad}
                          onChange={(e) =>
                            setNivelHabilidad(h.idHabilidad, e.target.value as NivelHabilidad)
                          }
                          className="rounded-lg border border-outline-variant bg-white px-1 py-0.5 text-[10px] text-on-surface"
                        >
                          <option value="BASICO">Basico</option>
                          <option value="INTERMEDIO">Intermedio</option>
                          <option value="AVANZADO">Avanzado</option>
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Intereses */}
        {step === 2 && (
          <div className="space-y-5 py-2">
            <p className="text-sm text-tertiary">
              Agrega tus intereses. Si no existen, se crean automaticamente.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-tertiary">
                Intereses
              </label>
              <div className="space-y-2">
                <input
                  type="text"
                  value={interesesInput}
                  onChange={(e) => setInteresesInput(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      await applyTypedIntereses();
                    }
                  }}
                  placeholder="Escribe intereses (ej: IA, Robotica) y presiona Enter"
                  className={inputClass}
                />
                {interesesMatchInfo && (
                  <p className="text-[11px] text-tertiary">{interesesMatchInfo}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {catalogIntereses.map((i) => (
                  <button
                    key={i.idInteres}
                    type="button"
                    onClick={() => toggleInteres(i.idInteres)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selectedIntereses.includes(i.idInteres)
                        ? 'bg-secondary text-on-secondary'
                        : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                    }`}
                  >
                    {i.nombreInteres}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Cualidades */}
        {step === 3 && (
          <div className="space-y-5 py-2">
            <p className="text-sm text-tertiary">
              Agrega cualidades personales. Si no existe una, se crea y se selecciona.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-tertiary">
                Cualidades
              </label>
              <div className="space-y-2">
                <input
                  type="text"
                  value={cualidadesInput}
                  onChange={(e) => setCualidadesInput(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      await applyTypedCualidades();
                    }
                  }}
                  placeholder="Escribe cualidades (ej: Liderazgo, Comunicacion) y presiona Enter"
                  className={inputClass}
                />
                {cualidadesMatchInfo && (
                  <p className="text-[11px] text-tertiary">{cualidadesMatchInfo}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {catalogCualidades.map((c) => (
                  <button
                    key={c.idCualidad}
                    type="button"
                    onClick={() => toggleCualidad(c.idCualidad)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selectedCualidades.includes(c.idCualidad)
                        ? 'bg-tertiary text-white'
                        : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                    }`}
                  >
                    {c.nombreCualidad}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Links y experiencia */}
        {step === 4 && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-tertiary">
                GitHub URL
              </label>
              <input
                type="url"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/usuario"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-tertiary">
                LinkedIn URL
              </label>
              <input
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/in/usuario"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-tertiary">
                Enlace Portafolio
              </label>
              <input
                type="url"
                value={enlacePortafolio}
                onChange={(e) => setEnlacePortafolio(e.target.value)}
                placeholder="https://miportafolio.com"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-tertiary">
                Curriculum (CV)
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setCv(file);
                      setCvName(file.name);
                    }
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
                <div className={`${inputClass} flex items-center gap-2 cursor-pointer`}>
                  <Upload className="h-4 w-4 text-tertiary" />
                  <span className={cvName ? 'text-on-surface' : 'text-outline-variant'}>
                    {cvName || 'Subir CV'}
                  </span>
                </div>
              </div>
            </div>

            {/* Experiencias */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-tertiary">
                  Experiencias previas
                </label>
                <button
                  type="button"
                  onClick={addExpForm}
                  className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  <Plus className="h-3 w-3" /> Agregar otra
                </button>
              </div>
              {experiencias.map((exp, idx) => (
                <div key={idx} className="rounded-xl border border-outline-variant p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-tertiary">
                      Experiencia {idx + 1}
                    </span>
                    <button type="button" onClick={() => removeExp(idx)}>
                      <X className="h-4 w-4 text-tertiary hover:text-error" />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Titulo del proyecto"
                    value={exp.tituloProyectoExperiencia}
                    onChange={(e) => updateExp(idx, 'tituloProyectoExperiencia', e.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    placeholder="Rol desempenado"
                    value={exp.rolDesempenado}
                    onChange={(e) => updateExp(idx, 'rolDesempenado', e.target.value)}
                    className={inputClass}
                  />
                  <select
                    value={exp.tipoExperiencia}
                    onChange={(e) => updateExp(idx, 'tipoExperiencia', e.target.value)}
                    className={inputClass}
                  >
                    <option value="PROYECTO_UNIVERSITARIO">Proyecto Universitario</option>
                    <option value="PASANTIA">Pasantia</option>
                    <option value="VOLUNTARIADO">Voluntariado</option>
                    <option value="INVESTIGACION">Investigacion</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between pt-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-1 rounded-xl px-4 py-2.5 text-sm font-bold text-tertiary hover:bg-surface-container-high transition-colors"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={saveStep}
            disabled={saving}
            className="flex items-center gap-1 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-on-primary shadow-sm transition-all hover:bg-primary-container active:scale-[0.98] disabled:opacity-60"
          >
            {saving
              ? 'Guardando...'
              : step === 4
                ? <>Finalizar <Check className="h-4 w-4" /></>
                : <>Siguiente <ChevronRight className="h-4 w-4" /></>}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
