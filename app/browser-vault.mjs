import {base64,bytes,keyFor,encrypt,decrypt,newEnvelope} from './browser-crypto.mjs';
import {emptyState,validateState} from './domain/state.mjs';
import {text,validate} from './domain/validation.mjs';
import {resourceCollections,requireResourceConsent} from './domain/resources.mjs';
import {assistantReply} from './domain/assistant.mjs';
const kinds=new Set(['tasks','notes','memories','journal','contacts','consents','feedback',...resourceCollections]);
const fail=(status,message)=>Object.assign(new Error(message),{status});
const audit=(state,action,object)=>{state.audit.push({id:crypto.randomUUID(),at:new Date().toISOString(),action,object});state.audit=state.audit.slice(-1000);};
let session=null,failures=[],database;
const channel=globalThis.BroadcastChannel?new BroadcastChannel('aura-vault-events'):null;
if(channel)channel.onmessage=({data})=>{if(data==='lock'){lock();globalThis.dispatchEvent(new Event('aura-vault-external-lock'));}};
const notifyLock=()=>channel?.postMessage('lock');
function lock(){session?.key.fill(0);session=null;previews.clear();}
const previews=new Map();
async function db(){return database??=new Promise((resolve,reject)=>{const r=indexedDB.open('aura-browser-vault',1);r.onupgradeneeded=()=>r.result.createObjectStore('vault');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Feche outras abas antigas do AURA e tente novamente.'));});}
async function stored(value,write=false){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('vault',write?'readwrite':'readonly'),store=tx.objectStore('vault');const r=write?(value===null?store.delete('personal'):store.put(value,'personal')):store.get('personal');let result;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('A gravação foi cancelada.'));});}
async function opened(file,password){if(file?.format!==1)throw new Error('Formato inválido.');const key=await keyFor(password,file.salt);try{const state=await decrypt(file,key);if(state?.schema===1){for(const k of resourceCollections)state[k]??=[];state.schema=2;}if(state?.schema!==2)throw new Error('Versão de dados indisponível.');validateState(state);return {key,state};}catch(error){key.fill(0);throw error;}}
function auth(){if(!session||Date.now()>session.expires){lock();throw fail(401,'Desbloqueie seu cofre.');}session.expires=Date.now()+30*60000;return session;}
function password(value){const p=text(value,200);if(p.length<12)throw fail(400,'Use pelo menos 12 caracteres.');return p;}
async function checkPassword(file,value){let check;try{check=await opened(file,text(value,200));}catch{throw fail(401,'Senha do cofre incorreta.');}finally{check?.key.fill(0);}}
function throttle(){failures=failures.filter(t=>Date.now()-t<900000);if(failures.length>=8)throw fail(429,'Aguarde antes de tentar novamente.');}
async function request(path,method,body,mutationId){
  let file=await stored();
  if(path==='status'&&method==='GET')return {initialized:!!file,identityRequired:false,userSubject:'browser-local',version:'0.6.0',mode:'browser',localAI:false,nativeAssistant:true};
  if(path==='import'&&method==='POST'){
    if(file)throw fail(409,'O cofre já existe. Use Restaurar em Privacidade para substituir seus dados.');if(body.confirm!=='IMPORTAR')throw fail(400,'Confirme a importação do cofre.');
    let check;try{check=await opened(body.backup,text(body.backupPassword,200));await stored(body.backup,true);}catch{throw fail(400,'Arquivo ou senha inválidos. Nenhum cofre foi criado.');}finally{check?.key.fill(0);}return {ok:true};
  }
  if(['setup','unlock'].includes(path)&&method==='POST'){
    throttle();let result;
    try{
      if(path==='setup'){if(file)throw fail(409,'O cofre já existe.');const state=emptyState(text(body.name,100)),created=await newEnvelope(state,password(body.password));try{await stored(created.file,true);}catch(error){created.key.fill(0);throw error;}result={key:created.key,state};}
      else result=await opened(file,text(body.password,200));
    }catch(error){failures.push(Date.now());if(error.status)throw error;throw fail(401,'Não foi possível abrir o cofre com esta senha.');}
    lock();session={key:result.key,expires:Date.now()+30*60000,reauthAt:Date.now(),csrf:crypto.randomUUID()};return {csrf:session.csrf};
  }
  if(path==='recover'&&method==='POST'){
    throttle();let recovery,old;
    try{if(!file?.recovery||!/^[-_A-Za-z0-9]{43}$/.test(body.code))throw new Error('Código inválido.');recovery=bytes(body.code.replaceAll('-','+').replaceAll('_','/')+'=');old=bytes((await decrypt(file.recovery,recovery)).key);const state=await decrypt(file,old);validateState(state);state.revision++;const created=await newEnvelope(state,password(body.newPassword));try{await stored(created.file,true);}finally{created.key.fill(0);}lock();notifyLock();return {ok:true};}
    catch(error){failures.push(Date.now());throw fail(400,'Não foi possível recuperar. Confira o código e a nova senha.');}finally{recovery?.fill(0);old?.fill(0);}
  }
  const active=auth();
  if(path==='session'&&method==='GET')return {csrf:active.csrf,reauthFresh:Date.now()-active.reauthAt<300000};
  if(path==='lock'&&method==='POST'){lock();notifyLock();return {ok:true};}
  let state;try{state=await decrypt(file,active.key);}catch{lock();throw fail(401,'O cofre foi alterado em outra aba. Abra-o novamente.');}
  if(path==='state'&&method==='GET')return state;
  if(mutationId&&kinds.has(path.split('/')[0])){if(!/^[a-f0-9-]{36}$/.test(mutationId))throw fail(400,'Identificador de operação inválido.');state.syncApplied??=[];if(state.syncApplied.includes(mutationId))return state;state.syncApplied.push(mutationId);}
  if(path==='reauth'&&method==='POST'){throttle();try{await checkPassword(file,body.password);}catch(error){failures.push(Date.now());throw error;}active.reauthAt=Date.now();return {ok:true};}
  if(['backup','export','erase','recovery/enable'].includes(path)&&Date.now()-active.reauthAt>=300000)throw fail(403,'Confirme sua senha novamente.');
  if(path==='backup'&&method==='POST'){if(body.confirm!=='BACKUP')throw fail(400,'Confirme o backup.');return file;}
  if(path==='export'&&method==='POST'){if(body.confirm!=='EXPORTAR')throw fail(400,'Confirme a exportação.');return state;}
  if(path==='erase'&&method==='POST'){if(body.confirm!=='APAGAR TUDO')throw fail(400,'Confirme a exclusão.');await stored(null,true);lock();notifyLock();return {ok:true};}
  if(path==='restore'&&method==='POST'){
    if(body.confirm!=='RESTAURAR')throw fail(400,'Confirme a restauração.');await checkPassword(file,body.currentPassword);
    const backup=body.backup;let check;try{check=await opened(backup,text(body.backupPassword,200));await stored(backup,true);}catch{throw fail(400,'Backup inválido ou senha incorreta. O cofre anterior foi preservado.');}finally{check?.key.fill(0);}lock();notifyLock();return {ok:true};
  }
  if(path==='recovery/enable'&&method==='POST'){
    if(body.confirm!=='CRIAR RECUPERACAO')throw fail(400,'Confirme a criação.');const key=crypto.getRandomValues(new Uint8Array(32));
    try{file.recovery=await encrypt({key:base64(active.key)},key);audit(state,'recovery-enabled','vault');state.revision++;await stored({...file,...await encrypt(state,active.key)},true);return {code:base64(key).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''),oneTime:true};}finally{key.fill(0);}
  }
  if(path==='assistant'&&method==='POST'){return assistantReply(text(body.message,2000),state,{includeNotes:body.includeNotes===true,includeDocuments:body.includeDocuments===true});}
  if(path==='actions/preview'&&method==='POST'){
    if(body.kind!=='tasks')throw fail(400,'Use uma atividade pessoal.');const data=validate('tasks',body.data);if(['consulta','medicamento'].includes(data.category))throw fail(400,'Use os registros manuais de saúde.');
    for(const [id,p]of previews)if(p.expires<Date.now())previews.delete(id);if(previews.size>=20)throw fail(429,'Revise as prévias pendentes.');const id=crypto.randomUUID();previews.set(id,{data,revision:state.revision,expires:Date.now()+300000});return {id,preview:data,source:'Campos informados por você; a criação exige confirmação.'};
  }
  const confirmation=/^actions\/([a-f0-9-]+)\/confirm$/.exec(path);
  if(confirmation&&method==='POST'){
    const p=previews.get(confirmation[1]);if(!p||p.expires<Date.now())throw fail(410,'Prévia expirada.');if(body.confirm!==true)throw fail(400,'Confirme a criação.');
    state.syncApplied??=[];if(!state.syncApplied.includes(confirmation[1])){if(state.revision!==p.revision)throw fail(409,'A agenda mudou. Prepare outra prévia.');if(state.tasks.length>=5000)throw fail(400,'Limite de atividades atingido.');state.tasks.push({...p.data,id:crypto.randomUUID(),createdAt:new Date().toISOString()});state.syncApplied.push(confirmation[1]);audit(state,'confirmed-action','tasks');}
  }else if(path==='preferences'&&method==='PATCH'){
    if(['dark','light','contrast'].includes(body.theme))state.preferences.theme=body.theme;if([100,125,150,200].includes(body.scale))state.preferences.scale=body.scale;
    for(const k of ['simple','reducedMotion'])if(typeof body[k]==='boolean')state.preferences[k]=body[k];
    if(body.name)state.profile.name=text(body.name,100);if(body.timezone){new Intl.DateTimeFormat('pt-BR',{timeZone:body.timezone});state.profile.timezone=body.timezone;}audit(state,'update','preferences');
  }else{
    const [kind,id,...rest]=path.split('/');if(rest.length||!kinds.has(kind)||!['POST','PATCH','DELETE'].includes(method))throw fail(404,'Recurso indisponível no cofre deste navegador. AURA ID e delegação exigem o modo Plataforma.');
    if(kind==='grants')throw fail(400,'A delegação exige o modo Plataforma com AURA ID.');
    if(method!=='DELETE'){requireResourceConsent(state,kind);const scope=kind==='journal'?'health':kind==='memories'?'memory':null;if(scope&&!state.consents.some(c=>c.scope===scope&&c.granted))throw fail(403,'Autorize este registro em Privacidade.');}
    if(method==='POST'&&!id){if(state[kind].length>=5000)throw fail(400,'Limite de registros atingido.');const item={...validate(kind,body),id:crypto.randomUUID(),createdAt:new Date().toISOString()};if(kind==='medicationEvents'&&!state.prescriptions.some(p=>p.id===item.prescriptionId))throw fail(400,'Prescrição não encontrada.');if(kind==='consents')state.consents=state.consents.filter(c=>c.scope!==item.scope);state[kind].push(item);}
    else if(id){const index=state[kind].findIndex(i=>i.id===id);if(index<0)throw fail(404,'Registro não encontrado.');if(method==='DELETE')state[kind].splice(index,1);else{const old=state[kind][index],item={...old,...validate(kind,{...old,...body}),updatedAt:new Date().toISOString()};if(kind==='tasks'&&body.done===true&&!old.done&&!old.nextOccurrenceId&&['daily','weekly'].includes(old.recurrence)){if(state.tasks.length>=5000)throw fail(400,'Limite de atividades atingido.');item.nextOccurrenceId=crypto.randomUUID();state.tasks.push({...old,id:item.nextOccurrenceId,startsAt:new Date(Date.parse(old.startsAt)+(old.recurrence==='daily'?86400000:604800000)).toISOString(),done:false,createdAt:new Date().toISOString()});}state[kind][index]=item;}}
    else throw fail(405,'Informe o registro.');audit(state,method.toLowerCase(),kind);
  }
  state.revision++;state.syncApplied=state.syncApplied?.slice(-2000);await stored({...file,...await encrypt(state,active.key)},true);return state;
}
export async function browserAPI(path,method='GET',body={},mutationId){
  if(!globalThis.isSecureContext||!navigator.locks||!globalThis.indexedDB)throw fail(503,'Este navegador precisa oferecer HTTPS, IndexedDB e Web Locks.');
  return navigator.locks.request('aura-browser-vault',async()=>structuredClone(await request(path,method,body||{},mutationId)));
}
globalThis.addEventListener('pagehide',lock);
globalThis.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
setInterval(()=>{if(session&&session.expires<Date.now())lock();},30000);
