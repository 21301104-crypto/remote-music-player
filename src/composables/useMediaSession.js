// src/composables/useMediaSession.js
export function useMediaSession(callbacks = {}) {
  const isSupported = typeof window !== 'undefined' && 'mediaSession' in navigator;

  const initActionHandlers = () => {
    if (!isSupported) return;

    const actionMap = [
      ['play', () => callbacks.onPlay && callbacks.onPlay()],
      ['pause', () => callbacks.onPause && callbacks.onPause()],
      ['previoustrack', () => callbacks.onPrev && callbacks.onPrev()],
      ['nexttrack', () => callbacks.onNext && callbacks.onNext()],
      ['stop', () => callbacks.onPause && callbacks.onPause()]
    ];

    actionMap.forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (err) {
        console.warn(`[MediaSession] Acción "${action}" no soportada:`, err);
      }
    });
  };

  const updateMetadata = ({ title, artist, album, coverUrl }) => {
    if (!isSupported || !window.MediaMetadata) return;

    const artwork = [];
    if (coverUrl) {
      const absoluteUrl = coverUrl.startsWith('http')
        ? coverUrl
        : new URL(coverUrl, window.location.origin).href;

      artwork.push(
        { src: absoluteUrl, sizes: '96x96', type: 'image/jpeg' },
        { src: absoluteUrl, sizes: '128x128', type: 'image/jpeg' },
        { src: absoluteUrl, sizes: '256x256', type: 'image/jpeg' },
        { src: absoluteUrl, sizes: '512x512', type: 'image/jpeg' }
      );
    }

    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: title || 'Remote Music',
      artist: artist || 'Moto G7 Play',
      album: album || 'Audio Local',
      artwork
    });
  };

  const updatePlaybackState = (isPlaying) => {
    if (!isSupported) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  };

  const updatePositionState = (duration, position) => {
    if (!isSupported || !navigator.mediaSession.setPositionState) return;
    if (!duration || duration <= 0) return;

    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(duration, 1),
        playbackRate: 1,
        position: Math.min(Math.max(position || 0, 0), duration)
      });
    } catch (e) {}
  };

  return {
    isSupported,
    initActionHandlers,
    updateMetadata,
    updatePlaybackState,
    updatePositionState
  };
}