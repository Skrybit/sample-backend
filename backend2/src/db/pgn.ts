import { Pool, PoolClient, QueryResult } from 'pg';
import * as crypto from 'crypto';
import { Inscription } from '../types';

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

      CREATE INDEX IF NOT EXISTS wallets_address_idx ON wallets (address);

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


      CREATE INDEX IF NOT EXISTS inscriptions_payment_address_id_idx ON inscriptions (payment_address_id);
      CREATE INDEX IF NOT EXISTS inscriptions_sender_address_id_idx ON inscriptions (sender_address_id);
      CREATE INDEX IF NOT EXISTS inscriptions_recipient_address_id_idx ON inscriptions (recipient_address_id);
      CREATE INDEX IF NOT EXISTS inscriptions_created_at_idx ON inscriptions (created_at);

      CREATE TABLE  IF NOT EXISTS commit_transactions (
        id SERIAL PRIMARY KEY,
        inscription_id INTEGER NOT NULL REFERENCES inscriptions(id) on delete CASCADE UNIQUE,
        tx_id TEXT,
        reveal_tx_hex TEXT NOT NULL,
        block_number INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS commit_transactions_inscription_id_idx ON commit_transactions (inscription_id);
      CREATE INDEX IF NOT EXISTS commit_transactions_block_number_idx ON commit_transactions (block_number);

      CREATE TABLE  IF NOT EXISTS reveal_transactions (
        id SERIAL PRIMARY KEY,
        inscription_id INTEGER NOT NULL REFERENCES inscriptions(id) on delete CASCADE UNIQUE,
        tx_id TEXT,
        block_number INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS reveal_transactions_inscription_id_idx ON reveal_transactions (inscription_id);
      CREATE INDEX IF NOT EXISTS reveal_transactions_block_number_idx ON reveal_transactions (block_number);

      CREATE TABLE  IF NOT EXISTS status_updates (
        id SERIAL PRIMARY KEY,
        inscription_id INTEGER NOT NULL REFERENCES inscriptions(id) on delete CASCADE,
        old_status TEXT,
        new_status TEXT NOT NULL,
        block_number INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS status_updates_inscription_id_idx ON status_updates (inscription_id);
      CREATE INDEX IF NOT EXISTS status_updates_new_status_idx ON status_updates (new_status);
      CREATE INDEX IF NOT EXISTS status_updates_inscription_id_created_at_idx ON status_updates (inscription_id, created_at DESC);

      CREATE TABLE  IF NOT EXISTS block_checks (
        id SERIAL PRIMARY KEY,
        inscription_id INTEGER NOT NULL REFERENCES inscriptions(id) on delete CASCADE,
        block_number INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

     CREATE INDEX IF NOT EXISTS block_checks_inscription_id_idx ON block_checks (inscription_id);
     CREATE INDEX IF NOT EXISTS block_checks_inscription_id_block_number_idx ON block_checks (inscription_id, block_number);

     CREATE TABLE IF NOT EXISTS inscription_files (
      id SERIAL PRIMARY KEY,
      inscription_id INTEGER NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
      file_data BYTEA NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      sha256_hash CHAR(64) NOT NULL
     );

     CREATE INDEX IF NOT EXISTS inscription_files_inscription_id_idx 
     ON inscription_files(inscription_id);

     CREATE INDEX IF NOT EXISTS inscription_files_created_at_idx 
     ON inscription_files(created_at);

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
    if (client) client.release();
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

  return result;
}

// ======================
// Inscription Operations
// ======================
export async function getInscription(id: number): Promise<Inscription> {
  const result = await query(
    `SELECT 
      i.*,
      w_pay.address as address,
      w_pay.private_key as temp_private_key,
      w_send.address as sender_address,
      w_recp.address as recipient_address,
      t_commit.tx_id as commit_tx_id,
      t_commit.reveal_tx_hex as reveal_tx_hex,
      t_reveal.tx_id as reveal_tx_id,
      (SELECT new_status
       FROM status_updates
       WHERE inscription_id = i.id
       ORDER BY created_at DESC
       LIMIT 1) as status,
      (SELECT block_number FROM block_checks
       WHERE inscription_id = i.id
       ORDER BY created_at DESC
       LIMIT 1) as last_checked_block
    FROM inscriptions i
    JOIN wallets w_pay ON i.payment_address_id = w_pay.id
    JOIN wallets w_send ON i.sender_address_id = w_send.id
    JOIN wallets w_recp ON i.recipient_address_id = w_recp.id
    LEFT JOIN commit_transactions t_commit ON i.id = t_commit.inscription_id
    LEFT JOIN reveal_transactions t_reveal ON i.id = t_reveal.inscription_id
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
      w_pay.private_key as temp_private_key,
      w_send.address as sender_address,
      (SELECT new_status
       FROM status_updates
       WHERE inscription_id = i.id
       ORDER BY created_at DESC
       LIMIT 1) as status,
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

export async function getPendingInscriptionBySender(senderAddress: string) {
  const result = await query(
    `SELECT 
      i.*,
      w_send.address as sender_address,
      su.new_status as status
    FROM inscriptions i
    JOIN wallets w_send ON i.sender_address_id = w_send.id
    LEFT JOIN LATERAL (
      SELECT new_status
      FROM status_updates
      WHERE inscription_id = i.id
      ORDER BY created_at DESC
      LIMIT 1
    ) su ON true
    WHERE w_send.address = $1 AND su.new_status = 'pending'`,
    [senderAddress],
  );

  return result.rows as Inscription[];
}

export async function getPendingInscriptions() {
  const result = await query(
    `SELECT 
      i.*,
      su.new_status as status
    FROM inscriptions i
    LEFT JOIN LATERAL (
      SELECT new_status
      FROM status_updates
      WHERE inscription_id = i.id
      ORDER BY created_at DESC
      LIMIT 1
    ) su ON true
    WHERE su.new_status = 'pending'`,
  );

  return result.rows as Inscription[];
}

// ======================
// Transaction Operations
// ======================
export async function insertCommitTransaction({
  inscriptionId,
  txId,
  revealTxHex,
  blockNumber,
}: {
  inscriptionId: number;
  txId: string;
  revealTxHex: string;
  blockNumber: number;
}) {
  const result = await query(
    `INSERT INTO commit_transactions (
      inscription_id,
      tx_id,
      reveal_tx_hex,
      block_number
    ) VALUES ($1, $2, $3 , $4 )
       ON CONFLICT (inscription_id) DO UPDATE SET tx_id = $2 , reveal_tx_hex = $3
    RETURNING *`,
    [inscriptionId, txId, revealTxHex, blockNumber],
  );

  return result;
}

export async function insertRevealTransaction({
  inscriptionId,
  txId,
  blockNumber,
}: {
  inscriptionId: number;
  txId: string;
  blockNumber: number;
}) {
  const result = await query(
    `INSERT INTO reveal_transactions (
      inscription_id,
      tx_id,
      block_number
    ) VALUES ($1, $2, $3 )
       ON CONFLICT (inscription_id) DO UPDATE SET tx_id = $2
    RETURNING *`,
    [inscriptionId, txId, blockNumber],
  );

  return result;
}

export async function getRevelaTransaction(inscriptionId: number) {
  const result = await query(
    `SELECT * 
    FROM reveal_transactions 
    WHERE inscription_id = $1 
    ORDER BY created_at DESC 
    LIMIT 1
  `,
    [inscriptionId],
  );
  return result.rows[0] || '';
}

export async function getCommitTransaction(inscriptionId: number) {
  const result = await query(
    `SELECT * 
    FROM commit_transactions
    WHERE inscription_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `,
    [inscriptionId],
  );
  return result.rows[0] || '';
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
  return result;
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
  return result.rows[0]?.new_status || null;
}

// helper function
export async function updateInscriptionStatus({ id, status }: { id: number; status: string }) {
  const currentStatus = await getCurrentStatus(id);
  if (currentStatus === status) {
    return;
  }
  const result = await insertStatusUpdate(id, currentStatus, status);
  return result;
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
  return result;
}

export async function getLastCheckedBlock(inscriptionId: number): Promise<number> {
  const result = await query(
    `
      SELECT block_number FROM block_checks
       WHERE inscription_id = $1
       ORDER BY created_at DESC
       LIMIT 1
    `,
    [inscriptionId],
  );

  return result.rows[0]?.block_number || 0;
}

export async function updateLastCheckedBlock({ id, blockNumber }: { id: number; blockNumber: number }) {
  const lastInsertedBlock = await getLastCheckedBlock(id);
  if (lastInsertedBlock === blockNumber) {
    return;
  }
  const result = await insertBlockCheck({ id, blockNumber });
  return result;
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

    return { id: inscriptionId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deletePendingInscriptionBySender(senderAddress: string, status = 'pending'): Promise<number> {
  const rows = await getPendingInscriptionBySender(senderAddress);

  const rowsId = rows.map((el) => el.id);

  if (!rowsId) {
    return 0;
  }
  const result = await query(`DELETE FROM inscriptions WHERE id = ANY($1::int[])`, [rowsId]);

  return result.rowCount || 0;
}

export async function storeInscriptionFile({
  inscriptionId,
  fileBuffer,
  fileName,
  mimeType,
}: {
  inscriptionId: number;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
}) {
  const hash = crypto.createHash('sha256');
  hash.update(fileBuffer);
  const sha256Hash = hash.digest('hex');

  return query(
    `INSERT INTO inscription_files (
      inscription_id,
      file_data,
      file_name,
      mime_type,
      sha256_hash
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING id`,
    [inscriptionId, fileBuffer, fileName, mimeType, sha256Hash],
  );
}

export async function getInscriptionFile(inscriptionId: number) {
  const result = await query(
    `SELECT file_data, file_name, mime_type, sha256_hash
     FROM inscription_files
     WHERE inscription_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [inscriptionId],
  );

  if (!result.rows[0]) return null;

  const fileBuffer: Buffer = result.rows[0].file_data;
  return {
    data: fileBuffer,
    fileName: result.rows[0].file_name,
    mimeType: result.rows[0].mime_type,
    sha256: result.rows[0].sha256_hash,
  };
}

process.on('SIGINT', async () => {
  await pool.end();
  console.log('PostgreSQL pool closed');
  // do we need it?
  process.exit(0);
});
