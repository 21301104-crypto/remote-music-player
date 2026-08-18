// server/services/mpvService.js
import { spawn } from 'child_process';
import net from 'net';
import fs from 'fs';
import { MPV_SOCKET } from '../config/constants.js';

let mpvProcess = null;
let mpvSocketClient = null;
let isMpvReady = false;
let onEofCallback = null;
const commandQueue = [];

const flushCommandQueue = () => {
  while (commandQueue.length > 0 && isMpvReady && mpvSocketClient) {
    const cmd = commandQueue.shift();
    try {
      mpvSocketClient.write(JSON.stringify({ command: cmd }) + '\n');
    } catch (err) {
      console.error('❌ [MPV Flush Error]:', err.message);
    }
  }
};

export const mpvService = {
  start: (onEof) => {
    onEofCallback = onEof;

    if (fs.existsSync(MPV_SOCKET)) {
      try { fs.unlinkSync(MPV_SOCKET); } catch (e) {}
    }

    console.log('🚀 [MPV Service] Iniciando demonio headless...');
    mpvProcess = spawn('mpv', [
      '--idle=yes',
      '--no-video',
      `--input-ipc-server=${MPV_SOCKET}`,
      '--audio-buffer=0.2',
      '--gapless-audio=yes'
    ], { stdio: 'ignore' });

    mpvProcess.on('exit', () => {
      isMpvReady = false;
      setTimeout(() => mpvService.start(onEofCallback), 1000);
    });

    const connectSocket = () => {
      if (!fs.existsSync(MPV_SOCKET)) {
        setTimeout(connectSocket, 150);
        return;
      }

      mpvSocketClient = net.connect(MPV_SOCKET, () => {
        console.log('✅ [MPV Service] Conexión IPC lista y comunicando.');
        isMpvReady = true;
        flushCommandQueue();
      });

      mpvSocketClient.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.event === 'end-file' && msg.reason === 'eof' && onEofCallback) {
              onEofCallback();
            }
          } catch (e) {}
        }
      });

      mpvSocketClient.on('error', () => {
        isMpvReady = false;
        setTimeout(connectSocket, 400);
      });
    };

    setTimeout(connectSocket, 200);
  },

  sendCommand: (commandArray) => {
    if (!isMpvReady || !mpvSocketClient) {
      commandQueue.push(commandArray);
      return;
    }
    try {
      mpvSocketClient.write(JSON.stringify({ command: commandArray }) + '\n');
    } catch (err) {
      console.error('❌ [MPV IPC Error]:', err.message);
      commandQueue.push(commandArray);
    }
  },

  loadFile: (filePath) => {
    console.log(`🎵 [MPV IPC] Transmitiendo archivo a mpv: ${filePath}`);
    mpvService.sendCommand(['loadfile', filePath, 'replace']);
    mpvService.sendCommand(['set_property', 'pause', false]);
  },

  setPause: (pause) => {
    mpvService.sendCommand(['set_property', 'pause', Boolean(pause)]);
  },

  seek: (seconds) => {
    mpvService.sendCommand(['seek', seconds, 'absolute']);
  },

  applyEqualizer: (eq) => {
    if (!eq || !eq.enabled || !eq.bands || eq.bands.length === 0) {
      mpvService.sendCommand(['set_property', 'af', '']);
      return;
    }

    const maxGain = Math.max(0, ...eq.bands.map(b => Number(b.gain) || 0));
    const preampDb = maxGain > 0 ? -(maxGain * 0.85).toFixed(1) : 0;
    const eqFilters = eq.bands.map(b => `equalizer=f=${b.freq}:width_type=o:w=1.2:g=${b.gain}`);
    const afString = `lavfi=[volume=${preampDb}dB,${eqFilters.join(',')},alimiter=level_in=1:level_out=0.98:limit=0.98:attack=5:release=50]`;

    mpvService.sendCommand(['set_property', 'af', afString]);
  },

  cleanup: () => {
    if (mpvProcess) {
      try { mpvProcess.kill('SIGTERM'); } catch (e) {}
    }
    if (fs.existsSync(MPV_SOCKET)) {
      try { fs.unlinkSync(MPV_SOCKET); } catch (e) {}
    }
  }
};