import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  checkinAgendaItem,
  createAgendaItem,
  createPet,
  createPetMetaItem,
  createRole,
  createService,
  createUser,
  deleteAgendaItem,
  deletePet,
  deletePetMetaItem,
  deleteRole,
  deleteService,
  getManagementMeta,
  listAgenda,
  listPetMetaItems,
  listPets,
  listRoles,
  listServices,
  listUsers,
  moveAgendaItem,
  toggleUserStatus,
  updateAgendaItem,
  updatePet,
  updatePetMetaItem,
  updateRole,
  updateService,
  updateUser
} from '../services/managementService.js';

const router = Router();
router.use(requireAuth);


router.get('/pet-meta/:kind', async (req, res) => {
  try { res.json({ items: await listPetMetaItems(req.user.tenantId, req.params.kind) }); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível carregar os cadastros auxiliares.' }); }
});
router.post('/pet-meta/:kind', async (req, res) => {
  try { res.status(201).json({ item: await createPetMetaItem(req.user.tenantId, req.params.kind, req.body || {}) }); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível criar o registro auxiliar.' }); }
});
router.put('/pet-meta/:kind/:itemId', async (req, res) => {
  try { res.json({ item: await updatePetMetaItem(req.user.tenantId, req.params.kind, req.params.itemId, req.body || {}) }); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível atualizar o registro auxiliar.' }); }
});
router.delete('/pet-meta/:kind/:itemId', async (req, res) => {
  try { res.json(await deletePetMetaItem(req.user.tenantId, req.params.kind, req.params.itemId)); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível remover o registro auxiliar.' }); }
});

router.get('/meta', async (req, res) => {
  try { res.json(await getManagementMeta(req.user.tenantId)); } catch (error) { res.status(500).json({ error: error.message || 'Não foi possível carregar os dados auxiliares.' }); }
});

router.get('/pets', async (req, res) => {
  try { res.json({ items: await listPets(req.user.tenantId, req.query || {}) }); } catch (error) { res.status(500).json({ error: error.message || 'Não foi possível carregar os pets.' }); }
});
router.post('/pets', async (req, res) => {
  try { res.status(201).json({ item: await createPet(req.user.tenantId, req.body || {}) }); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível criar o pet.' }); }
});
router.put('/pets/:petId', async (req, res) => {
  try { res.json({ item: await updatePet(req.user.tenantId, req.params.petId, req.body || {}) }); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível atualizar o pet.' }); }
});
router.delete('/pets/:petId', async (req, res) => {
  try { res.json(await deletePet(req.user.tenantId, req.params.petId)); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível remover o pet.' }); }
});

router.get('/services', async (req, res) => {
  try { res.json({ items: await listServices(req.user.tenantId, req.query || {}) }); } catch (error) { res.status(500).json({ error: error.message || 'Não foi possível carregar os serviços.' }); }
});
router.post('/services', async (req, res) => {
  try { res.status(201).json({ item: await createService(req.user.tenantId, req.body || {}) }); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível criar o serviço.' }); }
});
router.put('/services/:serviceId', async (req, res) => {
  try { res.json({ item: await updateService(req.user.tenantId, req.params.serviceId, req.body || {}) }); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível atualizar o serviço.' }); }
});
router.delete('/services/:serviceId', async (req, res) => {
  try { res.json(await deleteService(req.user.tenantId, req.params.serviceId)); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível remover o serviço.' }); }
});

router.get('/users', async (req, res) => {
  try { res.json({ items: await listUsers(req.user.tenantId, req.query || {}) }); } catch (error) { res.status(500).json({ error: error.message || 'Não foi possível carregar os usuários.' }); }
});
router.post('/users', async (req, res) => {
  try { res.status(201).json({ item: await createUser(req.user.tenantId, req.body || {}) }); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível criar o usuário.' }); }
});
router.put('/users/:userId', async (req, res) => {
  try { res.json({ item: await updateUser(req.user.tenantId, req.params.userId, req.body || {}) }); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível atualizar o usuário.' }); }
});
router.patch('/users/:userId/toggle-status', async (req, res) => {
  try { res.json(await toggleUserStatus(req.user.tenantId, req.params.userId)); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível alterar o status do usuário.' }); }
});

router.get('/roles', async (req, res) => {
  try { res.json({ items: await listRoles(req.user.tenantId) }); } catch (error) { res.status(500).json({ error: error.message || 'Não foi possível carregar os cargos.' }); }
});
router.post('/roles', async (req, res) => {
  try { res.status(201).json({ item: await createRole(req.user.tenantId, req.body || {}) }); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível criar o cargo.' }); }
});
router.put('/roles/:roleId', async (req, res) => {
  try { res.json({ item: await updateRole(req.user.tenantId, req.params.roleId, req.body || {}) }); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível atualizar o cargo.' }); }
});
router.delete('/roles/:roleId', async (req, res) => {
  try { res.json(await deleteRole(req.user.tenantId, req.params.roleId)); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível remover o cargo.' }); }
});

router.get('/agenda', async (req, res) => {
  try { res.json({ items: await listAgenda(req.user.tenantId, req.query || {}) }); } catch (error) { res.status(500).json({ error: error.message || 'Não foi possível carregar a agenda.' }); }
});
router.post('/agenda', async (req, res) => {
  try { res.status(201).json({ item: await createAgendaItem(req.user.tenantId, req.body || {}) }); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível criar o agendamento.' }); }
});
router.put('/agenda/:agendaId', async (req, res) => {
  try { res.json({ item: await updateAgendaItem(req.user.tenantId, req.params.agendaId, req.body || {}) }); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível atualizar o agendamento.' }); }
});
router.patch('/agenda/:agendaId/move', async (req, res) => {
  try { res.json(await moveAgendaItem(req.user.tenantId, req.params.agendaId, req.body || {})); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível mover o agendamento.' }); }
});
router.patch('/agenda/:agendaId/checkin', async (req, res) => {
  try { res.json(await checkinAgendaItem(req.user.tenantId, req.params.agendaId)); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível fazer check-in.' }); }
});
router.delete('/agenda/:agendaId', async (req, res) => {
  try { res.json(await deleteAgendaItem(req.user.tenantId, req.params.agendaId)); } catch (error) { res.status(400).json({ error: error.message || 'Não foi possível excluir o agendamento.' }); }
});

export default router;
