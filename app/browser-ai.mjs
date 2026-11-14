import {isSensitiveRequest,sensitiveReply,modelInput,safeModelReply} from './domain/ai-policy.mjs';
let worker,pending,ready=false;
let current={phase:'idle',text:'IA ainda não preparada neste aparelho.'};
const emit=(phase,text)=>{current={phase,text};globalThis.dispatchEvent(new CustomEvent('aura-ai-status',{detail:current}));};
export const browserAIStatus=()=>({...current,ready});
export function stopBrowserAI(){worker?.terminate();worker=null;ready=false;const p=pending;pending=null;if(p){clearTimeout(p.timeout);p.reject(new Error('Processamento da IA cancelado.'));}emit('idle','IA parada. Os arquivos baixados continuam neste aparelho.');}
function startWorker(){
  worker??=new Worker(new URL('./browser-ai-worker.mjs',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{if(data.type==='progress'){emit(pending?.type==='load'?'loading':'generating',data.text);return;}if(data.type==='ready')ready=true;
    const p=pending;if(!p)return;clearTimeout(p.timeout);pending=null;if(data.type==='error'){emit('error',data.message);p.reject(new Error(data.message));return;}emit('ready','IA pronta para responder neste navegador.');p.resolve(data);};
  worker.onerror=event=>{console.error('AURA: falha ao iniciar worker de IA:',event.message);const p=pending;pending=null;ready=false;worker?.terminate();worker=null;if(p){clearTimeout(p.timeout);p.reject(new Error('Não foi possível executar a IA neste navegador. Os recursos manuais continuam disponíveis.'));}emit('error','IA indisponível neste aparelho. Tente outro navegador ou use os comandos locais.');};
}
function ask(type,payload={},timeoutMs=300000){if(pending)throw new Error('Aguarde a IA ou cancele o processamento atual.');startWorker();return new Promise((resolve,reject)=>{pending={type,resolve,reject,timeout:setTimeout(()=>stopBrowserAI(),timeoutMs)};worker.postMessage({type,...payload});});}
export async function prepareBrowserAI(){
  if(ready)return;
  if(!isSecureContext||!globalThis.WebAssembly||!globalThis.caches)throw new Error('A IA exige HTTPS, WebAssembly e armazenamento do navegador.');
  const estimate=await navigator.storage?.estimate();if(estimate?.quota&&estimate.quota-(estimate.usage||0)<1_200_000_000)throw new Error('Libere pelo menos 1,2 GB de espaço neste navegador antes de preparar o modelo.');
  emit('loading','Iniciando download e verificação do modelo…');await ask('load',{},1800000);
}
export async function removeBrowserAI(){stopBrowserAI();const config=await(await fetch(new URL('./browser-ai-config.json',import.meta.url))).json();await caches.delete(config.cacheName);emit('idle','Arquivos do modelo removidos deste navegador.');}
export async function queryBrowserModel({message,state,includeNotes=false}){
  if(isSensitiveRequest(message))return {...sensitiveReply};
  if(!state.consents.some(c=>c.scope==='localAI'&&c.granted))throw new Error('Autorize a IA neste aparelho em Privacidade.');
  if(!ready)throw new Error('Prepare primeiro a IA usando o botão Baixar e preparar IA.');
  const {messages,records}=modelInput(message,state,includeNotes),result=await ask('generate',{messages});return safeModelReply(result.text,records,'browser-model');
}
globalThis.addEventListener('pagehide',stopBrowserAI);
