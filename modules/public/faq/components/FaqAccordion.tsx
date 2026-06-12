
import React, { useState, useEffect } from 'react';
import { ChevronDown, HelpCircle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

interface FaqAccordionProps {
  searchTerm: string;
}

const ITEMS_PER_PAGE = 5;

const faqData = [
  { q: "Quais cursos vocês oferecem?", a: "Oferecemos uma ampla gama de cursos técnicos (Saúde, Estética, Segurança), Cursos Livres, EAD e Ensino Superior em parceria com grandes instituições." },
  { q: "Qual o valor do curso?", a: "Os valores variam conforme a modalidade e duração. Entre em contato com nossa equipe comercial para obter a tabela de preços atualizada." },
  { q: "Qual valor do curso e forma de parcelamento?", a: "Oferecemos opções de parcelamento no boleto bancário ou cartão de crédito em até 12x. Temos condições especiais para pagamento antecipado." },
  { q: "Quais são os documentos necessários para fazer a matrícula?", a: "Geralmente solicitamos RG, CPF, Comprovante de Residência e Histórico Escolar. Para cursos técnicos, documentos adicionais podem ser requeridos." },
  { q: "Quais são os dias e horários das aulas?", a: "Temos turmas nos períodos matutino, vespertino e noturno, além de aulas aos sábados, dependendo do curso escolhido." },
  { q: "Onde a escola está localizada?", a: "Possuímos unidades estratégicas no Sertão Sergipano, em Japoatã, Aquidabã e Porto da Folha." },
  { q: "O curso é reconhecido? O certificado é válido?", a: "Sim! Nossos cursos técnicos são autorizados pelos órgãos competentes (CEE/SE) e os certificados possuem validade nacional." },
  { q: "Qual a duração total do curso?", a: "Cursos Livres duram de poucas semanas a meses. Cursos Técnicos geralmente duram entre 18 a 24 meses." },
  { q: "O curso tem estágio obrigatório? A escola ajuda a conseguir estágio?", a: "Muitos de nossos cursos técnicos possuem estágio obrigatório. A Universo possui parcerias com prefeituras e empresas privadas para facilitar o encaminhamento." },
  { q: "As aulas são presenciais, online ou semipresenciais?", a: "Oferecemos as três modalidades! Você pode escolher a que melhor se adapta à sua rotina." },
  { q: "Quais são os materiais que o aluno precisa ter? A escola fornece apostila?", a: "A escola fornece material didático digital (apostilas). Materiais de uso individual (como jalecos ou kits específicos) são de responsabilidade do aluno." },
  { q: "Quando começa a próxima turma?", a: "Iniciamos novas turmas mensalmente. Consulte nossa secretaria para as datas exatas do seu curso de interesse." },
  { q: "Posso começar a estudar ainda esse mês?", a: "Dependendo da disponibilidade de vagas e da modalidade (especialmente EAD), é possível iniciar imediatamente." },
  { q: "Quais são os requisitos para fazer o curso? (idade mínima, escolaridade etc.)", a: "A maioria dos cursos técnicos exige ensino médio completo ou em curso. Cursos livres podem ter requisitos variados." },
  { q: "Posso fazer mais de um curso ao mesmo tempo?", a: "Sim, desde que haja compatibilidade de horários. Muitos alunos optam por um técnico e um curso livre complementar." },
  { q: "O que acontece se eu faltar a uma aula?", a: "O aluno deve manter uma frequência mínima. Em caso de faltas, oferecemos suporte para reposição de conteúdo conforme o regimento escolar." },
  { q: "Tem desconto para pagamento à vista? Ou para grupos/família?", a: "Sim! Temos políticas de descontos para pagamento à vista e planos especiais para grupos de empresas ou membros da mesma família." },
  { q: "Depois que eu concluir o curso, recebo certificado impresso ou digital?", a: "Emitimos o certificado oficial em formato físico (impresso em papel especial) e também disponibilizamos a versão digital para sua conveniência." },
  { q: "A escola ajuda com encaminhamento para o mercado de trabalho?", a: "Sim, mantemos um banco de talentos e compartilhamos oportunidades exclusivas de nossas instituições parceiras com nossos alunos." },
];

const FaqAccordion: React.FC<FaqAccordionProps> = ({ searchTerm }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Reinicia a página quando o termo de busca mudar
  useEffect(() => {
    setCurrentPage(1);
    setOpenIndex(null);
  }, [searchTerm]);

  const filteredFaqs = faqData.filter(faq => 
    faq.q.toLowerCase().includes(searchTerm.toLowerCase()) || 
    faq.a.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredFaqs.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedFaqs = filteredFaqs.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (filteredFaqs.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
        <div className="flex justify-center mb-4">
          <AlertCircle className="text-slate-300" size={48} />
        </div>
        <p className="text-slate-500 font-medium text-lg">Nenhuma pergunta encontrada para sua busca.</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-4 text-blue-600 font-bold hover:underline"
        >
          Ver todas as perguntas
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 min-h-[400px]">
        {paginatedFaqs.map((item, index) => {
          const globalIndex = startIndex + index;
          return (
            <div 
              key={globalIndex} 
              className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === globalIndex ? null : globalIndex)}
                className="w-full px-6 py-5 flex items-center justify-between text-left focus:outline-none group"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg transition-colors ${openIndex === globalIndex ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'}`}>
                    <HelpCircle size={20} />
                  </div>
                  <span className={`font-bold text-lg ${openIndex === globalIndex ? 'text-blue-700' : 'text-slate-800'}`}>
                    {item.q}
                  </span>
                </div>
                <div className={`transition-transform duration-300 ${openIndex === globalIndex ? 'rotate-180' : ''}`}>
                  <ChevronDown className={openIndex === globalIndex ? 'text-blue-600' : 'text-slate-400'} />
                </div>
              </button>
              
              <div 
                className={`transition-all duration-300 ease-in-out overflow-hidden ${
                  openIndex === globalIndex ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="px-6 pb-6 pt-2 ml-14 text-slate-600 leading-relaxed border-t border-slate-50">
                  {item.a}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Controles de Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-12 py-4">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="p-3 rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-blue-50 hover:text-blue-600 transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-10 h-10 rounded-xl font-bold transition-all ${
                  currentPage === page 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                    : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="p-3 rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-blue-50 hover:text-blue-600 transition-all"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}
      
      <div className="text-center text-slate-400 text-xs uppercase tracking-widest font-bold mt-4">
        Página {currentPage} de {totalPages} • {filteredFaqs.length} resultados
      </div>
    </div>
  );
};

export default FaqAccordion;
