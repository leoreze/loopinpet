import bcrypt from 'bcrypt';
import { query } from '../config/db.js';
import { ensureBaseSchema } from '../scripts/bootstrapDb.js';

function sanitizeText(value, max = 255) {
  return String(value || '').trim().slice(0, max);
}

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeRoleLabel(role, label) {
  const explicit = sanitizeText(label, 120);
  if (explicit) return explicit;
  const map = {
    owner: 'Administrador principal',
    admin: 'Administrador',
    manager: 'Gestor',
    attendant: 'Atendente'
  };
  return map[String(role || '').toLowerCase()] || 'Administrador principal';
}

function toProfile(row) {
  if (!row) throw new Error('Perfil não encontrado.');
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    full_name: row.full_name || '',
    email: row.email || '',
    role: row.role || 'owner',
    role_label: normalizeRoleLabel(row.role, row.role_label),
    phone: row.phone || '',
    signature: row.signature || '',
    notification_email: Boolean(row.notification_email),
    notification_whatsapp: Boolean(row.notification_whatsapp),
    mfa_enabled: Boolean(row.mfa_enabled)
  };
}

export async function getMyProfile(userId) {
  await ensureBaseSchema();
  const { rows } = await query(
    `select id, tenant_id, full_name, email, role, role_label, phone, signature,
            notification_email, notification_whatsapp, mfa_enabled
       from tenant_users
      where id = $1
      limit 1`,
    [userId]
  );
  return toProfile(rows[0]);
}

export async function updateMyProfile(userId, payload) {
  await ensureBaseSchema();

  const fullName = sanitizeText(payload.full_name, 160);
  const email = sanitizeText(payload.email, 160).toLowerCase();
  const phone = sanitizeText(payload.phone, 40);
  const signature = sanitizeText(payload.signature, 300);
  const roleLabel = normalizeRoleLabel(null, payload.role_label);
  const notificationEmail = normalizeBoolean(payload.notification_email);
  const notificationWhatsapp = normalizeBoolean(payload.notification_whatsapp);
  const mfaEnabled = normalizeBoolean(payload.mfa_enabled);

  if (!fullName || !email) {
    throw new Error('Nome completo e e-mail são obrigatórios.');
  }

  const emailCheck = await query(
    'select id from tenant_users where email = $1 and id <> $2 limit 1',
    [email, userId]
  );
  if (emailCheck.rows.length) {
    throw new Error('Já existe outro usuário com este e-mail.');
  }

  const { rows } = await query(
    `update tenant_users
        set full_name = $2,
            email = $3,
            role_label = $4,
            phone = $5,
            signature = $6,
            notification_email = $7,
            notification_whatsapp = $8,
            mfa_enabled = $9,
            updated_at = now()
      where id = $1
      returning id, tenant_id, full_name, email, role, role_label, phone, signature,
                notification_email, notification_whatsapp, mfa_enabled`,
    [userId, fullName, email, roleLabel, phone, signature, notificationEmail, notificationWhatsapp, mfaEnabled]
  );

  return toProfile(rows[0]);
}

export async function updateMyPassword(userId, payload) {
  await ensureBaseSchema();

  const currentPassword = String(payload.currentPassword || '').trim();
  const newPassword = String(payload.newPassword || '').trim();
  const confirmPassword = String(payload.confirmPassword || '').trim();

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new Error('Preencha senha atual, nova senha e confirmação.');
  }
  if (newPassword.length < 6) {
    throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  }
  if (!/[A-Za-zÀ-ÿ]/.test(newPassword) || !/\d/.test(newPassword)) {
    throw new Error('A senha precisa conter letras e números.');
  }
  if (newPassword !== confirmPassword) {
    throw new Error('As senhas precisam ser iguais.');
  }

  const { rows } = await query(
    'select id, password_hash from tenant_users where id = $1 limit 1',
    [userId]
  );
  const user = rows[0];
  if (!user) {
    throw new Error('Usuário não encontrado.');
  }

  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) {
    throw new Error('A senha atual informada está incorreta.');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await query(
    'update tenant_users set password_hash = $2, updated_at = now() where id = $1',
    [userId, passwordHash]
  );

  return { success: true };
}
