import React, { useMemo, useState } from 'react';
import { MessageSquare, RefreshCw, Search, Send, UserRound, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';

export interface InternalConversationContact {
  id: string;
  nome: string;
  tipo: 'Aluno';
  email?: string | null;
  telefone?: string | null;
  status?: string | null;
  cidade?: string | null;
  foto?: string | null;
}

interface CategoryOption {
  id: string;
  nome: string;
  ativo: boolean;
}

interface StartInternalConversationModalProps {
  open: boolean;
  categories: CategoryOption[];
  onClose: () => void;
  onStart: (contact: InternalConversationContact, message: string, categoryId: string | null) => Promise<void>;
}

const initials = (name?: string) => (
  String(name || 'AL')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
);

const defaultMessageFor = (name?: string) => {
  const firstName = String(name || '').split(' ')[0] || 'tudo bem';
  return `Olá, ${firstName}! Aqui é da Universo Cursos. Podemos falar sobre seu atendimento?`;
};

const StartInternalConversationModal: React.FC<StartInternalConversationModalProps> = ({
  open,
  categories,
  onClose,
  onStart,
}) => {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [starting, setStarting] = useState(false);

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['comunicacao', 'start-internal-students'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parceiros')
        .select('id,nome,tipo,email,telefone,status,cidade,foto_url')
        .eq('tipo', 'Aluno')
        .order('nome', { ascending: true });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.id,
        nome: row.nome,
        tipo: 'Aluno' as const,
        email: row.email,
        telefone: row.telefone,
        status: row.status,
        cidade: row.cidade,
        foto: row.foto_url,
      }));
    },
  });

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students;

    return students.filter((student) => [
      student.nome,
      student.email,
      student.telefone,
      student.cidade,
      student.status,
    ].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [students, search]);

  const selectedStudent = useMemo(() => {
    if (!filteredStudents.length) return null;
    return filteredStudents.find((student) => student.id === selectedId) || filteredStudents[0];
  }, [filteredStudents, selectedId]);

  React.useEffect(() => {
    if (!open) return;
    if (!selectedStudent) {
      setSelectedId(null);
      setMessage('');
      return;
    }

    setSelectedId(selectedStudent.id);
    setMessage((current) => current || defaultMessageFor(selectedStudent.nome));
  }, [open, selectedStudent?.id]);

  React.useEffect(() => {
    if (!open) return;
    const firstActive = categories.find((category) => category.ativo);
    setCategoryId((current) => current || firstActive?.id || '');
  }, [open, categories]);

  if (!open) return null;

  const handleStart = async () => {
    if (!selectedStudent || !message.trim()) return;
    setStarting(true);
    try {
      await onStart(selectedStudent, message.trim(), categoryId || null);
      onClose();
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <MessageSquare size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight text-[#001a33]">Iniciar conversa</h3>
              <p className="text-xs font-medium text-slate-400">Atendimento interno com alunos do portal</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[360px_1fr]">
          <div className="flex min-h-0 flex-col border-r border-slate-100 bg-slate-50/70">
            <div className="border-b border-slate-100 p-4">
              <label className="relative block">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar aluno..."
                  className="h-11 w-full rounded-xl border border-transparent bg-white pl-10 pr-4 text-xs font-bold text-slate-700 outline-none transition-all focus:border-blue-500"
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 p-8 text-xs font-bold text-slate-400">
                  <RefreshCw size={16} className="animate-spin" />
                  Carregando alunos...
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="p-8 text-center text-xs font-bold text-slate-400">Nenhum aluno encontrado.</div>
              ) : (
                filteredStudents.map((student) => {
                  const isSelected = selectedStudent?.id === student.id;

                  return (
                    <button
                      key={student.id}
                      onClick={() => {
                        setSelectedId(student.id);
                        setMessage(defaultMessageFor(student.nome));
                      }}
                      className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all ${
                        isSelected ? 'border border-slate-200 bg-white shadow-sm' : 'border border-transparent hover:bg-white'
                      }`}
                    >
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-blue-600 text-white shadow-sm">
                        {student.foto ? (
                          <img src={student.foto} alt={student.nome} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-bold">{initials(student.nome)}</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[#001a33]">{student.nome}</p>
                        <p className="mt-1 truncate text-xs font-medium text-slate-400">
                          {student.email || student.cidade || student.status || 'Aluno'}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto p-6 custom-scrollbar">
            {selectedStudent ? (
              <div className="space-y-5">
                <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-blue-600 text-lg font-bold text-white">
                    {selectedStudent.foto ? (
                      <img src={selectedStudent.foto} alt={selectedStudent.nome} className="h-full w-full object-cover" />
                    ) : initials(selectedStudent.nome)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Aluno selecionado</p>
                    <h4 className="truncate text-xl font-bold text-[#001a33]">{selectedStudent.nome}</h4>
                    <p className="mt-1 text-xs font-medium text-slate-500">{selectedStudent.email || 'Sem e-mail cadastrado'}</p>
                  </div>
                </div>

                <label className="block space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Setor do atendimento</span>
                  <select
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-blue-500"
                  >
                    <option value="">Geral</option>
                    {categories.filter((category) => category.ativo).map((category) => (
                      <option key={category.id} value={category.id}>{category.nome}</option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Primeira mensagem</span>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    className="h-44 w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold leading-relaxed text-slate-700 outline-none transition-all focus:border-blue-500"
                    placeholder="Escreva a mensagem inicial do atendimento..."
                  />
                </label>

                <button
                  onClick={handleStart}
                  disabled={starting || !message.trim()}
                  className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#001a33] px-5 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {starting ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                  {starting ? 'Iniciando...' : 'Iniciar atendimento'}
                </button>
              </div>
            ) : (
              <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                <UserRound size={40} className="text-slate-300" />
                <p className="mt-4 text-sm font-bold text-slate-500">Selecione um aluno</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StartInternalConversationModal;
