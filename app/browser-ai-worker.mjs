import {env,pipeline} from './vendor/ai/transformers.min.mjs';
let generator,config;
const send=(type,extra={})=>postMessage({type,...extra});
const hex=buffer=>Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');
async function verified(response,file){if(!response?.ok)throw new Error('Falha ao baixar '+file.path);const data=await response.arrayBuffer();if(data.byteLength!==file.bytes||hex(await crypto.subtle.digest('SHA-256',data))!==file.sha256)throw new Error('Verificação de integridade falhou para '+file.path);return new Response(data,{headers:{'Content-Type':file.path.endsWith('.json')?'application/json':'application/octet-stream','X-Aura-SHA256':file.sha256}});}
async function prepare(){
  config??=await(await fetch(new URL('./browser-ai-config.json',import.meta.url))).json();
  const cache=await caches.open(config.cacheName),prefix=`https://huggingface.co/${config.model}/resolve/${config.revision}/`;
  let completed=0;
  for(const file of config.files){
    const url=prefix+file.path;let response=await cache.match(url);
    if(response){try{response=await verified(response,file);}catch{await cache.delete(url);response=null;}}
    if(!response){
      send('progress',{text:`Baixando ${file.path}. Arquivos verificados: ${Math.round(completed/config.downloadBytes*100)}%.`});
      const result=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'});if(!result.ok)throw new Error('Não foi possível baixar os arquivos do modelo. Verifique sua conexão.');
      const reader=result.body.getReader(),chunks=[];let received=0,last=0;
      while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.length;if(received>file.bytes){await reader.cancel();throw new Error('Tamanho inesperado do modelo.');}if(Date.now()-last>400){last=Date.now();send('progress',{text:`Baixando IA: ${Math.round((completed+received)/1e6)} de ${Math.round(config.downloadBytes/1e6)} MB (${Math.round((completed+received)/config.downloadBytes*100)}%).`});}}
      const data=new Uint8Array(received);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}chunks.length=0;
      response=await verified(new Response(data),file);await cache.put(url,response);
    }
    completed+=file.bytes;
  }
  env.allowLocalModels=false;env.allowRemoteModels=true;env.remotePathTemplate=`{model}/resolve/${config.revision}/`;env.useBrowserCache=true;env.cacheKey=config.cacheName;env.useWasmCache=false;
  env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
  env.backends.onnx.wasm.wasmPaths={mjs:new URL('./vendor/ai/ort-wasm-simd-threaded.asyncify.mjs',import.meta.url).href,wasm:new URL('./vendor/ai/ort-wasm-simd-threaded.asyncify.wasm',import.meta.url).href};
  // Only pinned, verified static model resources may be fetched by the library.
  env.fetch=async input=>{const url=String(input);if(!config.files.some(f=>url===prefix+f.path))return new Response('',{status:404});const cached=await cache.match(url);if(!cached)throw new Error('Arquivo do modelo não está preparado.');return cached;};
  send('progress',{text:'Arquivos verificados. Preparando o modelo neste aparelho…'});
  generator=await pipeline('text-generation',config.model,{revision:config.revision,dtype:config.dtype,device:'wasm'});
  send('ready',{model:config.model});
}
onmessage=async({data})=>{
  try{
    if(data.type==='load')return await prepare();
    if(data.type==='generate'){
      if(!generator)throw new Error('Prepare a IA primeiro.');send('progress',{text:'AURIA está elaborando a resposta neste aparelho…'});
      const output=await generator(data.messages,{max_new_tokens:96,do_sample:false,repetition_penalty:1.15,no_repeat_ngram_size:4,return_full_text:false});
      const generated=output[0]?.generated_text;const text=typeof generated==='string'?generated:generated?.at(-1)?.content;
      send('answer',{text});
    }
  }catch(error){send('error',{message:String(error.message||error).slice(0,500)});}
};
