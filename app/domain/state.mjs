import { resourceCollections } from './resources.mjs';
export function emptyState(name = 'Você') {
  return { schema: 2, revision: 0, profile: { name, timezone: 'America/Sao_Paulo' },
    preferences: { theme: 'dark', scale: 100, reducedMotion: true, simple: false },
    tasks: [], notes: [], memories: [], journal: [], contacts: [], consents: [], feedback: [], audit: [], ...Object.fromEntries(resourceCollections.map(k=>[k,[]])) };
}

export function validateState(state){
    if(!state.profile||typeof state.profile.name!=='string'||typeof state.profile.timezone!=='string')throw new Error('Perfil inválido.');
    new Intl.DateTimeFormat('pt-BR',{timeZone:state.profile.timezone});
    if(!state.preferences||!['dark','light','contrast'].includes(state.preferences.theme)||![100,125,150,200].includes(state.preferences.scale))throw new Error('Preferências inválidas.');
    for(const kind of ['tasks','notes','memories','journal','contacts','consents','feedback','audit',...resourceCollections]){
      if(!Array.isArray(state[kind])||state[kind].length>5000)throw new Error('Coleção inválida.');
      for(const item of state[kind]){
        if(!item||typeof item!=='object'||typeof item.id!=='string')throw new Error('Registro inválido.');
        for(const field of ['createdAt','updatedAt','expiresAt','validUntil','at'])if(item[field]&&!Number.isFinite(Date.parse(item[field])))throw new Error('Data inválida no registro.');
        if(kind==='grants'&&!Array.isArray(item.scopes))throw new Error('Escopos inválidos.');
      }
    }
    for(const t of state.tasks)if(typeof t.title!=='string'||!Number.isFinite(Date.parse(t.startsAt))||typeof t.id!=='string')throw new Error('Atividade inválida.');
    return state;
}
