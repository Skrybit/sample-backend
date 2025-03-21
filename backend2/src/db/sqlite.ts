import Database from 'better-sqlite3';
import path from 'path';

import { IS_TESTNET } from '../config/network';

const dbPrefix = IS_TESTNET ? 'testnet' : 'mainnet';

// Resolve DB path relative to project root
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      commit_tx_id TEXT,
      reveal_tx_hex TEXT,
      status TEXT DEFAULT 'pending'
    )
  `);
  console.log('Database initialized successfully');
}

// Prepared statements
export const insertInscription = db.prepare(`
  INSERT INTO inscriptions (
    temp_private_key, address, required_amount,
    file_size, recipient_address, sender_address, fee_rate, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export const getInscription = db.prepare<number>('SELECT * FROM inscriptions WHERE id = ?');
export const getInscriptionBySender = db.prepare<string>('SELECT * FROM inscriptions WHERE sender_address = ?');
export const updateInscription = db.prepare<[string, string, string, number]>(`
  UPDATE inscriptions 
  SET commit_tx_id = ?, reveal_tx_hex = ?, status = ? 
  WHERE id = ?
`);
export const updateInscriptionPayment = db.prepare<[string, number]>(`
  UPDATE inscriptions 
  SET status = ? 
  WHERE id = ?
`);
