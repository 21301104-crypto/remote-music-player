// server/check-lyrics.js
import initSqlJs from 'sql.js';
import fs from 'fs';
import { DB_PATH } from './config/constants.js';

async function checkDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ No se encontró la base de datos en: ${DB_PATH}`);
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const filebuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(filebuffer);

  console.log('📊 ===== REPORTE DE ESTADO: BASE DE DATOS SQLITE =====\n');

  const totalTracksRes = db.exec('SELECT COUNT(*) FROM tracks');
  const totalTracks = totalTracksRes[0].values[0][0];

  const syncedLyricsRes = db.exec("SELECT COUNT(*) FROM lyrics WHERE synced_lyrics IS NOT NULL AND synced_lyrics != ''");
  const totalSynced = syncedLyricsRes.length ? syncedLyricsRes[0].values[0][0] : 0;

  const plainOnlyRes = db.exec("SELECT COUNT(*) FROM lyrics WHERE (synced_lyrics IS NULL OR synced_lyrics = '') AND plain_lyrics IS NOT NULL AND plain_lyrics != ''");
  const totalPlainOnly = plainOnlyRes.length ? plainOnlyRes[0].values[0][0] : 0;

  const notFoundRes = db.exec("SELECT COUNT(*) FROM lyrics WHERE synced_lyrics IS NULL AND plain_lyrics IS NULL");
  const totalNotFound = notFoundRes.length ? notFoundRes[0].values[0][0] : 0;

  const pendingRes = db.exec(`
    SELECT COUNT(*) FROM tracks t 
    LEFT JOIN lyrics l ON t.path = l.track_path 
    WHERE l.track_path IS NULL
  `);
  const totalPending = pendingRes.length ? pendingRes[0].values[0][0] : 0;

  console.log(`📁 Total de pistas en catálogo:      ${totalTracks}`);
  console.log(`✨ Letras Sincronizadas (.lrc):     ${totalSynced}`);
  console.log(`📄 Letras en Texto Plano:           ${totalPlainOnly}`);
  console.log(`⚠️ No encontradas en LRCLIB:        ${totalNotFound}`);
  console.log(`⏳ Pendientes por escanear:         ${totalPending}\n`);

  if (totalSynced > 0) {
    console.log('🎵 Muestra de pistas con letras sincronizadas:');
    const sampleRes = db.exec(`
      SELECT t.artist, t.title, SUBSTR(l.synced_lyrics, 1, 90) as preview 
      FROM lyrics l 
      JOIN tracks t ON l.track_path = t.path 
      WHERE l.synced_lyrics IS NOT NULL 
      LIMIT 3
    `);

    if (sampleRes.length) {
      sampleRes[0].values.forEach(([artist, title, preview], idx) => {
        console.log(`\n  [${idx + 1}] ${artist} - ${title}`);
        console.log(`      Snippet: "${preview.replace(/\n/g, ' ')}..."`);
      });
    }
  }

  console.log('\n====================================================');
  process.exit(0);
}

checkDatabase();