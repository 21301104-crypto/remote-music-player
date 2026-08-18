// server/index.js
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { PORT } from './config/constants.js';
import apiRoutes from './routes/index.js';
import { initSocketManager } from './sockets/socketManager.js';
import { playbackService } from './services/playbackService.js';
import { mpvService } from './services/mpvService.js';

const app = express();
const httpServer = createServer(app);

// Middlewares Globales
app.use(cors());
app.use(express.json());
app.use(express.static('dist'));

// Montaje de Rutas REST (/api/cover, /api/lyrics, /api/search, /api/upload)
app.use('/api', apiRoutes);

// Inicialización de WebSockets en Tiempo Real
initSocketManager(httpServer);

// Inicialización del Motor de Audio y Base de Datos SQLite
playbackService.init();

// Manejo de Cierre Limpio de Procesos
const shutdown = () => {
  mpvService.cleanup();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [Clean Architecture] Servidor activo en puerto ${PORT}`);
});