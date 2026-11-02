import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Día `YYYY-MM-DD` como `dd/mm/aaaa`. */
export function fecha(iso: string | null): string {
  if (!iso) return "Sin fecha";
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}
