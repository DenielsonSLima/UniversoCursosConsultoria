import { createDocumentTemplateService } from '../shared/document-template.service';

export const HISTORICO_TEMPLATE_VERSION = 4;

export const historicoDefaultTemplate = {
  textContent: `
    <section style="font-family:Arial,Helvetica,sans-serif;color:#000;font-size:8px;line-height:1.15;">
      <p style="margin:0 0 5px;text-align:center;font-size:7px;line-height:1.2;">
        De acordo com o artigo 24, inciso VII da Lei nº 9.394 de 20 de dezembro de 1996.<br>
        Credenciado pela Resolução Nº 318/CEE de 14/09/2017 · Autorizado pela Resolução Nº 319/CEE de 14/09/2017 · Parecer Nº 458/CEE
      </p>
      <p style="margin:0 0 5px;text-align:center;font-size:8px;line-height:1.15;">
        <strong>CURSO TÉCNICO: {{CURSO_NOME}}</strong> · TURMA: {{TURMA_NOME}} · PERÍODO: {{PERIODO_CURSO}}
      </p>

      <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 5px;font-size:7px;line-height:1.1;">
        <tbody>
          <tr>
            <th style="width:14%;border:1px solid #111;padding:2px;text-align:center;">DATA DE EMISSÃO</th>
            <th style="width:14%;border:1px solid #111;padding:2px;text-align:center;">INÍCIO DO CURSO</th>
            <th style="width:14%;border:1px solid #111;padding:2px;text-align:center;">CONCLUSÃO DO CURSO</th>
            <th style="width:18%;border:1px solid #111;padding:2px;text-align:center;">EXPEDIÇÃO DO DIPLOMA</th>
          </tr>
          <tr>
            <td style="border:1px solid #111;padding:3px;text-align:center;">{{DATA_EMISSAO}}</td>
            <td style="border:1px solid #111;padding:3px;text-align:center;">{{DATA_INICIO_CURSO}}</td>
            <td style="border:1px solid #111;padding:3px;text-align:center;">{{DATA_CONCLUSAO_CURSO}}</td>
            <td style="border:1px solid #111;padding:3px;text-align:center;">{{DATA_EXPEDICAO_DIPLOMA}}</td>
          </tr>
        </tbody>
      </table>

      <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 5px;font-size:7px;line-height:1.1;">
        <tbody>
          <tr>
            <th style="width:16%;border:1px solid #111;padding:2px;">MATRÍCULA</th>
            <th style="width:48%;border:1px solid #111;padding:2px;">NOME DO ALUNO</th>
            <th style="width:12%;border:1px solid #111;padding:2px;">SEXO</th>
            <th style="width:24%;border:1px solid #111;padding:2px;">DATA DE NASCIMENTO</th>
          </tr>
          <tr>
            <td style="border:1px solid #111;padding:3px;">{{ALUNO_MATRICULA}}</td>
            <td style="border:1px solid #111;padding:3px;">{{ALUNO_NOME}}</td>
            <td style="border:1px solid #111;padding:3px;text-align:center;">{{ALUNO_SEXO}}</td>
            <td style="border:1px solid #111;padding:3px;text-align:center;">{{ALUNO_NASCIMENTO}}</td>
          </tr>
          <tr>
            <th style="border:1px solid #111;padding:2px;">NATURALIDADE</th>
            <th style="border:1px solid #111;padding:2px;">NACIONALIDADE</th>
            <th colspan="2" style="border:1px solid #111;padding:2px;">FILIAÇÃO</th>
          </tr>
          <tr>
            <td style="border:1px solid #111;padding:3px;">{{ALUNO_NATURALIDADE}}</td>
            <td style="border:1px solid #111;padding:3px;">{{ALUNO_NACIONALIDADE}}</td>
            <td colspan="2" style="border:1px solid #111;padding:3px;">Pai: {{ALUNO_PAI}} · Mãe: {{ALUNO_MAE}}</td>
          </tr>
        </tbody>
      </table>

      <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 5px;font-size:6.5px;line-height:1.1;">
        <tbody>
          <tr>
            <th style="border:1px solid #111;padding:2px;">RG</th>
            <th style="border:1px solid #111;padding:2px;">ÓRG. EXP.</th>
            <th style="border:1px solid #111;padding:2px;">CPF</th>
            <th style="border:1px solid #111;padding:2px;">TÍTULO ELEITOR</th>
            <th style="border:1px solid #111;padding:2px;">ZONA</th>
            <th style="border:1px solid #111;padding:2px;">SEÇÃO</th>
            <th style="border:1px solid #111;padding:2px;">CERT. MILITAR</th>
          </tr>
          <tr>
            <td style="border:1px solid #111;padding:3px;">{{ALUNO_RG}}</td>
            <td style="border:1px solid #111;padding:3px;">{{ALUNO_RG_ORGAO}}</td>
            <td style="border:1px solid #111;padding:3px;">{{ALUNO_CPF}}</td>
            <td style="border:1px solid #111;padding:3px;">{{ALUNO_TITULO_ELEITOR}}</td>
            <td style="border:1px solid #111;padding:3px;text-align:center;">{{ALUNO_TITULO_ZONA}}</td>
            <td style="border:1px solid #111;padding:3px;text-align:center;">{{ALUNO_TITULO_SECAO}}</td>
            <td style="border:1px solid #111;padding:3px;">{{ALUNO_RESERVISTA}}</td>
          </tr>
          <tr>
            <th colspan="5" style="border:1px solid #111;padding:2px;">ESCOLA ONDE CONCLUIU O ENSINO MÉDIO</th>
            <th colspan="2" style="border:1px solid #111;padding:2px;">ANO DE CONCLUSÃO</th>
          </tr>
          <tr>
            <td colspan="5" style="border:1px solid #111;padding:3px;">{{ENSINO_MEDIO_ESCOLA}}</td>
            <td colspan="2" style="border:1px solid #111;padding:3px;text-align:center;">{{ENSINO_MEDIO_ANO_CONCLUSAO}}</td>
          </tr>
        </tbody>
      </table>

      <h3 style="margin:4px 0 3px;text-align:center;font-size:9px;line-height:1.1;">UNIDADES CURRICULARES</h3>
      {{TABELA_HISTORICO_ESCOLAR}}

      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:3px;font-size:6.5px;line-height:1.15;">
        <div>Legenda: T – Teoria · P – Prática · E – Estágio · T/P – Teoria/Prática</div>
        <strong>Carga Horária Total do Curso: {{CARGA_HORARIA_TOTAL}} horas</strong>
      </div>
      <p style="margin:3px 0 0;text-align:center;font-size:7px;">{{CIDADE_POLO}}/{{POLO_UF}}, {{DATA_ATUAL}}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:12px;text-align:center;font-size:7px;">
        <div style="border-top:1px solid #111;padding-top:2px;">Secretaria Escolar</div>
        <div style="border-top:1px solid #111;padding-top:2px;">Diretoria Geral</div>
      </div>
    </section>

    <div data-page-break="true"></div>

    <section style="font-family:Arial,Helvetica,sans-serif;color:#000;font-size:10px;line-height:1.35;">
      <h3 style="margin:0 0 12px;text-align:center;font-size:14px;">INFORMAÇÕES COMPLEMENTARES DO HISTÓRICO</h3>
      <p style="margin:0 0 18px;"><strong>Titular:</strong> {{ALUNO_NOME}}</p>
      <p style="margin:0 0 12px;"><strong>EIXO TECNOLÓGICO:</strong> {{EIXO_TECNOLOGICO}}</p>
      <p style="margin:0 0 22px;"><strong>CURSO DE NÍVEL TÉCNICO EM:</strong> {{CURSO_NOME}}</p>

      <section style="border:1px solid #111;margin-bottom:24px;">
        <h4 style="margin:0;padding:6px;border-bottom:1px solid #111;text-align:center;font-size:11px;">PERFIL PROFISSIONAL DE CONCLUSÃO</h4>
        <p style="min-height:125px;margin:0;padding:10px;text-align:justify;font-size:10px;line-height:1.6;">{{PERFIL_PROFISSIONAL_CONCLUSAO}}</p>
      </section>

      <h4 style="margin:0 0 7px;text-align:center;font-size:11px;">RESERVADO AO ESTABELECIMENTO</h4>
      <div style="height:255px;border:1px solid #111;"></div>

      <p style="margin:28px 0 0;text-align:center;font-size:10px;">{{CIDADE_POLO}}/{{POLO_UF}}, {{DATA_ATUAL}}</p>
      <div style="margin-top:34px;border-top:3px double #38a9db;padding-top:6px;text-align:center;font-size:7px;line-height:1.35;color:#475569;">
        {{POLO_ENDERECO_COMPLETO}}<br>
        Contato: {{POLO_TELEFONE}} · E-mail: {{POLO_EMAIL}}<br>
        CNPJ: {{POLO_CNPJ}}
      </div>
    </section>
  `,
  absoluteFields: [],
  validityDays: 365,
  pageCount: 2,
  v: HISTORICO_TEMPLATE_VERSION,
};

const baseHistoricoService = createDocumentTemplateService(
  'historico',
  historicoDefaultTemplate,
  { sharedTemplate: true },
);

const isLegacyHistoricoTemplate = (template: any) => {
  const content = String(template?.textContent || '');
  return Number(template?.v || 0) < HISTORICO_TEMPLATE_VERSION
    || Number(template?.pageCount || 1) < 2
    || !content.includes('data-page-break')
    || !content.includes('{{EIXO_TECNOLOGICO}}')
    || !content.includes('{{ENSINO_MEDIO_ESCOLA}}');
};

export const historicoService = {
  ...baseHistoricoService,
  async getTemplate(poloId: string) {
    const template = await baseHistoricoService.getTemplate(poloId);
    if (isLegacyHistoricoTemplate(template)) {
      return JSON.parse(JSON.stringify(historicoDefaultTemplate));
    }
    return {
      ...template,
      pageCount: Math.max(2, Number(template.pageCount || 2)),
      absoluteFields: Array.isArray(template.absoluteFields) ? template.absoluteFields : [],
    };
  },
};
