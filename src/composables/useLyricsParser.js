// src/composables/useLyricsParser.js
export function useLyricsParser() {
  // Parsea texto .lrc a [{ time: segundos, text: 'estrofa' }]
  const parseLRC = (lrcString) => {
    if (!lrcString || typeof lrcString !== 'string') return [];
    
    const lines = lrcString.split('\n');
    const parsed = [];
    
    // Expresión regular para capturar corchetes de tiempo [mm:ss.xx] o [mm:ss]
    const timeRegExp = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

    for (const line of lines) {
      timeRegExp.lastIndex = 0;
      let match;
      const timestamps = [];
      let cleanText = line;

      // Extraer todas las marcas de tiempo de la línea (puede haber varias)
      while ((match = timeRegExp.exec(line)) !== null) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
        
        const totalSeconds = minutes * 60 + seconds + milliseconds / 1000;
        timestamps.push(totalSeconds);
        cleanText = cleanText.replace(match[0], '');
      }

      const textResult = cleanText.trim();
      if (timestamps.length > 0) {
        for (const time of timestamps) {
          parsed.push({ time, text: textResult });
        }
      }
    }

    // Ordenar cronológicamente por segundo
    return parsed.sort((a, b) => a.time - b.time);
  };

  // Encontrar el índice de la línea activa según el tiempo actual del reproductor
  const getActiveLineIndex = (lines, currentTime) => {
    if (!lines || !lines.length) return -1;
    
    let activeIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      // Si el tiempo actual es mayor o igual a la marca de la línea
      if (currentTime >= lines[i].time - 0.15) { // Pequeño margen de tolerancia de 150ms
        activeIndex = i;
      } else {
        break;
      }
    }
    return activeIndex;
  };

  return {
    parseLRC,
    getActiveLineIndex
  };
}