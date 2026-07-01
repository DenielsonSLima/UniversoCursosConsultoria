import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Megaphone, Save } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import {
  DEFAULT_SITE_TICKER_CONFIG,
  SitePublicTickerConfig,
  SiteTickerModality,
  SiteTickerPhraseCategory,
} from '../../../public/siteTicker.service';
import { sitePublicoConfigService } from './site-publico.service';

type SiteTickerCursoOption = {
  id: string;
  nome: string;
  modalidade: SiteTickerModality;
};

type SiteTickerPoloOption = {
  nome?: string | null;
  cidade?: string | null;
  estado?: string | null;
};

type SiteTickerTurmaOption = {
  id: string;
  nome: string;
  curso_id: string;
  cursos?: SiteTickerCursoOption | SiteTickerCursoOption[] | null;
  polos?: SiteTickerPoloOption | SiteTickerPoloOption[] | null;
};

type SiteTickerFraseOption = {
  id: string;
  texto: string;
  categoria: SiteTickerPhraseCategory;
  ordem: number | null;
};

const MODALIDADES: { value: SiteTickerModality; label: string }[] = [
  { value: 'EAD', label: 'EAD' },
  { value: 'TECNICO', label: 'Técnico' },
  { value: 'LIVRE', label: 'Livre' },
  { value: 'ESPECIALIZACAO', label: 'Especialização' },
];

const FRASE_CATEGORIAS: { value: SiteTickerPhraseCategory; label: string; desc: string }[] = [
  { value: 'all', label: 'Mistas', desc: 'Motivacionais e reflexão' },
  { value: 'motivacional', label: 'Motivacionais', desc: 'Energia para começar o dia' },
  { value: 'reflexao', label: 'Reflexão', desc: 'Mensagens mais contemplativas' },
];

const SitePublicoConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const [config, setConfig] = React.useState<SitePublicTickerConfig>(DEFAULT_SITE_TICKER_CONFIG);

  const configQuery = useQuery({
    queryKey: ['gestor-site-publico-ticker-config'],
    queryFn: () => sitePublicoConfigService.getConfig(),
  });

  React.useEffect(() => {
    if (configQuery.data) setConfig(configQuery.data);
  }, [configQuery.data]);

  const { data: cursos = [] } = useQuery<SiteTickerCursoOption[]>({
    queryKey: ['gestor-site-publico-ticker-cursos', config.modalidades],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cursos')
        .select('id, nome, modalidade')
        .eq('status', 'ativo')
        .in('modalidade', config.modalidades)
        .order('nome', { ascending: true });
      if (error) throw error;
      return (data || []) as SiteTickerCursoOption[];
    },
    enabled: config.modalidades.length > 0,
  });

  const { data: turmas = [] } = useQuery<SiteTickerTurmaOption[]>({
    queryKey: ['gestor-site-publico-ticker-turmas', config.modalidades, config.cursoIds],
    queryFn: async () => {
      let query = supabase
        .from('turmas')
        .select('id, nome, curso_id, cursos!inner(nome, modalidade), polos(nome, cidade, estado)')
        .eq('status', 'EM_ANDAMENTO')
        .eq('permitir_inscricoes_online', true)
        .in('cursos.modalidade', config.modalidades.filter((item) => item !== 'EAD'))
        .order('nome', { ascending: true });

      if (config.cursoIds.length) query = query.in('curso_id', config.cursoIds);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SiteTickerTurmaOption[];
    },
    enabled: config.modalidades.some((item) => item !== 'EAD'),
  });

  const { data: frases = [] } = useQuery<SiteTickerFraseOption[]>({
    queryKey: ['gestor-site-publico-ticker-frases', config.automaticCategory],
    queryFn: async () => {
      let query = supabase
        .from('site_publico_ticker_mensagens')
        .select('id, texto, categoria, ordem')
        .eq('ativo', true)
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: true });

      if (config.automaticCategory !== 'all') {
        query = query.eq('categoria', config.automaticCategory);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SiteTickerFraseOption[];
    },
    enabled: config.mode === 'automatic_phrases',
  });

  const saveMutation = useMutation({
    mutationFn: () => sitePublicoConfigService.saveConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gestor-site-publico-ticker-config'] });
      queryClient.invalidateQueries({ queryKey: ['site-public-ticker'] });
    },
  });

  const updateConfig = (patch: Partial<SitePublicTickerConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
  };

  const toggleModalidade = (value: SiteTickerModality) => {
    const next = config.modalidades.includes(value)
      ? config.modalidades.filter((item) => item !== value)
      : [...config.modalidades, value];
    updateConfig({ modalidades: next, cursoIds: [], turmaIds: [] });
  };

  const selectedOptions = (event: React.ChangeEvent<HTMLSelectElement>) =>
    Array.from(event.target.selectedOptions).map((option) => option.value);

  const formatPolo = (turma: SiteTickerTurmaOption) => {
    const polo = Array.isArray(turma.polos) ? turma.polos[0] : turma.polos;
    return [polo?.nome, polo?.cidade && polo?.estado ? `${polo.cidade}/${polo.estado}` : polo?.cidade || polo?.estado]
      .filter(Boolean)
      .join(' - ') || 'Polo a confirmar';
  };

  const previewItems = React.useMemo(() => {
    if (!config.enabled) {
      return ['A faixa esta desativada e nao aparecera no site publico.'];
    }

    if (config.mode === 'manual') {
      const manualItems = config.manualText
        .split(/\n+/)
        .map((item) => item.trim())
        .filter(Boolean);
      return manualItems.length ? manualItems : ['Seu texto manual aparecerá aqui.'];
    }

    if (config.mode === 'automatic_phrases') {
      if (!frases.length) return ['A oportunidade cresce com preparo, organização e propósito.'];
      const startOfYear = new Date(new Date().getFullYear(), 0, 0);
      const dayOfYear = Math.floor((Date.now() - startOfYear.getTime()) / 86_400_000);
      return [frases[dayOfYear % frases.length].texto];
    }

    const selectedTurmas = config.turmaIds.length
      ? turmas.filter((turma) => config.turmaIds.includes(turma.id))
      : turmas;

    const turmaItems = selectedTurmas.slice(0, Math.max(1, config.maxItems)).map((turma) => {
      const curso = Array.isArray(turma.cursos) ? turma.cursos[0] : turma.cursos;
      return `Turma aberta: ${curso?.nome || turma.nome}${config.showPolo ? ` • ${formatPolo(turma)}` : ''}`;
    });

    return turmaItems.length ? turmaItems : ['Novas turmas abertas serão anunciadas em breve.'];
  }, [config.enabled, config.manualText, config.maxItems, config.mode, config.showPolo, config.turmaIds, frases, turmas]);

  const previewLoopItems = React.useMemo(() => {
    const baseLoopItems = Array.from(
      { length: Math.max(previewItems.length, 8) },
      (_, index) => previewItems[index % previewItems.length]
    );
    return [...baseLoopItems, ...baseLoopItems];
  }, [previewItems]);
  const previewSpeed = `${Math.max(5, Math.min(90, Number(config.speedSeconds || 28)))}s`;

  if (configQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
        <Loader2 className="animate-spin" size={18} />
        Carregando configurações do site...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">Site público</p>
        <h2 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">Faixa de avisos do cabeçalho</h2>
        <p className="mt-1 text-xs font-bold text-slate-500">Controle o ticker exibido no topo do site público.</p>
      </div>

      <div className="rounded-[2rem] border border-slate-100 bg-slate-50 p-5">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-black text-[#001a33]">Ativar faixa no site</span>
            <span className="block text-xs font-bold text-slate-500">Quando desligado, nada aparece no cabeçalho público.</span>
          </span>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(event) => updateConfig({ enabled: event.target.checked })}
            className="h-5 w-5 accent-blue-600"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => updateConfig({ enabled: false })}
          className={`rounded-[1.5rem] border p-5 text-left ${!config.enabled ? 'border-slate-500 bg-slate-100' : 'border-slate-100 bg-white'}`}
        >
          <p className="text-sm font-black text-[#001a33]">Desativar</p>
          <p className="mt-1 text-xs font-bold text-slate-500">Não exibir faixa no site público.</p>
        </button>
        <button
          type="button"
          onClick={() => updateConfig({ enabled: true, mode: 'manual' })}
          className={`rounded-[1.5rem] border p-5 text-left ${config.enabled && config.mode === 'manual' ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-white'}`}
        >
          <p className="text-sm font-black text-[#001a33]">Mensagem personalizada</p>
          <p className="mt-1 text-xs font-bold text-slate-500">Digite uma ou mais mensagens para ficarem em loop.</p>
        </button>
        <button
          type="button"
          onClick={() => updateConfig({ enabled: true, mode: 'open_classes' })}
          className={`rounded-[1.5rem] border p-5 text-left ${config.enabled && config.mode === 'open_classes' ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-white'}`}
        >
          <p className="text-sm font-black text-[#001a33]">Anunciar turmas abertas</p>
          <p className="mt-1 text-xs font-bold text-slate-500">Gerar a faixa a partir das turmas liberadas para inscrição online.</p>
        </button>
        <button
          type="button"
          onClick={() => updateConfig({ enabled: true, mode: 'automatic_phrases' })}
          className={`rounded-[1.5rem] border p-5 text-left ${config.enabled && config.mode === 'automatic_phrases' ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-white'}`}
        >
          <p className="text-sm font-black text-[#001a33]">Frases automáticas</p>
          <p className="mt-1 text-xs font-bold text-slate-500">Mensagem do dia com troca automática diária.</p>
        </button>
      </div>

      {!config.enabled ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 text-xs font-bold text-slate-500">
          A faixa ficará oculta no site público depois de salvar.
        </div>
      ) : config.mode === 'manual' ? (
        <label className="block">
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">Texto em loop</span>
          <textarea
            rows={5}
            value={config.manualText}
            onChange={(event) => updateConfig({ manualText: event.target.value })}
            placeholder="Uma mensagem por linha..."
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-blue-400"
          />
        </label>
      ) : config.mode === 'automatic_phrases' ? (
        <div className="space-y-5">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Tipo de frase automática</p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              {FRASE_CATEGORIAS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => updateConfig({ automaticCategory: item.value })}
                  className={`rounded-2xl border p-4 text-left ${
                    config.automaticCategory === item.value ? 'border-blue-500 bg-blue-50' : 'border-slate-100 bg-white'
                  }`}
                >
                  <p className="text-xs font-black uppercase tracking-widest text-[#001a33]">{item.label}</p>
                  <p className="mt-1 text-[10px] font-bold text-slate-500">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-xs font-bold leading-relaxed text-blue-800">
            O sistema escolhe uma frase automaticamente pelo dia do ano. Amanhã a frase muda sozinha, sem precisar editar a configuração.
            <span className="mt-2 block text-[10px] uppercase tracking-widest text-blue-500">
              Frases ativas nesta seleção: {frases.length || 'carregando'}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {turmas.length === 0 && config.modalidades.some((item) => item !== 'EAD') && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-bold leading-relaxed text-amber-800">
              Nenhuma turma aberta com inscrições online liberadas foi encontrada para os filtros atuais. A faixa pública continuará aparecendo com uma mensagem de espera até existir uma turma liberada.
            </div>
          )}

          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Modalidades anunciadas</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {MODALIDADES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => toggleModalidade(item.value)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-[10px] font-black uppercase tracking-widest ${
                    config.modalidades.includes(item.value) ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-500'
                  }`}
                >
                  {config.modalidades.includes(item.value) && <Check size={13} />}
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Cursos específicos</span>
              <select
                multiple
                value={config.cursoIds}
                onChange={(event) => updateConfig({ cursoIds: selectedOptions(event), turmaIds: [] })}
                className="mt-2 h-44 w-full rounded-2xl border border-slate-200 px-3 py-2 text-xs font-bold outline-none focus:border-blue-400"
              >
                {cursos.map((curso) => (
                  <option key={curso.id} value={curso.id}>{curso.nome} ({curso.modalidade})</option>
                ))}
              </select>
              <p className="mt-1 text-[10px] font-bold text-slate-400">Sem seleção anuncia todos da modalidade.</p>
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Turmas específicas</span>
              <select
                multiple
                value={config.turmaIds}
                onChange={(event) => updateConfig({ turmaIds: selectedOptions(event) })}
                className="mt-2 h-44 w-full rounded-2xl border border-slate-200 px-3 py-2 text-xs font-bold outline-none focus:border-blue-400"
              >
                {turmas.map((turma) => {
                  const curso = Array.isArray(turma.cursos) ? turma.cursos[0] : turma.cursos;
                  return <option key={turma.id} value={turma.id}>{curso?.nome} - {formatPolo(turma)}</option>;
                })}
              </select>
              <p className="mt-1 text-[10px] font-bold text-slate-400">Sem seleção anuncia todas as turmas abertas filtradas.</p>
            </label>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <label className="block">
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">Limite</span>
          <input
            type="number"
            min={1}
            max={30}
            value={config.maxItems}
            onChange={(event) => updateConfig({ maxItems: Number(event.target.value) })}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
        </label>
        <label className="block">
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">Velocidade</span>
          <input
            type="number"
            min={5}
            max={90}
            value={config.speedSeconds}
            onChange={(event) => updateConfig({ speedSeconds: Number(event.target.value) })}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-xs font-black text-slate-600">
          <input type="checkbox" checked={config.showPolo} onChange={(event) => updateConfig({ showPolo: event.target.checked })} />
          Mostrar polo
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-xs font-black text-slate-600">
          <input type="checkbox" checked={config.showStartDate} onChange={(event) => updateConfig({ showStartDate: event.target.checked })} />
          Mostrar início
        </label>
      </div>

      {saveMutation.isError && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs font-bold text-red-700">
          Não foi possível salvar a configuração: {(saveMutation.error as Error)?.message || 'erro desconhecido'}.
        </div>
      )}

      {saveMutation.isSuccess && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs font-bold text-emerald-700">
          Configuração salva com sucesso.
        </div>
      )}

      <button
        type="button"
        disabled={saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-700 disabled:bg-slate-300"
      >
        {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        Salvar ajustes
      </button>

      <div className="rounded-[1.5rem] border border-blue-100 bg-white p-4 shadow-sm">
        <p className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-600">
          <Megaphone size={14} />
          Prévia da faixa
        </p>
        <style>{`
          @keyframes siteTickerPreviewLoop {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
          .site-ticker-preview-track {
            animation: siteTickerPreviewLoop var(--preview-speed, 28s) linear infinite;
          }
          .site-ticker-preview-track:hover {
            animation-play-state: paused;
          }
          @media (prefers-reduced-motion: reduce) {
            .site-ticker-preview-track { animation: none; transform: none; }
          }
        `}</style>
        <div className="overflow-hidden rounded-2xl border border-blue-900/30 bg-[#001a33] text-white">
          <div className="flex h-11 items-center overflow-hidden">
            <div className="flex h-full shrink-0 items-center gap-2 bg-blue-700 px-4 text-[10px] font-black uppercase tracking-[0.18em]">
              <Megaphone size={13} />
              Avisos
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <div
                className="site-ticker-preview-track flex w-max items-center gap-8 whitespace-nowrap px-4 text-[11px] font-bold uppercase tracking-wider text-blue-50"
                style={{ '--preview-speed': previewSpeed } as React.CSSProperties}
              >
                {previewLoopItems.map((item, index) => (
                  <span key={`${item}-${index}`} className="flex items-center gap-8">
                    <span>{item}</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <p className="mt-2 text-[10px] font-bold text-slate-400">
          A prévia usa a velocidade atual: {previewSpeed}. Passe o mouse sobre a faixa para pausar o loop.
        </p>
      </div>
    </div>
  );
};

export default SitePublicoConfig;
