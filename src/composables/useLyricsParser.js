// src/composables/useLyricsParser.js
import { computed } from 'vue';

export function useLyricsParser(syncedLyricsRef, currentTimeRef) {
  // Parsea strings con formato [mm:ss.xx] a un array estructurado
  const parsedLyrics = computed(() => {
    const raw = syncedLyricsRef.value;
    if (!raw || typeof raw !== 'string') return [];

    const lines = raw.split('\n');
    const result = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

    lines.forEach((line, idx) => {
      const match = timeRegex.exec(line);
      if (match) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const ms = parseInt(match[3].padEnd(3, '0'), 10);
        const time = min * 60 + sec + ms / 1000;
        const text = line.replace(timeRegex, '').trim();

        if (text) {
          result.push({
            id: idx,
            time,
            text
          });
        }
      }
    });

    return result.sort((a, b) => a.time - b.time);
  });

  // Encuentra el índice de la línea que debe estar iluminada en este segundo exacto
  const activeLineIndex = computed(() => {
    const list = parsedLyrics.value;
    const time = currentTimeRef.value;

    if (!list.length) return -1;
    if (time < list[0].time) return -1;

    for (let i = list.length - 1; i >= 0; i--) {
      if (time >= list[i].time) {
        return i;
      }
    }
    return -1;
  });

  return {
    parsedLyrics,
    activeLineIndex
  };
}