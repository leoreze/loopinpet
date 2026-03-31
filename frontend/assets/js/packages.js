import { api } from './api.js';

export function initPackagesPage() {
  const state = { tab: 'catalogo', data: { templates: [], customer_packages: [], services: [], tutors: [], pets: [], pet_sizes: [], staff_users: [], metrics: {} }, detail: null, editingTemplate: null, contractTemplateHtml: '', saleStep: 1, lastCreatedSale: null };
  const $ = (sel) => document.querySelector(sel);
  const summary = $('[data-summary]');
  const templateList = $('[data-template-list]');
  const saleList = $('[data-sale-list]');
  const templateModal = $('[data-template-modal]');
  const templateForm = $('[data-template-form]');
  const templateItems = $('[data-template-items]');
  const templateModalTitle = $('[data-template-modal-title]');
  const templateItemRow = document.getElementById('template-item-row');
  const saleModal = $('[data-sale-modal]');
  const saleForm = $('[data-sale-form]');
  const detailModal = $('[data-detail-modal]');

  function money(cents){ return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100); }
  function esc(v=''){ return String(v||'').replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
  function dateBr(v=''){ if(!v) return '—'; if(/^\d{4}-\d{2}-\d{2}$/.test(String(v))){ const [y,m,d]=String(v).split('-'); return `${d}/${m}/${y}`; } const x=new Date(v); return Number.isNaN(x.getTime())?String(v):new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo'}).format(x); }
  function recurrenceLabel(v){ return String(v) === 'monthly' ? 'Mensal recorrente' : 'Pré-pago'; }
  function statusPill(v){ const cls = String(v||'').toLowerCase() === 'ativo' ? 'ativo' : 'inativo'; return `<span class="status-pill ${cls}">${esc(v || '—')}</span>`; }

  function normalize(v=''){ return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase(); }
  function getTemplateById(id){ return (state.data.templates || []).find((item) => String(item.id) === String(id)) || null; }
  function getPetSizeMeta(id, label=''){ return (state.data.pet_sizes || []).find((item) => String(item.id) === String(id)) || (label ? { id:'', name: label } : null); }

  function buildContractSnapshotHtml() {
    const tutorLabel = saleForm?.elements?.tutor_id?.selectedOptions?.[0]?.textContent || '';
    const templateLabel = saleForm?.elements?.template_id?.selectedOptions?.[0]?.textContent || '';
    const acceptance = saleForm?.elements?.contract_acceptance_name?.value || tutorLabel;
    const paymentMethod = saleForm?.elements?.payment_method?.selectedOptions?.[0]?.textContent || '—';
    const paymentStatus = saleForm?.elements?.payment_status?.selectedOptions?.[0]?.textContent || '—';
    let html = state.contractTemplateHtml || '<!doctype html><html><head><meta charset="utf-8"><title>Contrato do pacote {{PACOTE}} • {{CLIENTE}}</title></head><body><div class="contract-wrap"><div class="contract-card"><div class="contract-header"><span class="contract-badge">LoopinPet</span><h1>Contrato do pacote {{PACOTE}}</h1><p>Cliente: {{CLIENTE}}</p></div><div class="contract-body"><div class="contract-intro">Ao prosseguir, o cliente confirma ciência das regras do pacote, reagendamentos, validade, sessões semanais no mesmo horário e condições comerciais.</div></div></div></div></body></html>';
    html = html
      .replace(/\{\{CLIENTE\}\}/g, esc(tutorLabel))
      .replace(/\{\{PACOTE\}\}/g, esc(templateLabel))
      .replace(/\{\{ACEITE\}\}/g, esc(acceptance))
      .replace(/\{\{FORMA_PAGAMENTO\}\}/g, esc(paymentMethod))
      .replace(/\{\{STATUS_PAGAMENTO\}\}/g, esc(paymentStatus));
    if (!/Contrato do pacote/i.test(html)) {
      html = html.replace(/<body[^>]*>/i, `$&<div style="max-width:960px;margin:0 auto;padding:24px 24px 0;font-family:Inter,Arial,sans-serif;color:#0f172a"><h1 style="margin:0 0 8px;font-size:28px">Contrato do pacote ${esc(templateLabel)}</h1><p style="margin:0 0 18px;color:#475569">Cliente: ${esc(tutorLabel)} • Aceite: ${esc(acceptance)}</p></div>`);
    }
    if (!/<title>/i.test(html)) {
      html = `<!doctype html><html><head><meta charset="utf-8"><title>Contrato do pacote ${esc(templateLabel)} • ${esc(tutorLabel)}</title></head>${html.replace(/^<!doctype html>/i,'').replace(/^<html>/i,'').replace(/<\/html>$/i,'')}`;
    }
    return html;
  }

  function openContractWindow({ print = false } = {}) {
    const tutorLabel = saleForm?.elements?.tutor_id?.selectedOptions?.[0]?.textContent || 'Cliente';
    const templateLabel = saleForm?.elements?.template_id?.selectedOptions?.[0]?.textContent || 'Pacote';
    const html = buildContractSnapshotHtml();
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.document.title = `Contrato do pacote ${templateLabel} • ${tutorLabel}`;
    win.focus();
    if (print) win.print();
  }

  function getPaymentMethodLabel(){ return saleForm?.elements?.payment_method?.selectedOptions?.[0]?.textContent || '—'; }
  function getPaymentStatusLabel(){ return saleForm?.elements?.payment_status?.selectedOptions?.[0]?.textContent || '—'; }
  function getTutorLabel(){ return saleForm?.elements?.tutor_id?.selectedOptions?.[0]?.textContent || '—'; }
  function getPetLabel(){ return saleForm?.elements?.pet_id?.selectedOptions?.[0]?.textContent || '—'; }
  function getTemplateLabel(){ return saleForm?.elements?.template_id?.selectedOptions?.[0]?.textContent || '—'; }

  function computePlannedSchedule(){
    const template = getTemplateById(saleForm?.elements?.template_id?.value);
    const count = Math.max(0, Number(template?.appointments_per_period || 0));
    const startDate = saleForm?.elements?.start_date?.value;
    const scheduleTime = saleForm?.elements?.schedule_time?.value || '09:00';
    if (!template || !startDate || !count) return [];
    const [year, month, day] = String(startDate).split('-').map(Number);
    const [hours, minutes] = String(scheduleTime).split(':').map(Number);
    const base = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0);
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(base);
      date.setDate(base.getDate() + (index * 7));
      return {
        session: index + 1,
        total: count,
        iso: date.toISOString(),
        label: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date)
      };
    });
  }

  function renderSaleSummary(){
    const container = document.querySelector('[data-sale-summary]');
    if (!container) return;
    const template = getTemplateById(saleForm?.elements?.template_id?.value);
    const tutor = getTutorLabel();
    const pet = getPetLabel();
    const dates = computePlannedSchedule();
    const items = template?.items || [];
    const totalWithout = Number(template?.price_without_discount_cents || template?.price_cents || 0);
    const totalWith = Number(template?.price_cents || 0);
    const discount = Number(template?.discount_percent || 0);
    const notes = saleForm?.elements?.notes?.value || 'Sem observações';
    const datesHtml = dates.length ? dates.map(item => `<div class="mini-list-item"><strong>${item.session} de ${item.total}</strong><div>${item.label}</div></div>`).join('') : '<div class="mini-list-item">Este pacote não gera agendamentos automáticos.</div>';
    const itemsHtml = items.length ? items.map(item => `<div class="wizard-receipt-row"><span>${esc(item.service_name || 'Serviço')} × ${Number(item.quantity || 0)}</span><strong>${money((Number(item.price_cents || 0) * Number(item.quantity || 1)))}</strong></div>`).join('') : '<div class="wizard-receipt-row"><span>Sem serviços</span><strong>—</strong></div>';
    container.innerHTML = `
      <div class="wizard-receipt-card">
        <h4>Recibo do pacote</h4>
        <p>${esc(getTemplateLabel())}</p>
        <div class="wizard-receipt-grid">
          <div class="mini-list-item"><strong>Tutor</strong><div>${esc(tutor)}</div></div>
          <div class="mini-list-item"><strong>Pet</strong><div>${esc(pet)}</div></div>
          <div class="mini-list-item"><strong>Colaborador</strong><div>${esc(saleForm?.elements?.staff_user_id?.selectedOptions?.[0]?.textContent || 'Não definido')}</div></div>
          <div class="mini-list-item"><strong>Início</strong><div>${dateBr(saleForm?.elements?.start_date?.value)} às ${esc(saleForm?.elements?.schedule_time?.value || '09:00')}</div></div>
          <div class="mini-list-item"><strong>Pagamento</strong><div>${esc(getPaymentStatusLabel())} • ${esc(getPaymentMethodLabel())}</div></div>
        </div>
      </div>
      <div class="wizard-receipt-card">
        <h4>Serviços do pacote</h4>
        <div class="wizard-receipt-list">${itemsHtml}</div>
        <div class="wizard-receipt-row"><span>Total sem desconto</span><strong>${money(totalWithout)}</strong></div>
        <div class="wizard-receipt-row"><span>Desconto do pacote</span><strong>${discount.toFixed(2).replace('.', ',')}%</strong></div>
        <div class="wizard-receipt-row"><span>Valor real do pagamento</span><strong>${money(totalWith)}</strong></div>
      </div>
      <div class="wizard-receipt-card">
        <h4>Contrato do pacote</h4>
        <div class="page-toolbar-right" style="justify-content:flex-start">
          <button class="btn-secondary" type="button" data-sale-view-contract>Visualizar contrato</button>
          <button class="btn-secondary" type="button" data-sale-print-contract>Imprimir contrato / PDF</button>
        </div>
      </div>
      <div class="wizard-receipt-card">
        <h4>Agendamentos previstos</h4>
        <div class="wizard-dates">${datesHtml}</div>
      </div>
      <div class="wizard-receipt-card">
        <h4>Observações e renovação</h4>
        <div class="wizard-receipt-grid">
          <div class="mini-list-item"><strong>Observações</strong><div>${esc(notes)}</div></div>
          <div class="mini-list-item"><strong>Renovação automática</strong><div>${saleForm?.elements?.auto_renew?.checked ? 'Sim' : 'Não'}</div></div>
        </div>
      </div>`;
  }

  function setSaleStep(step){
    state.saleStep = Math.min(4, Math.max(1, Number(step || 1)));
    document.querySelectorAll('[data-wizard-step]').forEach((el) => el.classList.toggle('is-active', Number(el.dataset.wizardStep) === state.saleStep));
    document.querySelectorAll('[data-sale-panel]').forEach((panel) => { panel.hidden = Number(panel.dataset.salePanel) !== state.saleStep; });
    const prevBtn = document.querySelector('[data-sale-prev]');
    const nextBtn = document.querySelector('[data-sale-next]');
    const submitBtn = document.querySelector('[data-sale-submit]');
    if (prevBtn) prevBtn.hidden = state.saleStep === 1;
    if (nextBtn) nextBtn.hidden = state.saleStep === 4;
    if (submitBtn) submitBtn.hidden = state.saleStep !== 4;
    if (state.saleStep === 4) renderSaleSummary();
  }

  function validateSaleStep(step){
    if (step === 1) {
      if (!saleForm.elements.template_id.value || !saleForm.elements.start_date.value || !saleForm.elements.tutor_id.value || !saleForm.elements.pet_id.value) {
        window.alert('Preencha pacote, início, tutor e pet para continuar.');
        return false;
      }
    }
    if (step === 2) {
      if (!saleForm.elements.contract_accepted?.checked) {
        window.alert('É preciso aceitar o termo do contrato antes de continuar.');
        return false;
      }
    }
    if (step === 3) {
      if (!saleForm.elements.payment_method.value || !saleForm.elements.payment_status.value) {
        window.alert('Confirme forma e status do pagamento para seguir ao resumo.');
        return false;
      }
    }
    return true;
  }

  function getSelectedPetSize(){
    const petSizeId = templateForm?.elements?.pet_size_id?.value || '';
    return (state.data.pet_sizes || []).find((item) => String(item.id) === String(petSizeId)) || null;
  }

  function getFilteredServices(){
    const selected = getSelectedPetSize();
    if (!selected) return []; 
    const selectedId = String(selected.id || '');
    const selectedLabel = normalize(selected.name || '');
    return (state.data.services || []).filter((service) => {
      const serviceSizeId = service.pet_size_id ? String(service.pet_size_id) : '';
      const serviceSizeLabel = normalize(service.pet_size_name || service.pet_size_label || '');
      if (!serviceSizeId && !serviceSizeLabel) return true;
      if (serviceSizeId && selectedId && serviceSizeId === selectedId) return true;
      if (serviceSizeLabel && selectedLabel && serviceSizeLabel === selectedLabel) return true;
      return false;
    });
  }

  function renderPetSizeOptions(selected = ''){
    const select = templateForm?.elements?.pet_size_id;
    if (!select) return;
    select.innerHTML = ['<option value="">Selecione</option>']
      .concat((state.data.pet_sizes || []).map((item) => `<option value="${item.id}" ${String(selected)===String(item.id)?'selected':''}>${esc(item.name)}</option>`))
      .join('');
  }

  function renderSummary(){
    const m = state.data.metrics || {};
    summary.innerHTML = `
      <article class="summary-card"><span class="label">Modelos</span><strong>${m.templates_total || 0}</strong><small>Catálogo de pacotes do pet shop.</small></article>
      <article class="summary-card"><span class="label">Pacotes ativos</span><strong>${m.active_packages || 0}</strong><small>Vinculados a pets e prontos para a agenda.</small></article>
      <article class="summary-card"><span class="label">Recorrentes</span><strong>${m.recurring_packages || 0}</strong><small>Com cobrança mensal prevista.</small></article>
      <article class="summary-card"><span class="label">A receber</span><strong>${money(m.receivable_cents || 0)}</strong><small>Pagamentos pendentes dos pacotes vendidos.</small></article>`;
  }

  function renderTemplates(){
    if(!state.data.templates.length){ templateList.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum pacote cadastrado.</td></tr>'; return; }
    templateList.innerHTML = state.data.templates.map(item => `
      <tr>
        <td><strong>${esc(item.name)}</strong><br><small class="mini-muted">${esc(item.pet_size_label || item.description || 'Sem descrição')}</small></td>
        <td>${(item.items || []).map(entry => `${esc(entry.service_name)} × ${Number(entry.quantity||0)}`).join('<br>') || '—'}</td>
        <td>${Number(item.validity_days || 0)} dias<br><small class="mini-muted">${Number(item.appointments_per_period || 0)} ag./período</small></td>
        <td>${recurrenceLabel(item.recurrence_type)}</td>
        <td><strong>${money(item.price_cents)}</strong><br><small class="mini-muted">Sem desc.: ${money(item.price_without_discount_cents || item.price_cents)}</small></td>
        <td>${statusPill(item.status)}</td>
        <td>${Number(item.active_customers || 0)}</td>
        <td><div class="row-actions"><button class="icon-action" type="button" data-edit-template="${item.id}" title="Editar">✎</button><button class="icon-action danger" type="button" data-delete-template="${item.id}" title="Excluir">🗑</button></div></td>
      </tr>`).join('');
  }

  function renderSales(){
    if(!state.data.customer_packages.length){ saleList.innerHTML = '<tr><td colspan="9" class="empty-state">Nenhum pacote vendido ainda.</td></tr>'; return; }
    saleList.innerHTML = state.data.customer_packages.map(item => { const firstPayment = (item.payments || [])[0] || {}; const paymentStatus = String(firstPayment.status || '').toLowerCase() === 'paid' ? 'Pago' : (String(firstPayment.status || '').toLowerCase() === 'failed' ? 'Falhou' : 'Pendente'); const paymentMethod = firstPayment.payment_method || '—'; return `
      <tr>
        <td><strong>${esc(item.tutor_name)}</strong><br><small class="mini-muted">${esc(item.pet_name)}</small></td>
        <td><strong>${esc(item.package_name)}</strong><br><small class="mini-muted">${recurrenceLabel(item.recurrence_type)}</small></td>
        <td>${(item.items || []).map(entry => `${esc(entry.service_name)}: ${Math.max(0, Number(entry.total_quantity||0)-Number(entry.used_quantity||0))}/${Number(entry.total_quantity||0)}`).join('<br>')}</td>
        <td>${dateBr(item.start_date)} → ${dateBr(item.end_date)}</td>
        <td>${item.next_charge_date ? `Próxima: ${dateBr(item.next_charge_date)}` : 'Sem recorrência'}</td>
        <td>${paymentStatus}</td>
        <td>${esc(paymentMethod)}</td>
        <td>${statusPill(item.status)}</td>
        <td><div class="row-actions"><button class="icon-action" type="button" data-open-detail="${item.id}" title="Detalhes">👁</button><button class="icon-action danger" type="button" data-delete-sale="${item.id}" title="Excluir">🗑</button></div></td>
      </tr>`; }).join('');
  }

  function fillTemplateServiceOptions(select, selected = ''){
    let services = getFilteredServices();
    if (!services.length && selected) {
      const current = (state.data.services || []).find((service) => String(service.id) === String(selected));
      if (current) services = [current];
    }
    const selectedStillExists = services.some((service) => String(service.id) === String(selected));
    select.innerHTML = ['<option value="">Selecione</option>'].concat(services.map(service => `<option value="${service.id}" ${String(selected)===String(service.id)?'selected':''}>${esc(service.name)} • ${money(service.price_cents)}</option>`)).join('');
    if (selected && !selectedStillExists) select.value = '';
  }

  function parseMoneyInput(value){
    const raw = String(value || '').replace(/\./g, '').replace(',', '.').trim();
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function formatMoneyInput(value){
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  }

  function getServiceById(id){
    return (state.data.services || []).find(service => String(service.id) === String(id));
  }

  function recalcTemplateTotals(){
    const rows = [...templateItems.querySelectorAll('.mini-list-item')];
    const subtotal = rows.reduce((acc, node) => {
      const serviceId = node.querySelector('select[name="service_id"]').value;
      const qty = Math.max(1, Number(node.querySelector('input[name="quantity"]').value || 1) || 1);
      const service = getServiceById(serviceId);
      return acc + ((Number(service?.price_cents || 0) / 100) * qty);
    }, 0);
    const discountPercent = Math.min(100, Math.max(0, Number(templateForm.elements.discount_percent.value || 0) || 0));
    const totalWithDiscount = subtotal * (1 - (discountPercent / 100));
    templateForm.elements.price_without_discount.value = formatMoneyInput(subtotal);
    templateForm.elements.price.value = formatMoneyInput(totalWithDiscount);
  }

  function addTemplateItem(item = null){
    const node = templateItemRow.content.firstElementChild.cloneNode(true);
    const select = node.querySelector('select[name="service_id"]');
    const qtyInput = node.querySelector('input[name="quantity"]');
    fillTemplateServiceOptions(select, item?.service_id || '');
    qtyInput.value = item?.quantity || 1;
    select.addEventListener('change', recalcTemplateTotals);
    qtyInput.addEventListener('input', recalcTemplateTotals);
    node.querySelector('[data-remove-item]').addEventListener('click', () => { node.remove(); recalcTemplateTotals(); });
    templateItems.appendChild(node);
    recalcTemplateTotals();
  }

  function refreshTemplateItemOptions(){
    [...templateItems.querySelectorAll('.mini-list-item select[name="service_id"]')].forEach((select) => {
      const current = select.value;
      fillTemplateServiceOptions(select, current);
    });
    recalcTemplateTotals();
  }

  function openTemplateModal(item = null){
    state.editingTemplate = item;
    templateForm.reset();
    templateItems.innerHTML = '';
    templateModalTitle.textContent = item ? 'Editar pacote' : 'Novo pacote';
    templateForm.elements.id.value = item?.id || '';
    templateForm.elements.name.value = item?.name || '';
    renderPetSizeOptions(item?.pet_size_id || '');
    templateForm.elements.pet_size_id.value = item?.pet_size_id || '';
    templateForm.elements.discount_percent.value = Number(item?.discount_percent || 0);
    templateForm.elements.price_without_discount.value = item?.price_without_discount_cents ? formatMoneyInput(Number(item.price_without_discount_cents)/100) : '';
    templateForm.elements.price.value = item?.price_cents ? formatMoneyInput(Number(item.price_cents)/100) : '';
    templateForm.elements.appointments_per_period.value = Number(item?.appointments_per_period || 0) || 0;
    templateForm.elements.validity_days.value = item?.validity_days || 30;
    templateForm.elements.recurrence_type.value = item?.recurrence_type || 'none';
    templateForm.elements.status.value = item?.status || 'ativo';
    templateForm.elements.description.value = item?.description || '';
    (item?.items?.length ? item.items : [null]).forEach(entry => addTemplateItem(entry));
    recalcTemplateTotals();
    templateModal.classList.add('is-open');
  }

  function closeTemplateModal(){ templateModal.classList.remove('is-open'); }

  function openSaleModal(){
    saleForm.reset();
    saleForm.elements.start_date.value = new Date().toISOString().slice(0,10);
    if (saleForm.elements.schedule_time) saleForm.elements.schedule_time.value = '09:00';
    saleForm.elements.template_id.innerHTML = ['<option value="">Selecione</option>'].concat((state.data.templates || []).filter(item => item.status === 'ativo').map(item => `<option value="${item.id}">${esc(item.name)} • ${money(item.price_cents)}</option>`)).join('');
    saleForm.elements.tutor_id.innerHTML = ['<option value="">Selecione</option>'].concat((state.data.tutors || []).map(item => `<option value="${item.id}">${esc(item.full_name)}</option>`)).join('');
    if (saleForm.elements.staff_user_id) {
      saleForm.elements.staff_user_id.innerHTML = ['<option value="">Selecionar</option>']
        .concat((state.data.staff_users || []).map((item) => `<option value="${item.id}">${esc(item.full_name || item.email || 'Colaborador')}</option>`))
        .join('');
    }
    saleForm.elements.pet_id.innerHTML = '<option value="">Selecione um tutor e um pacote</option>';
    if (saleForm.elements.contract_accepted) saleForm.elements.contract_accepted.checked = false;
    if (saleForm.elements.auto_renew) saleForm.elements.auto_renew.checked = false;
    if (saleForm.elements.contract_acceptance_name) saleForm.elements.contract_acceptance_name.value = '';
    if (saleForm.elements.staff_user_id) saleForm.elements.staff_user_id.value = '';
    const preview = document.querySelector('[data-sale-contract-preview]');
    if (preview) preview.innerHTML = '<strong>Contrato de regras do pacote</strong><p>Use o botão de impressão para revisar o termo e seguir para pagamento. O pacote será agendado automaticamente, mantendo o mesmo horário base em sessões semanais.</p>';
    syncPetsForTutor('');
    setSaleStep(1);
    renderSaleSummary();
    saleModal.classList.add('is-open');
  }
  function closeSaleModal(){ saleModal.classList.remove('is-open'); }

  function syncPetsForTutor(tutorId){
    const selectedTemplate = getTemplateById(saleForm.elements.template_id.value);
    const sizeId = String(selectedTemplate?.pet_size_id || '');
    const sizeLabel = normalize(selectedTemplate?.pet_size_label || '');
    const pets = (state.data.pets || []).filter((item) => {
      if (String(item.tutor_id) !== String(tutorId)) return false;
      if (!selectedTemplate) return true;
      const sameId = sizeId && String(item.size_id || '') === sizeId;
      const sameLabel = sizeLabel && normalize(item.size || '') === sizeLabel;
      return (sizeId || sizeLabel) ? (sameId || sameLabel) : true;
    });
    saleForm.elements.pet_id.innerHTML = ['<option value="">Selecione</option>']
      .concat(pets.map(item => `<option value="${item.id}">${esc(item.name)}${item.size ? ` • ${esc(item.size)}`:''}</option>`)).join('');
  }

  async function openDetail(id){
    const response = await api.get(`/api/tenant/packages/customer-packages/${id}`);
    state.detail = response.item;
    $('[data-detail-title]').textContent = state.detail.package_name;
    $('[data-detail-subtitle]').textContent = `${state.detail.tutor_name} • ${state.detail.pet_name}`;
    $('[data-detail-summary]').innerHTML = `
      <div class="mini-list-item"><strong>Status</strong><div>${statusPill(state.detail.status)}</div></div>
      <div class="mini-list-item"><strong>Validade</strong><div>${dateBr(state.detail.start_date)} → ${dateBr(state.detail.end_date)}</div></div>
      <div class="mini-list-item"><strong>Recorrência</strong><div>${recurrenceLabel(state.detail.recurrence_type)}</div></div>
      <div class="mini-list-item"><strong>Agendamentos automáticos</strong><div>${Number(state.detail.auto_appointments_generated || 0)} gerados • ${Number(state.detail.appointments_per_period || 0)} planejados</div></div>
      <div class="mini-list-item"><strong>Próxima cobrança</strong><div>${state.detail.next_charge_date ? dateBr(state.detail.next_charge_date) : 'Sem recorrência'}</div></div>
      <div class="mini-list-item"><strong>Renovação automática</strong><div>${state.detail.auto_renew ? 'Ativada' : 'Desligada'}</div></div>
      <div class="mini-list-item"><strong>Termo aceito</strong><div>${state.detail.contract_accepted ? 'Aceito em ' + dateBr(state.detail.contract_accepted_at) : 'Pendente'}</div></div>
      <div class="mini-list-item"><strong>Pagamento real</strong><div>${money(state.detail.total_with_discount_cents || 0)} <small class="mini-muted">sem desconto ${money(state.detail.total_without_discount_cents || state.detail.total_with_discount_cents || 0)}</small></div></div>`;
    $('[data-detail-balance]').innerHTML = (state.detail.items || []).map(item => `<div class="mini-list-item"><strong>${esc(item.service_name)}</strong><div class="package-balance"><span class="badge">Saldo ${Math.max(0, Number(item.total_quantity||0)-Number(item.used_quantity||0))}/${Number(item.total_quantity||0)}</span><span class="badge">Usado ${Number(item.used_quantity||0)}</span></div></div>`).join('') || '<div class="mini-list-item">Sem itens.</div>';
    $('[data-detail-payments]').innerHTML = (state.detail.payments || []).map(item => `<tr><td><strong>${money(item.amount_cents)}</strong><br><small class="mini-muted">${item.payment_method || 'Sem método'} • ${item.due_date ? dateBr(item.due_date) : 'sem vencimento'}</small></td><td>${statusPill(item.status === 'paid' ? 'ativo' : 'inativo')}</td></tr>`).join('') || '<tr><td colspan="2" class="empty-state">Sem pagamentos.</td></tr>';
    $('[data-detail-usages]').innerHTML = (state.detail.appointments || []).map(item => { const services = Array.isArray(item.services_json) ? item.services_json : []; const label = services.length ? services.map((service) => service.name || service.service_name).join(' • ') : (item.service_name || 'Serviço'); return `<tr><td><strong>${dateBr(item.scheduled_at)}</strong><br><small class="mini-muted">${esc(item.package_session_number || 0)} de ${esc(item.package_session_total || 0)} • ${esc(label)}</small></td><td>${money(item.package_total_with_discount_cents || state.detail.total_with_discount_cents || 0)}<br><small class="mini-muted">sem desconto ${money(item.package_total_without_discount_cents || state.detail.total_without_discount_cents || 0)}</small></td></tr>`; }).join('') || '<tr><td colspan="2" class="empty-state">Nenhum agendamento automático gerado ainda.</td></tr>';
    $('[data-detail-usages]').innerHTML = (state.detail.usages || []).map(item => `<tr><td><strong>${esc(item.service_name)}</strong><br><small class="mini-muted">${dateBr(item.used_at)}</small></td><td>${item.appointment_id ? esc(item.appointment_id) : 'Sem vínculo'}</td></tr>`).join('') || '<tr><td colspan="2" class="empty-state">Nenhum uso registrado ainda.</td></tr>';
    detailModal.classList.add('is-open');
  }

  async function load(){
    if (!state.contractTemplateHtml) {
      try { const response = await fetch('../../assets/contracts/package-contract.html'); state.contractTemplateHtml = await response.text(); } catch (error) { state.contractTemplateHtml = ''; }
    }
    const data = await api.get('/api/tenant/packages/dashboard');
    state.data = data;
    renderPetSizeOptions(templateForm?.elements?.pet_size_id?.value || '');
    renderSummary();
    renderTemplates();
    renderSales();
  }

  document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => {
    state.tab = btn.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(entry => entry.classList.toggle('is-active', entry === btn));
    document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== state.tab; });
  }));

  $('[data-new-template]').addEventListener('click', () => openTemplateModal());
  $('[data-new-sale]').addEventListener('click', () => openSaleModal());
  $('[data-template-close]').addEventListener('click', closeTemplateModal);
  $('[data-template-cancel]').addEventListener('click', closeTemplateModal);
  $('[data-sale-close]').addEventListener('click', closeSaleModal);
  $('[data-sale-cancel]').addEventListener('click', closeSaleModal);
  $('[data-detail-close]').addEventListener('click', () => detailModal.classList.remove('is-open'));
  $('[data-add-item]').addEventListener('click', () => addTemplateItem());
  templateForm.elements.discount_percent.addEventListener('input', recalcTemplateTotals);
  templateForm.elements.pet_size_id?.addEventListener('change', refreshTemplateItemOptions);
  saleForm.elements.tutor_id.addEventListener('change', () => { syncPetsForTutor(saleForm.elements.tutor_id.value); if (saleForm.elements.contract_acceptance_name) saleForm.elements.contract_acceptance_name.value = saleForm.elements.tutor_id.selectedOptions?.[0]?.textContent || ''; });
  saleForm.elements.contract_accepted?.addEventListener('change', () => { if (state.saleStep === 4) renderSaleSummary(); });
  saleForm.elements.auto_renew?.addEventListener('change', () => { if (state.saleStep === 4) renderSaleSummary(); });
  saleForm.elements.notes?.addEventListener('input', () => { if (state.saleStep === 4) renderSaleSummary(); });
  saleForm.elements.payment_method?.addEventListener('change', () => { if (state.saleStep >= 3) renderSaleSummary(); });
  saleForm.elements.payment_status?.addEventListener('change', () => { if (state.saleStep >= 3) renderSaleSummary(); });
  saleForm.elements.staff_user_id?.addEventListener('change', () => { if (state.saleStep >= 1) renderSaleSummary(); });
  document.querySelector('[data-contract-print]')?.addEventListener('click', () => openContractWindow({ print: true }));

  document.addEventListener('click', (event) => {
    const contractLink = event.target.closest('[data-contract-view-link]');
    if (contractLink) {
      event.preventDefault();
      openContractWindow({ print: false });
      return;
    }
    const viewContract = event.target.closest('[data-sale-view-contract]');
    if (viewContract) {
      event.preventDefault();
      openContractWindow({ print: false });
      return;
    }
    const printContract = event.target.closest('[data-sale-print-contract]');
    if (printContract) {
      event.preventDefault();
      openContractWindow({ print: true });
    }
  });

  document.querySelector('[data-sale-prev]')?.addEventListener('click', () => setSaleStep(state.saleStep - 1));
  document.querySelector('[data-sale-next]')?.addEventListener('click', () => { if (validateSaleStep(state.saleStep)) setSaleStep(state.saleStep + 1); });

  saleForm.elements.start_date?.addEventListener('change', () => { if (state.saleStep === 4) renderSaleSummary(); });
  saleForm.elements.schedule_time?.addEventListener('change', () => { if (state.saleStep === 4) renderSaleSummary(); });
  saleForm.elements.pet_id?.addEventListener('change', () => { if (state.saleStep === 4) renderSaleSummary(); });
  saleForm.elements.template_id?.addEventListener('change', () => {
    const selected = (state.data.templates || []).find((item) => String(item.id) === String(saleForm.elements.template_id.value));
    const helper = document.querySelector('[data-sale-auto-helper]');
    if (helper) {
      if (selected && Number(selected.appointments_per_period || 0) > 0) {
        helper.textContent = `Este pacote vai distribuir automaticamente ${Number(selected.appointments_per_period || 0)} agendamento(s), mantendo o mesmo horário base e repetindo semanalmente a partir da data inicial.`;
      } else {
        helper.textContent = 'Selecione um pacote para ver se haverá distribuição automática de agendamentos.';
      }
    }
    syncPetsForTutor(saleForm.elements.tutor_id.value);
    const preview = document.querySelector('[data-sale-contract-preview]');
    if (preview && selected) preview.innerHTML = `<strong>Contrato do pacote ${esc(selected.name)}</strong><p>Cliente: ${esc(getTutorLabel()) || 'A definir'} • Porte do pacote: ${esc(selected.pet_size_label || 'Livre')} • valor real ${money(selected.price_cents)} • sem desconto ${money(selected.price_without_discount_cents || selected.price_cents)}</p><p><a href="#" data-contract-view-link>Visualizar contrato completo</a></p>`;
    if (state.saleStep === 4) renderSaleSummary();
  });

  templateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const items = [...templateItems.querySelectorAll('.mini-list-item')].map(node => ({ service_id: node.querySelector('select[name="service_id"]').value, quantity: Number(node.querySelector('input[name="quantity"]').value || 1) })).filter(item => item.service_id);
    const payload = {
      name: templateForm.elements.name.value,
      discount_percent: Number(templateForm.elements.discount_percent.value || 0),
      price_without_discount: templateForm.elements.price_without_discount.value,
      price: templateForm.elements.price.value,
      appointments_per_period: Number(templateForm.elements.appointments_per_period.value || 0),
      validity_days: Number(templateForm.elements.validity_days.value || 30),
      recurrence_type: templateForm.elements.recurrence_type.value,
      status: templateForm.elements.status.value,
      description: templateForm.elements.description.value,
      pet_size_id: templateForm.elements.pet_size_id.value,
      pet_size_label: templateForm.elements.pet_size_id.selectedOptions?.[0]?.textContent || '',
      items
    };
    if (state.editingTemplate?.id) await api.put(`/api/tenant/packages/templates/${state.editingTemplate.id}`, payload);
    else await api.post('/api/tenant/packages/templates', payload);
    closeTemplateModal();
    await load();
  });

  saleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saleForm.elements.contract_accepted && !saleForm.elements.contract_accepted.checked) {
      window.alert('É preciso aceitar o termo do contrato antes de fechar o pacote.');
      return;
    }
    const payload = {
      template_id: saleForm.elements.template_id.value,
      tutor_id: saleForm.elements.tutor_id.value,
      pet_id: saleForm.elements.pet_id.value,
      start_date: saleForm.elements.start_date.value,
      schedule_time: saleForm.elements.schedule_time?.value || '09:00',
      payment_method: saleForm.elements.payment_method.value,
      payment_status: saleForm.elements.payment_status.value,
      notes: saleForm.elements.notes.value,
      auto_renew: saleForm.elements.auto_renew?.checked || false,
      contract_accepted: saleForm.elements.contract_accepted?.checked || false,
      contract_acceptance_name: saleForm.elements.contract_acceptance_name?.value || saleForm.elements.tutor_id.selectedOptions?.[0]?.textContent || '',
      contract_snapshot_html: buildContractSnapshotHtml()
    };
    const created = await api.post('/api/tenant/packages/customer-packages', payload);
    closeSaleModal();
    state.tab = 'vendidos';
    document.querySelector('[data-tab="vendidos"]').click();
    await load();
    if (created?.item?.id) await openDetail(created.item.id);
  });

  templateList.addEventListener('click', async (event) => {
    const deleteBtn = event.target.closest('[data-delete-template]');
    if (deleteBtn) { if (!window.confirm('Excluir este pacote do catálogo?')) return; await api.delete(`/api/tenant/packages/templates/${deleteBtn.dataset.deleteTemplate}`); await load(); return; }
    const editBtn = event.target.closest('[data-edit-template]');
    if (!editBtn) return;
    const item = (state.data.templates || []).find(entry => String(entry.id) === String(editBtn.dataset.editTemplate));
    if (item) openTemplateModal(item);
  });

  saleList.addEventListener('click', async (event) => {
    const deleteBtn = event.target.closest('[data-delete-sale]');
    if (deleteBtn) { if (!window.confirm('Excluir esta venda de pacote e seus agendamentos vinculados?')) return; await api.delete(`/api/tenant/packages/customer-packages/${deleteBtn.dataset.deleteSale}`); await load(); return; }
    const openBtn = event.target.closest('[data-open-detail]');
    if (!openBtn) return;
    openDetail(openBtn.dataset.openDetail);
  });

  $('[data-cancel-package]').addEventListener('click', async () => {
    if (!state.detail?.id) return;
    await api.put(`/api/tenant/packages/customer-packages/${state.detail.id}`, { status: 'cancelado' });
    detailModal.classList.remove('is-open');
    await load();
  });
  $('[data-reactivate-package]').addEventListener('click', async () => {
    if (!state.detail?.id) return;
    await api.put(`/api/tenant/packages/customer-packages/${state.detail.id}`, { status: 'ativo' });
    detailModal.classList.remove('is-open');
    await load();
  });

  load();
}
