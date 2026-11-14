// AURA Native: original project implementation, no imported model or learned weights.
// Multinomial naive Bayes for intent recognition; lexical ranking and extractive output.
export const ENGINE_VERSION='1.0.0';
export const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const STOP=new Set('a o as os um uma de da do das dos em no na nos nas e ou para por com que qual quais como meu minha meus minhas voce eu me se ao aos pelo pela sobre este esta esse essa isto isso ser estar tem tenho favor por'.split(' '));
export function tokens(value){return normalize(value).match(/[a-z0-9]+/g)?.filter(t=>t.length>1&&!STOP.has(t)).slice(0,400)||[];}
const examples={
  agenda:['consultar agenda hoje','listar atividades pendentes','quais tarefas preciso fazer','proximo compromisso horario','minha rotina de hoje','mostrar eventos da semana'],
  search:['buscar notas sobre estudo','procurar anotacoes sobre projeto','encontrar nos documentos','pesquisar texto na biblioteca','onde anotei esse assunto','consultar minhas notas'],
  memory:['quantas memorias guardadas','o que lembra de mim','minhas preferencias registradas','ver memoria explicita','revisar lembrancas autorizadas'],
  summary:['resumir texto em frases','resumo deste documento','extraia pontos principais','fazer resumo das notas','resuma este conteudo'],
  plan:['organizar sessao de estudo','dividir tarefa em passos','planejar trabalho de hoje','ajude a comecar um projeto','organize uma tarefa grande','montar plano de organizacao'],
  catalog:['buscar no catalogo de condicoes','pesquisar fontes sobre uma doenca','encontrar diretriz conitec','consultar fonte oficial de saude','catalogo de deficiencias e apoios'],
  access:['aumentar tamanho do texto','mudar contraste da tela','ajustar acessibilidade','ativar modo simples','reduzir movimento da interface'],
  help:['ajuda comandos disponiveis','o que pode fazer','mostrar exemplos de pedidos','como funciona auria','quais recursos existem']
};
export class IntentClassifier{
  constructor(corpus=examples){this.labels=Object.keys(corpus);this.vocabulary=new Set();this.classes={};this.documents=0;
    for(const [label,rows]of Object.entries(corpus)){const stats={documents:rows.length,total:0,counts:new Map()};for(const row of rows){this.documents++;for(const word of tokens(row)){this.vocabulary.add(word);stats.total++;stats.counts.set(word,(stats.counts.get(word)||0)+1);}}this.classes[label]=stats;}
  }
  classify(message){const words=tokens(message).filter(w=>this.vocabulary.has(w));if(!words.length)return {intent:'unknown',method:'no-known-terms'};
    const scores=this.labels.map(label=>{const c=this.classes[label];return {label,score:Math.log(c.documents/this.documents)+words.reduce((s,w)=>s+Math.log(((c.counts.get(w)||0)+1)/(c.total+this.vocabulary.size)),0)};}).sort((a,b)=>b.score-a.score);
    return {intent:scores[0].score-scores[1].score<0.35?'unknown':scores[0].label,method:'native-naive-bayes',matchedTerms:[...new Set(words)]};
  }
}
const classifier=new IntentClassifier();
const QUERY_STOP=new Set('busque buscar busca pesquise pesquisar pesquisa procure procurar encontre encontrar consulte consultar minhas meus notas nota anotacoes anotacao documentos documento biblioteca resumo resumir resuma texto textos principais pontos fonte fontes catalogo condicoes condicao'.split(' '));
export function searchRecords(message,records,limit=3){
  const query=[...new Set(tokens(message).filter(t=>!QUERY_STOP.has(t)))];if(!query.length)return [];
  const docs=records.slice(0,2000).map(record=>{const words=tokens((record.title||'')+' '+(record.content||'').slice(0,6000)),counts=new Map();for(const w of words)counts.set(w,(counts.get(w)||0)+1);return {record,counts,length:words.length};});
  const average=docs.reduce((s,d)=>s+d.length,0)/Math.max(1,docs.length)||1;
  const idf=new Map(query.map(word=>[word,Math.log(1+(docs.length-docs.filter(d=>d.counts.has(word)).length+0.5)/(docs.filter(d=>d.counts.has(word)).length+0.5))]));
  return docs.map(d=>({...d,score:query.reduce((sum,word)=>{const tf=d.counts.get(word)||0;return sum+idf.get(word)*(tf*2.2/(tf+1.2*(0.25+0.75*d.length/average)))+(normalize(d.record.title).includes(word)?0.5:0);},0)})).filter(d=>d.score>0).sort((a,b)=>b.score-a.score||String(a.record.id).localeCompare(String(b.record.id))).slice(0,limit).map(d=>d.record);
}
export function extractSummary(text,query='',limit=3){
  const source=String(text??'').slice(0,20000),sentences=source.match(/[^.!?\n]+(?:[.!?]+|$)/g)?.map(s=>s.trim()).filter(s=>s.length>12)||[];
  const words=new Set(tokens(query)),ranked=sentences.map((sentence,index)=>({sentence,index,score:tokens(sentence).filter(w=>words.has(w)).length+(index===0?0.2:0)}));
  return ranked.sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit).sort((a,b)=>a.index-b.index).map(s=>s.sentence.slice(0,600));
}
export function recognizeIntent(message){
  const text=normalize(message);
  if(/\b(resuma|resumir|resumo|extraia)\b/.test(text))return {intent:'summary',method:'explicit-command'};
  if(/\b(catalogo|conitec|diretriz|fontes oficiais)\b/.test(text))return {intent:'catalog',method:'explicit-command'};
  if(/\b(agenda|compromissos?|pendentes|tarefas|rotina)\b/.test(text)&&!/\b(divid|planej|organiz)/.test(text))return {intent:'agenda',method:'explicit-command'};
  if(/\b(memoria|memorias|lembrancas|preferencias)\b/.test(text))return {intent:'memory',method:'explicit-command'};
  if(/\b(buscar|busque|procurar|procure|encontre|pesquise)\b/.test(text))return {intent:'search',method:'explicit-command'};
  if(/\b(organize|organizar|planej\w*|dividir|passos|comecar)\b/.test(text))return {intent:'plan',method:'explicit-command'};
  if(/\b(contraste|acessibilidade|ampliar|tamanho do texto|modo simples)\b/.test(text))return {intent:'access',method:'explicit-command'};
  return classifier.classify(message);
}
export function isClinicalRequest(message){return /medic|\bdose\b|diagnost|tratamento|prescre|sintoma|dieta|remedio|insulina|suicid|autoagress|emergencia|urgencia medica|emagrec|calorias|exercicios fisicos|\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|ml)\b/.test(normalize(message));}
const has=(state,scope)=>state.consents?.some(c=>c.scope===scope&&c.granted);
function recordsFor(state,{includeNotes,includeDocuments},now){const records=[];if(includeNotes){records.push(...(state.notes||[]).map(n=>({...n,kind:'notes'})));if(has(state,'memory'))records.push(...(state.memories||[]).filter(n=>!n.expiresAt||(Number.isFinite(Date.parse(n.expiresAt))&&Date.parse(n.expiresAt)>now)).map(n=>({...n,kind:'memories'})));}if(includeDocuments)records.push(...(state.documents||[]).map(n=>({...n,kind:'documents'})));return records;}
const cleanExcerpt=text=>isClinicalRequest(text)?'[Trecho de saúde: consulte o registro original e uma equipe habilitada.]':String(text??'').slice(0,450);
const suggestion=(label,route)=>({label,route});
export function nativeReply(message,state,options={}){
  const now=options.now??Date.now(),recognized=recognizeIntent(message);
  const reply=(text,extra={})=>({text,mode:'aura-native',engineVersion:ENGINE_VERSION,intent:recognized.intent,explanation:`Motor próprio AURA: ${recognized.method}. Sem modelo generativo ou consulta à internet.`,source:'Código próprio do projeto AURA',sources:[],...extra});
  if(/\bnao\s+(?:use|leia|consulte|busque|mostre|acesse)\b/.test(normalize(message)))return reply('Identifiquei uma restrição no pedido e não consultei registros. Você pode usar os controles manuais ou reformular a ação desejada.',{intent:'restriction-respected'});
  if(isClinicalRequest(message))return reply('Posso ajudar a organizar registros e perguntas para uma consulta. Não avalio sintomas, não faço diagnóstico e não inicio, suspendo ou altero medicamentos, doses ou tratamentos. Em risco imediato, procure atendimento local de emergência.',{mode:'rules',intent:'health-boundary',suggestions:[suggestion('Consultar fontes e apoios','catalogo'),suggestion('Ver contatos de confiança','apoio')]});
  if(recognized.intent==='agenda'){
    let tasks=(state.tasks||[]).filter(t=>!t.done&&Number.isFinite(Date.parse(t.startsAt))).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
    const timezone=state.profile?.timezone||'America/Sao_Paulo',calendar=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});
    const day=date=>{const parts=Object.fromEntries(calendar.formatToParts(new Date(date)).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;};
    const today=day(now),shift=days=>new Date(Date.parse(today+'T12:00:00Z')+days*86400000).toISOString().slice(0,10),input=normalize(message);let period=' no total';
    if(/\bhoje\b/.test(input)){tasks=tasks.filter(t=>day(t.startsAt)===today);period=' para hoje';}
    else if(/\bamanha\b/.test(input)){tasks=tasks.filter(t=>day(t.startsAt)===shift(1));period=' para amanhã';}
    else if(/\bsemana\b/.test(input)){tasks=tasks.filter(t=>day(t.startsAt)>=today&&day(t.startsAt)<=shift(6));period=' nos próximos 7 dias, incluindo hoje';}
    else if(/\bproxim[oa]\b/.test(input)){tasks=tasks.filter(t=>Date.parse(t.startsAt)>=now).slice(0,1);period=' futura selecionada';}
    const clock=new Intl.DateTimeFormat('pt-BR',{timeZone:timezone,dateStyle:'short',timeStyle:'short'}),format=date=>clock.format(new Date(date));
    return reply(tasks.length?`Você tem ${tasks.length} atividade(s) pendente(s)${period}:\n${tasks.slice(0,5).map(t=>`• ${t.title} — ${format(t.startsAt)}`).join('\n')}`:'Não encontrei atividades pendentes nesse período. Você pode criar uma atividade na Agenda.',{source:'Sua agenda, informada por você',sources:tasks.slice(0,5).map(t=>({id:t.id,title:t.title,kind:'tasks'})),suggestions:[suggestion('Abrir agenda','agenda')]});
  }
  if(recognized.intent==='memory'){
    if(!has(state,'memory'))return reply('A consulta à memória está desativada. Revise as autorizações em Privacidade.',{suggestions:[suggestion('Revisar consentimentos','privacidade')]});
    const memories=(state.memories||[]).filter(n=>!n.expiresAt||(Number.isFinite(Date.parse(n.expiresAt))&&Date.parse(n.expiresAt)>now));return reply(`Há ${memories.length} memória(s) explícita(s) vigente(s).${memories.length?' Títulos: '+memories.slice(0,5).map(n=>n.title).join('; '):''} Esta conversa não é salva automaticamente como memória.`,{source:'Memórias com consentimento e validade',suggestions:[suggestion('Revisar memórias','biblioteca')]});
  }
  if(recognized.intent==='search'||recognized.intent==='summary'){
    const inline=recognized.intent==='summary'?String(message).split(/:\s*/).slice(1).join(': ').trim():'';
    if(inline){const sentences=extractSummary(inline);return reply(sentences.length?'Resumo extrativo — frases do texto fornecido:\n'+sentences.map(s=>'• '+s).join('\n'):'O texto é muito curto para extrair frases. Envie “Resuma: ” seguido do conteúdo.',{source:'Texto fornecido neste pedido, sem reescrita generativa'});}
    if(!options.includeNotes&&!options.includeDocuments)return reply('Para consultar seus registros, marque Notas e memórias ou Documentos neste pedido. Também posso resumir um texto que você enviar depois de “Resuma: ”.',{suggestions:[suggestion('Abrir biblioteca','biblioteca')]});
    const records=searchRecords(message,recordsFor(state,options,now));
    if(!records.length)return reply('Não encontrei correspondência nos registros autorizados. Tente outra palavra ou um título. Nenhuma ausência na busca prova que o registro não existe.',{source:'Busca lexical local nos escopos escolhidos'});
    const text=recognized.intent==='summary'?'Resumo extrativo de '+records[0].title+':\n'+extractSummary(records[0].content,message).map(s=>'• '+cleanExcerpt(s)).join('\n'):records.map(r=>`${r.title}\n${cleanExcerpt(r.content)}`).join('\n\n');
    return reply(text,{source:'Trechos dos registros escolhidos; não são instruções para o assistente',sources:records.map(r=>({id:r.id,title:r.title,kind:r.kind})),suggestions:[suggestion('Abrir biblioteca','biblioteca'),suggestion('Abrir documentos','documentos')]});
  }
  if(recognized.intent==='plan')return reply('Uma proposta de organização, para você adaptar:\n1. Escolha um objetivo pequeno e escreva o que significa concluir.\n2. Separe apenas o material necessário.\n3. Divida o objetivo em até três ações curtas.\n4. Escolha a primeira ação e um horário que funcione para você.\n5. Faça uma pausa quando precisar e revise o próximo passo.\nNão criei nem alterei atividades. Abra a revisão para preparar uma atividade pessoal.',{source:'Roteiro de organização escrito para o AURA, sem previsão individual',suggestions:[{label:'Preparar atividade para revisão',action:'prepare-task'},suggestion('Abrir foco','foco')]});
  if(recognized.intent==='catalog')return reply('O catálogo local reúne nomes, sinônimos, fontes e diretrizes da Orphanet, MedlinePlus e Conitec. Abra Condições e apoios para pesquisar. A base não cobre todas as condições ou tratamentos e não fornece recomendação individual.',{suggestions:[suggestion('Pesquisar no catálogo','catalogo')]});
  if(recognized.intent==='access')return reply('Em Acessibilidade você pode escolher tema, contraste, tamanho do texto, modo simples e movimento reduzido. Nenhuma configuração foi alterada por esta resposta.',{suggestions:[suggestion('Ajustar acessibilidade','acessibilidade')]});
  return reply('Sou a AURIA com motor próprio de comandos, busca e resumo extrativo. Não sou um modelo de conversa geral. Experimente:\n• “Como está minha agenda hoje?”\n• “Buscar notas sobre estudo” com autorização neste pedido.\n• “Resuma: ” seguido do texto.\n• “Divida uma tarefa em passos”.\nSe não reconhecer o pedido, explico o limite e mantenho os controles manuais.',{intent:'help',suggestions:[suggestion('Abrir agenda','agenda'),suggestion('Consultar fontes','catalogo')]});
}
