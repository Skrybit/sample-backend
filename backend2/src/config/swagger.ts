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
        ApiErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'object' },
          },
        },
        Inscription: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            temp_private_key: { type: 'string' },
            address: { type: 'string' },
            required_amount: { type: 'integer' },
            file_size: { type: 'integer' },
            recipient_address: { type: 'string' },
            sender_address: { type: 'string' },
            fee_rate: { type: 'number' },
            created_at: { type: 'string', format: 'date-time' },
            commit_tx_id: { type: 'string' },
            reveal_tx_hex: { type: 'string' },
            status: {
              type: 'string',
              enum: ['pending', 'paid', 'reveal_ready', 'completed'],
            },
          },
        },
        CreateCommitPayload: {
          type: 'object',
          required: ['recipient_address', 'fee_rate', 'file_path'],
          properties: {
            recipient_address: { type: 'string' },
            sender_address: { type: 'string' },
            fee_rate: { type: 'string' },
            file_path: { type: 'string' },
          },
        },
        CreateCommitResponse: {
          type: 'object',
          properties: {
            inscription_id: { type: 'integer', format: 'int64' },
            file_size_in_bytes: { type: 'integer' },
            payment_address: { type: 'string' },
            recipient_address: { type: 'string' },
            sender_address: { type: 'string' },
            required_amount_in_sats: { type: 'string' },
            commmit_creation_successful: { type: 'boolean' },
          },
        },
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
        InscriptionPayment: {
          type: 'object',
          properties: {
            is_paid: { type: 'boolean' },
            id: { type: 'integer' },
            payment_address: { type: 'string' },
            required_amount_in_sats: { type: 'integer' },
            sender_address: { type: 'string' },
            status: {
              type: 'string',
              enum: ['pending', 'paid', 'reveal_ready', 'completed'],
            },
            payment_utxo: {
              nullable: true,
              oneOf: [{ $ref: '#/components/schemas/PaymentUtxo' }, { type: 'null' }],
            },
            error_details: { $ref: '#/components/schemas/ErrorDetails' },
          },
        },
        PaymentUtxo: {
          type: 'object',
          properties: {
            txid: { type: 'string' },
            vout: { type: 'integer' },
            address: { type: 'string' },
            label: { type: 'string' },
            amount: { type: 'number' },
            confirmations: { type: 'integer' },
            scriptPubKey: { type: 'string' },
            spendable: { type: 'boolean' },
          },
        },
        CreateRevealPayload: {
          type: 'object',
          required: ['inscription_id', 'commit_tx_id', 'vout', 'amount', 'file_path'],
          properties: {
            inscription_id: { type: 'string' },
            commit_tx_id: { type: 'string' },
            vout: { type: 'string' },
            amount: { type: 'string' },
          },
        },
        CreateRevealResponse: {
          type: 'object',
          properties: {
            inscription_id: { type: 'string' },
            commit_tx_id: { type: 'string' },
            reveal_tx_hex: { type: 'string' },
            debug: {
              type: 'object',
              properties: {
                payment_address: { type: 'string' },
                payment_pubkey: { type: 'string' },
                required_amount_in_sats: { type: 'string' },
                given_utxo_amount_in_sats: { type: 'string' },
                sender_address: { type: 'string' },
                recipient_address: { type: 'string' },
                fees: { type: 'string' },
              },
            },
          },
        },
        BroadcastRevealTxBody: {
          type: 'object',
          required: ['inscription_id'],
          properties: {
            inscription_id: { type: 'string' },
            sender_address: { type: 'string' },
          },
        },
        BroadcastRevealResponse: {
          type: 'object',
          properties: {
            inscription_id: { type: 'string' },
            reveal_tx_id: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
              nullable: true,
            },
          },
        },
        PaymentStatusBody: {
          type: 'object',
          required: ['payment_address', 'required_amount_in_sats', 'sender_address', 'id'],
          properties: {
            payment_address: { type: 'string' },
            required_amount_in_sats: { type: 'string' },
            sender_address: { type: 'string' },
            id: { type: 'string' },
          },
        },
        ErrorDetails: {
          type: 'object',
          properties: {
            errCode: { type: 'string' },
            errMsg: { type: 'string' },
            errStatus: { type: 'string' },
            responseStatus: { type: 'number' },
            responseStatusText: { type: 'string' },
            dataErrCode: {}, // Generic object since type is unknown
            dataErrMsg: { type: 'string' },
            details: { type: 'string' },
            originalResponseError: { $ref: '#/components/schemas/RpcErrResponse' },
          },
        },
        RpcErrResponse: {
          type: 'object',
          properties: {
            result: { type: 'null' },
            id: { type: 'string' },
            error: {
              type: 'object',
              properties: {
                code: { type: 'number' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: [path.join(__dirname, '../routes/*.{ts,js}')],
};

export const swaggerSpec = swaggerJsdoc(swaggerOptions);
