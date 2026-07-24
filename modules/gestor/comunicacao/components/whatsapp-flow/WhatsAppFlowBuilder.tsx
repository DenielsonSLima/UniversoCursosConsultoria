import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CornerDownRight,
  GitBranch,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  WhatsAppFlowActionType,
  WhatsAppFlowDefinition,
  WhatsAppFlowNode,
  WhatsAppFlowOption,
  WhatsAppSector,
} from '../whatsapp/whatsapp.types';
import { createFlowId } from './flowBuilder';

interface WhatsAppFlowBuilderProps {
  definition: WhatsAppFlowDefinition;
  validationIssues?: string[];
  onChange: (definition: WhatsAppFlowDefinition) => void;
  onRestoreDefault: () => void;
}

const actionLabels: Record<WhatsAppFlowActionType, string> = {
  goto: 'Abrir outra etapa',
  route: 'Encaminhar para setor',
  finance_link: 'Financeiro · boleto/link',
  finance_pix: 'Financeiro · PIX',
  finance_irpf: 'Financeiro · IRPF',
  course_agent: 'Agente de cursos e dúvidas',
  redirect: 'Redirecionar instituição',
  handoff: 'Passar para atendente',
  reply: 'Responder e encaminhar',
};

const sectorLabels: Record<WhatsAppSector, string> = {
  comercial_matriculas: 'Comercial / Matrículas',
  secretaria: 'Secretaria',
  financeiro: 'Financeiro',
  pedagogico_coordenacao: 'Coordenação / Pedagógico',
  atendimento_geral: 'Atendimento geral',
};

const moveItem = <T,>(items: T[], index: number, direction: -1 | 1) => {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
};

const WhatsAppFlowBuilder: React.FC<WhatsAppFlowBuilderProps> = ({
  definition,
  validationIssues = [],
  onChange,
  onRestoreDefault,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState(definition.startNodeId);
  const [notice, setNotice] = useState('');

  const selectedNode = useMemo(
    () => definition.nodes.find((item) => item.id === selectedNodeId) || definition.nodes[0],
    [definition.nodes, selectedNodeId],
  );

  useEffect(() => {
    if (!definition.nodes.some((item) => item.id === selectedNodeId)) {
      setSelectedNodeId(definition.startNodeId);
    }
  }, [definition.nodes, definition.startNodeId, selectedNodeId]);

  const changeDefinition = (updates: Partial<WhatsAppFlowDefinition>) => {
    setNotice('');
    onChange({ ...definition, ...updates });
  };

  const updateNode = (nodeId: string, updates: Partial<WhatsAppFlowNode>) => {
    changeDefinition({
      nodes: definition.nodes.map((item) => item.id === nodeId ? { ...item, ...updates } : item),
    });
  };

  const updateOption = (
    nodeId: string,
    optionId: string,
    updates: Partial<WhatsAppFlowOption>,
  ) => {
    changeDefinition({
      nodes: definition.nodes.map((item) => item.id === nodeId
        ? {
          ...item,
          options: item.options.map((entry) => entry.id === optionId
            ? { ...entry, ...updates }
            : entry),
        }
        : item),
    });
  };

  const addNode = () => {
    const id = createFlowId('step');
    const nextNode: WhatsAppFlowNode = {
      id,
      name: `Nova etapa ${definition.nodes.length + 1}`,
      message: 'Digite aqui a mensagem que o cliente receberá.',
      enabled: true,
      options: [],
    };
    changeDefinition({ nodes: [...definition.nodes, nextNode] });
    setSelectedNodeId(id);
  };

  const deleteNode = (nodeId: string) => {
    if (definition.nodes.length === 1) {
      setNotice('O fluxo precisa ter pelo menos uma etapa.');
      return;
    }
    if (definition.startNodeId === nodeId) {
      setNotice('Escolha outra etapa como inicial antes de excluir esta.');
      return;
    }
    const isReferenced = definition.nodes.some((item) =>
      item.options.some((entry) => entry.action === 'goto' && entry.targetNodeId === nodeId));
    if (isReferenced) {
      setNotice('Esta etapa ainda é destino de uma opção. Altere esse destino antes de excluir.');
      return;
    }
    const nodes = definition.nodes.filter((item) => item.id !== nodeId);
    changeDefinition({ nodes });
    setSelectedNodeId(nodes[0].id);
  };

  const moveNode = (index: number, direction: -1 | 1) => {
    changeDefinition({ nodes: moveItem(definition.nodes, index, direction) });
  };

  const addOption = (nodeId: string) => {
    const targetNodeId = definition.nodes.find((item) => item.id !== nodeId)?.id || nodeId;
    const nextOption: WhatsAppFlowOption = {
      id: createFlowId('option'),
      label: 'Nova opção',
      enabled: true,
      action: 'goto',
      targetNodeId,
    };
    updateNode(nodeId, { options: [...selectedNode.options, nextOption] });
  };

  const removeOption = (nodeId: string, optionId: string) => {
    updateNode(nodeId, {
      options: selectedNode.options.filter((entry) => entry.id !== optionId),
    });
  };

  const setAction = (option: WhatsAppFlowOption, action: WhatsAppFlowActionType) => {
    const defaults: Partial<WhatsAppFlowOption> = {
      action,
      targetNodeId: action === 'goto'
        ? definition.nodes.find((item) => item.id !== selectedNode.id)?.id || selectedNode.id
        : null,
      sector: ['route', 'handoff', 'reply'].includes(action)
        ? option.sector || 'atendimento_geral'
        : null,
      poloMode: ['route', 'handoff', 'reply'].includes(action)
        ? option.poloMode || 'inherit'
        : undefined,
      institution: action === 'redirect' ? option.institution || 'anhanguera' : null,
      responseMessage: action === 'reply'
        ? option.responseMessage || 'Certo. Vou encaminhar sua solicitação.'
        : null,
    };
    updateOption(selectedNode.id, option.id, defaults);
  };

  return (
    <div className="grid min-h-[620px] xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="border-b border-slate-200 bg-[#fbfcfd] p-4 xl:border-b-0 xl:border-r">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Etapas</p>
            <p className="mt-1 text-xs font-medium text-slate-400">{definition.nodes.length} etapa(s) no roteiro</p>
          </div>
          <button
            type="button"
            onClick={addNode}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#001a33] px-3 text-xs font-bold text-white hover:bg-[#00315d]"
          >
            <Plus size={14} /> Adicionar
          </button>
        </div>

        <div className="mt-4 space-y-1.5">
          {definition.nodes.map((item, index) => {
            const active = selectedNode.id === item.id;
            const isStart = definition.startNodeId === item.id;
            return (
              <div
                key={item.id}
                className={`group flex w-full items-start gap-1 rounded-xl pr-1 transition-colors ${active ? 'bg-emerald-50 text-emerald-900' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNodeId(item.id);
                    setNotice('');
                  }}
                  className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left"
                >
                  <span className={`mt-0.5 text-xs font-black ${active ? 'text-emerald-600' : 'text-slate-300'}`}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold">{item.name}</span>
                      {isStart && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">INÍCIO</span>}
                    </span>
                    <span className="mt-0.5 block text-xs font-medium text-slate-400">
                      {item.enabled ? `${item.options.filter((entry) => entry.enabled).length} opção(ões)` : 'Etapa inativa'}
                    </span>
                  </span>
                  <span className={`mt-1.5 h-2 w-2 rounded-full ${item.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </button>
                <span className="mt-2 flex flex-col opacity-30 transition-opacity group-hover:opacity-100">
                  <button type="button" onClick={() => moveNode(index, -1)} disabled={index === 0} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-20" aria-label="Mover etapa para cima">
                    <ArrowUp size={12} />
                  </button>
                  <button type="button" onClick={() => moveNode(index, 1)} disabled={index === definition.nodes.length - 1} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-20" aria-label="Mover etapa para baixo">
                    <ArrowDown size={12} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onRestoreDefault}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 border-t border-slate-200 pt-4 text-xs font-bold text-slate-500 hover:text-blue-700"
        >
          <RotateCcw size={14} />
          Restaurar fluxo padrão
        </button>
      </aside>

      <main className="min-w-0 p-5 lg:p-7">
        {validationIssues.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-bold text-amber-900">
              Corrija {validationIssues.length} pendência(s) antes de salvar
            </p>
            <p className="mt-1 text-xs font-medium leading-relaxed text-amber-800">
              {validationIssues.slice(0, 3).join(' · ')}
            </p>
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            {notice}
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="min-w-0 flex-1">
            <label className="block text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">Nome da etapa</label>
            <input
              value={selectedNode.name}
              onChange={(event) => updateNode(selectedNode.id, { name: event.target.value })}
              className="mt-1 w-full border-0 bg-transparent p-0 text-xl font-bold text-[#001a33] outline-none placeholder:text-slate-300"
              placeholder="Nome da etapa"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {definition.startNodeId !== selectedNode.id && (
              <button
                type="button"
                onClick={() => changeDefinition({
                  startNodeId: selectedNode.id,
                  nodes: definition.nodes.map((item) =>
                    item.id === selectedNode.id ? { ...item, enabled: true } : item),
                })}
                className="h-9 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"
              >
                Tornar etapa inicial
              </button>
            )}
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600">
              <input
                type="checkbox"
                checked={selectedNode.enabled}
                disabled={definition.startNodeId === selectedNode.id}
                onChange={(event) => updateNode(selectedNode.id, { enabled: event.target.checked })}
                className="h-4 w-4 accent-emerald-600 disabled:opacity-40"
              />
              {definition.startNodeId === selectedNode.id ? 'Etapa inicial ativa' : 'Etapa ativa'}
            </label>
            <button
              type="button"
              onClick={() => deleteNode(selectedNode.id)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-100 px-3 text-xs font-bold text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} /> Excluir
            </button>
          </div>
        </div>

        <label className="block border-b border-slate-200 py-5">
          <span className="block text-sm font-bold text-[#001a33]">Mensagem desta etapa</span>
          <span className="mt-1 block text-xs font-medium text-slate-400">
            As opções ativas serão numeradas automaticamente abaixo desta mensagem.
          </span>
          <textarea
            value={selectedNode.message}
            onChange={(event) => updateNode(selectedNode.id, { message: event.target.value })}
            rows={4}
            className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium leading-relaxed text-slate-700 outline-none focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-50"
          />
        </label>

        <section className="pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-[#001a33]">Opções e destinos</h4>
              <p className="mt-1 text-xs font-medium text-slate-400">A ordem abaixo será a mesma exibida no WhatsApp.</p>
            </div>
            <button
              type="button"
              onClick={() => addOption(selectedNode.id)}
              disabled={selectedNode.options.length >= 12}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Plus size={14} /> Adicionar opção
            </button>
          </div>

          {selectedNode.options.length === 0 ? (
            <div className="mt-4 border-y border-dashed border-slate-200 py-10 text-center">
              <GitBranch size={22} className="mx-auto text-slate-300" />
              <p className="mt-2 text-sm font-bold text-slate-500">Esta etapa ainda não tem opções.</p>
              <p className="mt-1 text-xs font-medium text-slate-400">Adicione uma opção para continuar, responder ou encaminhar.</p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100 border-y border-slate-200">
              {selectedNode.options.map((entry, index) => (
                <article key={entry.id} className={`py-4 ${entry.enabled ? '' : 'opacity-55'}`}>
                  <div className="grid gap-3 lg:grid-cols-[44px_minmax(180px,0.8fr)_minmax(210px,1fr)_auto] lg:items-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-500">
                      {index + 1}
                    </span>
                    <input
                      value={entry.label}
                      onChange={(event) => updateOption(selectedNode.id, entry.id, { label: event.target.value })}
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-[#001a33] outline-none focus:border-emerald-400"
                      placeholder="Texto da opção"
                    />
                    <select
                      value={entry.action}
                      onChange={(event) => setAction(entry, event.target.value as WhatsAppFlowActionType)}
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                    >
                      {Object.entries(actionLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <div className="flex items-center justify-end gap-1">
                      <label className="mr-1 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
                        <input
                          type="checkbox"
                          checked={entry.enabled}
                          onChange={(event) => updateOption(selectedNode.id, entry.id, { enabled: event.target.checked })}
                          className="h-4 w-4 accent-emerald-600"
                        />
                        Ativa
                      </label>
                      <button type="button" onClick={() => updateNode(selectedNode.id, { options: moveItem(selectedNode.options, index, -1) })} disabled={index === 0} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25" aria-label="Mover opção para cima">
                        <ArrowUp size={14} />
                      </button>
                      <button type="button" onClick={() => updateNode(selectedNode.id, { options: moveItem(selectedNode.options, index, 1) })} disabled={index === selectedNode.options.length - 1} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25" aria-label="Mover opção para baixo">
                        <ArrowDown size={14} />
                      </button>
                      <button type="button" onClick={() => removeOption(selectedNode.id, entry.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Excluir opção">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="ml-0 mt-3 grid gap-3 border-l-2 border-emerald-100 pl-4 lg:ml-11 lg:grid-cols-2">
                    {entry.action === 'goto' && (
                      <label className="block">
                        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-500"><CornerDownRight size={13} /> Próxima etapa</span>
                        <select
                          value={entry.targetNodeId || ''}
                          onChange={(event) => updateOption(selectedNode.id, entry.id, { targetNodeId: event.target.value })}
                          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                        >
                          <option value="">Selecione a etapa</option>
                          {definition.nodes.filter((item) => item.id !== selectedNode.id).map((item) => (
                            <option key={item.id} value={item.id}>{item.name}{item.enabled ? '' : ' — inativa'}</option>
                          ))}
                        </select>
                      </label>
                    )}

                    {entry.action === 'course_agent' && (
                      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs font-semibold leading-relaxed text-blue-800 lg:col-span-2">
                        Consulta apenas cursos e turmas publicados e a base de respostas aprovadas. Dúvidas sem resposta segura são encaminhadas ao Comercial.
                      </div>
                    )}

                    {['route', 'handoff', 'reply'].includes(entry.action) && (
                      <>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-bold text-slate-500">Setor de destino</span>
                          <select
                            value={entry.sector || 'atendimento_geral'}
                            onChange={(event) => updateOption(selectedNode.id, entry.id, { sector: event.target.value as WhatsAppSector })}
                            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                          >
                            {Object.entries(sectorLabels).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-bold text-slate-500">Polo</span>
                          <select
                            value={entry.poloMode || 'inherit'}
                            onChange={(event) => updateOption(selectedNode.id, entry.id, { poloMode: event.target.value as WhatsAppFlowOption['poloMode'] })}
                            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                          >
                            <option value="inherit">Usar polo escolhido anteriormente</option>
                            <option value="default">Usar matriz / polo padrão</option>
                            <option value="label">Escolher pelo nome</option>
                            <option value="none">Sem polo específico</option>
                          </select>
                        </label>
                        {entry.poloMode === 'label' && (
                          <label className="block">
                            <span className="mb-1.5 block text-xs font-bold text-slate-500">Nome ou cidade do polo</span>
                            <input
                              value={entry.poloLabel || ''}
                              onChange={(event) => updateOption(selectedNode.id, entry.id, { poloLabel: event.target.value })}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                              placeholder="Ex.: Japoatã"
                            />
                          </label>
                        )}
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-bold text-slate-500">Assunto exibido na conversa</span>
                          <input
                            value={entry.subject || ''}
                            onChange={(event) => updateOption(selectedNode.id, entry.id, { subject: event.target.value })}
                            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                            placeholder="Ex.: Matrícula em Curso Técnico"
                          />
                        </label>
                      </>
                    )}

                    {entry.action === 'reply' && (
                      <label className="block lg:col-span-2">
                        <span className="mb-1.5 block text-xs font-bold text-slate-500">Mensagem antes do encaminhamento</span>
                        <textarea
                          value={entry.responseMessage || ''}
                          onChange={(event) => updateOption(selectedNode.id, entry.id, { responseMessage: event.target.value })}
                          rows={3}
                          className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-emerald-400"
                        />
                      </label>
                    )}

                    {entry.action === 'redirect' && (
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-bold text-slate-500">Instituição de destino</span>
                        <select
                          value={entry.institution || 'anhanguera'}
                          onChange={(event) => updateOption(selectedNode.id, entry.id, { institution: event.target.value as WhatsAppFlowOption['institution'] })}
                          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                        >
                          <option value="anhanguera">Anhanguera</option>
                          <option value="unopar">Unopar</option>
                        </select>
                      </label>
                    )}

                    {['finance_link', 'finance_pix', 'finance_irpf'].includes(entry.action) && (
                      <p className="lg:col-span-2 text-xs font-semibold leading-relaxed text-blue-700">
                        Esta é uma ação protegida do sistema. Ela valida telefone e CPF antes de consultar cobrança ou documento.
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default WhatsAppFlowBuilder;
