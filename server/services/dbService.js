// server/services/dbService.js
import initSqlJs from 'sql.js';
import fs from 'fs';
import { DATA_DIR, DB_PATH } from '../config/constants.js';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const SQL = await initSqlJs();
let db;

if (fs.existsSync(DB_PATH)) {
  try {
    const filebuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(filebuffer);
    console.log('📦 [SQLite Core] Base de datos cargada desde disco.');
  } catch (e) {
    db = new SQL.Database();
  }
} else {
  db = new SQL.Database();
  console.log('📦 [SQLite Core] Nueva base de datos inicializada.');
}

const saveDb = () => {
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('[DB Save Error]:', err.message);
  }
};

// Esquema e Índices
db.run(`
  CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    genre TEXT,
    year INTEGER,
    duration INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
  CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre);
  CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);

  CREATE TABLE IF NOT EXISTS favorites (
    track_path TEXT PRIMARY KEY,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS playlist_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id TEXT NOT NULL,
    track_path TEXT NOT NULL,
    position INTEGER NOT NULL,
    UNIQUE(playlist_id, track_path)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lyrics (
    track_path TEXT PRIMARY KEY,
    plain_lyrics TEXT,
    synced_lyrics TEXT,
    updated_at INTEGER,
    FOREIGN KEY(track_path) REFERENCES tracks(path) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_lyrics_track ON lyrics(track_path);
`);
saveDb();

export const dbService = {
  getAllTracks: () => {
    const res = db.exec('SELECT * FROM tracks ORDER BY id ASC');
    if (!res.length) return [];
    const { columns, values } = res[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, idx) => { obj[col] = row[idx]; });
      return obj;
    });
  },

  getTracksCount: () => {
    const res = db.exec('SELECT COUNT(*) as count FROM tracks');
    return res.length ? res[0].values[0][0] : 0;
  },

  getTrackByPath: (trackPath) => {
    const stmt = db.prepare('SELECT * FROM tracks WHERE path = ?');
    stmt.bind([trackPath]);
    if (stmt.step()) {
      const obj = stmt.getAsObject();
      stmt.free();
      return obj;
    }
    stmt.free();
    return null;
  },

  saveTracksBatch: (tracks) => {
    if (!tracks || !tracks.length) return;
    db.run('BEGIN TRANSACTION');
    const stmt = db.prepare(`
      INSERT INTO tracks (path, title, artist, album, genre, year, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        title = excluded.title,
        artist = excluded.artist,
        album = excluded.album,
        genre = excluded.genre,
        year = excluded.year,
        duration = excluded.duration
    `);

    for (const t of tracks) {
      stmt.run([t.path, t.title, t.artist, t.album || null, t.genre || 'Varios', t.year || null, t.duration || 0]);
    }
    stmt.free();
    db.run('COMMIT');
    saveDb();
  },

  getFavorites: () => {
    const res = db.exec('SELECT track_path FROM favorites ORDER BY created_at DESC');
    return res.length ? res[0].values.map(r => r[0]) : [];
  },

  toggleFavorite: (trackPath) => {
    const stmt = db.prepare('SELECT 1 FROM favorites WHERE track_path = ?');
    stmt.bind([trackPath]);
    const exists = stmt.step();
    stmt.free();

    if (exists) {
      db.run('DELETE FROM favorites WHERE track_path = ?', [trackPath]);
      saveDb();
      return false;
    } else {
      db.run('INSERT OR IGNORE INTO favorites (track_path, created_at) VALUES (?, ?)', [trackPath, Date.now()]);
      saveDb();
      return true;
    }
  },

  getPlaylists: () => {
    const res = db.exec('SELECT * FROM playlists ORDER BY created_at ASC');
    if (!res.length) return [];
    const { columns, values } = res[0];
    return values.map(row => {
      const pl = {};
      columns.forEach((col, idx) => { pl[col] = row[idx]; });
      const tRes = db.exec(`SELECT track_path FROM playlist_tracks WHERE playlist_id = '${pl.id.replace(/'/g, "''")}' ORDER BY position ASC`);
      pl.tracks = tRes.length ? tRes[0].values.map(r => r[0]) : [];
      return pl;
    });
  },

  createPlaylist: (id, name, createdAt) => {
    db.run('INSERT INTO playlists (id, name, created_at) VALUES (?, ?, ?)', [id, name, createdAt]);
    saveDb();
  },

  deletePlaylist: (id) => {
    db.run('DELETE FROM playlist_tracks WHERE playlist_id = ?', [id]);
    db.run('DELETE FROM playlists WHERE id = ?', [id]);
    saveDb();
  },

  addTrackToPlaylist: (playlistId, trackPath) => {
    const countRes = db.exec(`SELECT COALESCE(MAX(position), 0) + 1 FROM playlist_tracks WHERE playlist_id = '${playlistId.replace(/'/g, "''")}'`);
    const nextPos = countRes.length ? countRes[0].values[0][0] : 1;
    db.run('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_path, position) VALUES (?, ?, ?)', [playlistId, trackPath, nextPos]);
    saveDb();
  },

  getSetting: (key, defaultValue = null) => {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    stmt.bind([key]);
    if (stmt.step()) {
      const val = stmt.getAsObject().value;
      stmt.free();
      try { return JSON.parse(val); } catch (e) { return defaultValue; }
    }
    stmt.free();
    return defaultValue;
  },

  setSetting: (key, value) => {
    db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, JSON.stringify(value)]);
    saveDb();
  },

  getLyrics: (trackPath) => {
    const stmt = db.prepare('SELECT plain_lyrics, synced_lyrics FROM lyrics WHERE track_path = ?');
    stmt.bind([trackPath]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  },

  saveLyrics: (trackPath, plainLyrics, syncedLyrics) => {
    db.run(`
      INSERT INTO lyrics (track_path, plain_lyrics, synced_lyrics, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(track_path) DO UPDATE SET
        plain_lyrics = excluded.plain_lyrics,
        synced_lyrics = excluded.synced_lyrics,
        updated_at = excluded.updated_at
    `, [trackPath, plainLyrics || null, syncedLyrics || null, Date.now()]);
    saveDb();
  },

  getTracksWithoutLyrics: () => {
    const res = db.exec(`
      SELECT t.path, t.title, t.artist, t.album, t.duration
      FROM tracks t
      LEFT JOIN lyrics l ON t.path = l.track_path
      WHERE l.track_path IS NULL
    `);
    if (!res.length) return [];
    const { columns, values } = res[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, idx) => { obj[col] = row[idx]; });
      return obj;
    });
  },

  // Búsqueda Blindada contra Fallos
  searchTracks: (query) => {
    if (!query || !query.trim()) return [];
    const term = `%${query.trim().toLowerCase()}%`;

    try {
      const sql = `
        SELECT 
          t.id, t.path, t.title, t.artist, t.album, t.genre, t.duration,
          l.plain_lyrics, l.synced_lyrics
        FROM tracks t
        LEFT JOIN lyrics l ON t.path = l.track_path
        WHERE 
          LOWER(t.title) LIKE ? OR 
          LOWER(t.artist) LIKE ? OR 
          LOWER(COALESCE(t.album, '')) LIKE ? OR 
          LOWER(COALESCE(t.genre, '')) LIKE ? OR
          LOWER(COALESCE(l.plain_lyrics, '')) LIKE ? OR
          LOWER(COALESCE(l.synced_lyrics, '')) LIKE ?
        LIMIT 100
      `;

      const res = db.exec(sql, [term, term, term, term, term, term]);
      if (!res.length) return [];

      const { columns, values } = res[0];
      return values.map(row => {
        const obj = {};
        columns.forEach((col, idx) => { obj[col] = row[idx]; });

        const rawLyrics = obj.synced_lyrics || obj.plain_lyrics;
        if (rawLyrics && rawLyrics.toLowerCase().includes(query.toLowerCase())) {
          const lines = rawLyrics.split('\n');
          const matchedLine = lines.find(l => l.toLowerCase().includes(query.toLowerCase()));
          obj.matched_snippet = matchedLine ? matchedLine.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim() : null;
        }

        delete obj.plain_lyrics;
        delete obj.synced_lyrics;
        return obj;
      });
    } catch (err) {
      console.error('[Search SQL Error]:', err.message);
      return [];
    }
  }
};