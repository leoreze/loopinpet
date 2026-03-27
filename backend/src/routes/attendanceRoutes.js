import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createAttendance, deleteAttendance, getAttendanceSummary, listAttendances, updateAttendance } from '../services/attendanceService.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const [items, summary] = await Promise.all([
      listAttendances(req.user.tenantId, req.query || {}),
      getAttendanceSummary(req.user.tenantId)
    ]);
    res.json({ items, summary });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Não foi possível carregar o atendimento.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const item = await createAttendance(req.user.tenantId, req.body || {});
    res.status(201).json({ message: 'Atendimento criado com sucesso.', item });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível criar o atendimento.' });
  }
});

router.put('/:attendanceId', async (req, res) => {
  try {
    const item = await updateAttendance(req.user.tenantId, req.params.attendanceId, req.body || {});
    res.json({ message: 'Atendimento atualizado com sucesso.', item });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível atualizar o atendimento.' });
  }
});

router.delete('/:attendanceId', async (req, res) => {
  try {
    await deleteAttendance(req.user.tenantId, req.params.attendanceId);
    res.json({ message: 'Atendimento removido com sucesso.' });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível remover o atendimento.' });
  }
});

export default router;
