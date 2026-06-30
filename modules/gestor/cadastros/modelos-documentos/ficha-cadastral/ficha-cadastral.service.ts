import { createDocumentTemplateService } from '../shared/document-template.service';

export const FICHA_CADASTRAL_VARIABLES = [
  { code: '{{ALUNO_NOME}}', label: 'Nome do Aluno' },
  { code: '{{ALUNO_FOTO_URL}}', label: 'URL da Foto' },
  { code: '{{ALUNO_NOME_SOCIAL}}', label: 'Nome Social' },
  { code: '{{ALUNO_CPF}}', label: 'CPF' },
  { code: '{{ALUNO_RG}}', label: 'RG / Documento' },
  { code: '{{ALUNO_NASCIMENTO}}', label: 'Nascimento' },
  { code: '{{ALUNO_SEXO}}', label: 'Sexo' },
  { code: '{{ALUNO_ESTADO_CIVIL}}', label: 'Estado Civil' },
  { code: '{{ALUNO_NACIONALIDADE}}', label: 'Nacionalidade' },
  { code: '{{ALUNO_NATURALIDADE}}', label: 'Naturalidade' },
  { code: '{{ALUNO_MAE}}', label: 'Nome da Mãe' },
  { code: '{{ALUNO_PAI}}', label: 'Nome do Pai' },
  { code: '{{ALUNO_EMAIL}}', label: 'E-mail' },
  { code: '{{ALUNO_TELEFONE}}', label: 'Telefone / WhatsApp' },
  { code: '{{ALUNO_ENDERECO}}', label: 'Endereço Completo' },
  { code: '{{ALUNO_CEP}}', label: 'CEP' },
  { code: '{{ALUNO_RESPONSAVEL}}', label: 'Responsável' },
  { code: '{{ALUNO_RESPONSAVEL_CPF}}', label: 'CPF Responsável' },
  { code: '{{ALUNO_RESPONSAVEL_TELEFONE}}', label: 'Telefone Responsável' },
  { code: '{{ALUNO_MATRICULA}}', label: 'Matrícula' },
  { code: '{{CURSO_NOME}}', label: 'Curso' },
  { code: '{{TURMA_NOME}}', label: 'Turma' },
  { code: '{{DATA_INGRESSO}}', label: 'Data de Ingresso' },
  { code: '{{POLO_NOME}}', label: 'Polo' },
  { code: '{{CIDADE_POLO}}', label: 'Cidade do Polo' },
  { code: '{{LOCAL_DOCUMENTO}}', label: 'Local do Documento' },
  { code: '{{DATA_ATUAL}}', label: 'Data Atual' },
  { code: '{{DATA_GERACAO}}', label: 'Data/Hora de Geração' },
];

export const fichaCadastralDefaultTemplate = {
  textContent: `
    <section style="display:flex;gap:18px;align-items:center;border:1px solid #cbd5e1;border-radius:14px;padding:12px;background:rgba(255,255,255,.72);margin-bottom:14px;">
      <div style="width:92px;height:122px;border:2px solid #cbd5e1;border-radius:10px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#94a3b8;font-size:10px;font-weight:900;text-transform:uppercase;text-align:center;">
        <img src="{{ALUNO_FOTO_URL}}" alt="Foto do aluno" style="width:100%;height:100%;object-fit:cover;" />
      </div>
      <div style="flex:1;">
        <h3 style="font-size:21px;margin:0 0 4px 0;color:#0f172a;text-transform:uppercase;">{{ALUNO_NOME}}</h3>
        <p style="margin:0 0 12px 0;font-size:12px;color:#475569;font-weight:800;text-transform:uppercase;">Curso: {{CURSO_NOME}}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:12px;">
          <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Matrícula</strong>{{ALUNO_MATRICULA}}</div>
          <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Turma</strong>{{TURMA_NOME}}</div>
        </div>
      </div>
    </section>

    <h4 style="font-size:14px;text-transform:uppercase;border-bottom:2px solid #cbd5e1;padding-bottom:6px;margin:0 0 10px;color:#0f172a;">Dados pessoais</h4>
    <section style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px 16px;border:1px solid #e2e8f0;border-radius:14px;padding:12px;background:rgba(255,255,255,.70);margin-bottom:14px;font-size:12px;">
      <div style="grid-column:span 2;"><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Nome social</strong>{{ALUNO_NOME_SOCIAL}}</div>
      <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">CPF</strong>{{ALUNO_CPF}}</div>
      <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">RG / Documento</strong>{{ALUNO_RG}}</div>
      <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Nascimento</strong>{{ALUNO_NASCIMENTO}}</div>
      <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Sexo</strong>{{ALUNO_SEXO}}</div>
      <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Estado civil</strong>{{ALUNO_ESTADO_CIVIL}}</div>
      <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Nacionalidade</strong>{{ALUNO_NACIONALIDADE}}</div>
      <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Naturalidade</strong>{{ALUNO_NATURALIDADE}}</div>
      <div style="grid-column:span 3;border-top:1px solid #e2e8f0;padding-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:18px;">
        <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Nome da mãe</strong>{{ALUNO_MAE}}</div>
        <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Nome do pai</strong>{{ALUNO_PAI}}</div>
      </div>
    </section>

    <h4 style="font-size:14px;text-transform:uppercase;border-bottom:2px solid #cbd5e1;padding-bottom:6px;margin:0 0 10px;color:#0f172a;">Contato e endereço</h4>
    <section style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;border:1px solid #e2e8f0;border-radius:14px;padding:12px;background:rgba(255,255,255,.70);margin-bottom:14px;font-size:12px;">
      <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">E-mail</strong>{{ALUNO_EMAIL}}</div>
      <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Celular / WhatsApp</strong>{{ALUNO_TELEFONE}}</div>
      <div style="grid-column:span 2;"><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Endereço completo</strong>{{ALUNO_ENDERECO}}</div>
      <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">CEP</strong>{{ALUNO_CEP}}</div>
    </section>

    <div data-page-break="true" style="height:330px;border-top:2px dashed #cbd5e1;margin:18px 0 26px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:10px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;">Página 2</div>

    <h4 style="font-size:14px;text-transform:uppercase;border-bottom:2px solid #cbd5e1;padding-bottom:6px;margin:0 0 10px;color:#0f172a;">Responsável legal e financeiro</h4>
    <section style="display:grid;grid-template-columns:1fr 1fr;gap:12px 18px;border:1px solid #e2e8f0;border-radius:14px;padding:12px;background:rgba(255,255,255,.70);margin-bottom:28px;font-size:12px;">
      <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Responsável</strong>{{ALUNO_RESPONSAVEL}}</div>
      <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">CPF</strong>{{ALUNO_RESPONSAVEL_CPF}}</div>
      <div><strong style="display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Telefone</strong>{{ALUNO_RESPONSAVEL_TELEFONE}}</div>
    </section>

    <section style="border-top:2px dashed #0f172a;padding-top:20px;margin-top:36px;font-size:10px;color:#475569;text-align:justify;line-height:1.7;">
      Declaro para os devidos fins que as informações prestadas nesta ficha cadastral são verdadeiras. Estou ciente do regulamento interno da instituição e dos termos contratuais relativos à prestação de serviços educacionais para o curso supracitado. Autorizo a instituição a utilizar meus dados para fins acadêmicos e comunicações oficiais.
    </section>
  `,
  absoluteFields: [
    {
      id: 'assinatura_aluno',
      type: 'text',
      value: '___________________________________________<br><b>ASSINATURA DO ALUNO</b><br><span style="font-size:9px;color:#64748b">{{ALUNO_NOME}}</span>',
      x: 82,
      y: 1980,
      width: 280,
      style: { textAlign: 'center', fontSize: '12px', color: '#0f172a' },
    },
    {
      id: 'data_local',
      type: 'text',
      value: '___ / ___ / ______<br><b>DATA</b><br><span style="font-size:9px;color:#64748b">LOCAL: {{LOCAL_DOCUMENTO}}</span>',
      x: 515,
      y: 1980,
      width: 180,
      style: { textAlign: 'center', fontSize: '12px', color: '#0f172a' },
    },
    {
      id: 'rodape_geracao',
      type: 'text',
      value: 'GERADO PELO SISTEMA INTEGRADO EM {{DATA_GERACAO}}',
      x: 80,
      y: 2105,
      width: 634,
      style: { textAlign: 'center', fontSize: '8px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' },
    },
  ],
  validityDays: 0,
  pageCount: 2,
  v: 2,
};

const fichaCadastralTemplateService = createDocumentTemplateService(
  'ficha_cadastral_aluno',
  fichaCadastralDefaultTemplate,
  { sharedTemplate: true }
);

export const fichaCadastralService = {
  ...fichaCadastralTemplateService,
  async getTemplate(poloId: string) {
    const template = await fichaCadastralTemplateService.getTemplate(poloId);
    const hasTwoPageStructure = String(template?.textContent || '').includes('data-page-break');
    if (!template?.v || Number(template.v) < 2 || !hasTwoPageStructure || Number((template as any).pageCount || 1) < 2) {
      return JSON.parse(JSON.stringify(fichaCadastralDefaultTemplate));
    }
    return {
      ...template,
      pageCount: Math.max(2, Number((template as any).pageCount || 2)),
    };
  },
};
