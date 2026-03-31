import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import tenantRoutes from './routes/tenantRoutes.js';
import tutorRoutes from './routes/tutorRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import supportRoutes from './routes/supportRoutes.js';
import managementRoutes from './routes/managementRoutes.js';
import aiManagerRoutes from './routes/aiManagerRoutes.js';
import packageRoutes from './routes/packageRoutes.js';
import { healthcheckDb } from './config/db.js';
import { requireAuth } from './middleware/auth.js';
import { getMyProfile, updateMyPassword, updateMyProfile } from './services/meProfileService.js';
import { env } from './config/env.js';
import { ensureBaseSchema } from './scripts/bootstrapDb.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.resolve(__dirname, '../../frontend')));

app.get('/api/health', async (req, res) => {
  const db = await healthcheckDb();
  res.json({
    status: 'ok',
    service: 'LoopinPet API',
    database: db,
    integrations: {
      openaiConfigured: Boolean(env.openAiApiKey),
      whatsappConfigured: Boolean(env.whatsappApiUrl && env.whatsappApiToken),
      mercadoPagoConfigured: Boolean(env.mercadoPagoAccessToken)
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/tenant', tenantRoutes);
app.use('/api/tenant/tutors', tutorRoutes);
app.use('/api/tenant/attendance', attendanceRoutes);
app.use('/api/tenant/support', supportRoutes);
app.use('/api/tenant/manage', managementRoutes);
app.use('/api/tenant/ai', aiManagerRoutes);
app.use('/api/tenant/packages', packageRoutes);

app.get('/tenant/login', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../frontend/pages/auth/tenant-login.html'));
});

const tenantPages = [
  'dashboard',
  'agenda',
  'atendimento',
  'configuracoes',
  'configuracoes-gerais',
  'horario-de-funcionamento',
  'meu-perfil',
  'usuarios',
  'cargos-e-permissoes',
  'pets',
  'services',
  'pacotes',
  'financeiro',
  'assinatura',
  'status-das-sessoes',
  'formas-de-pagamento',
  'categorias-das-despesas',
  'appetzap',
  'suporte',
  'ai',
  'atualizacoes',
  'termos-de-uso',
  'politicas-de-privacidade',
  'tutores',
  'colaboradores'
];

tenantPages.forEach((page) => {
  app.get(`/tenant/${page}`, (req, res) => {
    res.sendFile(path.resolve(__dirname, `../../frontend/pages/tenant/${page}.html`));
  });
});

if (env.databaseUrl) {
  ensureBaseSchema().catch((error) => {
    console.error('Falha ao preparar schema inicial:', error.message);
  });
}

app.get('/api/me-profile', requireAuth, async (req, res) => {
  try {
    const profile = await getMyProfile(req.user.sub);
    res.json(profile);
  } catch (error) {
    res.status(404).json({ error: error.message || 'Não foi possível carregar o Meu Perfil.' });
  }
});

app.put('/api/me-profile', requireAuth, async (req, res) => {
  try {
    const profile = await updateMyProfile(req.user.sub, req.body || {});
    res.json({ message: 'Meu Perfil atualizado com sucesso.', profile });
  } catch (error) {
    const status = /obrigat|já existe|e-mail/i.test(error.message || '') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Não foi possível salvar o Meu Perfil.' });
  }
});

app.post('/api/me-profile/password', requireAuth, async (req, res) => {
  try {
    await updateMyPassword(req.user.sub, req.body || {});
    res.json({ message: 'Senha alterada com sucesso.' });
  } catch (error) {
    const status = /senha|preencha|incorreta|iguais/i.test(error.message || '') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Não foi possível alterar a senha.' });
  }
});

export default app;
