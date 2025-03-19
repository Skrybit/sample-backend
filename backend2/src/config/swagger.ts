import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';

const PORT = Number(process.env.PORT) || 3001;

export const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ordinals Inscription API',
      version: '1.0.0',
      description: 'API for managing Bitcoin ordinal inscriptions',
    },
    servers: [{ url: `http://localhost:${PORT}` }],
    tags: [
      { name: 'Inscriptions', description: 'Inscription management' },
      { name: 'Payments', description: 'Payment verification' },
      { name: 'Transactions', description: 'Transaction operations' },
    ],
    components: {
      schemas: {
        InscriptionResponse: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            payment_address: { type: 'string' },
            required_amount_in_sats: { type: 'integer' },
            file_size_in_bytes: { type: 'integer' },
            status: {
              type: 'string',
              enum: ['pending', 'paid', 'reveal_ready', 'completed'],
            },
            commit_tx_id: { type: 'string' },
            reveal_tx_hex: { type: 'string' },
            sender_address: { type: 'string' },
            recipient_address: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        PaymentStatus: {
          type: 'object',
          properties: {
            is_paid: { type: 'boolean' },
            id: { type: 'integer' },
            address: { type: 'string' },
            amount: { type: 'integer' },
            sender_address: { type: 'string' },
            status: { type: 'string' },
          },
        },
        PaymentUtxo: {
          type: 'object',
          properties: {
            txid: { type: 'string' },
            vout: { type: 'integer' },
            value: { type: 'integer' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            error_details: { type: 'string' },
          },
        },
      },
    },
  },
  apis: [path.join(__dirname, '../**/*.{ts,js}')],
};

export const swaggerSpec = swaggerJsdoc(swaggerOptions);
