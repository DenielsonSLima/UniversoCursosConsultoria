import React, { useEffect, useState } from 'react';
import {
  Camera,
  GraduationCap,
  IdCard,
  Mail,
  MapPin,
  Phone,
  Upload,
  User,
} from 'lucide-react';
import { PerfilData, PerfilUpdatePayload } from './perfil.types';

interface PerfilDadosTabProps {
  profile: PerfilData;
  saving: boolean;
  uploadingPhoto: boolean;
  onSave: React.Dispatch<PerfilUpdatePayload>;
  onPhotoUpload: React.Dispatch<File>;
}

interface TextFieldConfig {
  label: string;
  value: string;
  setter: React.Dispatch<React.SetStateAction<string>>;
  placeholder: string;
}

const read = (value: string | null | undefined, fallback = '—') => value || fallback;

const PerfilDadosTab: React.FC<PerfilDadosTabProps> = ({
  profile,
  saving,
  uploadingPhoto,
  onSave,
  onPhotoUpload,
}) => {
  const [editing, setEditing] = useState(false);
  const [telefone, setTelefone] = useState('');
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [sexo, setSexo] = useState('');
  const [estadoCivil, setEstadoCivil] = useState('');
  const [nacionalidade, setNacionalidade] = useState('');
  const [naturalidade, setNaturalidade] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState('CARTEIRA NACIONAL DE IDENTIFICAÇÃO');
  const [rg, setRg] = useState('');
  const [orgaoEmissor, setOrgaoEmissor] = useState('');
  const [rgUfEmissao, setRgUfEmissao] = useState('');
  const [rgDataEmissao, setRgDataEmissao] = useState('');
  const [nomeMae, setNomeMae] = useState('');
  const [nomePai, setNomePai] = useState('');
  const [escolaridadeAnterior, setEscolaridadeAnterior] = useState('');
  const [instituicaoOrigem, setInstituicaoOrigem] = useState('');
  const [anoConclusaoEnsinoMedio, setAnoConclusaoEnsinoMedio] = useState('');
  const [responsavelNome, setResponsavelNome] = useState('');
  const [responsavelCpf, setResponsavelCpf] = useState('');
  const [responsavelParentesco, setResponsavelParentesco] = useState('');
  const [responsavelTelefone, setResponsavelTelefone] = useState('');
  const [responsavelEmail, setResponsavelEmail] = useState('');
  const [responsavelFinanceiro, setResponsavelFinanceiro] = useState(false);

  useEffect(() => {
    setTelefone(profile?.telefone || '');
    setCep(profile?.cep || '');
    setEndereco(profile?.endereco || '');
    setNumero(profile?.numero || '');
    setBairro(profile?.bairro || '');
    setCidade(profile?.cidade || '');
    setUf(profile?.uf || '');
    setDataNascimento(profile?.dataNascimento || '');
    setSexo(profile?.sexo || '');
    setEstadoCivil(profile?.estadoCivil || '');
    setNacionalidade(profile?.nacionalidade || 'Brasileira');
    setNaturalidade(profile?.naturalidade || '');
    setTipoDocumento(profile?.tipoDocumento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO');
    setRg(profile?.rg || '');
    setOrgaoEmissor(profile?.orgaoEmissor || '');
    setRgUfEmissao(profile?.rgUfEmissao || '');
    setRgDataEmissao(profile?.rgDataEmissao || '');
    setNomeMae(profile?.nomeMae || '');
    setNomePai(profile?.nomePai || '');
    setEscolaridadeAnterior(profile?.escolaridadeAnterior || '');
    setInstituicaoOrigem(profile?.instituicaoOrigem || '');
    setAnoConclusaoEnsinoMedio(profile?.anoConclusaoEnsinoMedio || '');
    setResponsavelNome(profile?.responsavelNome || '');
    setResponsavelCpf(profile?.responsavelCpf || '');
    setResponsavelParentesco(profile?.responsavelParentesco || '');
    setResponsavelTelefone(profile?.responsavelTelefone || '');
    setResponsavelEmail(profile?.responsavelEmail || '');
    setResponsavelFinanceiro(Boolean(profile?.responsavelFinanceiro));
  }, [profile]);

  const supplementalFields: TextFieldConfig[] = [
    { label: 'Data de nascimento', value: dataNascimento, setter: setDataNascimento, placeholder: 'DD/MM/AAAA' },
    { label: 'Naturalidade', value: naturalidade, setter: setNaturalidade, placeholder: 'Cidade/UF' },
    { label: 'Nacionalidade', value: nacionalidade, setter: setNacionalidade, placeholder: 'Brasileira' },
    { label: 'Número do documento', value: rg, setter: setRg, placeholder: 'RG, CIN ou CNH' },
    { label: 'Órgão emissor', value: orgaoEmissor, setter: setOrgaoEmissor, placeholder: 'SSP, DETRAN...' },
    { label: 'UF emissão', value: rgUfEmissao, setter: setRgUfEmissao, placeholder: 'SE' },
    { label: 'Data emissão', value: rgDataEmissao, setter: setRgDataEmissao, placeholder: 'DD/MM/AAAA' },
    { label: 'Nome da mãe', value: nomeMae, setter: setNomeMae, placeholder: 'Nome completo' },
    { label: 'Nome do pai', value: nomePai, setter: setNomePai, placeholder: 'Opcional' },
    { label: 'Instituição de origem', value: instituicaoOrigem, setter: setInstituicaoOrigem, placeholder: 'Escola/faculdade anterior' },
    { label: 'Ano conclusão ensino médio', value: anoConclusaoEnsinoMedio, setter: setAnoConclusaoEnsinoMedio, placeholder: 'Ex: 2022' },
    { label: 'Responsável', value: responsavelNome, setter: setResponsavelNome, placeholder: 'Se aplicável' },
    { label: 'CPF responsável', value: responsavelCpf, setter: setResponsavelCpf, placeholder: '000.000.000-00' },
    { label: 'Telefone responsável', value: responsavelTelefone, setter: setResponsavelTelefone, placeholder: '(00) 00000-0000' },
    { label: 'E-mail responsável', value: responsavelEmail, setter: setResponsavelEmail, placeholder: 'responsavel@email.com' },
  ];

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSave({
      telefone,
      cep,
      endereco,
      numero,
      bairro,
      cidade,
      uf,
      dataNascimento,
      sexo,
      estadoCivil,
      nacionalidade,
      naturalidade,
      tipoDocumento,
      rg,
      orgaoEmissor,
      rgUfEmissao,
      rgDataEmissao,
      nomeMae,
      nomePai,
      escolaridadeAnterior,
      instituicaoOrigem,
      anoConclusaoEnsinoMedio,
      responsavelNome,
      responsavelCpf,
      responsavelParentesco,
      responsavelTelefone,
      responsavelEmail,
      responsavelFinanceiro,
    });
    setEditing(false);
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.8fr_2fr]">
      <aside className="space-y-4">
        <div className="rounded-[2.5rem] border border-blue-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Camera size={16} />
            </div>
            <h3 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Foto de perfil</h3>
          </div>

          <div className="mt-5 flex flex-col items-center text-center">
            <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-[2rem] border border-slate-100 bg-slate-50 text-blue-600 shadow-inner">
              {profile?.foto ? (
                <img src={profile.foto} alt="Foto de perfil do aluno" className="h-full w-full object-cover" />
              ) : (
                <User size={44} />
              )}
            </div>
            <p className="mt-4 text-[11px] font-semibold leading-relaxed text-slate-500">
              Envie uma foto nítida, recente e bem iluminada. Ela pode ser usada na impressão de ficha de matrícula, carteirinha, crachá e outros documentos acadêmicos.
            </p>
            <label className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700">
              <Upload size={14} />
              {uploadingPhoto ? 'Enviando foto...' : 'Enviar foto'}
              <input
                type="file"
                accept="image/*"
                disabled={uploadingPhoto}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onPhotoUpload(file);
                }}
              />
            </label>
          </div>
        </div>
      </aside>

      <section className="rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <User size={16} />
            </div>
            <h3 className="text-base font-bold uppercase tracking-tight text-[#001a33]">Dados cadastrais</h3>
          </div>

          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="text-xs font-bold uppercase tracking-widest text-blue-600 hover:underline"
          >
            {editing ? 'Cancelar' : 'Alterar dados'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Nome Completo</label>
              <p className="cursor-not-allowed rounded-xl border border-transparent bg-slate-50 p-3 font-bold text-slate-800">
                {profile?.nomeCompleto || profile?.nome}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">CPF</label>
              <p className="cursor-not-allowed rounded-xl border border-transparent bg-slate-50 p-3 font-bold text-slate-800">
                {profile?.cpf || 'Não Informado'}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">E-mail Acadêmico</label>
              <p className="flex items-center gap-2 rounded-xl border border-transparent bg-slate-50 p-3 font-bold text-slate-800">
                <Mail size={13} className="text-slate-400" />
                {profile?.email || 'Sem email'}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Telefone celular</label>
              {editing ? (
                <input value={telefone} onChange={(event) => setTelefone(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-bold text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white" />
              ) : (
                <p className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-3 font-bold text-slate-850">
                  <Phone size={13} className="text-slate-400" />
                  {read(profile?.telefone, 'Não Informado')}
                </p>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h4 className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#001a33]">
              <MapPin size={14} className="text-blue-500" /> Endereço residencial
            </h4>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                ['CEP', cep, setCep, profile?.cep || '—', false],
                ['Logradouro / Endereço', endereco, setEndereco, profile?.endereco || '—', true],
                ['Número', numero, setNumero, profile?.numero || 'S/N', false],
                ['Bairro', bairro, setBairro, profile?.bairro || '—', false],
              ].map(([label, value, setter, display, wide]) => (
                <div key={label as string} className={`space-y-1 ${wide ? 'sm:col-span-2' : ''}`}>
                  <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label as string}</label>
                  {editing ? (
                    <input value={value as string} onChange={(event) => (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-bold text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white" />
                  ) : (
                    <p className="truncate rounded-xl border border-slate-100 bg-slate-50/50 p-3 font-bold text-slate-850">{display as string}</p>
                  )}
                </div>
              ))}

              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Cidade / UF</label>
                {editing ? (
                  <div className="flex gap-2">
                    <input placeholder="Cidade" value={cidade} onChange={(event) => setCidade(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-bold text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white" />
                    <input placeholder="UF" maxLength={2} value={uf} onChange={(event) => setUf(event.target.value)} className="w-16 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center font-bold text-slate-750 outline-none transition-all focus:border-blue-500 focus:bg-white" />
                  </div>
                ) : (
                  <p className="truncate rounded-xl border border-slate-100 bg-slate-50/50 p-3 font-bold text-slate-850">
                    {profile?.cidade ? `${profile.cidade} / ${profile.uf || 'SE'}` : '—'}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h4 className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#001a33]">
              <IdCard size={14} className="text-blue-500" /> Dados complementares para cursos técnicos
            </h4>
            <p className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-[10px] font-semibold leading-relaxed text-blue-800">
              Estes campos são opcionais para cursos EAD, livres e especializações. Para curso técnico, completar estas informações agiliza a matrícula e emissão de documentos.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {supplementalFields.map((field) => (
                <div key={field.label} className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{field.label}</label>
                  {editing ? (
                    <input value={field.value} placeholder={field.placeholder} onChange={(event) => field.setter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white" />
                  ) : (
                    <p className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 font-bold text-slate-850">{field.value || '—'}</p>
                  )}
                </div>
              ))}

              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Sexo</label>
                {editing ? (
                  <select value={sexo} onChange={(event) => setSexo(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white">
                    <option value="">Selecione...</option>
                    <option value="MASCULINO">MASCULINO</option>
                    <option value="FEMININO">FEMININO</option>
                    <option value="NÃO-BINÁRIO">NÃO-BINÁRIO</option>
                    <option value="PREFIRO NÃO INFORMAR">PREFIRO NÃO INFORMAR</option>
                  </select>
                ) : (
                  <p className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 font-bold text-slate-850">{sexo || '—'}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Estado civil</label>
                {editing ? (
                  <select value={estadoCivil} onChange={(event) => setEstadoCivil(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white">
                    <option value="">Selecione...</option>
                    {['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável', 'Separado(a)'].map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                ) : (
                  <p className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 font-bold text-slate-850">{estadoCivil || '—'}</p>
                )}
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Tipo de documento</label>
                {editing ? (
                  <select value={tipoDocumento} onChange={(event) => setTipoDocumento(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white">
                    <option value="CARTEIRA NACIONAL DE IDENTIFICAÇÃO">CARTEIRA NACIONAL DE IDENTIFICAÇÃO (CIN)</option>
                    <option value="CNH">CNH</option>
                    <option value="PASSAPORTE">PASSAPORTE</option>
                    <option value="CARTEIRA PROFISSIONAL">CARTEIRA PROFISSIONAL</option>
                    <option value="RG (ANTIGO)">RG (ANTIGO)</option>
                  </select>
                ) : (
                  <p className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 font-bold text-slate-850">{tipoDocumento || '—'}</p>
                )}
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  <GraduationCap size={12} /> Escolaridade anterior
                </label>
                {editing ? (
                  <select value={escolaridadeAnterior} onChange={(event) => setEscolaridadeAnterior(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white">
                    <option value="">Selecione...</option>
                    <option value="Ensino Médio Completo">Ensino Médio Completo</option>
                    <option value="Ensino Médio Incompleto">Ensino Médio Incompleto</option>
                    <option value="Ensino Superior Completo">Ensino Superior Completo</option>
                    <option value="Ensino Superior Incompleto">Ensino Superior Incompleto</option>
                    <option value="Pós-Graduação">Pós-Graduação</option>
                  </select>
                ) : (
                  <p className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 font-bold text-slate-850">{escolaridadeAnterior || '—'}</p>
                )}
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Parentesco do responsável</label>
                {editing ? (
                  <select value={responsavelParentesco} onChange={(event) => setResponsavelParentesco(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white">
                    <option value="">Selecione...</option>
                    {['Mãe', 'Pai', 'Avó/Avô', 'Tio(a)', 'Irmão/Irmã', 'Tutor(a) Legal', 'Cônjuge', 'Outro'].map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                ) : (
                  <p className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 font-bold text-slate-850">{responsavelParentesco || '—'}</p>
                )}
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:col-span-2">
                <input type="checkbox" disabled={!editing} checked={responsavelFinanceiro} onChange={(event) => setResponsavelFinanceiro(event.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600" />
                <span className="text-xs font-bold text-slate-650">Este contato é o responsável financeiro.</span>
              </label>
            </div>
          </div>

          {editing && (
            <div className="flex justify-end gap-2 pt-4">
              <button type="button" onClick={() => setEditing(false)} className="rounded-xl bg-slate-100 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-650 transition-all hover:bg-slate-250">
                Voltar
              </button>
              <button type="submit" disabled={saving} className="rounded-xl bg-[#001a33] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-all hover:bg-blue-900 disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          )}
        </form>
      </section>
    </div>
  );
};

export default PerfilDadosTab;
