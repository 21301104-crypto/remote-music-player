// src/composables/useColorExtractor.js
import { ref } from 'vue';

export function useColorExtractor() {
  const currentPalette = ref({
    accent: '#38bdf8',
    secondary: '#2563eb',
    glow: 'rgba(56, 189, 248, 0.45)',
    bgGradient: 'radial-gradient(circle at top, #0f172a 0%, #060913 100%)'
  });

  const extractColorsFromImage = (imageSrc) => {
    if (!imageSrc) return;

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageSrc;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        // Muestreo rápido a 16x16 píxeles
        canvas.width = 16;
        canvas.height = 16;
        ctx.drawImage(img, 0, 0, 16, 16);

        const imageData = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0, count = 0;
        let maxSaturation = 0;
        let bestR = 56, bestG = 189, bestB = 248;

        for (let i = 0; i < imageData.length; i += 16) {
          const pr = imageData[i];
          const pg = imageData[i + 1];
          const pb = imageData[i + 2];

          // Filtrar píxeles muy oscuros o casi blancos
          const brightness = (pr * 299 + pg * 587 + pb * 114) / 1000;
          if (brightness > 30 && brightness < 220) {
            const max = Math.max(pr, pg, pb);
            const min = Math.min(pr, pg, pb);
            const sat = max === 0 ? 0 : (max - min) / max;

            if (sat > maxSaturation) {
              maxSaturation = sat;
              bestR = pr;
              bestG = pg;
              bestB = pb;
            }

            r += pr;
            g += pg;
            b += pb;
            count++;
          }
        }

        if (count > 0) {
          const accentColor = `rgb(${bestR}, ${bestG}, ${bestB})`;
          const darkR = Math.max(0, Math.floor(bestR * 0.2));
          const darkG = Math.max(0, Math.floor(bestG * 0.2));
          const darkB = Math.max(0, Math.floor(bestB * 0.2));

          currentPalette.value = {
            accent: accentColor,
            secondary: `rgb(${Math.floor(bestR * 0.7)}, ${Math.floor(bestG * 0.7)}, ${Math.floor(bestB * 0.7)})`,
            glow: `rgba(${bestR}, ${bestG}, ${bestB}, 0.5)`,
            bgGradient: `radial-gradient(circle at top, rgb(${darkR}, ${darkG}, ${darkB}) 0%, #060913 100%)`
          };
        }
      } catch (err) {
        console.warn('[ColorExtractor] Error procesando carátula:', err);
      }
    };
  };

  return {
    currentPalette,
    extractColorsFromImage
  };
}