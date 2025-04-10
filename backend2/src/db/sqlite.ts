import Database from 'better-sqlite3';
import path from 'path';
import { Inscription } from '../types';
import { IS_TESTNET } from '../config/network';

const dbPrefix = IS_TESTNET ? 'testnet' : 'mainnet';

const DB_PATH = path.resolve(__dirname, `../../ordinals_${dbPrefix}.db`);

export const db = new Database(DB_PATH, { verbose: console.log });

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      temp_private_key TEXT NOT NULL,
      address TEXT NOT NULL,
      required_amount INTEGER NOT NULL,
      file_size INTEGER NOT NULL,
      recipient_address TEXT NOT NULL,
      sender_address TEXT NOT NULL,
      fee_rate REAL NOT NULL,
      commit_tx_id TEXT,
      reveal_tx_hex TEXT,
      status TEXT DEFAULT 'pending',
      reveal_tx_id TEXT DEFAULT '',
      created_block INTEGER DEFAULT 0,
      last_checked_block INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Database initialized successfully');
}

export async function insertInscription({
  tempPrivateKey,
  address,
  requiredAmount,
  fileSize,
  recipientAddress,
  senderAddress,
  feeRate,
  createdBlock,
}: {
  tempPrivateKey: string;
  address: string;
  requiredAmount: string;
  fileSize: number;
  recipientAddress: string;
  senderAddress: string;
  feeRate: string;
  createdBlock: number;
}) {
  const result = db
    .prepare(
      `
  INSERT INTO inscriptions (
    temp_private_key, address, required_amount,
    file_size, recipient_address, sender_address, 
    fee_rate, created_block, last_checked_block
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
    )
    .run(
      tempPrivateKey,
      address,
      requiredAmount,
      fileSize,
      recipientAddress,
      senderAddress,
      feeRate,
      createdBlock,
      createdBlock,
    );

  return { id: result.lastInsertRowid };
}

export async function getInscription(id: number): Promise<Inscription | null> {
  const result = db.prepare<number>('SELECT * FROM inscriptions WHERE id = ?').get(id);

  return result ? (result as Inscription) : null;
}

export async function getInscriptionBySender(senderAddress: string): Promise<Inscription[]> {
  const result = db.prepare<string>('SELECT * FROM inscriptions WHERE sender_address = ?').all(senderAddress);
  return result as Inscription[];
}

export async function updateInscription({
  id,
  commitTxId,
  revealTxHex,
  status,
}: {
  id: number;
  commitTxId: string;
  revealTxHex: string;
  status: string;
}) {
  const result = db
    .prepare(
      `
        UPDATE inscriptions 
        SET commit_tx_id = $commitTxId, reveal_tx_hex = $revealTxHex, status = $status 
        WHERE id = $id 
      `,
    )
    .run({ commitTxId, revealTxHex, status, id });
  return result;
}

export async function updateInscriptionStatus({ id, status }: { id: number; status: string }) {
  const result = db
    .prepare(
      `
        UPDATE inscriptions 
        SET status = $status 
        WHERE id = $id
      `,
    )
    .run({ id, status });

  return result.lastInsertRowid;
}

export async function updateInscriptionLastCheckedBlock({
  id,
  lastCheckedBlock,
}: {
  id: number;
  lastCheckedBlock: number;
}) {
  const result = db
    .prepare(
      `
        UPDATE inscriptions 
        SET last_checked_block = $lastCheckedBlock
        WHERE id = $id
      `,
    )
    .run({ id, lastCheckedBlock });

  return result.lastInsertRowid;
}

export async function updateInscriptionRevealTxId({ id, revealTxId }: { id: number; revealTxId: string }) {
  const result = db
    .prepare(
      `
        UPDATE inscriptions 
        SET reveal_tx_id = $revealTxId 
        WHERE id = $id 
      `,
    )
    .run({
      id,
      revealTxId,
    });

  return result.lastInsertRowid;
}

// not implemented
export async function deletePendingInscriptionBySender(senderAddress: string, status = 'pending'): Promise<number> {
  return 0;
}
