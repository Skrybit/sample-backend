import { Pool, PoolClient, QueryResult } from 'pg';
import { Inscription } from '../types';

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'ordinals',
  password: process.env.PGPASSWORD || 'postgres',
  port: Number(process.env.PGPORT) || 5432,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export async function initDatabase() {
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS inscriptions (
        id SERIAL PRIMARY KEY,
        temp_private_key TEXT NOT NULL,
        address TEXT NOT NULL,
        required_amount INTEGER NOT NULL,
        file_size INTEGER NOT NULL,
        recipient_address TEXT NOT NULL,
        sender_address TEXT NOT NULL,
        fee_rate REAL NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        commit_tx_id TEXT,
        reveal_tx_hex TEXT,
        status TEXT DEFAULT 'pending'
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inscriptions_sender 
      ON inscriptions (sender_address)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inscriptions_status 
      ON inscriptions (status)
    `);

    console.log('PostgreSQL database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

async function query(text: string, params?: any[]): Promise<QueryResult> {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export const db = {
  async insertInscription(inscription: Omit<Inscription, 'id' | 'created_at'>): Promise<Inscription> {
    const result = await query(
      `INSERT INTO inscriptions (
        temp_private_key, address, required_amount,
        file_size, recipient_address, sender_address, fee_rate
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        inscription.temp_private_key,
        inscription.address,
        inscription.required_amount,
        inscription.file_size,
        inscription.recipient_address,
        inscription.sender_address,
        inscription.fee_rate,
      ],
    );
    return result.rows[0];
  },

  async getInscription(id: number): Promise<Inscription | null> {
    const result = await query('SELECT * FROM inscriptions WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async getInscriptionBySender(senderAddress: string): Promise<Inscription[]> {
    const result = await query('SELECT * FROM inscriptions WHERE sender_address = $1', [senderAddress]);
    return result.rows;
  },

  async updateInscription(
    id: number,
    updates: {
      commit_tx_id?: string;
      reveal_tx_hex?: string;
      status?: string;
    },
  ): Promise<Inscription> {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (updates.commit_tx_id) {
      fields.push(`commit_tx_id = $${paramIndex++}`);
      values.push(updates.commit_tx_id);
    }
    if (updates.reveal_tx_hex) {
      fields.push(`reveal_tx_hex = $${paramIndex++}`);
      values.push(updates.reveal_tx_hex);
    }
    if (updates.status) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }

    values.push(id);
    const queryText = `
      UPDATE inscriptions 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(queryText, values);
    return result.rows[0];
  },

  async updateInscriptionPayment(id: number, status: string): Promise<Inscription> {
    return this.updateInscription(id, { status });
  },
};

process.on('SIGINT', async () => {
  await pool.end();
  console.log('PostgreSQL pool closed');
  process.exit(0);
});

export default db;
