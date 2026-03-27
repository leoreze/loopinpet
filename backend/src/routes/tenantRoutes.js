import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getTenantBranding, getTenantSummary, updateTenantBranding } from '../services/tenantService.js';

const router = Router();

router.get('/summary', requireAuth, async (req, res) => {
  try {
    const data = await getTenantSummary(req.user.tenantId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Não foi possível carregar o resumo do tenant.' });
  }
});

router.get('/branding', requireAuth, async (req, res) => {
  try {
    const data = await getTenantBranding(req.user.tenantId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Não foi possível carregar o white-label.' });
  }
});

router.put('/branding', requireAuth, async (req, res) => {
  try {
    const data = await updateTenantBranding(req.user.tenantId, req.body || {});
    res.json({ message: 'White-label atualizado com sucesso.', ...data });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível salvar o white-label.' });
  }
});

export default router;
