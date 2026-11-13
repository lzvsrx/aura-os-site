import {scryptAsync} from './vendor/hashes/scrypt.js';
const encoder=new TextEncoder(),decoder=new TextDecoder();
export function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
export function bytes(s){if(typeof s!=='string')throw new Error('Formato inválido.');return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
export async function keyFor(password,salt){const s=bytes(salt);if(s.length!==32)throw new Error('Salt inválido.');return scryptAsync(password,s,{N:32768,r:8,p:1,dkLen:32,maxmem:64*1024*1024,asyncTick:10});}
export async function encrypt(state,key){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const imported=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);
  const output=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,tagLength:128},imported,encoder.encode(JSON.stringify(state))));
  return {iv:base64(iv),body:base64(output.subarray(0,-16)),tag:base64(output.subarray(-16))};
}
export async function decrypt(file,key){
  const iv=bytes(file.iv),tag=bytes(file.tag),body=bytes(file.body);if(iv.length!==12||tag.length!==16||body.length>20_000_000)throw new Error('Cofre inválido.');
  const input=new Uint8Array(body.length+16);input.set(body);input.set(tag,body.length);
  const imported=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['decrypt']);
  return JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,tagLength:128},imported,input)));
}
export async function newEnvelope(state,password){const salt=base64(crypto.getRandomValues(new Uint8Array(32))),key=await keyFor(password,salt);try{return {file:{format:1,salt,...await encrypt(state,key)},key};}catch(error){key.fill(0);throw error;}}
