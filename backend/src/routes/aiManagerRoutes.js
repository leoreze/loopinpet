import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getAiManagerDashboard, updateAiActionStatus } from '../services/aiManagerService.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    res.json(await getAiManagerDashboard(req.user.tenantId));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Não foi possível carregar o Gerente IA.' });
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
