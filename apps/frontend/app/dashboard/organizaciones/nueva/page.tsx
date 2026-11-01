'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ChevronLeft, ChevronRight, Eye, Globe, Lock, Save, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { dashboardPage } from '@/components/layout/dashboard-page';
import { OrgAvatar } from '@/components/organizations/org-avatar';
import { useCrearOrganizacion } from '@/hooks/use-organizations';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { mensajeErrorOrganizacion } from '@/lib/organizations/errors';
import {
  validarDatosOrganizacion,
  validarLogo,
  validarSitioWeb,
  type ErroresOrganizacion,
} from '@/lib/organizations/form';
import { normalizeUrlInput } from '@/lib/security/safe-url';
import { aviso } from '@/lib/mensajes';
import type { VisibilidadOrganizacion } from '@/lib/types/organizations';

const STEPS = [
  { title: 'Datos', icon: Building2, desc: 'Nombre y descripción' },
  { title: 'Identidad', icon: Upload, desc: 'Logo y sitio web' },
  { title: 'Visibilidad', icon: Eye, desc: 'Quién la ve y revisión final' },
];

const inputClass =
  'w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface placeholder:text-outline-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200';
const labelClass = 'block text-xs font-black uppercase tracking-widest text-tertiary mb-2';

const ErrorCampo = ({ mensaje }: { mensaje?: string }) =>
  mensaje ? (
    <p role="alert" className="mt-1 text-xs text-error">
      {mensaje}
    </p>
  ) : null;

export default function NuevaOrganizacionPage() {
  const router = useRouter();
  const crear = useCrearOrganizacion();
  const [step, setStep] = useState(0);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [sitioWeb, setSitioWeb] = useState('');
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [visibilidad, setVisibilidad] = useState<VisibilidadOrganizacion>('PRIVADA');
  const [errores, setErrores] = useState<ErroresOrganizacion>({});
  const [guardando, setGuardando] = useState(false);

  useEffect(
    () => () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    },
    [logoPreview],
  );

  const elegirLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0] ?? null;
    if (!archivo) return;
    const error = validarLogo(archivo);
    setErrores((prev) => ({ ...prev, logo: error.logo }));
    if (error.logo) return;
    setLogo(archivo);
    setLogoPreview(URL.createObjectURL(archivo));
  };

  const validarPaso = (paso: number): ErroresOrganizacion => {
    if (paso === 0) return validarDatosOrganizacion({ nombre, descripcion });
    if (paso === 1) return { ...validarSitioWeb(sitioWeb), ...validarLogo(logo) };
    return {};
  };

  const siguiente = () => {
    const encontrados = validarPaso(step);
    setErrores(encontrados);
    if (Object.keys(encontrados).length === 0) setStep(step + 1);
  };

  const irA = (destino: number) => {
    if (destino <= step) return setStep(destino);
    for (let paso = step; paso < destino; paso += 1) {
      const encontrados = validarPaso(paso);
      if (Object.keys(encontrados).length > 0) {
        setErrores(encontrados);
        return setStep(paso);
      }
    }
    setErrores({});
    setStep(destino);
  };

  const guardar = async () => {
    const encontrados = { ...validarDatosOrganizacion({ nombre, descripcion }), ...validarSitioWeb(sitioWeb) };
    if (Object.keys(encontrados).length > 0) {
      setErrores(encontrados);
      return setStep(encontrados.nombre || encontrados.descripcion ? 0 : 1);
    }
    setGuardando(true);
    try {
      const logoUrl = logo ? (await uploadToCloudinary(logo, 'organization-logos')).url : undefined;
      const creada = await crear.mutateAsync({
        nombreOrganizacion: nombre.trim(),
        descripcionOrganizacion: descripcion.trim() || undefined,
        sitioWeb: normalizeUrlInput(sitioWeb),
        logoUrl,
        visibilidad,
      });
      aviso.exito('Organización creada', 'Eres su propietario.');
      router.push(`/dashboard/organizaciones/${creada.idOrganizacion}`);
    } catch (err) {
      aviso.error('No se pudo crear la organización', mensajeErrorOrganizacion(err));
    } finally {
      setGuardando(false);
    }
  };

  const Icono = STEPS[step].icon;

  return (
    <div className={dashboardPage('pt-7 pb-24')}>
      <div className="mb-8">
        <button
          type="button"
          onClick={() => router.push('/dashboard/organizaciones')}
          className="mb-4 flex cursor-pointer items-center gap-2 text-xs font-bold text-tertiary transition-colors hover:text-on-surface"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          Volver a mis organizaciones
        </button>
        <h1 className="type-display">Nueva organización</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Crea un grupo para trabajar proyectos en equipo. Tú serás su propietario.
        </p>
      </div>

      <div className="mb-8 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 shadow-sm md:p-6">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Icono aria-hidden="true" className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-primary">
                Paso {step + 1} de {STEPS.length}
              </p>
              <p className="font-headline text-lg font-black leading-tight text-on-surface">{STEPS[step].title}</p>
            </div>
          </div>
          <p className="text-xs font-medium text-on-surface-variant">{STEPS[step].desc}</p>
        </div>
        <div className="mt-6 flex gap-2">
          {STEPS.map((s, idx) => (
            <button
              key={s.title}
              type="button"
              onClick={() => irA(idx)}
              aria-label={`Ir al paso ${idx + 1}: ${s.title}`}
              aria-current={idx === step ? 'step' : undefined}
              className={`h-2 flex-1 cursor-pointer rounded-full transition-all duration-300 ${
                idx <= step ? 'bg-primary' : 'bg-surface-container-high'
              }`}
              title={s.title}
            />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-sm md:p-8">
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <label htmlFor="org-nombre" className={labelClass}>
                Nombre <span className="text-error">*</span>
              </label>
              <input
                id="org-nombre"
                maxLength={120}
                className={inputClass}
                placeholder="Nombre único de la organización"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
              <ErrorCampo mensaje={errores.nombre} />
            </div>
            <div>
              <label htmlFor="org-descripcion" className={labelClass}>
                Descripción
              </label>
              <textarea
                id="org-descripcion"
                rows={5}
                maxLength={2000}
                className={inputClass}
                placeholder="¿A qué se dedica y qué proyectos busca impulsar?"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
              <ErrorCampo mensaje={errores.descripcion} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                {logoPreview ? (
                  // blob: URL de createObjectURL, next/image no la optimiza
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="Vista previa del logo" className="size-20 rounded-xl border-2 border-primary object-cover" />
                ) : (
                  <OrgAvatar nombre={nombre || 'Organización'} logoUrl={null} className="size-20" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={elegirLogo}
                  aria-label="Subir logo de la organización"
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </div>
              <div>
                <p className="text-sm font-bold text-on-surface">Logo</p>
                <p className="text-xs text-tertiary">Click para subir una imagen (opcional)</p>
                <ErrorCampo mensaje={errores.logo} />
              </div>
            </div>
            <div>
              <label htmlFor="org-sitio" className={labelClass}>
                Sitio web
              </label>
              <input
                id="org-sitio"
                type="url"
                maxLength={255}
                className={inputClass}
                placeholder="https://..."
                value={sitioWeb}
                onChange={(e) => setSitioWeb(e.target.value)}
              />
              <ErrorCampo mensaje={errores.sitioWeb} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <fieldset>
              <legend className={labelClass}>Visibilidad</legend>
              <RadioGroup
                value={visibilidad}
                onValueChange={(v) => setVisibilidad(v as VisibilidadOrganizacion)}
                className="grid gap-3 md:grid-cols-2"
              >
                {[
                  { value: 'PRIVADA', icon: Lock, titulo: 'Privada', texto: 'Solo la ven sus miembros. Se entra por invitación.' },
                  {
                    value: 'PUBLICA',
                    icon: Globe,
                    titulo: 'Pública',
                    texto: 'Aparece en el buscador con sus proyectos y cualquiera puede solicitar unirse.',
                  },
                ].map(({ value, icon: Icon, titulo, texto }) => (
                  <label
                    key={value}
                    htmlFor={`org-vis-${value}`}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                      visibilidad === value ? 'border-primary bg-primary/5' : 'border-outline-variant/40 hover:border-outline'
                    }`}
                  >
                    <RadioGroupItem id={`org-vis-${value}`} value={value} className="mt-1" />
                    <span>
                      <span className="flex items-center gap-1.5 text-sm font-bold text-on-surface">
                        <Icon aria-hidden="true" className="size-4" />
                        {titulo}
                      </span>
                      <span className="mt-0.5 block text-xs text-on-surface-variant">{texto}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>

            <div className="space-y-1.5 rounded-xl border border-outline-variant p-4">
              <h2 className="mb-2 text-sm font-bold text-on-surface">Resumen</h2>
              <p className="text-sm">
                <span className="text-tertiary">Nombre: </span>
                {nombre.trim()}
              </p>
              {descripcion.trim() && (
                <p className="line-clamp-2 text-sm">
                  <span className="text-tertiary">Descripción: </span>
                  {descripcion.trim()}
                </p>
              )}
              {sitioWeb.trim() && (
                <p className="text-sm">
                  <span className="text-tertiary">Sitio web: </span>
                  {sitioWeb.trim()}
                </p>
              )}
              <p className="text-sm">
                <span className="text-tertiary">Logo: </span>
                {logo ? logo.name : 'Sin logo'}
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between border-t border-outline-variant/30 pt-6">
          <Button type="button" variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>
            <ChevronLeft aria-hidden="true" />
            Anterior
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={siguiente}>
              Siguiente
              <ChevronRight aria-hidden="true" />
            </Button>
          ) : (
            <Button type="button" onClick={guardar} disabled={guardando}>
              <Save aria-hidden="true" />
              {guardando ? 'Creando...' : 'Crear organización'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
