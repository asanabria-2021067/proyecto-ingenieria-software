'use client';

import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// react-leaflet 5 requiere los sprites del marcador vía URL explícita (el
// bundler no resuelve los paths relativos por defecto del ícono de leaflet).
const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// UVG / Ciudad de Guatemala: centro por defecto cuando aún no hay marcador.
const DEFAULT_CENTER: [number, number] = [14.5906, -90.551];

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 15));
    // Solo recentrar cuando cambia el punto, no en cada render del mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);
  return null;
}

export interface EventLocationPickerProps {
  lat: number | null;
  lng: number | null;
  nombre: string;
  onNombreChange: (value: string) => void;
  onPositionChange: (lat: number, lng: number) => void;
  disabled?: boolean;
}

/**
 * Requisito 2 (mapa "Nuevo evento"): búsqueda por nombre vía Nominatim
 * (OpenStreetMap, sin API key) + click en el mapa para marcar el punto.
 * Se monta solo vía next/dynamic con ssr:false porque leaflet usa `window`.
 */
export default function EventLocationPicker({
  lat,
  lng,
  nombre,
  onNombreChange,
  onPositionChange,
  disabled,
}: EventLocationPickerProps) {
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const buscar = async () => {
    if (!nombre.trim()) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const params = new URLSearchParams({ format: 'json', q: nombre.trim(), limit: '5' });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
      if (!res.ok) throw new Error('busqueda fallida');
      const data = (await res.json()) as NominatimResult[];
      setResults(data);
      if (data.length === 0) setSearchError('No se encontraron resultados.');
    } catch {
      setSearchError('No se pudo buscar la ubicación. Intenta de nuevo.');
    } finally {
      setSearching(false);
    }
  };

  const elegirResultado = (result: NominatimResult) => {
    onNombreChange(result.display_name);
    onPositionChange(Number.parseFloat(result.lat), Number.parseFloat(result.lon));
    setResults([]);
  };

  const center: [number, number] = lat !== null && lng !== null ? [lat, lng] : DEFAULT_CENTER;

  return (
    <div className="space-y-tight">
      <div className="flex gap-tight">
        <Input
          value={nombre}
          disabled={disabled}
          onChange={(e) => onNombreChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void buscar();
            }
          }}
          placeholder="Busca un lugar (ej. Edificio T-1, UVG)"
          className="h-10 rounded-md border-outline-variant text-sm"
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || searching}
          onClick={() => void buscar()}
          className="h-10 shrink-0 rounded-md border-outline-variant px-3"
          aria-label="Buscar ubicación"
        >
          {searching ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-3.5" aria-hidden="true" />
          )}
        </Button>
      </div>

      {results.length > 0 && (
        <ul className="max-h-36 overflow-y-auto rounded-md border border-outline-variant bg-surface-container-lowest text-xs">
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                onClick={() => elegirResultado(r)}
                className="block w-full truncate px-2 py-1.5 text-left hover:bg-surface-container"
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {searchError && (
        <p role="alert" className="text-xs text-status-error">
          {searchError}
        </p>
      )}

      <div className="h-48 w-full overflow-hidden rounded-md border border-outline-variant">
        <MapContainer center={center} zoom={lat !== null ? 15 : 12} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onPick={onPositionChange} />
          {lat !== null && lng !== null && <Marker position={[lat, lng]} icon={markerIcon} />}
          {lat !== null && lng !== null && <Recenter lat={lat} lng={lng} />}
        </MapContainer>
      </div>
      <p className="type-meta">Haz clic en el mapa para marcar el punto exacto.</p>
    </div>
  );
}
