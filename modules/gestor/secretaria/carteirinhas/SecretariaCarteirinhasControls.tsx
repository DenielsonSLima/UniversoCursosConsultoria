import React from 'react';
import { CreditCard, Image, Loader2, Printer, Search, Trash2, Users, X } from 'lucide-react';
import { onlyDigits } from '../../../../lib/documentFormatters';
import SecretariaAlunoSearchCard from '../shared/SecretariaAlunoSearchCard';
import type { Aluno } from './secretaria-carteirinhas.types';
import type { CarteirinhaTechnicalClass } from './secretaria-carteirinhas.service';
import type { CarteirinhaLayoutType } from './SecretariaCarteirinhasPrintLayout';

export type CarteirinhaMode = 'individual' | 'lote' | 'custom';

interface SecretariaCarteirinhasControlsProps {
  alunos: Aluno[];
  alunosParaImprimir: Aluno[];
  customSelectedAlunos: Aluno[];
  isPreparingValidation: boolean;
  layoutType: CarteirinhaLayoutType;
  mode: CarteirinhaMode;
  onPrintAction: () => void;
  searchQuery: string;
  searchQueryCustom: string;
  selectedAluno: Aluno | null;
  selectedTurmaId: string;
  setCustomSelectedAlunos: React.Dispatch<React.SetStateAction<Aluno[]>>;
  setLayoutType: React.Dispatch<React.SetStateAction<CarteirinhaLayoutType>>;
  setMode: React.Dispatch<React.SetStateAction<CarteirinhaMode>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setSearchQueryCustom: React.Dispatch<React.SetStateAction<string>>;
  setSelectedAluno: React.Dispatch<React.SetStateAction<Aluno | null>>;
  setSelectedTurmaId: React.Dispatch<React.SetStateAction<string>>;
  setValidadeGeral: React.Dispatch<React.SetStateAction<string>>;
  startNumber: number;
  turmas: CarteirinhaTechnicalClass[];
  validadeGeral: string;
  onSearch: () => void;
}

const matchesAlunoSearch = (aluno: Aluno, term: string) => {
  const normalized = term.trim().toUpperCase();
  const digits = onlyDigits(term);
  return aluno.nome.toUpperCase().includes(normalized)
    || Boolean(aluno.cpf && (aluno.cpf.includes(term) || (digits && onlyDigits(aluno.cpf).includes(digits))))
    || Boolean(aluno.rg && aluno.rg.includes(term))
    || Boolean(aluno.curso && aluno.curso.toUpperCase().includes(normalized))
    || Boolean(aluno.turmaNome && aluno.turmaNome.toUpperCase().includes(normalized));
};

const ModeNavigation: React.FC<{
  mode: CarteirinhaMode;
  setMode: React.Dispatch<React.SetStateAction<CarteirinhaMode>>;
}> = ({ mode, setMode }) => {
  const items = [
    { key: 'individual' as const, icon: Search, title: 'Individual', description: 'Busque um aluno técnico deste polo.' },
    { key: 'lote' as const, icon: Users, title: 'Em lote', description: 'Gere por turma técnica ou para todo o polo.' },
    { key: 'custom' as const, icon: CreditCard, title: 'Personalizado', description: 'Monte uma lista de alunos técnicos deste polo.' },
  ];
  return (
    <div className="border-b border-slate-100 p-4">
      <div className="grid gap-2 md:grid-cols-3">
        {items.map(({ key, icon: Icon, title, description }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${mode === key ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
          >
            <Icon size={20} />
            <div>
              <p className="text-xs font-black uppercase tracking-wider">{title}</p>
              <p className="mt-0.5 text-[11px] font-medium leading-snug">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

const LayoutSelector: React.FC<{
  individual?: boolean;
  layoutType: CarteirinhaLayoutType;
  setLayoutType: React.Dispatch<React.SetStateAction<CarteirinhaLayoutType>>;
}> = ({ individual = false, layoutType, setLayoutType }) => (
  <div className="mb-8 rounded-3xl border border-slate-200 bg-slate-50 p-6">
    <h4 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-500">Escolha o Layout de Impressão</h4>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-all ${layoutType === 'dobra' ? 'border-purple-500 bg-white shadow-md' : 'border-slate-200 bg-slate-50/50 hover:border-slate-350 hover:bg-white'}`} onClick={() => setLayoutType('dobra')}>
        <input type="radio" checked={layoutType === 'dobra'} readOnly className="mt-1 accent-purple-600" />
        <div>
          <span className="block text-xs font-black uppercase text-[#001a33]">Dobra Lateral (5 por Folha)</span>
          <span className="mt-1 block text-[10px] font-medium leading-normal text-slate-500">
            {individual
              ? 'Imprime frentes e versos colados na mesma página A4. Excelente para recorte e dobra ao meio.'
              : 'Imprime frentes e versos colados na mesma página. Ideal para corte e dobra.'}
          </span>
        </div>
      </label>
      <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-all ${layoutType === 'espelhado' ? 'border-purple-500 bg-white shadow-md' : 'border-slate-200 bg-slate-50/50 hover:border-slate-350 hover:bg-white'}`} onClick={() => setLayoutType('espelhado')}>
        <input type="radio" checked={layoutType === 'espelhado'} readOnly className="mt-1 accent-purple-600" />
        <div>
          <span className="block text-xs font-black uppercase text-[#001a33]">Frente / Verso Real (10 por Folha)</span>
          <span className="mt-1 block text-[10px] font-medium leading-normal text-slate-500">
            {individual
              ? 'Gera uma folha de Frentes e outra de Versos espelhados. Ideal para impressora frente/verso (duplex).'
              : 'Gera páginas separadas de Frentes e Versos com espelhamento. Perfeito para impressoras duplex.'}
          </span>
        </div>
      </label>
    </div>
  </div>
);

const IndividualControls: React.FC<Pick<SecretariaCarteirinhasControlsProps,
  'alunos' | 'isPreparingValidation' | 'layoutType' | 'onPrintAction' | 'onSearch' | 'searchQuery'
  | 'selectedAluno' | 'setLayoutType' | 'setSearchQuery' | 'setSelectedAluno' | 'startNumber'
>> = ({ alunos, isPreparingValidation, layoutType, onPrintAction, onSearch, searchQuery, selectedAluno, setLayoutType, setSearchQuery, setSelectedAluno, startNumber }) => {
  const searchResults = searchQuery.trim() ? alunos.filter((aluno) => matchesAlunoSearch(aluno, searchQuery)) : [];
  return (
    <div className="animate-fadeIn">
      <h3 className="mb-6 text-xl font-black uppercase tracking-tight text-[#001a33]">Carteirinha Individual</h3>
      <div className="relative mb-8">
        <div className="flex gap-4">
          <input type="text" placeholder="Buscar aluno por nome, CPF ou RG..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && onSearch()} className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 font-medium text-slate-750 outline-none focus:border-purple-500" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="px-3 text-xs font-bold uppercase tracking-wider text-slate-450 transition-colors hover:text-slate-650">Limpar</button>}
          <button onClick={onSearch} className="rounded-2xl bg-purple-600 px-8 text-white shadow-lg shadow-purple-900/20 transition-colors hover:bg-purple-700"><Search size={20} /></button>
        </div>
        {searchQuery.trim().length > 0 && (
          <div className="absolute left-0 right-0 z-50 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl custom-scrollbar">
            {searchResults.slice(0, 15).map((aluno) => (
              <div key={aluno.id} className="border-b border-slate-100 p-2 last:border-0">
                <SecretariaAlunoSearchCard {...{ nome: aluno.nome, cpf: aluno.cpf, rg: aluno.rg, cursoNome: aluno.curso, turmaNome: aluno.turmaNome, turmaCodigo: aluno.turmaCodigo, matricula: aluno.matricula, fotoUrl: aluno.fotoUrl }} tone="purple" onClick={() => { setSelectedAluno(aluno); setSearchQuery(''); }} />
              </div>
            ))}
            {searchResults.length === 0 && <div className="p-4 text-center text-xs font-bold uppercase text-slate-400">Nenhum aluno encontrado</div>}
          </div>
        )}
      </div>

      {selectedAluno ? (
        <div className="mb-8 animate-fadeIn">
          <SecretariaAlunoSearchCard
            nome={selectedAluno.nome} cpf={selectedAluno.cpf} rg={selectedAluno.rg} cursoNome={selectedAluno.curso}
            turmaNome={selectedAluno.turmaNome} turmaCodigo={selectedAluno.turmaCodigo}
            matricula={selectedAluno.matricula && selectedAluno.matricula !== 'PENDENTE' && selectedAluno.matricula !== 'CIE-PENDENTE' ? selectedAluno.matricula : `CIE-${startNumber}`}
            fotoUrl={selectedAluno.fotoUrl} tone="purple" selected statusLabel={selectedAluno.fotoUrl ? 'Foto cadastrada' : 'Sem foto'}
            statusTone={selectedAluno.fotoUrl ? 'success' : 'warning'} actionLabel="Trocar" onClick={() => setSelectedAluno(null)}
          />
        </div>
      ) : (
        <div className="mb-8 rounded-3xl border border-slate-150 p-6 text-center text-xs font-bold uppercase text-slate-450">Busque um aluno acima para visualizar seus dados e emitir a carteirinha.</div>
      )}
      <LayoutSelector individual layoutType={layoutType} setLayoutType={setLayoutType} />
      <div className="flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
        <div className="relative mb-6 flex h-[54mm] w-[85.6mm] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg">
          <CreditCard size={48} className="absolute -bottom-4 -right-4 rotate-12 scale-150 opacity-20" />
          <div className="z-10 p-4 text-center"><p className="text-[7px] font-black uppercase tracking-widest opacity-80">Visualização do Modelo</p><h4 className="mt-1 text-[10px] font-black uppercase tracking-wider">{selectedAluno?.nome || 'SELECIONE UM ALUNO'}</h4><p className="mt-0.5 text-[8px] font-bold opacity-90">{selectedAluno ? `CIE-${startNumber}` : '-'}</p></div>
        </div>
        <button onClick={onPrintAction} disabled={!selectedAluno || isPreparingValidation} className="flex items-center gap-2 rounded-2xl bg-[#001a33] px-8 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-colors hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50">
          {isPreparingValidation ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}{isPreparingValidation ? 'Registrando códigos...' : 'Abrir Visualização de Impressão A4'}
        </button>
      </div>
    </div>
  );
};

const BatchControls: React.FC<Pick<SecretariaCarteirinhasControlsProps,
  'alunosParaImprimir' | 'isPreparingValidation' | 'layoutType' | 'onPrintAction' | 'selectedTurmaId'
  | 'setLayoutType' | 'setSelectedTurmaId' | 'setValidadeGeral' | 'turmas' | 'validadeGeral'
>> = ({ alunosParaImprimir, isPreparingValidation, layoutType, onPrintAction, selectedTurmaId, setLayoutType, setSelectedTurmaId, setValidadeGeral, turmas, validadeGeral }) => (
  <div className="animate-fadeIn">
    <h3 className="mb-6 text-xl font-black uppercase tracking-tight text-[#001a33]">Emissão em Lote</h3>
    <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
      <div><label className="mb-2 block text-xs font-bold uppercase text-slate-500">Selecione a Turma</label><select value={selectedTurmaId} onChange={(event) => setSelectedTurmaId(event.target.value)} className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 p-4 font-bold text-slate-700 outline-none focus:border-purple-500"><option value="todos">Todos os alunos técnicos deste polo</option>{turmas.map((turma) => <option key={turma.id} value={turma.id}>{turma.nome} ({turma.codigo})</option>)}</select></div>
      <div><label className="mb-2 block text-xs font-bold uppercase text-slate-500">Validade Geral</label><input type="date" value={validadeGeral} onChange={(event) => setValidadeGeral(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-bold text-slate-700 outline-none focus:border-purple-500" /></div>
    </div>
    <LayoutSelector layoutType={layoutType} setLayoutType={setLayoutType} />
    <div className="mb-8 flex items-start gap-4 rounded-2xl border border-purple-100 bg-purple-50 p-6">
      <div className="mt-0.5 shrink-0 rounded-lg bg-purple-100 p-2 text-purple-600"><Image size={20} /></div>
      <div><h4 className="text-sm font-black uppercase text-purple-900">Verificação de Fotos da Turma</h4><p className="mt-1 text-xs font-semibold leading-relaxed text-purple-700">O lote selecionado possui {alunosParaImprimir.length} alunos cadastrados ativos. Destes, {alunosParaImprimir.filter((aluno) => aluno.fotoUrl).length} possuem foto de perfil cadastrada e validada no sistema.</p></div>
    </div>
    <div className="flex flex-col gap-4 sm:flex-row">
      <button onClick={() => { const nomes = alunosParaImprimir.map((aluno) => `${aluno.nome} (${aluno.fotoUrl ? 'COM FOTO' : 'SEM FOTO'})`).join('\n'); alert(`Alunos no lote para impressão:\n\n${nomes}`); }} className="flex-1 rounded-2xl border border-slate-200 py-4 text-xs font-bold uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-50">Ver Lista de Alunos ({alunosParaImprimir.length})</button>
      <button onClick={onPrintAction} disabled={alunosParaImprimir.length === 0 || isPreparingValidation} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-purple-600 py-4 font-black uppercase tracking-widest text-white shadow-xl shadow-purple-900/20 transition-all hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50">{isPreparingValidation ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}{isPreparingValidation ? 'Registrando códigos...' : 'Visualizar Lote Completo'}</button>
    </div>
  </div>
);

const CustomControls: React.FC<Pick<SecretariaCarteirinhasControlsProps,
  'alunos' | 'customSelectedAlunos' | 'isPreparingValidation' | 'layoutType' | 'onPrintAction'
  | 'searchQueryCustom' | 'setCustomSelectedAlunos' | 'setLayoutType' | 'setSearchQueryCustom'
  | 'setValidadeGeral' | 'startNumber' | 'validadeGeral'
>> = ({ alunos, customSelectedAlunos, isPreparingValidation, layoutType, onPrintAction, searchQueryCustom, setCustomSelectedAlunos, setLayoutType, setSearchQueryCustom, setValidadeGeral, startNumber, validadeGeral }) => {
  const searchResults = searchQueryCustom.trim() ? alunos.filter((aluno) => matchesAlunoSearch(aluno, searchQueryCustom)) : [];
  return (
    <div className="animate-fadeIn">
      <h3 className="mb-6 text-xl font-black uppercase tracking-tight text-[#001a33]">Carteirinhas Personalizadas (Misto)</h3>
      <div className="relative mb-8">
        <label className="mb-2 block text-xs font-bold uppercase text-slate-500">Buscar e Adicionar Alunos</label>
        <div className="flex gap-4"><input type="text" placeholder="Buscar aluno por nome, CPF ou RG..." value={searchQueryCustom} onChange={(event) => setSearchQueryCustom(event.target.value)} className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 font-medium text-slate-750 outline-none focus:border-purple-500" />{searchQueryCustom && <button onClick={() => setSearchQueryCustom('')} className="px-3 text-xs font-bold uppercase tracking-wider text-slate-450 transition-colors hover:text-slate-650">Limpar</button>}</div>
        {searchQueryCustom.trim().length > 0 && (
          <div className="absolute left-0 right-0 z-50 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl custom-scrollbar">
            {searchResults.slice(0, 15).map((aluno) => { const isAdded = customSelectedAlunos.some((selected) => selected.id === aluno.id); return <div key={aluno.id} className="border-b border-slate-100 p-2 last:border-0"><SecretariaAlunoSearchCard {...{ nome: aluno.nome, cpf: aluno.cpf, rg: aluno.rg, cursoNome: aluno.curso, turmaNome: aluno.turmaNome, turmaCodigo: aluno.turmaCodigo, matricula: aluno.matricula, fotoUrl: aluno.fotoUrl }} tone="purple" disabled={isAdded} actionLabel={isAdded ? 'Adicionado' : 'Adicionar'} statusLabel={isAdded ? 'Na lista' : undefined} statusTone="neutral" onClick={() => { setCustomSelectedAlunos((current) => [...current, aluno]); setSearchQueryCustom(''); }} /></div>; })}
            {searchResults.length === 0 && <div className="p-4 text-center text-xs font-bold uppercase text-slate-400">Nenhum aluno encontrado</div>}
          </div>
        )}
      </div>
      <div className="mb-8"><label className="mb-2 block text-xs font-bold uppercase text-slate-500">Validade Geral</label><input type="date" value={validadeGeral} onChange={(event) => setValidadeGeral(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-bold text-slate-700 outline-none focus:border-purple-500" /></div>
      <div className="mb-8 rounded-3xl border border-slate-200 bg-slate-50/20 p-6">
        <div className="mb-6 flex items-center justify-between"><h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Alunos Selecionados ({customSelectedAlunos.length})</h4>{customSelectedAlunos.length > 0 && <button onClick={() => setCustomSelectedAlunos([])} className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-red-500 transition-colors hover:text-red-700"><Trash2 size={12} /> Esvaziar Lista</button>}</div>
        {customSelectedAlunos.length > 0 ? (
          <div className="flex max-h-96 flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar">{customSelectedAlunos.map((aluno, index) => <div key={aluno.id} className="flex animate-fadeIn items-center justify-between rounded-2xl border border-slate-150 bg-white p-4 shadow-sm transition-all hover:shadow-md"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-purple-100 bg-purple-50 text-sm font-black text-purple-600">{aluno.fotoUrl ? <img src={aluno.fotoUrl} alt="Foto do Aluno" className="h-full w-full object-cover" /> : aluno.nome[0]}</div><div><span className="block text-xs font-black uppercase leading-tight text-slate-800">{aluno.nome}</span><span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-450">Matrícula: {aluno.matricula && aluno.matricula !== 'PENDENTE' && aluno.matricula !== 'CIE-PENDENTE' ? aluno.matricula : `CIE-${startNumber + index}`} | {aluno.curso}</span></div></div><button onClick={() => setCustomSelectedAlunos((current) => current.filter((selected) => selected.id !== aluno.id))} className="rounded-xl p-2 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500" title="Remover aluno"><X size={16} /></button></div>)}</div>
        ) : <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs font-bold uppercase text-slate-450">Nenhum aluno adicionado à lista. Busque alunos acima para começar a montar o lote de impressão personalizado.</div>}
      </div>
      <LayoutSelector layoutType={layoutType} setLayoutType={setLayoutType} />
      <button onClick={onPrintAction} disabled={customSelectedAlunos.length === 0 || isPreparingValidation} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 py-4 font-black uppercase tracking-widest text-white shadow-xl shadow-purple-900/20 transition-all hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50">{isPreparingValidation ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}{isPreparingValidation ? 'Registrando códigos...' : 'Visualizar Lote Personalizado'}</button>
    </div>
  );
};

const SecretariaCarteirinhasControls: React.FC<SecretariaCarteirinhasControlsProps> = (props) => (
  <div className="animate-fadeIn">
    <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <ModeNavigation mode={props.mode} setMode={props.setMode} />
      <div className="p-5 md:p-7">
        {props.mode === 'individual' && <IndividualControls {...props} />}
        {props.mode === 'lote' && <BatchControls {...props} />}
        {props.mode === 'custom' && <CustomControls {...props} />}
      </div>
    </div>
  </div>
);

export default SecretariaCarteirinhasControls;
