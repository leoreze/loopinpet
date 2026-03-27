import { registerTenantAdmin, loginTenantAdmin, getCurrentTenantUser, normalizePublicError } from '../services/authService.js';

function statusFromMessage(message) {
  if (/já existe/i.test(message)) return 409;
  if (/não configurado|backend\/\.env/i.test(message)) return 500;
  if (/estrutura do banco/i.test(message)) return 500;
  if (/inválidos|informe|preencha|senha precisa/i.test(message)) return 400;
  return 500;
}

export async function signup(req, res) {
  try {
    const data = await registerTenantAdmin(req.body);
    return res.status(201).json(data);
  } catch (error) {
    const message = normalizePublicError(error.message);
    console.error('SIGNUP_ERROR:', error);
    return res.status(statusFromMessage(message)).json({ error: message });
  }
}

export async function login(req, res) {
  try {
    const data = await loginTenantAdmin(req.body);
    return res.json(data);
  } catch (error) {
    const message = normalizePublicError(error.message);
    console.error('LOGIN_ERROR:', error);
    return res.status(statusFromMessage(message)).json({ error: message });
  }
}

export async function me(req, res) {
  try {
    const data = await getCurrentTenantUser(req.user.sub);
    return res.json(data);
  } catch (error) {
    const message = normalizePublicError(error.message);
    console.error('ME_ERROR:', error);
    return res.status(404).json({ error: message });
  }
}
