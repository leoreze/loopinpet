import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSupportPageData, saveSupportFeedback } from '../services/supportService.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const data = await getSupportPageData(req.user.tenantId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Não foi possível carregar os dados de suporte.' });
  }
});

router.post('/feedback', async (req, res) => {
  try {
    const feedback = await saveSupportFeedback(req.user.tenantId, req.user, req.body || {});
    res.json({ message: 'Sugestões enviadas com sucesso.', feedback });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível enviar as sugestões.' });
  }
});

export default router;
