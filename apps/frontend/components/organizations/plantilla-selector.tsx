'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { ClavePlantillaOrganizacion, PlantillaOrganizacion } from '@/lib/types/organizations';

const NINGUNA = 'NINGUNA';

const labelClass = 'block text-xs font-black uppercase tracking-widest text-tertiary mb-2';

interface Props {
  plantillas: PlantillaOrganizacion[];
  value: ClavePlantillaOrganizacion | null;
  onChange: (plantilla: PlantillaOrganizacion | null) => void;
}

/** MEJ-156: elegir una plantilla sugiere la descripción; es opcional. */
export function PlantillaSelector({ plantillas, value, onChange }: Props) {
  const opciones = [
    { valor: NINGUNA, titulo: 'Sin plantilla', texto: 'Escribes la descripción desde cero.' },
    ...plantillas.map((p) => ({
      valor: p.clave as string,
      titulo: p.etiqueta,
      texto: p.descripcion || 'Sin descripción sugerida.',
    })),
  ];

  return (
    <fieldset>
      <legend className={labelClass}>Plantilla</legend>
      <p className="mb-2 text-xs text-on-surface-variant">
        Sugiere una descripción que puedes editar.
      </p>
      <RadioGroup
        value={value ?? NINGUNA}
        onValueChange={(v) => onChange(plantillas.find((p) => p.clave === v) ?? null)}
        className="grid gap-3 md:grid-cols-2"
      >
        {opciones.map(({ valor, titulo, texto }) => (
          <label
            key={valor}
            htmlFor={`org-plantilla-${valor}`}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
              (value ?? NINGUNA) === valor ? 'border-primary bg-primary/5' : 'border-outline-variant/40 hover:border-outline'
            }`}
          >
            <RadioGroupItem id={`org-plantilla-${valor}`} value={valor} className="mt-1" />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-on-surface">{titulo}</span>
              <span className="mt-0.5 block text-xs text-on-surface-variant">{texto}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}
