import { makeBoletimSource } from '../../gestor/secretaria/historico-emissoes/emission-document.pdf.contract.fixtures.ts';

/** Only synthetic records and inline assets are used by this portal fixture. */
export function createAlunoBulletinFixture(createCanvas) {
  const asset = (color) => {
    const canvas = createCanvas(360, 120);
    const context = canvas.getContext('2d');
    context.strokeStyle = color;
    context.lineWidth = 8;
    context.strokeRect(12, 12, 336, 96);
    context.beginPath(); context.moveTo(30, 95); context.lineTo(180, 25); context.lineTo(320, 90); context.stroke();
    return canvas.toDataURL('image/png');
  };
  const source = makeBoletimSource();
  Object.assign(source.emission, {
    id: 'test-bulletin', codigo: 'BOL-TEST-1234-5678', aluno_id: 'test-student',
    matricula_id: 'test-enrollment', polo_id: 'test-polo', periodo_referencia: 'test-module',
  });
  const institution = {
    ...source.emission.dados_emissao.institutionSnapshot,
    nome: 'Instituição de Teste', nomeFantasia: 'Instituição de Teste', logoUrl: asset('#0f172a'),
  };
  const watermark = { watermarkUrl: asset('#0284c7'), watermarkOpacity: 0.12, watermarkScale: 70, watermarkRotate: true };
  Object.assign(source.emission.dados_emissao, {
    studentName: 'ALUNA SINTÉTICA DE TESTE', studentMatricula: 'UNIV-TEST123',
    studentCpf: '12345678909', studentRg: '12345678909', studentDocumentType: 'CIN',
    moduleId: 'test-module', institutionSnapshot: institution, watermarkSnapshot: watermark,
  });
  source.preview.polo = institution;
  source.preview.watermark = watermark;
  source.preview.academicData.componentes.forEach(component => { component.moduleId = 'test-module'; });
  source.preview.template.absoluteFields.push({
    id: 'configured-marker', type: 'text', x: 92, y: 1030, width: 500, height: 28,
    value: 'REGISTRO DO MODELO CADASTRADO', style: { fontSize: '12px', fontWeight: 'bold' },
  });
  source.emission.dados_emissao.documentTemplateSnapshot = globalThis.structuredClone(source.preview.template);
  return source;
}

export const alunoBulletinRpcStub = `
  export const supabase = {
    rpc(name, parameters) {
      window.rpcCalls.push({name, parameters});
      if (name !== 'obter_boletim_aluno_pdf') throw Error('Unexpected RPC: ' + name);
      if (parameters.p_matricula_id !== 'test-enrollment') throw Error('Unexpected enrollment');
      if (parameters.p_modulo_id !== 'test-module') throw Error('Unexpected module');
      const reply = window.rpcReplies.shift();
      if (!reply) throw Error('No configured RPC response');
      const promise = Promise.resolve(reply);
      promise.abortSignal = () => promise;
      return promise;
    },
    from() { throw Error('The student bulletin must use its authorized RPC'); },
  };
`;
