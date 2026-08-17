// server/services/lyricsService.js
import { dbService } from './dbService.js';

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
  const cleanTitle = cleanMetadata(track.title);
  const duration = Math.round(track.duration || 0);

  // 1. Intento Exacto
  try {
    const params = new URLSearchParams({
      artist_name: rawArtist,
      track_name: cleanTitle,
      duration: duration ? duration.toString() : ''
    });

    const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { 'User-Agent': 'SoundWave-DAP' }
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
    return null;
  }

  // 2. Fallback de Búsqueda
  try {
    const q = `${rawArtist} ${cleanTitle}`.trim();
    const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'SoundWave-DAP' }
    });

    if (searchRes.ok) {
      const results = await searchRes.json();
      if (Array.isArray(results) && results.length > 0) {
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

let isSyncing = false;

export const startBulkLyricsSync = async (io) => {
  if (isSyncing) return;
  isSyncing = true;

  const pendingTracks = dbService.getTracksWithoutLyrics();
  const total = pendingTracks.length;
  console.log(`🌐 [Lyrics Worker] Sincronizando ${total} pistas...`);

  let processed = 0;
  let found = 0;

  for (const track of pendingTracks) {
    try {
      const result = await fetchLyricsFromLRCLIB(track);
      if (result) {
        dbService.saveLyrics(track.path, result.plainLyrics, result.syncedLyrics);
        found++;
      } else {
        dbService.saveLyrics(track.path, null, null);
      }
    } catch (e) {}

    processed++;

    if (processed % 5 === 0 || processed === total) {
      io.emit('lyrics_sync_progress', {
        total,
        processed,
        found,
        percentage: Math.round((processed / total) * 100),
        currentTrack: track.title
      });
    }

    await new Promise(r => setTimeout(r, 120));
  }

  isSyncing = false;
  io.emit('lyrics_sync_completed', { total, found });
  console.log(`✅ [Lyrics Worker] Sincronización completa: ${found}/${total} guardadas.`);
};