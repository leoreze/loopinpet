import { api } from './api.js';

function formatWhatsAppLink(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : '#';
}

function formatMailto(value) {
  const email = String(value || '').trim();
  return email ? `mailto:${email}` : '#';
}

function setLoading(button, loading) {
  if (!button) return;
  button.disabled = Boolean(loading);
  button.textContent = loading ? 'ENVIANDO...' : 'ENVIAR';
}

function showMessage(message, type = 'success') {
  const node = document.querySelector('[data-support-feedback-message]');
  if (!node) return;
  node.textContent = message || '';
  node.dataset.state = type;
  node.hidden = !message;
}

function hydrateChannels(data) {
  const email = data?.channels?.email || document.querySelector('[data-tenant-support-email]')?.textContent || '';
  const whatsapp = data?.channels?.whatsapp || document.querySelector('[data-tenant-whatsapp]')?.textContent || '';
  const youtube = data?.channels?.youtube || 'https://www.youtube.com/';

  const emailLink = document.querySelector('[data-support-email-link]');
  const whatsappLink = document.querySelector('[data-support-whatsapp-link]');
  const youtubeLink = document.querySelector('[data-support-youtube-link]');
  const versionNode = document.querySelector('[data-support-version]');

  if (emailLink) emailLink.href = formatMailto(email);
  if (whatsappLink) whatsappLink.href = formatWhatsAppLink(whatsapp);
  if (youtubeLink) youtubeLink.href = youtube;
  if (versionNode && data?.version) versionNode.textContent = data.version;
}

function hydrateFeedback(data) {
  const favorite = document.querySelector('[name="favoritePart"]');
  const suggestions = document.querySelector('[name="improvementSuggestions"]');
  if (favorite && data?.feedback?.favorite_part) favorite.value = data.feedback.favorite_part;
  if (suggestions && data?.feedback?.improvement_suggestions) suggestions.value = data.feedback.improvement_suggestions;
}

async function bootstrapSupport() {
  hydrateChannels(null);
  const form = document.querySelector('[data-support-form]');
  const submitButton = form?.querySelector('button[type="submit"]');

  try {
    const data = await api.get('/api/tenant/support');
    hydrateChannels(data);
    hydrateFeedback(data);
  } catch (error) {
    showMessage(error.message || 'Não foi possível carregar o suporte.', 'error');
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage('');
    const payload = {
      favoritePart: form.favoritePart.value,
      improvementSuggestions: form.improvementSuggestions.value
    };

    try {
      setLoading(submitButton, true);
      const response = await api.post('/api/tenant/support/feedback', payload);
      showMessage(response.message || 'Sugestões enviadas com sucesso.', 'success');
    } catch (error) {
      showMessage(error.message || 'Não foi possível enviar as sugestões.', 'error');
    } finally {
      setLoading(submitButton, false);
    }
  });
}

bootstrapSupport();
