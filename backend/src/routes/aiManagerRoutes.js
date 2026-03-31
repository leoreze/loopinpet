import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { chatWithAiManager, getAiManagerDashboard, updateAiActionStatus } from '../services/aiManagerService.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    res.json(await getAiManagerDashboard(req.user.tenantId));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Não foi possível carregar o Gerente IA.' });
  }
});


router.post('/chat', async (req, res) => {
  try {
    const data = await chatWithAiManager(req.user.tenantId, req.body || {});
    res.json(data);
  } catch (error) {
    const status = /Envie uma pergunta/i.test(error.message || '') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Não foi possível conversar com o Gerente IA.' });
  }
});

router.patch('/actions/:actionId', async (req, res) => {
  try {
    const item = await updateAiActionStatus(req.user.tenantId, req.params.actionId, req.body || {});
    res.json({ message: 'Ação do Gerente IA atualizada com sucesso.', item });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível atualizar a ação.' });
  }
});

export default router;
