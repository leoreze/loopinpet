import { ensureBaseSchema } from './bootstrapDb.js';

try {
  await ensureBaseSchema();
  console.log('Migrations iniciais aplicadas.');
  process.exit(0);
} catch (error) {
  console.error('Erro ao migrar banco:', error.message);
  process.exit(1);
}
