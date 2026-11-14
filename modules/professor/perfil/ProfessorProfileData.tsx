import React from 'react';
import { Landmark } from 'lucide-react';
import InstitutionalSelect from '../../shared/components/InstitutionalSelect';
import { maskProfessorProfileDate, PROFESSOR_PROFILE_UFS, type ProfessorProfileForm } from './professor-profile.model';

interface Props {
  profile: Record<string, any>;
  values: ProfessorProfileForm;
  editing: boolean;
  busy: boolean;
  onField: (key: keyof ProfessorProfileForm, value: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent) => void;
}
const documents = [
  { value: 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO', label: 'Carteira Nacional de Identificação' },
  ...['RG', 'CNH', 'PASSAPORTE', 'CARTEIRA PROFISSIONAL', 'OUTRO'].map((value) => ({ value, label: value === 'OUTRO' ? 'Outro documento oficial' : value })),
];
const councils = ['COREN', 'CRF', 'CREFITO', 'CRM', 'CRN', 'CRO', 'CRP', 'CREA', 'CAU', 'OAB', 'OUTRO'];

const ProfessorProfileData: React.FC<Props> = ({ profile, values, editing, busy, onField, onEdit, onCancel, onSubmit }) => {
  const field = (
    name: keyof ProfessorProfileForm,
    label: string,
    options: { wide?: boolean; placeholder?: string; maxLength?: number; transform?: (value: string) => string } = {},
  ) => (
    <div className={`professor-field ${options.wide ? 'sm:col-span-2' : ''}`}>
      <label htmlFor={`profile-${name}`}>{label}</label>
      {editing ? (
        <input
          id={`profile-${name}`}
          name={name}
          value={values[name]}
          placeholder={options.placeholder}
          maxLength={options.maxLength}
          onChange={(event) => onField(name, options.transform?.(event.target.value) ?? event.target.value)}
          className="professor-input"
        />
      ) : <p>{values[name] || 'Não informado'}</p>}
    </div>
  );
  const choice = (
    name: keyof ProfessorProfileForm,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <div className="professor-field">
      <label htmlFor={`profile-${name}`}>{label}</label>
      {editing ? (
        <InstitutionalSelect
          id={`profile-${name}`}
          ariaLabel={label}
          value={values[name]}
          options={options.some((option) => option.value === values[name]) || !values[name]
            ? options : [...options, { value: values[name], label: values[name] }]}
          onValueChange={(value) => onField(name, value)}
        />
      ) : <p>{options.find((option) => option.value === values[name])?.label || values[name] || 'Não informado'}</p>}
    </div>
  );
  return (
    <section className="pt-5">
      <div className="professor-heading">
        <div>
          <h3>Dados e pagamento</h3>
          <p>Contato, especialidade e recebimento de honorários.</p>
        </div>
        <button type="button" className="professor-button" disabled={busy} onClick={editing ? onCancel : onEdit}>
          {editing ? 'Cancelar' : 'Alterar dados'}
        </button>
      </div>
      <form onSubmit={onSubmit}>
        <fieldset disabled={busy} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {field('nomeCompleto', 'Nome completo', { wide: true })}
          <div className="professor-field"><label>CPF/CNPJ</label><p>{profile.cpf || profile.cnpj || 'Não cadastrado'}</p></div>
          {field('dataNascimento', 'Data de nascimento', { maxLength: 10, placeholder: 'DD/MM/AAAA', transform: maskProfessorProfileDate })}
          <div className="professor-field"><label>E-mail para contato</label><p>{profile.email || 'Não informado'}</p></div>
          {field('telefone', 'Telefone celular')}
          {choice('tipoDocumento', 'Tipo de documento', documents)}
          {field('rg', 'Número do documento', { placeholder: 'RG, CNH, CIN…' })}
          {field('orgaoEmissor', 'Órgão emissor', { placeholder: 'SSP, DETRAN…', transform: (value) => value.toUpperCase() })}
          {choice('rgUfEmissao', 'UF de emissão', [{ value: '', label: 'Não informado' }, ...PROFESSOR_PROFILE_UFS.map((value) => ({ value, label: value }))])}
          {field('rgDataEmissao', 'Data de emissão', { maxLength: 10, placeholder: 'DD/MM/AAAA', transform: maskProfessorProfileDate })}
          {field('especialidade', 'Especialidade / titulação', { wide: true, placeholder: 'Área de formação e especialidade' })}
          {choice('registroProfissional', 'Conselho / registro', [{ value: '', label: 'Não se aplica' }, ...councils.map((value) => ({ value, label: value }))])}
          {field('numeroRegistro', 'Número do registro', { placeholder: 'Ex.: COREN-SE 123456', transform: (value) => value.toUpperCase() })}
        </fieldset>
        <section className="mt-5 border-t border-slate-200 pt-5">
          <h4 className="mb-4 flex items-center gap-2"><Landmark size={16} />Dados para recebimento</h4>
          <fieldset disabled={busy} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {field('banco', 'Banco', { wide: true })}
            {field('agencia', 'Agência')}
            {field('conta', 'Conta')}
            {choice('tipoConta', 'Tipo de conta', [{ value: 'CORRENTE', label: 'Conta corrente' }, { value: 'POUPANCA', label: 'Conta poupança' }])}
            {field('chavePix', 'Chave Pix cadastrada', { wide: true, placeholder: 'E-mail, CPF, telefone ou chave aleatória' })}
          </fieldset>
        </section>
        {editing && (
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            <button type="button" className="professor-button" disabled={busy} onClick={onCancel}>Voltar</button>
            <button type="submit" className="professor-button professor-button--primary" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar dados'}
            </button>
          </div>
        )}
      </form>
    </section>
  );
};
export default ProfessorProfileData;
