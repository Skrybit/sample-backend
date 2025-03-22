import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Resolve uploads directory relative to project root
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const upload = multer({ dest: UPLOAD_DIR });
