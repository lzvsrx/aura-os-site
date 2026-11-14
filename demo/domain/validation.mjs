import { resourceCollections,validateResource } from './resources.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function text(value, max = 2000) { if (typeof value !== 'string' || !value.trim() || value.length > max) throw fail(400, 'Texto obrigatório ou tamanho inválido.'); return value.trim(); }
export function validate(kind, body) {
  if(resourceCollections.includes(kind))return validateResource(kind,body);
  const item = {};
  if (kind === 'tasks') {
    item.title = text(body.title, 200);
    if (typeof body.startsAt !== 'string' || !Number.isFinite(Date.parse(body.startsAt))) throw fail(400, 'Data inválida.');
    item.startsAt = new Date(body.startsAt).toISOString();
    item.timezone = text(body.timezone, 100);
    try { new Intl.DateTimeFormat('pt-BR', { timeZone: item.timezone }); } catch { throw fail(400, 'Fuso inválido.'); }
    item.category = ['pessoal','trabalho','estudo','pausa','consulta','medicamento'].includes(body.category) ? body.category : 'pessoal';
    item.recurrence = ['none','daily','weekly'].includes(body.recurrence) ? body.recurrence : 'none';
    item.done = body.done === true;
  } else if (kind === 'contacts') { item.name = text(body.name, 120); item.phone = text(body.phone, 40); if (!/^[+\d ()-]{3,40}$/.test(item.phone)) throw fail(400, 'Telefone inválido.'); }
  else if (kind === 'consents') {
    item.scope = text(body.scope, 120); item.granted = body.granted === true;
    if (!['health','memory','localAI','offline'].includes(item.scope)) throw fail(400, 'Escopo indisponível nesta versão local.');
  } else {
    item.title = text(body.title, 200); item.content = text(body.content, 10000);
    if (kind === 'memories') { item.source = 'declarada pelo usuário'; item.purpose = text(body.purpose || 'Personalização local', 200); item.expiresAt = body.expiresAt || null; if (item.expiresAt && !Number.isFinite(Date.parse(item.expiresAt))) throw fail(400, 'Validade inválida.'); }
  }
  return item;
}
