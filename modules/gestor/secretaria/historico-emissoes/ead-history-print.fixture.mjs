/** Controlled service boundaries; the history page, modal and EAD compositor remain real. */
export const historyPrintIo = {
  '../shared/secretaria-documentos.service': `export const getSecretariaContext=()=>({poloId:'test-polo',userId:'test-user'});`,
  '../../components/ToastNotification': `export const useToast=()=>({toasts:[],removeToast(){},toast:{error(...args){window.historyErrors.push(args)}}});export default()=>null;`,
  './components/EmissionsToolbar': `export default()=>null;`,
  './components/EmissionsTable': `import React from 'react';export default({emissions,onOpenPreview})=>emissions.map(row=><button key={row.id} onClick={()=>onOpenPreview(row)}>Abrir segunda via</button>);`,
  './historico-emissoes.service': `
    const resources=()=>structuredClone(window.historyFixture.resources);
    export const historicoEmissoesService={
      loadFilters:async()=>({turmas:[],systemUsers:{}}),
      loadEmissions:async()=>({emissions:[structuredClone(window.historyFixture.emission)],total:1}),
      loadPreview:async()=>resources(),loadPreviewFresh:async()=>resources(),
      loadEmissionByCode:async()=>structuredClone(window.historyFixture.emission),
    };`,
  './emission-browser-pdf': `export const createBrowserEmissionDocumentsPdf=async()=>{throw Error('EAD must use its canonical compositor')};`,
  './contract-history-pdf': `export const createContractHistoryPdf=async()=>{throw Error('EAD is not a contract')};`,
  '../useUpdateDocumentIdentity': `export const canUpdateDocumentIdentity=()=>false;export const useUpdateDocumentIdentity=()=>({isUpdating:false,error:null});`,
  '../../../components/DocumentHeader': `export default()=>null;`,
  '../../../cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview': `export default()=>null;`,
  '../../../cadastros/modelos-documentos/cracha/components/CrachaPreview': `export default()=>null;`,
  '../../../cadastros/modelos-documentos/declaracao/components/declaracao-editor.utils': `export const PAGE_WIDTH=794;export const PAGE_HEIGHT=1123;`,
  '../template-parser': `export const parseEmissionTemplate=value=>value;`,
  '../preview-utils': `export const getPreviewStudent=()=>({});`,
  './preview-utils': `
    import {downloadPdfBlob} from '../../../shared/pdf/download-pdf-blob';
    export const downloadEmissionPdf=async()=>{throw Error('Generic certificate export is forbidden')};
    export const saveEmissionPdfBlob=(blob,emission)=>downloadPdfBlob(blob,'history-'+emission.codigo+'.pdf');`,
  '../../../shared/document-validation/document-validation.service': `
    export const createDocumentReissueKey=()=> 'synthetic-reissue-'+(++window.historyKeyCounter);
    export const documentValidationService={
      prepareReissue:async request=>{
        window.historyEvents.push({type:'prepare',request});
        const e=window.historyFixture.emission;
        if(window.historyFailPrepare)throw Error('Preparation rejected');
        return {code:e.codigo,issueCount:e.quantidade_emissoes+1,
          lastIssuedAt:'2026-10-09T12:00:00.000Z',expiresAt:null,validationPublic:true};
      },
      reissue:async request=>{
        window.historyEvents.push({type:'confirm',request});
        if(window.historyFailConfirm)throw Error('Confirmation rejected');
        const e=window.historyFixture.emission;
        e.quantidade_emissoes++;e.ultima_emissao_em='2026-10-09T12:00:00.000Z';
        return {code:e.codigo,issueCount:e.quantidade_emissoes,lastIssuedAt:e.ultima_emissao_em};
      },
    };`,
};
