import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createCustomerPackage,
  createPackageTemplate,
  getCustomerPackageById,
  listAvailablePackagesForPet,
  listPackageDashboard,
  updateCustomerPackage,
  updatePackageTemplate,
  deletePackageTemplate,
  deleteCustomerPackage
} from '../services/packageService.js';

const router = Router();
router.use(requireAuth);

router.get('/dashboard', async (req, res) => {
  try { res.json(await listPackageDashboard(req.user.tenantId)); }
  catch (error) { res.status(500).json({ error: error.message || 'Não foi possível carregar o módulo de pacotes.' }); }
});

router.post('/templates', async (req, res) => {
  try { res.status(201).json({ item: await createPackageTemplate(req.user.tenantId, req.body || {}) }); }
  catch (error) { res.status(400).json({ error: error.message || 'Não foi possível criar o pacote.' }); }
});

router.put('/templates/:templateId', async (req, res) => {
  try { res.json({ item: await updatePackageTemplate(req.user.tenantId, req.params.templateId, req.body || {}) }); }
  catch (error) { res.status(400).json({ error: error.message || 'Não foi possível atualizar o pacote.' }); }
});


router.delete('/templates/:templateId', async (req, res) => {
  try { await deletePackageTemplate(req.user.tenantId, req.params.templateId); res.status(204).end(); }
  catch (error) { res.status(400).json({ error: error.message || 'Não foi possível excluir o pacote.' }); }
});

router.post('/customer-packages', async (req, res) => {
  try { res.status(201).json({ item: await createCustomerPackage(req.user.tenantId, req.body || {}) }); }
  catch (error) { res.status(400).json({ error: error.message || 'Não foi possível vender o pacote.' }); }
});

router.get('/customer-packages/:customerPackageId', async (req, res) => {
  try { res.json({ item: await getCustomerPackageById(req.user.tenantId, req.params.customerPackageId) }); }
  catch (error) { res.status(404).json({ error: error.message || 'Não foi possível carregar o pacote vendido.' }); }
});

router.put('/customer-packages/:customerPackageId', async (req, res) => {
  try { res.json({ item: await updateCustomerPackage(req.user.tenantId, req.params.customerPackageId, req.body || {}) }); }
  catch (error) { res.status(400).json({ error: error.message || 'Não foi possível atualizar o pacote vendido.' }); }
});


router.delete('/customer-packages/:customerPackageId', async (req, res) => {
  try { await deleteCustomerPackage(req.user.tenantId, req.params.customerPackageId); res.status(204).end(); }
  catch (error) { res.status(400).json({ error: error.message || 'Não foi possível excluir o pacote vendido.' }); }
});

router.get('/available', async (req, res) => {
  try { res.json({ items: await listAvailablePackagesForPet(req.user.tenantId, req.query.pet_id || req.query.petId) }); }
  catch (error) { res.status(400).json({ error: error.message || 'Não foi possível consultar pacotes disponíveis.' }); }
});

export default router;
