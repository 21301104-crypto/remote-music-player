// server/lyricsService.js
import { dbService } from './database.js';

// Limpieza de títulos (elimina "(Remastered)", "[Official Video]", etc.)
const cleanMetadata = (text) => {
  if (!text) return '';
  return text
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/feat\..*|ft\..*/i, '')
    .replace(/\s*-\s*Single|\s*-\s*Live|\s*-\s*Radio Edit/gi, '')
    .trim();
};

export const fetchLyricsFromLRCLIB = async (track) => {
  if (!track || !track.title || !track.artist) return null;

  const rawArtist = track.artist === 'Varios' ? '' : track.artist;
  const rawTitle = track.title;
  const cleanTitle = cleanMetadata(rawTitle);
  const duration = Math.round(track.duration || 0);

  // 1. Intento: Consulta Exacta
  try {
    const params = new URLSearchParams({
      artist_name: rawArtist,
      track_name: cleanTitle,
      duration: duration ? duration.toString() : ''
    });

    const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { 'User-Agent': 'SoundWave-DAP (https://github.com/soundwave-dap)' }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.syncedLyrics || data.plainLyrics) {
        return {
          plainLyrics: data.plainLyrics || null,
          syncedLyrics: data.syncedLyrics || null
        };
      }
    }
  } catch (err) {
    // Si no hay conexión a internet, falla silenciosamente
    return null;
  }

  // 2. Intento: Fallback por búsqueda general de similitud
  try {
    const q = `${rawArtist} ${cleanTitle}`.trim();
    const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'SoundWave-DAP' }
    });

    if (searchRes.ok) {
      const results = await searchRes.json();
      if (Array.isArray(results) && results.length > 0) {
        // Encontrar la mejor coincidencia por duración o primer resultado con syncedLyrics
        const bestMatch = results.find(r => r.syncedLyrics) || results[0];
        if (bestMatch && (bestMatch.syncedLyrics || bestMatch.plainLyrics)) {
          return {
            plainLyrics: bestMatch.plainLyrics || null,
            syncedLyrics: bestMatch.syncedLyrics || null
          };
        }
      }
    }
  } catch (err) {
    return null;
  }

  return null;
};

// Sincronizador por Lotes en Segundo Plano (Batch Worker)
let isSyncing = false;

export const startBulkLyricsSync = async (io) => {
  if (isSyncing) return { status: 'in_progress' };
  isSyncing = true;

  const pendingTracks = dbService.getTracksWithoutLyrics();
  const total = pendingTracks.length;
  console.log(`🌐 [Lyrics Worker] Iniciando descarga masiva para ${total} pistas...`);

  let processed = 0;
  let found = 0;

  for (const track of pendingTracks) {
    try {
      const result = await fetchLyricsFromLRCLIB(track);
      if (result) {
        dbService.saveLyrics(track.path, result.plainLyrics, result.syncedLyrics);
        found++;
      } else {
        // Marcar vacía para no reintentar infinitamente
        dbService.saveLyrics(track.path, null, null);
      }
    } catch (e) {}

    processed++;

    // Emitir progreso por WebSockets cada 5 pistas
    if (processed % 5 === 0 || processed === total) {
      io.emit('lyrics_sync_progress', {
        total,
        processed,
        found,
        percentage: Math.round((processed / total) * 100),
        currentTrack: track.title
      });
    }

    // Pausa de 120ms para respetar el Rate Limit de la API pública
    await new Promise(r => setTimeout(r, 120));
  }

  isSyncing = false;
  io.emit('lyrics_sync_completed', { total, found });
  console.log(`✅ [Lyrics Worker] Finalizado. ${found}/${total} letras guardadas en SQLite.`);
};