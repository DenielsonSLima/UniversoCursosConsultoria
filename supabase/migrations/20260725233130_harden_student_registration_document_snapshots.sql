-- Torna a emissão de Pasta de Identificação e Ficha de Matrícula autoritativa:
-- o banco valida o modelo e congela dados cadastrais e layout sem confiar no navegador.

insert into public.documentos_templates (id, conteudo, updated_at)
values (
  'pasta_identificacao_aluno',
  $layout${"textContent":"\n    <section style=\"display:flex;gap:18px;align-items:center;border-bottom:3px solid #2563eb;padding-bottom:12px;margin-bottom:18px;\">\n      <div style=\"flex:1;\">\n        <h3 style=\"margin:0;color:#001a33;font-size:24px;text-transform:uppercase;\">Pasta de Identificação do Aluno</h3>\n        <p style=\"margin:5px 0 0;color:#64748b;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;\">Documento geral • dados do polo da matrícula</p>\n      </div>\n      \n  <div style=\"width:90px;height:120px;border:2px solid #cbd5e1;border-radius:10px;background-color:#f8fafc;display:flex;align-items:center;justify-content:center;overflow:hidden;\">\n    <img src=\"{{ALUNO_FOTO_URL}}\" alt=\"Foto 3x4 do aluno\" style=\"width:100%;height:100%;object-fit:cover;\" />\n  </div>\n\n    </section>\n\n    <section style=\"display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px 16px;border:1px solid #cbd5e1;border-radius:12px;padding:12px;margin-bottom:12px;background-color:rgba(255,255,255,.82);\">\n      \n  <div style=\"grid-column:span 2;\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Nome completo</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_NOME}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Sexo</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_SEXO}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Matrícula</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_MATRICULA}}</span>\n  </div>\n\n      \n  <div style=\"grid-column:span 2;\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Curso</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{CURSO_NOME}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Turma / Turno</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{TURMA_NOME}} • {{CURSO_TURNO}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Raça / Cor</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_RACA_COR}}</span>\n  </div>\n\n    </section>\n\n    <h4 style=\"font-size:12px;text-transform:uppercase;color:#001a33;border-bottom:2px solid #dbeafe;padding-bottom:5px;margin:14px 0 8px;\">Identificação e filiação</h4>\n    <section style=\"display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px 16px;border:1px solid #e2e8f0;border-radius:12px;padding:12px;background-color:rgba(255,255,255,.82);\">\n      \n  <div style=\"grid-column:span 2;\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Nome da mãe</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_MAE}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Nascimento</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_NASCIMENTO}}</span>\n  </div>\n\n      \n  <div style=\"grid-column:span 2;\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Nome do pai</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_PAI}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Nacionalidade</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_NACIONALIDADE}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Naturalidade</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_NATURALIDADE}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">UF</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_UF}}</span>\n  </div>\n\n      \n  <div style=\"grid-column:span 2;\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Necessidades especiais</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_PCD}} • {{ALUNO_PCD_TIPO}}</span>\n  </div>\n\n    </section>\n\n    <h4 style=\"font-size:12px;text-transform:uppercase;color:#001a33;border-bottom:2px solid #dbeafe;padding-bottom:5px;margin:14px 0 8px;\">Endereço e contato</h4>\n    <section style=\"display:grid;grid-template-columns:2fr .65fr 1fr;gap:10px 16px;border:1px solid #e2e8f0;border-radius:12px;padding:12px;background-color:rgba(255,255,255,.82);\">\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Logradouro</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_LOGRADOURO}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Número</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_NUMERO}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Complemento</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_COMPLEMENTO}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Bairro</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_BAIRRO}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Cidade / UF</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_CIDADE}} / {{ALUNO_UF}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">CEP</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_CEP}}</span>\n  </div>\n\n      \n  <div style=\"grid-column:span 2;\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">E-mail</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_EMAIL}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Telefone / WhatsApp</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_TELEFONE}}</span>\n  </div>\n\n    </section>\n\n    <h4 style=\"font-size:12px;text-transform:uppercase;color:#001a33;border-bottom:2px solid #dbeafe;padding-bottom:5px;margin:14px 0 8px;\">Documentos</h4>\n    <section style=\"display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:10px 16px;border:1px solid #e2e8f0;border-radius:12px;padding:12px;background-color:rgba(255,255,255,.82);\">\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">CPF</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_CPF}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">RG / Documento</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_RG}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Tipo</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_TIPO_DOCUMENTO}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Órgão / UF</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Data de emissão</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_RG_EMISSAO}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Título eleitoral</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_TITULO_ELEITOR}}</span>\n  </div>\n\n    </section>\n\n    <p style=\"margin-top:20px;border-top:3px solid #dc2626;padding-top:8px;text-align:center;color:#64748b;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;\">\n      {{POLO_NOME}} • Gerado em {{DATA_GERACAO}}\n    </p>\n  ","absoluteFields":[],"validityDays":0,"pageCount":1,"v":3}$layout$::jsonb,
  now()
)
on conflict (id) do nothing;

update public.modelos_fichas
set
  template_config = $layout${"textContent":"\n    <section style=\"display:flex;gap:18px;align-items:center;border-bottom:3px solid #2563eb;padding-bottom:12px;margin-bottom:14px;\">\n      \n  <div style=\"width:90px;height:120px;border:2px solid #cbd5e1;border-radius:10px;background-color:#f8fafc;display:flex;align-items:center;justify-content:center;overflow:hidden;\">\n    <img src=\"{{ALUNO_FOTO_URL}}\" alt=\"Foto 3x4 do aluno\" style=\"width:100%;height:100%;object-fit:cover;\" />\n  </div>\n\n      <div style=\"flex:1;\">\n        <p style=\"margin:0 0 4px;color:#64748b;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;\">Ficha de Matrícula • {{DATA_GERACAO}}</p>\n        <h3 style=\"margin:0;color:#001a33;font-size:23px;text-transform:uppercase;\">{{ALUNO_NOME}}</h3>\n        <p style=\"margin:5px 0 0;color:#475569;font-size:11px;font-weight:800;text-transform:uppercase;\">{{CURSO_NOME}} • {{TURMA_NOME}} • {{CURSO_TURNO}}</p>\n      </div>\n    </section>\n\n    <h4 style=\"font-size:12px;text-transform:uppercase;color:#001a33;margin:0 0 7px;\">Identificação do aluno</h4>\n    <section style=\"display:grid;grid-template-columns:2fr 1fr 1fr;gap:9px 15px;border:1px solid #cbd5e1;border-radius:11px;padding:11px;background-color:rgba(255,255,255,.82);\">\n      \n  <div style=\"grid-column:span 2;\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Nome completo</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_NOME}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Sexo</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_SEXO}}</span>\n  </div>\n\n      \n  <div style=\"grid-column:span 2;\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Filiação — Mãe</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_MAE}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Nascimento</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_NASCIMENTO}}</span>\n  </div>\n\n      \n  <div style=\"grid-column:span 2;\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Filiação — Pai</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_PAI}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Naturalidade / UF</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_NATURALIDADE}} / {{ALUNO_UF}}</span>\n  </div>\n\n      \n  <div style=\"grid-column:span 3;\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Necessidades especiais</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_PCD}} • {{ALUNO_PCD_TIPO}}</span>\n  </div>\n\n    </section>\n\n    <h4 style=\"font-size:12px;text-transform:uppercase;color:#001a33;margin:12px 0 7px;\">Endereço e contato</h4>\n    <section style=\"display:grid;grid-template-columns:2fr .6fr 1fr;gap:9px 15px;border:1px solid #e2e8f0;border-radius:11px;padding:11px;background-color:rgba(255,255,255,.82);\">\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Logradouro</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_LOGRADOURO}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Nº</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_NUMERO}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">CEP</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_CEP}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Bairro</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_BAIRRO}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Cidade / UF</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_CIDADE}} / {{ALUNO_UF}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Telefone</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_TELEFONE}}</span>\n  </div>\n\n      \n  <div style=\"grid-column:span 3;\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">E-mail</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_EMAIL}}</span>\n  </div>\n\n    </section>\n\n    <h4 style=\"font-size:12px;text-transform:uppercase;color:#001a33;margin:12px 0 7px;\">Documentação e dados acadêmicos</h4>\n    <section style=\"display:grid;grid-template-columns:repeat(4,1fr);gap:9px 15px;border:1px solid #e2e8f0;border-radius:11px;padding:11px;background-color:rgba(255,255,255,.82);\">\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">CPF</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_CPF}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">RG</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_RG}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Órgão / UF</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Emissão</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_RG_EMISSAO}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Matrícula</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{ALUNO_MATRICULA}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Modalidade</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{CURSO_MODALIDADE}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Status</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{MATRICULA_STATUS}}</span>\n  </div>\n\n      \n  <div style=\"\">\n    <strong style=\"display:block;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;\">Polo</strong>\n    <span style=\"font-size:12px;color:#0f172a;font-weight:700;\">{{POLO_NOME}}</span>\n  </div>\n\n    </section>\n\n    <section style=\"margin-top:13px;border:1px solid #bfdbfe;border-radius:11px;padding:11px;background-color:rgba(239,246,255,.82);font-size:11px;line-height:1.5;color:#0f172a;text-align:justify;\">\n      {{FICHA_TERMO}}\n    </section>\n\n    {{FICHA_CAMPOS_EXTRAS}}\n    {{FICHA_ASSINATURAS}}\n    <p style=\"margin-top:20px;text-align:right;color:#475569;font-size:10px;font-weight:700;\">{{LOCAL_DOCUMENTO}}, {{DATA_ATUAL}}</p>\n  ","absoluteFields":[],"validityDays":0,"pageCount":1,"enrollmentFormTerm":"Solicito minha matrícula no curso acima identificado e declaro que os dados informados são verdadeiros. Estou ciente das normas acadêmicas e administrativas da unidade.","enrollmentFormCustomFields":[],"enrollmentFormRequiresSignature":true,"v":3}$layout$::jsonb,
  updated_at = now()
where template_config is null;

create or replace function public.emitir_ficha_validacao_portal(
  p_documento text,
  p_matricula_id uuid,
  p_periodo_referencia text default null,
  p_emitido_por uuid default null,
  p_registrar_reemissao boolean default false,
  p_dados_emissao jsonb default '{}'::jsonb
)
returns table(
  codigo text,
  documento text,
  emitido_em timestamptz,
  ultima_emissao_em timestamptz,
  validade_ate timestamptz,
  status text,
  quantidade_emissoes integer,
  reutilizado boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enrollment record;
  v_model record;
  v_model_id uuid;
  v_template jsonb;
  v_snapshot jsonb;
  v_issue record;
begin
  if p_documento not in ('pasta_identificacao', 'ficha_matricula') then
    raise exception 'Documento incompatível com a emissão de ficha cadastral.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_dados_emissao, '{}'::jsonb)) <> 'object' then
    raise exception 'Os dados auxiliares da ficha devem ser um objeto JSON.'
      using errcode = '22023';
  end if;

  select
    m.id as enrollment_id,
    m.status as enrollment_status,
    m.data_matricula as enrollment_date,
    p.nome as student_name,
    p.nome_social as student_social_name,
    p.cpf_cnpj as student_cpf,
    p.data_nascimento as student_birth_date,
    p.foto_url as student_photo_url,
    p.email as student_email,
    p.telefone as student_phone,
    p.sexo as student_sex,
    p.estado_civil as student_marital_status,
    p.raca_cor as student_race_color,
    p.rg as student_rg,
    p.tipo_documento as student_document_type,
    p.orgao_emissor as student_rg_issuer,
    p.rg_uf_emissao as student_rg_state,
    p.rg_data_emissao as student_rg_issue_date,
    p.nacionalidade as student_nationality,
    p.naturalidade as student_birthplace,
    p.titulo_eleitor as student_voter_id,
    p.reservista as student_reservist,
    p.nome_mae as student_mother_name,
    p.nome_pai as student_father_name,
    p.pcd as student_pcd,
    p.pcd_tipo as student_pcd_type,
    p.cep as student_zip_code,
    p.endereco as student_street,
    p.numero as student_address_number,
    p.complemento as student_address_complement,
    p.bairro as student_district,
    p.cidade as student_city,
    p.uf as student_state,
    p.responsavel_nome as student_responsible_name,
    p.responsavel_cpf as student_responsible_cpf,
    p.responsavel_parentesco as student_responsible_relation,
    p.responsavel_telefone as student_responsible_phone,
    p.observacao as student_notes,
    t.polo_id,
    t.nome as class_name,
    t.turno as class_shift,
    c.id as course_id,
    c.nome as course_name,
    c.modalidade as course_modality,
    unit.nome as unit_name
  into v_enrollment
  from public.matriculas as m
  join public.parceiros as p on p.id = m.aluno_id
  join public.turmas as t on t.id = m.turma_id
  join public.cursos as c on c.id = t.curso_id
  left join public.polos as unit on unit.id = t.polo_id
  where m.id = p_matricula_id
  for share of m, p, t, c;

  if not found then
    raise exception 'Matrícula, aluno, turma ou curso não localizado.';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_manage_secretaria_document(p_documento, v_enrollment.polo_id)
  then
    raise exception 'Acesso à emissão desta ficha não autorizado.'
      using errcode = '42501';
  end if;

  if p_documento = 'ficha_matricula' then
    if nullif(btrim(coalesce(p_periodo_referencia, '')), '') is null then
      raise exception 'Selecione um modelo ativo de ficha de matrícula.'
        using errcode = '22023';
    end if;

    begin
      v_model_id := p_periodo_referencia::uuid;
    exception
      when invalid_text_representation then
        raise exception 'O identificador do modelo de ficha é inválido.'
          using errcode = '22023';
    end;

    select
      model.id,
      model.nome,
      model.tipo_curso,
      model.status,
      model.requer_assinatura,
      model.texto_contrato,
      model.campos_customizados,
      model.curso_especifico_id,
      model.template_config
    into v_model
    from public.modelos_fichas as model
    where model.id = v_model_id
    for share;

    if not found or upper(coalesce(v_model.status, '')) <> 'ATIVO' then
      raise exception 'O modelo selecionado não está ativo ou foi removido.'
        using errcode = '22023';
    end if;

    if v_model.curso_especifico_id is not null
      and v_model.curso_especifico_id <> v_enrollment.course_id
    then
      raise exception 'O modelo selecionado não pertence ao curso desta matrícula.'
        using errcode = '22023';
    end if;

    if upper(btrim(coalesce(v_model.tipo_curso, 'TODOS'))) <> 'TODOS'
      and upper(btrim(v_model.tipo_curso)) <> upper(btrim(coalesce(v_enrollment.course_modality, '')))
    then
      raise exception 'O modelo selecionado não é compatível com a modalidade desta matrícula.'
        using errcode = '22023';
    end if;

    v_template :=
      coalesce(v_model.template_config, '{}'::jsonb)
      || jsonb_build_object(
        'enrollmentFormTerm', coalesce(v_model.texto_contrato, ''),
        'enrollmentFormCustomFields', coalesce(v_model.campos_customizados, '[]'::jsonb),
        'enrollmentFormRequiresSignature', coalesce(v_model.requer_assinatura, true)
      );

    if jsonb_typeof(v_template) <> 'object'
      or nullif(btrim(coalesce(v_template ->> 'textContent', '')), '') is null
    then
      raise exception 'O modelo selecionado ainda não possui um layout válido.'
        using errcode = '22023';
    end if;
  else
    select template.conteudo
    into v_template
    from public.documentos_templates as template
    where template.id = 'pasta_identificacao_aluno'
    for share;

    if not found
      or jsonb_typeof(v_template) <> 'object'
      or nullif(btrim(coalesce(v_template ->> 'textContent', '')), '') is null
    then
      raise exception 'O modelo geral da Pasta de Identificação não está configurado.'
        using errcode = '22023';
    end if;
  end if;

  v_snapshot := jsonb_build_object(
    'studentName', coalesce(v_enrollment.student_name, ''),
    'studentSocialName', coalesce(v_enrollment.student_social_name, ''),
    'studentCpf', coalesce(v_enrollment.student_cpf, ''),
    'studentBirthDate', coalesce(v_enrollment.student_birth_date::text, ''),
    'studentPhotoUrl', v_enrollment.student_photo_url,
    'studentEmail', coalesce(v_enrollment.student_email, ''),
    'studentPhone', coalesce(v_enrollment.student_phone, ''),
    'studentSex', coalesce(v_enrollment.student_sex, ''),
    'studentMaritalStatus', coalesce(v_enrollment.student_marital_status, ''),
    'studentRaceColor', coalesce(v_enrollment.student_race_color, ''),
    'studentRg', coalesce(v_enrollment.student_rg, ''),
    'studentDocumentType', coalesce(v_enrollment.student_document_type, ''),
    'studentRgIssuer', coalesce(v_enrollment.student_rg_issuer, ''),
    'studentRgState', coalesce(v_enrollment.student_rg_state, ''),
    'studentRgIssueDate', coalesce(v_enrollment.student_rg_issue_date::text, ''),
    'studentNationality', coalesce(v_enrollment.student_nationality, ''),
    'studentBirthplace', coalesce(v_enrollment.student_birthplace, ''),
    'studentVoterId', coalesce(v_enrollment.student_voter_id, ''),
    'studentReservist', coalesce(v_enrollment.student_reservist, ''),
    'studentMotherName', coalesce(v_enrollment.student_mother_name, ''),
    'studentFatherName', coalesce(v_enrollment.student_father_name, ''),
    'studentPcd', case when coalesce(v_enrollment.student_pcd, false) then 'SIM' else 'NÃO' end,
    'studentPcdType', coalesce(v_enrollment.student_pcd_type, ''),
    'studentZipCode', coalesce(v_enrollment.student_zip_code, ''),
    'studentStreet', coalesce(v_enrollment.student_street, ''),
    'studentAddressNumber', coalesce(v_enrollment.student_address_number, ''),
    'studentAddressComplement', coalesce(v_enrollment.student_address_complement, ''),
    'studentDistrict', coalesce(v_enrollment.student_district, ''),
    'studentCity', coalesce(v_enrollment.student_city, ''),
    'studentState', coalesce(v_enrollment.student_state, ''),
    'studentResponsibleName', coalesce(v_enrollment.student_responsible_name, ''),
    'studentResponsibleCpf', coalesce(v_enrollment.student_responsible_cpf, ''),
    'studentResponsibleRelation', coalesce(v_enrollment.student_responsible_relation, ''),
    'studentResponsiblePhone', coalesce(v_enrollment.student_responsible_phone, ''),
    'studentNotes', coalesce(v_enrollment.student_notes, ''),
    'courseName', coalesce(v_enrollment.course_name, ''),
    'courseModality', coalesce(v_enrollment.course_modality, ''),
    'classShift', coalesce(v_enrollment.class_shift, ''),
    'className', coalesce(v_enrollment.class_name, ''),
    'unitName', coalesce(v_enrollment.unit_name, ''),
    'enrollmentStatus', coalesce(v_enrollment.enrollment_status, ''),
    'enrollmentDate', coalesce(v_enrollment.enrollment_date::text, ''),
    'documentTemplateId', case
      when p_documento = 'ficha_matricula' then v_model_id::text
      else 'pasta_identificacao_aluno'
    end,
    'documentTemplateName', case
      when p_documento = 'ficha_matricula' then v_model.nome
      else 'Pasta de Identificação Geral'
    end,
    'documentTemplateSnapshot', v_template
  );

  select issued.*
  into v_issue
  from public.emitir_documento_validacao_portal(
    p_documento,
    p_matricula_id,
    p_periodo_referencia,
    null,
    null,
    p_emitido_por,
    p_registrar_reemissao
  ) as issued;

  if v_issue.codigo is null then
    raise exception 'A emissão não retornou um código de validação.';
  end if;

  update public.documentos_validacao as validation
  set dados_emissao =
    coalesce(validation.dados_emissao, '{}'::jsonb)
    || v_snapshot
  where validation.codigo = v_issue.codigo;

  if not found then
    raise exception 'O snapshot não pôde ser associado ao documento emitido.';
  end if;

  codigo := v_issue.codigo;
  documento := v_issue.documento;
  emitido_em := v_issue.emitido_em;
  ultima_emissao_em := v_issue.ultima_emissao_em;
  validade_ate := v_issue.validade_ate;
  status := v_issue.status;
  quantidade_emissoes := v_issue.quantidade_emissoes;
  reutilizado := v_issue.reutilizado;
  return next;
end;
$function$;

revoke all on function public.emitir_ficha_validacao_portal(
  text, uuid, text, uuid, boolean, jsonb
) from public, anon;
grant execute on function public.emitir_ficha_validacao_portal(
  text, uuid, text, uuid, boolean, jsonb
) to authenticated, service_role;
