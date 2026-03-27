import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');

const candidatePaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(backendRoot, '.env')
];

let loadedEnvFile = '';
for (const candidate of candidatePaths) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false });
    loadedEnvFile = candidate;
    break;
  }
}

if (!loadedEnvFile) {
  dotenv.config();
}

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: (process.env.DATABASE_URL || '').trim(),
  jwtSecret: (process.env.JWT_SECRET || 'loopinpet-dev-secret').trim(),
  openAiApiKey: (process.env.OPENAI_API_KEY || '').trim(),
  whatsappApiUrl: (process.env.WHATSAPP_API_URL || '').trim(),
  whatsappApiToken: (process.env.WHATSAPP_API_TOKEN || '').trim(),
  mercadoPagoAccessToken: (process.env.MERCADO_PAGO_ACCESS_TOKEN || '').trim(),
  loadedEnvFile
};
