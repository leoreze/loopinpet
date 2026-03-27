import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { addPetToTutor, createTutor, getTutorById, listTutors, toggleTutorStatus, updateTutor } from '../services/tutorService.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const data = await listTutors(req.user.tenantId, req.query || {});
    res.json({ items: data });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Não foi possível carregar os clientes.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = await createTutor(req.user.tenantId, req.body || {});
    res.status(201).json({ message: 'Cliente criado com sucesso.', ...data });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível criar o cliente.' });
  }
});

router.get('/:tutorId', async (req, res) => {
  try {
    const data = await getTutorById(req.user.tenantId, req.params.tutorId);
    res.json(data);
  } catch (error) {
    res.status(404).json({ error: error.message || 'Cliente não encontrado.' });
  }
});

router.put('/:tutorId', async (req, res) => {
  try {
    const data = await updateTutor(req.user.tenantId, req.params.tutorId, req.body || {});
    res.json({ message: 'Cliente atualizado com sucesso.', ...data });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível atualizar o cliente.' });
  }
});

router.patch('/:tutorId/toggle-status', async (req, res) => {
  try {
    const data = await toggleTutorStatus(req.user.tenantId, req.params.tutorId);
    res.json({ message: 'Status do cliente atualizado.', ...data });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível alterar o status.' });
  }
});

router.post('/:tutorId/pets', async (req, res) => {
  try {
    const data = await addPetToTutor(req.user.tenantId, req.params.tutorId, req.body || {});
    res.status(201).json({ message: 'Pet adicionado com sucesso.', ...data });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível adicionar o pet.' });
  }
});

export default router;
