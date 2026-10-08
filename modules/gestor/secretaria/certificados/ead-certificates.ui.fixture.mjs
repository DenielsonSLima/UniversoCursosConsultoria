export const certificate = (id, modalidade, status) => ({
  id, modalidade, status,
  matricula_id: `enrollment-${id}`, aluno_id: `student-${id}`,
  turma_id: 'class-fixture', curso_id: 'course-fixture', polo_id: null,
  data_inscricao: '2026-09-01', data_conclusao: '2026-10-08', nota_final: 9,
  certificado_numero: null, pagina_livro: null, livro_registro: null,
  validacao_sistec: null, codigo_validacao: status === 'FINALIZADO' ? `CODE-${id}` : null,
  emitido_em: status === 'FINALIZADO' ? '2026-10-08T12:00:00Z' : null,
  aluno: { nome: `Aluno sintético ${id}`, cpf_cnpj: null },
  turma: { nome: 'Turma sintética', codigo: 'TESTE' },
  curso: { nome: 'Curso sintético', carga_horaria: 40 },
  polo: null,
});

const rows = [
  certificate('tecnico', 'TECNICO', 'PENDENTE'),
  certificate('ead-finalizado', 'EAD', 'FINALIZADO'),
  certificate('ead-pendente', 'EAD', 'PENDENTE'),
  certificate('livre', 'LIVRE', 'PENDENTE'),
];

export const mockModules = {
  './certificados.queries': `
    const rows = ${JSON.stringify(rows)};
    const response = (data) => ({data, isLoading:false, isError:false, refetch:async()=>({data})});
    export const useCertificadosQuery = (filters) => response(rows.filter(
      row => row.modalidade === filters.modalidade && row.status === filters.status));
    export const useCertificadoTurmasQuery = () => response([]);
    export const useCertificadoTemplatesQuery = () => response([
      {tipoCurso:'Educação a Distância (EAD)', testModel:'modelo-ead-configurado'}]);
    export const useFinalizarCertificadoMutation = () => ({isPending:false,
      mutateAsync:async(value)=>{ window.testIssuances.push(value); }});
  `,
  '@tanstack/react-query': `
    export const useQuery = () => ({isPending:false,
      isError:window.testValidationUnavailable === true,
      data:window.testValidationUnavailable ? null : {validationPublic:true},
      refetch:async()=>({})});
  `,
  '../shared/secretaria-documentos.service': 'export const getSecretariaContext = () => ({});',
  '../../../shared/document-validation/document-validation.service':
    'export const documentValidationService = {getSnapshot:async()=>({validationPublic:true})};',
  '../../../shared/qrcode/qr-code-assets': 'export const waitForQrCodeAssets = async () => {};',
  '../secretaria-search': `
    export const normalizeSecretariaSearch = value => (value || '').trim().toLowerCase();
    export const secretariaSearchIncludes = (value, search) => (value || '').toLowerCase().includes(search);
  `,
  './components/CertificadoPreview': `
    import React from 'react';
    export default ({certificado, modelo}) => <div data-testid="certificate-document"
      data-model={modelo?.testModel}>{certificado.aluno.nome}</div>;
  `,
};

// Only geometry used by the viewer is needed for this containing-block test.
// The real Page and portal retain their own Tailwind class names.
export const fixtureHtml = `<!doctype html><html><head><meta charset="utf-8">
<style>
  body{margin:0;font:14px sans-serif;background:#e2e8f0}
  #transformed-panel{transform:translateZ(0);margin:90px 110px;width:650px;height:600px;overflow:hidden}
  .fixed{position:fixed}.inset-0{inset:0}.w-screen{width:100vw}
  [class*="h-[100dvh]"]{height:100dvh}[class*="z-[2147483000]"]{z-index:2147483000}
  .z-50{z-index:50}.overflow-y-auto{overflow-y:auto}
  [class*="bg-slate-950/"]{background:rgba(2,6,23,.85);color:white}
  [class*="bg-white"]{background:white;color:#334155}.p-6{padding:24px}
  .p-4{padding:16px}.p-7{padding:28px}.p-3{padding:12px}
  .flex{display:flex}.justify-end{justify-content:flex-end}.gap-2{gap:8px}
  .mx-auto{margin-left:auto;margin-right:auto}.max-w-6xl{max-width:1152px}
  button{min-height:32px;cursor:pointer}button:disabled{opacity:.4;cursor:default}
  input{display:block;margin:8px;padding:10px}table{min-width:980px}td{padding:12px}
  [data-testid="certificate-document"]{background:white;color:#001a33;padding:80px;text-align:center}
</style></head><body><div id="transformed-panel"><div id="root"></div></div>
<script>window.testIssuances=[];window.testPrints=0;window.print=()=>window.testPrints++;</script>
<script type="module" src="/bundle.js"></script></body></html>`;
