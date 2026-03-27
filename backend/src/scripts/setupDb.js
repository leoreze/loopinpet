import { ensureBaseSchema } from './bootstrapDb.js';

try {
  await ensureBaseSchema();
  console.log('Base do assinante criada com sucesso.');
  process.exit(0);
} catch (error) {
  console.error('Erro ao preparar banco:', error.message);
  process.exit(1);
}
