export function assistantReply(message, state) {
  const text = String(message).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/medic|dose|diagnost|tratamento|prescre|sintoma|dieta/.test(text)) return {
    text: 'Posso ajudar a organizar registros e perguntas para uma consulta. Não avalio sintomas, não faço diagnóstico e não inicio, suspendo ou altero medicamentos, doses ou tratamentos. Converse com um profissional habilitado.',
    source: 'Regras locais de segurança • plano AURA OS V16, seções 102 e 141', mode: 'rules' };
  if (/agenda|hoje|tarefa|rotina/.test(text)) {
    const pending = state.tasks.filter(t => !t.done).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { text: pending.length ? `Você tem ${pending.length} atividade(s) pendente(s). Próxima: ${pending[0].title}. Abra Agenda para revisar os horários e concluir atividades.` : 'Sua agenda está livre. Abra Agenda para adicionar uma atividade com horário e fuso.', source: 'Sua agenda local, informada por você', mode: 'rules' };
  }
  if (/memoria|lembr/.test(text)) return state.consents.some(c => c.scope === 'memory' && c.granted) ? { text: `Há ${state.memories.length} memória(s) explícita(s) vigentes. Você pode revisar, editar e apagar em Biblioteca. Esta conversa não será salva como memória.`, source: 'Seu cofre local', mode: 'rules' } : { text: 'A consulta à memória está desativada. Você pode revisar seus registros em Biblioteca e suas autorizações em Privacidade.', source: 'Seu consentimento local', mode: 'rules' };
  return { text: 'Sou a AURIA em modo de comandos locais, sem modelo generativo conectado. Posso consultar sua agenda e a quantidade de memórias. Use Agenda para organizar tarefas, Biblioteca para anotar, Comunicação para falar uma frase ou Acessibilidade para ajustar a interface.', source: 'Catálogo local de recursos • nenhum dado enviado à nuvem', mode: 'rules' };
}
