// server/sockets/socketManager.js
import { Server } from 'socket.io';
import { registerAudioSocketHandlers } from './audioSocketHandler.js';
import { playbackService } from '../services/playbackService.js';

export const initSocketManager = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    maxHttpBufferSize: 1e8
  });

  playbackService.setNotifyCallback(() => {
    io.emit('state_changed', playbackService.getState());
  });

  io.on('connection', (socket) => {
    console.log(`📱 [WebSocket] Cliente conectado desde IP: ${socket.handshake.address} (Socket ID: ${socket.id})`);
    registerAudioSocketHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log(`🔌 [WebSocket] Cliente desconectado (Socket ID: ${socket.id})`);
    });
  });

  return io;
};