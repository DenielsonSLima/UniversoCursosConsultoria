import React, { useEffect, useMemo, useState } from 'react';
import {
  Award, BookOpen, CheckCircle2, Eye, Filter, GraduationCap,
  Loader2, MonitorPlay, Printer, Search, Settings2, X, Zap,
} from 'lucide-react';
import { diplomaService } from '../../cadastros/modelos-documentos/diploma/diploma.service';
import { getSecretariaContext } from '../shared/secretaria-documentos.service';
import CertificadoPreview from './components/CertificadoPreview';
import { certificadosService } from './certificados.service';
import { CertificadoAcademico, CertificadoModalidade, CertificadoStatus } from './certificados.types';

const MODALIDADES = [
  { id: 'TECNICO', label: 'Cursos Técnicos', icon: GraduationCap },
  { id: 'LIVRE', label: 'Cursos Livres', icon: Zap },
  { id: 'EAD', label: 'EAD / Online', icon: MonitorPlay },
  { id: 'ESPECIALIZACAO', label: 'Especialização', icon: BookOpen },
] as const;

const templateType: Record<CertificadoModalidade, string> = {
  TECNICO: 'Cursos Técnicos',
  LIVRE: 'Cursos Livres',
  EAD: 'Educação a Distância (EAD)',
  ESPECIALIZACAO: 'Cursos Especialização',
};

const formatDate = (date?: string | null) =>
  date ? new Date(date.includes('T') ? date : `${date}T12:00:00`).toLocaleDateString('pt-BR') : '—';

const SecretariaCertificadosPage: React.FC = () => {
  const context = getSecretariaContext();
  const [modalidade, setModalidade] = useState<CertificadoModalidade>('TECNICO');
  const [status, setStatus] = useState<CertificadoStatus>('PENDENTE');
  const [search, setSearch] = useState('');
  const [turmaId, setTurmaId] = useState('todos');
  const [groupBy, setGroupBy] = useState<'nenhum' | 'polo' | 'turma'>('turma');
  const [items, setItems] = useState<CertificadoAcademico[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CertificadoAcademico | null>(null);
  const [preview, setPreview] = useState<CertificadoAcademico | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    certificadoNumero: '', paginaLivro: '', livroRegistro: '', validacaoSistec: '',
    ensinoMedioEstabelecimento: '', ensinoMedioLocalidadeUf: '', ensinoMedioAnoConclusao: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [rows, classes, models] = await Promise.all([
        certificadosService.list({
          modalidade,
          status: modalidade === 'TECNICO' ? status : undefined,
          search,
          turmaId,
          poloId: context.poloId || undefined,
        }),
        certificadosService.getTurmas(modalidade, context.poloId || undefined),
        diplomaService.getTemplates(),
      ]);
      setItems(rows);
      setTurmas(classes);
      setTemplates(models);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTurmaId('todos');
    if (modalidade !== 'TECNICO') setStatus('FINALIZADO');
  }, [modalidade]);

  useEffect(() => { void load(); }, [modalidade, status, turmaId]);

  const grouped = useMemo(() => {
    const filtered = search.trim()
      ? items.filter(item => item.aluno.nome.toLowerCase().includes(search.toLowerCase()) || item.aluno.cpf_cnpj.includes(search))
      : items;
    return filtered.reduce<Record<string, CertificadoAcademico[]>>((acc, item) => {
      const key = groupBy === 'polo'
        ? item.polo?.nome || 'Sem polo'
        : groupBy === 'turma'
          ? `${item.turma.nome} · ${item.turma.codigo}`
          : 'Certificados';
      (acc[key] ||= []).push(item);
      return acc;
    }, {});
  }, [groupBy, items, search]);

  const openIssue = (item: CertificadoAcademico) => {
    setSelected(item);
    setForm({
      certificadoNumero: item.certificado_numero || '',
      paginaLivro: item.pagina_livro || '',
      livroRegistro: item.livro_registro || '',
      validacaoSistec: item.validacao_sistec || '',
      ensinoMedioEstabelecimento: item.ensino_medio_estabelecimento || '',
      ensinoMedioLocalidadeUf: item.ensino_medio_localidade_uf || '',
      ensinoMedioAnoConclusao: item.ensino_medio_ano_conclusao || '',
    });
  };

  const handleIssue = async () => {
    if (!selected) return;
    if (selected.modalidade === 'TECNICO' && (!form.certificadoNumero || !form.paginaLivro || !form.livroRegistro)) {
      alert('Preencha número do certificado, página e livro.');
      return;
    }
    setSaving(true);
    try {
      await certificadosService.finalizar(selected.id, form);
      setSelected(null);
      await load();
    } catch (error: any) {
      alert(`Erro ao emitir certificado: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const modelo = templates.find(item => item.tipoCurso === templateType[modalidade]);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="rounded-[2rem] bg-[#001a33] p-7 text-white shadow-xl">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-white/10 p-3"><Award size={26} /></div>
          <div>
            <h3 className="text-2xl font-black uppercase tracking-tight">Central de Certificados</h3>
            <p className="text-sm font-medium text-blue-200">Conclusões, registros, validação e segunda via em um só fluxo.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-1.5">
        {MODALIDADES.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setModalidade(tab.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wider transition-all ${modalidade === tab.id ? 'bg-[#001a33] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
              <Icon size={15} /> {tab.label}
            </button>
          );
        })}
      </div>

      {modalidade === 'TECNICO' && (
        <div className="flex gap-2">
          {(['PENDENTE', 'FINALIZADO'] as CertificadoStatus[]).map(value => (
            <button key={value} onClick={() => setStatus(value)}
              className={`rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider ${status === value ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-500'}`}>
              {value === 'PENDENTE' ? 'Pendentes' : 'Finalizados'}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && void load()}
            placeholder="Buscar aluno ou CPF..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-blue-500" />
        </div>
        <select value={turmaId} onChange={e => setTurmaId(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
          <option value="todos">Todas as turmas</option>
          {turmas.map(turma => <option key={turma.id} value={turma.id}>{turma.nome}</option>)}
        </select>
        <select value={groupBy} onChange={e => setGroupBy(e.target.value as typeof groupBy)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
          <option value="turma">Agrupar por turma</option>
          <option value="polo">Agrupar por polo</option>
          <option value="nenhum">Sem agrupamento</option>
        </select>
        <button onClick={() => void load()} className="flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase text-white">
          <Filter size={14} /> Filtrar
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="mx-auto animate-spin text-blue-600" size={34} /></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-20 text-center text-sm font-bold text-slate-400">Nenhum certificado encontrado.</div>
      ) : Object.entries(grouped).map(([group, rows]) => (
        <section key={group} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
            <h4 className="font-black uppercase tracking-wider text-[#001a33]">{group}</h4>
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-700">{rows.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                <tr><th className="p-4">Aluno</th><th>Inscrição</th><th>Conclusão</th><th>Nota</th><th>Status</th><th className="p-4 text-right">Ações</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(item => (
                  <tr key={item.id} className="text-xs text-slate-600 hover:bg-slate-50/60">
                    <td className="p-4"><b className="block text-[#001a33]">{item.aluno.nome}</b><span>{item.aluno.cpf_cnpj}</span></td>
                    <td>{formatDate(item.data_inscricao)}</td><td>{formatDate(item.data_conclusao)}</td>
                    <td className="font-black">{item.nota_final !== null ? item.nota_final.toFixed(1) : '—'}</td>
                    <td><span className={`rounded-full px-2 py-1 text-[9px] font-black ${item.status === 'FINALIZADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{item.status}</span></td>
                    <td className="p-4 text-right">
                      <div className="inline-flex gap-2">
                        <button onClick={() => setPreview(item)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:text-blue-600" title="Pré-visualizar"><Eye size={15} /></button>
                        {item.status === 'PENDENTE' && <button onClick={() => openIssue(item)} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-black uppercase text-white"><Settings2 size={13} /> Preparar</button>}
                        {item.status === 'FINALIZADO' && <button onClick={() => setPreview(item)} className="flex items-center gap-1.5 rounded-lg bg-[#001a33] px-3 py-2 text-[10px] font-black uppercase text-white"><Printer size={13} /> 2ª Via</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-7 shadow-2xl">
            <div className="mb-6 flex justify-between"><div><h4 className="text-xl font-black uppercase text-[#001a33]">Preparar Certificado</h4><p className="text-sm text-slate-500">{selected.aluno.nome} · {selected.curso.nome}</p></div><button onClick={() => setSelected(null)}><X /></button></div>
            {selected.modalidade === 'TECNICO' && (
              <div className="space-y-5">
                <div><h5 className="mb-3 text-xs font-black uppercase tracking-wider text-blue-700">Ensino Médio</h5><div className="grid gap-3 md:grid-cols-2">
                  <input value={form.ensinoMedioEstabelecimento} onChange={e => setForm({...form, ensinoMedioEstabelecimento:e.target.value})} placeholder="Estabelecimento" className="rounded-xl border p-3 text-sm" />
                  <input value={form.ensinoMedioLocalidadeUf} onChange={e => setForm({...form, ensinoMedioLocalidadeUf:e.target.value})} placeholder="Localidade / UF" className="rounded-xl border p-3 text-sm" />
                  <input value={form.ensinoMedioAnoConclusao} onChange={e => setForm({...form, ensinoMedioAnoConclusao:e.target.value})} placeholder="Ano de conclusão" className="rounded-xl border p-3 text-sm" />
                </div></div>
                <div><h5 className="mb-3 text-xs font-black uppercase tracking-wider text-blue-700">Registro do verso</h5><div className="grid gap-3 md:grid-cols-2">
                  <input value={form.certificadoNumero} onChange={e => setForm({...form, certificadoNumero:e.target.value})} placeholder="Certificado expedido Nº" className="rounded-xl border p-3 text-sm" />
                  <input value={form.paginaLivro} onChange={e => setForm({...form, paginaLivro:e.target.value})} placeholder="Página" className="rounded-xl border p-3 text-sm" />
                  <input value={form.livroRegistro} onChange={e => setForm({...form, livroRegistro:e.target.value})} placeholder="Livro" className="rounded-xl border p-3 text-sm" />
                  <input value={form.validacaoSistec} onChange={e => setForm({...form, validacaoSistec:e.target.value})} placeholder="Validação do SISTEC" className="rounded-xl border p-3 text-sm" />
                </div></div>
              </div>
            )}
            <div className="mt-7 flex justify-end gap-2"><button onClick={() => setSelected(null)} className="rounded-xl border px-5 py-3 text-xs font-black uppercase">Cancelar</button><button onClick={() => void handleIssue()} disabled={saving} className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-xs font-black uppercase text-white disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={15}/> : <CheckCircle2 size={15}/>} Emitir certificado</button></div>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 p-6 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl">
            <div className="mb-4 flex justify-end gap-2"><button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase text-white"><Printer size={15}/> Imprimir</button><button onClick={() => setPreview(null)} className="rounded-xl bg-white p-3 text-slate-600"><X size={18}/></button></div>
            <CertificadoPreview certificado={preview} modelo={modelo} />
          </div>
        </div>
      )}
    </div>
  );
};

export default SecretariaCertificadosPage;
