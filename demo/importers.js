globalThis.AuraImporters={
  async text(file,progress=()=>{}){
    if(!file||file.size>10000000)throw new Error('Escolha um arquivo de até 10 MB.');
    const name=file.name.toLowerCase();let text='';
    if(/\.(txt|md)$/.test(name))text=await file.text();
    else if(name.endsWith('.pdf')){
      progress('Lendo o texto do PDF neste dispositivo…');
      const pdfjs=await import('./vendor/pdf/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='./vendor/pdf/pdf.worker.min.mjs';
      const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,stopAtErrors:true});
      const timer=setTimeout(()=>task.destroy(),30000);
      try{
        const pdf=await task.promise;if(pdf.numPages>100)throw new Error('Este importador aceita até 100 páginas por arquivo.');
        const pages=[];for(let n=1;n<=pdf.numPages;n++){progress(`Lendo página ${n} de ${pdf.numPages}…`);const page=await pdf.getPage(n),content=await page.getTextContent();pages.push(content.items.map(item=>item.str||'').join(' '));page.cleanup();if(pages.join('\n').length>50000)throw new Error('O texto excede 50.000 caracteres. Importe um trecho menor.');}text=pages.join('\n\n');
      }finally{clearTimeout(timer);await task.destroy();}
    }else throw new Error('Use TXT, Markdown ou PDF com texto. Imagens não são reconhecidas: esta edição não usa OCR treinado.');
    text=text.trim();if(!text)throw new Error('Nenhum texto encontrado. PDFs digitalizados sem texto não são reconhecidos nesta edição.');if(text.length>50000)throw new Error('O texto excede 50.000 caracteres. Importe um trecho menor.');
    return {title:file.name,content:text,source:'Arquivo local: '+file.name};
  }
};
