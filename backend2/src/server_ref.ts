import express from 'express';
import { db, initDatabase } from './db/sqlite';
import { swaggerSpec } from './config/swagger';
import swaggerUi from 'swagger-ui-express';
import { bigintParser } from './middleware';
import inscriptionsRouter from './routes/inscriptions';
import paymentsRouter from './routes/payments';
import transactionsRouter from './routes/transactions';

const PORT = Number(process.env.PORT) || 3001;
const app = express();

// Initialize database
initDatabase();

// Middleware
app.use(express.json());
app.use(bigintParser);

// Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/inscriptions', inscriptionsRouter);
app.use('/payments', paymentsRouter);
app.use('/transactions', transactionsRouter);

// Server startup
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

export default app;
