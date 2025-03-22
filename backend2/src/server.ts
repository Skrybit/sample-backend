import express, { Application } from 'express';
import swaggerUi from 'swagger-ui-express';
import corsMiddleware from './middleware/cors';
import { bigintParser } from './middleware/bigintParser';
import { swaggerSpec } from './config/swagger';
import { initDatabase } from './db/sqlite';
import paymentsRouter from './routes/payments';
import inscriptionsRouter from './routes/inscriptions';
import transactionsRouter from './routes/transactions';

console.log('__filename', __filename);
console.log(' __dirname: %s', __dirname);

const PORT = Number(process.env.PORT) || 3001;
const app: Application = express();

// Initialize database
initDatabase();

// Middleware
app.use(corsMiddleware);
app.use(express.json());
app.use(bigintParser);

// Docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/payments', paymentsRouter);
app.use('/inscriptions', inscriptionsRouter);
app.use('/transactions', transactionsRouter);

const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
