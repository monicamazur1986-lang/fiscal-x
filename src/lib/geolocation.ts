'use client';

export interface CapturedLocation {
  address: string;
  latitude: number;
  longitude: number;
}

/**
 * Captura a posição atual do navegador e reverte pra um endereço legível via
 * Nominatim (OpenStreetMap) — serviço público, sem chave de API nem custo,
 * adequado ao volume baixo de uso (poucas fotos por vistoria). Usado em
 * handlePhotoUpload (src/app/roteiros/[id]/page.tsx) pra registrar onde cada
 * foto de evidência foi tirada.
 *
 * Sempre degrada com sucesso: qualquer falha (permissão negada, sem sinal de
 * GPS, timeout, API de geocodificação fora do ar) retorna null ou só as
 * coordenadas — quem chamou cai no texto padrão que já existia antes (nome
 * do estabelecimento), sem travar o anexo da foto.
 */
export async function captureCurrentLocation(timeoutMs = 8000): Promise<CapturedLocation | null> {
  if (typeof window === 'undefined' || !navigator.geolocation) return null;

  const position = await new Promise<GeolocationPosition | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timer); resolve(pos); },
      () => { clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
    );
  });
  if (!position) return null;

  const { latitude, longitude } = position.coords;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=pt-BR`
    );
    if (!res.ok) throw new Error('Falha na geocodificação reversa.');
    const data = await res.json();
    return { address: formatAddress(data) ?? formatCoords(latitude, longitude), latitude, longitude };
  } catch {
    // Sem internet ou serviço de geocodificação fora do ar: ainda vale
    // registrar as coordenadas puras, melhor do que nada pra saber onde a
    // foto foi tirada.
    return { address: formatCoords(latitude, longitude), latitude, longitude };
  }
}

function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function formatAddress(data: any): string | null {
  const a = data?.address;
  if (!a) return data?.display_name || null;
  const rua = a.road || a.pedestrian || a.footway;
  const numero = a.house_number;
  const bairro = a.suburb || a.neighbourhood;
  const cidade = a.city || a.town || a.village || a.municipality;
  const partes = [[rua, numero].filter(Boolean).join(', '), bairro, cidade].filter(Boolean);
  return partes.length ? partes.join(' — ') : (data?.display_name || null);
}

/** Link pronto pro Google Maps a partir das coordenadas capturadas. */
export function mapsLinkFor(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}
