// server/sockets/socketManager.js
import { Server } from 'socket.io';
import { registerAudioSocketHandlers } from './audioSocketHandler.js';
import { playbackService } from '../services/playbackService.js';

export const initSocketManager = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    maxHttpBufferSize: 1e8
  });

  // Enlazar la difusión reactiva al callback de la máquina de estados
  playbackService.setNotifyCallback(() => {
    io.emit('state_changed', playbackService.getState());
  });

  io.on('connection', (socket) => {
    registerAudioSocketHandlers(io, socket);
  });

  return io;
};