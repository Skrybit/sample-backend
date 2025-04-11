import { Pool, PoolClient, QueryResult } from 'pg';
import { Inscription } from '../types';
type TransactionType = 'commit' | 'reveal';

import { PG_POOL_CONFIG } from '../config/network';

const pool = new Pool(PG_POOL_CONFIG);

export async function initDatabase() {
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();

    await client.query(`
      CREATE TABLE  IF NOT EXISTS  wallets (
        id SERIAL PRIMARY KEY,
        address TEXT NOT NULL UNIQUE,
        private_key TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE  IF NOT EXISTS inscriptions (
        id SERIAL PRIMARY KEY,
        payment_address_id INTEGER NOT NULL REFERENCES wallets(id),
        sender_address_id INTEGER NOT NULL REFERENCES wallets(id),
        recipient_address_id INTEGER NOT NULL REFERENCES wallets(id),
        required_amount INTEGER NOT NULL,
        file_size INTEGER NOT NULL,
        fee_rate DOUBLE PRECISION NOT NULL,
        created_block INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE  IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        inscription_id INTEGER NOT NULL REFERENCES inscriptions(id),
        type TEXT NOT NULL,
        tx_id TEXT,
        tx_hex TEXT NOT NULL,
        block_number INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE  IF NOT EXISTS status_updates (
        id SERIAL PRIMARY KEY,
        inscription_id INTEGER NOT NULL REFERENCES inscriptions(id),
        old_status TEXT,
        new_status TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE  IF NOT EXISTS block_checks (
        id SERIAL PRIMARY KEY,
        inscription_id INTEGER NOT NULL REFERENCES inscriptions(id),
        block_number INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

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
    // if (client) client.release();
  }
}

// ======================
// Wallet Operations
// ======================

export async function insertWallet(address: string, privateKey?: string) {
  const result = await query(
    `INSERT INTO wallets (address, private_key)
     VALUES ($1, $2)
     ON CONFLICT (address) DO NOTHING
     RETURNING *`,
    [address, privateKey],
  );

  // console.log('insertWallet result', result);

  return result;
}

export async function getWalletByAddress(address: string) {
  const result = await query(`SELECT * FROM wallets WHERE address = $1`, [address]);
  return result.rows[0];
}

// ======================
// Inscription Operations
// ======================

export async function insertInscription(
  paymentAddressId: number,
  senderAddressId: number,
  recipientAddressId: number,
  requiredAmount: number,
  fileSize: number,
  feeRate: number,
  createdBlock: number,
) {
  const result = await query(
    `INSERT INTO inscriptions (
      payment_address_id,
      sender_address_id,
      recipient_address_id,
      required_amount,
      file_size,
      fee_rate,
      created_block
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [paymentAddressId, senderAddressId, recipientAddressId, requiredAmount, fileSize, feeRate, createdBlock],
  );
  // console.log('insertInscription result ', result);
  return result.rows[0] || null;
}

export async function getInscription(id: number): Promise<Inscription> {
  const result = await query(
    `SELECT 
      i.*,
      w_pay.address as address,
      w_pay.private_key as private_key,
      w_send.address as sender_address,
      w_recp.address as recipient_address,
      (SELECT block_number FROM block_checks 
       WHERE inscription_id = i.id 
       ORDER BY created_at DESC 
       LIMIT 1) as last_checked_block
    FROM inscriptions i
    JOIN wallets w_pay ON i.payment_address_id = w_pay.id
    JOIN wallets w_send ON i.sender_address_id = w_send.id
    JOIN wallets w_recp ON i.recipient_address_id = w_recp.id
    WHERE i.id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

export async function getInscriptionBySender(senderAddress: string) {
  const result = await query(
    `SELECT 
      i.*,
      w_pay.address as address,
      w_pay.private_key as private_key,
      w_send.address as sender_address,
      w_recp.address as recipient_address
    FROM inscriptions i
    JOIN wallets w_send ON i.sender_address_id = w_send.id
    JOIN wallets w_pay ON i.payment_address_id = w_pay.id
    JOIN wallets w_recp ON i.recipient_address_id = w_recp.id
    WHERE w_send.address = $1`,
    [senderAddress],
  );
  return result.rows as Inscription[];
}

// ======================
// Transaction Operations
// ======================

export async function insertTransaction({
  inscriptionId,
  type,
  txId,
  txHex,
  blockNumber,
}: {
  inscriptionId: number;
  type: TransactionType;
  txId: string;
  txHex: string;
  blockNumber: number;
}) {
  const result = await query(
    `INSERT INTO transactions (
      inscription_id,
      type,
      tx_id,
      tx_hex,
      block_number
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *`,
    [inscriptionId, type, txId, txHex, blockNumber],
  );
  // console.log('insertTransaction result', result);

  return result;
}

export async function getTransactionsByInscription(inscriptionId: number, txType = 'commit') {
  const result = await query(
    `SELECT * 
    FROM transactions 
    WHERE inscription_id = $1 and type = $2
    ORDER BY created_at DESC 
    LIMIT 1
  `,
    [inscriptionId, txType],
  );
  return result.rows[0]?.tx_hex || '';
}

// ======================
// Status Operations
// ======================

export async function insertStatusUpdate(inscriptionId: number, oldStatus: string | null, newStatus: string) {
  const result = await query(
    `INSERT INTO status_updates (
      inscription_id,
      old_status,
      new_status
    ) VALUES ($1, $2, $3)
    RETURNING *`,
    [inscriptionId, oldStatus, newStatus],
  );
  // console.log('insertStatusUpdate result', result);
  return result;
}

export async function getStatusHistory(inscriptionId: number) {
  const result = await query(
    `SELECT * FROM status_updates 
    WHERE inscription_id = $1 
    ORDER BY created_at DESC`,
    [inscriptionId],
  );
  return result.rows;
}

export async function getCurrentStatus(inscriptionId: number) {
  const result = await query(
    `SELECT new_status 
    FROM status_updates 
    WHERE inscription_id = $1 
    ORDER BY created_at DESC 
    LIMIT 1`,
    [inscriptionId],
  );
  // console.log('getCurrentStatus result', result);
  return result.rows[0]?.new_status || null;
}

// ======================
// Block Check Operations
// ======================

export async function insertBlockCheck({ id, blockNumber }: { id: number; blockNumber: number }) {
  const result = await query(
    `INSERT INTO block_checks (inscription_id, block_number)
    VALUES ($1, $2)
    RETURNING *`,
    [id, blockNumber],
  );
  // console.log('insertBlockCheck result', result);
  return result;
}

export async function getBlockCheckHistory(inscriptionId: number) {
  const result = await query(
    `SELECT * FROM block_checks 
    WHERE inscription_id = $1 
    ORDER BY created_at DESC`,
    [inscriptionId],
  );
  return result.rows;
}

// ======================
// Complex Operations
// ======================

export async function createFullInscriptionRecord({
  tempPrivateKey,
  address,
  requiredAmount,
  fileSize,
  recipientAddress,
  senderAddress,
  feeRate,
  createdBlock,
  initialStatus = 'pending',
}: {
  tempPrivateKey: string;
  address: string;
  requiredAmount: string;
  fileSize: number;
  recipientAddress: string;
  senderAddress: string;
  feeRate: string;
  createdBlock: number;
  initialStatus?: string;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert wallets
    await client.query(
      `INSERT INTO wallets (address, private_key)
       VALUES ($1, $2)
       ON CONFLICT (address) DO NOTHING`,
      [address, tempPrivateKey],
    );

    await client.query(
      `INSERT INTO wallets (address)
       VALUES ($1)
       ON CONFLICT (address) DO NOTHING`,
      [senderAddress],
    );

    await client.query(
      `INSERT INTO wallets (address)
       VALUES ($1)
       ON CONFLICT (address) DO NOTHING`,
      [recipientAddress],
    );

    // Get wallet IDs
    const paymentWallet = await client.query(`SELECT id FROM wallets WHERE address = $1`, [address]);
    const senderWallet = await client.query(`SELECT id FROM wallets WHERE address = $1`, [senderAddress]);
    const recipientWallet = await client.query(`SELECT id FROM wallets WHERE address = $1`, [recipientAddress]);

    // Create inscription
    const inscriptionResult = await client.query(
      `INSERT INTO inscriptions (
        payment_address_id,
        sender_address_id,
        recipient_address_id,
        required_amount,
        file_size,
        fee_rate,
        created_block
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
      [
        paymentWallet.rows[0].id,
        senderWallet.rows[0].id,
        recipientWallet.rows[0].id,
        requiredAmount,
        fileSize,
        feeRate,
        createdBlock,
      ],
    );

    // console.log('inscriptionResult ', inscriptionResult);

    const inscriptionId = inscriptionResult.rows[0].id;

    // Record initial status
    await client.query(
      `INSERT INTO status_updates (inscription_id, new_status)
       VALUES ($1, $2)`,
      [inscriptionId, initialStatus],
    );

    // Record initial block check
    await client.query(
      `INSERT INTO block_checks (inscription_id, block_number)
       VALUES ($1, $2)`,
      [inscriptionId, createdBlock],
    );

    await client.query('COMMIT');
    // console.log('!! inscriptionId', inscriptionId);

    return { id: inscriptionId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateInscriptionStatus({ id, status }: { id: number; status: string }) {
  const currentStatus = await getCurrentStatus(id);
  const result = await insertStatusUpdate(id, currentStatus, status);
  // console.log('insertStatusUpdate result', result);
  return result;
}

export async function deletePendingInscriptionBySender(senderAddress: string, status = 'pending'): Promise<number> {
  const result = await query('DELETE FROM inscriptions WHERE sender_address = $1 and status = $2', [
    senderAddress,
    status,
  ]);
  console.log('delete result', result);
  return result.rowCount || 0;
}

process.on('SIGINT', async () => {
  await pool.end();
  console.log('PostgreSQL pool closed');
  // do we need it?
  process.exit(0);
});
