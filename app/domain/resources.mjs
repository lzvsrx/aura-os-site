export const resourceCollections=['prescriptions','medicationEvents','carePlans','nutritionPlans','activityPlans','grants','boards','documents'];
const error=message=>Object.assign(new Error(message),{status:400});
const text=(v,max=2000,optional=false)=>{if(optional&&(v===undefined||v===''))return '';if(typeof v!=='string'||!v.trim()||v.length>max)throw error('Campo de texto inválido.');return v.trim();};
const date=v=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))throw error('Data inválida.');return new Date(v).toISOString();};
export function validateResource(kind,body){
  if(kind==='prescriptions')return {title:text(body.title,200),instructions:text(body.instructions,4000),prescriber:text(body.prescriber,200),source:text(body.source,500),validUntil:date(body.validUntil),verification:'user-reported',status:['active','archived'].includes(body.status)?body.status:'active'};
  if(kind==='medicationEvents'){
    if(!['confirmed','postponed','skipped'].includes(body.status))throw error('Evento inválido.');
    return {prescriptionId:text(body.prescriptionId,100),status:body.status,at:date(body.at||new Date().toISOString()),note:text(body.note,500,true)};
  }
  if(['carePlans','nutritionPlans','activityPlans'].includes(kind))return {title:text(body.title,200),content:text(body.content,10000),responsible:text(body.responsible,200),source:text(body.source,500),validUntil:date(body.validUntil),approvalStatus:'recorded-not-verified'};
  if(kind==='grants'){
    const scopes=Array.isArray(body.scopes)?[...new Set(body.scopes)]:[];
    if(!scopes.length||scopes.some(s=>!['tasks','notes','journal','prescriptions','carePlans','nutritionPlans','activityPlans'].includes(s)))throw error('Escolha permissões válidas.');
    const expiresAt=date(body.expiresAt);
    if(Date.parse(expiresAt)<=Date.now()||Date.parse(expiresAt)>Date.now()+90*86400000)throw error('O acesso deve expirar em até 90 dias.');
    return {recipient:text(body.recipient,120),targetSubject:text(body.targetSubject,200),purpose:text(body.purpose,500),scopes,expiresAt,revoked:body.revoked===true};
  }
  if(kind==='boards')return {title:text(body.title,120),phrase:text(body.phrase,500),symbol:text(body.symbol||'☷',20)};
  if(kind==='documents')return {title:text(body.title,200),content:text(body.content,50000),source:text(body.source||'Texto importado pelo usuário',500),mediaType:'text/plain',trust:'untrusted-user-content'};
  throw error('Recurso não implementado.');
}
export function requireResourceConsent(state,kind){
  if(['prescriptions','medicationEvents','carePlans','nutritionPlans','activityPlans'].includes(kind)&&!state.consents.some(c=>c.scope==='health'&&c.granted))throw Object.assign(new Error('Autorize o armazenamento de saúde em Privacidade.'),{status:403});
}
