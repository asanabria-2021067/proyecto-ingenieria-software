/**
 * T-259/T-260 (HU-164): dispara la descarga de un `Blob` ya recibido del
 * backend (nunca una URL del proveedor) como archivo, vía el truco estándar
 * de un `<a download>` sintético. El objectURL se revoca de inmediato
 * después del click — a diferencia de `useClosureDocument` (visor inline),
 * aquí no hay nada que mostrar en pantalla que siga necesitando la URL.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
