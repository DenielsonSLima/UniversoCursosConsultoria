// clientes.page.tsx
// ✅ Página "fina": orquestra, não contém lógica visual complexa
// ✅ Trata todos os estados: loading, error, empty, data
// ✅ Dados via hooks — zero fetch direto
// ✅ Callbacks passados para componentes filhos

import { useState } from 'react';
import { useClientes, useCriarCliente } from './clientes.hooks';
import { ClienteList } from './components/ClienteList';
import { ClienteFormAdd } from './components/ClienteFormAdd';
import { Button } from '@/lib/ui/Button';
import { Input } from '@/lib/ui/Input';
import { Spinner } from '@/lib/ui/Spinner';
import { ErrorMessage } from '@/lib/ui/ErrorMessage';
import { EmptyState } from '@/lib/ui/EmptyState';
import { Modal } from '@/lib/ui/Modal';
import { useToast } from '@/lib/ui/useToast';
import type { CreateClienteInput } from './clientes.types';

export function ClientesPage() {
  const { toast } = useToast();
  const [pagina, setPagina] = useState(0);
  const [busca, setBusca] = useState('');
  const [modalAberto, setModalAberto] = useState(false);

  // ✅ Dados via hooks — componente não faz fetch
  const { data, isLoading, isError, error, refetch } = useClientes(pagina, busca);
  const { mutate: criarCliente, isPending: criando } = useCriarCliente();

  const handleCriar = (input: CreateClienteInput) => {
    criarCliente(input, {
      onSuccess: () => {
        toast({ title: 'Cliente criado com sucesso!' });
        setModalAberto(false);
      },
      onError: (err) => {
        toast({ variant: 'destructive', title: 'Erro ao criar cliente', description: err.message });
      },
    });
  };

  // ─── Estados da Página ────────────────────────────────────────────────

  // ✅ Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
        <span className="ml-3 text-gray-600">Carregando clientes...</span>
      </div>
    );
  }

  // ✅ Erro
  if (isError) {
    return (
      <ErrorMessage
        title="Erro ao carregar clientes"
        message={error.message}
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
        <Button onClick={() => setModalAberto(true)}>
          + Novo Cliente
        </Button>
      </div>

      {/* Busca */}
      <div className="mb-4">
        <Input
          placeholder="Buscar por nome..."
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setPagina(0); }}
        />
      </div>

      {/* ✅ Estado vazio */}
      {data?.data.length === 0 ? (
        <EmptyState
          titulo="Nenhum cliente encontrado"
          descricao={busca ? 'Tente outros termos de busca.' : 'Comece criando o primeiro cliente.'}
          acao={!busca ? <Button onClick={() => setModalAberto(true)}>Criar Cliente</Button> : undefined}
        />
      ) : (
        <>
          {/* ✅ Dados passados como props — ClienteList não faz fetch */}
          <ClienteList
            clientes={data?.data ?? []}
            total={data?.total ?? 0}
            pagina={pagina}
            totalPaginas={data?.totalPaginas ?? 0}
            onPaginaChange={setPagina}
          />
        </>
      )}

      {/* Modal de criação */}
      <Modal
        aberto={modalAberto}
        titulo="Novo Cliente"
        onFechar={() => setModalAberto(false)}
      >
        <ClienteFormAdd onSubmit={handleCriar} carregando={criando} />
      </Modal>
    </div>
  );
}
