-- Executar após as migrations candidatas, em ambiente isolado. Dados sintéticos.
begin;
do $test$
declare
  v_student jsonb := jsonb_build_object('aluno', jsonb_build_object(
    'nome', 'Aluno de Teste', 'cpf', '00000000000', 'nascimento', '2008-10-13',
    'telefone', 'Contato de teste',
    'responsavel', jsonb_build_object('nome', 'Responsável de Teste', 'cpf', '11111111111')
  ));
  v_party jsonb;
  v_snapshot jsonb;
  v_text text;
  v_failed boolean;
begin
  v_party := internal_academic.contract_party_snapshot(v_student, date '2026-10-13');
  assert v_party #>> '{contratante,tipo}' = 'ALUNO', 'maioridade na data da emissão';
  assert v_party #>> '{contratante,nome}' = 'Aluno de Teste', 'contato opcional não assume contrato';
  assert v_party #>> '{contratante,cpf}' = '000.000.000-00', 'máscara de CPF da própria parte';
  assert v_party #> '{aluno,responsavel}' = v_student #> '{aluno,responsavel}', 'cadastro original preservado';
  assert not (v_party -> 'contratante' ? 'endereco'), 'endereço de terceiro não presumido';

  v_party := internal_academic.contract_party_snapshot(v_student, date '2026-10-12');
  assert v_party #>> '{contratante,tipo}' = 'RESPONSAVEL_LEGAL', 'menor na véspera do aniversário';
  assert v_party #>> '{contratante,nome}' = 'Responsável de Teste';
  assert v_party #>> '{contratante,cpf}' = '111.111.111-11';
  assert v_party #>> '{contratante,telefone}' is null, 'telefone não mistura pessoas';
  v_party := internal_academic.contract_party_snapshot(v_student,
    (timestamptz '2026-10-13 01:00:00+00' at time zone 'America/Maceio')::date);
  assert v_party #>> '{contratante,tipo}' = 'RESPONSAVEL_LEGAL',
    'maioridade acompanha data institucional, não virada antecipada em UTC';

  v_failed := false;
  begin
    perform internal_academic.contract_party_snapshot(v_student #- '{aluno,responsavel,cpf}', date '2026-10-12');
  exception when sqlstate '22023' then v_failed := true;
  end;
  assert v_failed, 'menor sem CPF do responsável deve bloquear';
  v_failed := false;
  begin
    perform internal_academic.contract_party_snapshot(v_student #- '{aluno,nascimento}', date '2026-10-13');
  exception when sqlstate '22023' then v_failed := true;
  end;
  assert v_failed, 'nascimento ausente não presume maioridade';
  v_failed := false;
  begin
    perform internal_academic.contract_party_snapshot(
      jsonb_set(v_student, '{aluno,nascimento}', '"2027-01-01"'), date '2026-10-13');
  exception when sqlstate '22023' then v_failed := true;
  end;
  assert v_failed, 'data de nascimento futura deve bloquear';

  v_snapshot := v_party || jsonb_build_object('financeiro', jsonb_build_object(
    'quantidadeCiclos', 2, 'quantidadeMatriculas', 1, 'quantidadeRematriculas', 0,
    'valorTotalMatriculasExibicao', 'R$ 0,00', 'valorTotalRematriculasExibicao', 'R$ 0,00',
    'valorTotalMensalidadesExibicao', 'R$ 4.800,00', 'valorTotalContratoExibicao', 'R$ 4.800,00',
    'planoPagamentoExibicao', 'Ciclo 1: 12 parcelas de R$ 200,00; ciclo 2: 12 parcelas de R$ 200,00',
    'condicoesExibicao', 'Juros de 1% ao mês. Multa de 2%, uma única vez.',
    'jurosAtrasoExibicao', 'R$ 1,00', 'multaAtrasoExibicao', 'R$ 4,00'
  ));
  v_text := internal_academic.contract_individual_terms_text(
    E'CONTRATANTE: {{contratante.nome}}\nCPF: {{contratante.cpf}}\nContato: {{contratante.telefone}}\n\n'
    || 'Ciclos: {{financeiro.quantidadeCiclos}}; rematrículas: {{financeiro.quantidadeRematriculas}}; '
    || 'total: {{financeiro.valorTotalContrato}}. {{financeiro.planoPagamento}}. {{financeiro.condicoes}}',
    v_snapshot
  );
  assert position('{{' in v_text) = 0, 'tokens novos devem ser resolvidos';
  assert position('Contato:' in v_text) = 0, 'contato opcional sem valor deve ser omitido';
  assert position('rematrículas: 0' in v_text) > 0, 'zero é valor, não ausência';
  assert position('1% ao mês' in v_text) > 0 and position('R$ 1,00' in v_text) = 0,
    'juros usam condição tipada, não a representação monetária antiga';
  assert internal_academic.contract_individual_terms_text(
    '{{financeiro.condicoes}} | {{aluno.responsavel.nome}}', '{"aluno":{}}'
  ) = '{{financeiro.condicoes}} | {{aluno.responsavel.nome}}', 'snapshot legado permanece compatível';
  v_text := 'Endereço: Rua Teste, {{aluno.endereco.numero}}, CEP 00000-000. '
    || 'Instituição: Rua Teste, nº {{instituicao.numero}}, bairro Teste.';
  assert internal_academic.contract_individual_terms_text(v_text,
    '{"instituicao":{"presentationVersion":"CONTRATO_A4_INSTITUCIONAL_V4_LEGIVEL","numero":""}}'
  ) = 'Endereço: Rua Teste, CEP 00000-000. Instituição: Rua Teste, bairro Teste.',
    'número ausente não vira S/N nem deixa rótulo vazio';
  assert internal_academic.contract_individual_terms_text(v_text,
    '{"aluno":{"endereco":{"numero":"S/N"}},"instituicao":{"numero":"S/N","presentationVersion":"CONTRATO_A4_INSTITUCIONAL_V4_LEGIVEL"}}'
  ) = v_text, 'S/N explicitamente cadastrado continua para o renderer';
  assert internal_academic.contract_individual_terms_text(v_text, '{}') = v_text,
    'apresentação histórica do endereço permanece intocada';
  v_failed := false;
  begin
    perform internal_academic.contract_individual_terms_text('{{financeiro.valorTotalContrato}}', '{}');
  exception when sqlstate '22023' then v_failed := true;
  end;
  assert v_failed, 'modelo novo sem plano completo não emite valor presumido';
end;
$test$;
rollback;
