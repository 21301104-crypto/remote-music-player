// server/sync-lyrics-cli.js
import { dbService } from './database.js';
import { fetchLyricsFromLRCLIB } from './lyricsService.js';

async function runCliSync() {
  console.log('🔍 [CLI Sync] Analizando catálogo en SQLite...');
  const pendingTracks = dbService.getTracksWithoutLyrics();
  const total = pendingTracks.length;

  if (total === 0) {
    console.log('✨ ¡Todas las pistas ya tienen letra o fueron verificadas en SQLite!');
    process.exit(0);
  }

  console.log(`🚀 Iniciando descarga para ${total} pistas pendientes...\n`);

  let found = 0;
  let processed = 0;

  for (const track of pendingTracks) {
    processed++;
    const progressPct = ((processed / total) * 100).toFixed(1);
    
    process.stdout.write(`\r[${progressPct}%] (${processed}/${total}) Buscando: ${track.artist} - ${track.title.slice(0, 25)}...`);

    try {
      const result = await fetchLyricsFromLRCLIB(track);
      if (result) {
        dbService.saveLyrics(track.path, result.plainLyrics, result.syncedLyrics);
        found++;
      } else {
        // Marcar como revisada para evitar reintentos en el siguiente escaneo
        dbService.saveLyrics(track.path, null, null);
      }
    } catch (err) {
      // Ignorar fallos de red puntuales
    }

    // Rate Limiting para la API pública
    await new Promise(r => setTimeout(r, 120));
  }

  console.log(`\n\n🎉 ¡Sincronización finalizada!`);
  console.log(`📊 Letras encontradas y guardadas: ${found}/${total}`);
  process.exit(0);
}

runCliSync();