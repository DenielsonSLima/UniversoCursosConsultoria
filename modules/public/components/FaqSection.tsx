
import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const FaqSection: React.FC = () => {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  const faqs = [
    { q: 'Os cursos oferecem certificado?', a: 'Sim, todos os nossos cursos possuem certificação válida em todo o território nacional, com carga horária detalhada.' },
    { q: 'Como funciona a consultoria?', a: 'Realizamos um diagnóstico inicial gratuito, seguido por um plano de ação personalizado focado nos KPIs do seu negócio.' },
    { q: 'Posso parcelar o valor dos cursos?', a: 'Com certeza! Oferecemos parcelamento em até 12x sem juros no cartão de crédito.' },
    { q: 'Existe suporte após o término do curso?', a: 'Sim, nossos alunos têm acesso vitalício à nossa comunidade e suporte especializado por 1 ano após a conclusão.' },
  ];

  return (
    <div className="py-20 bg-slate-50">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Perguntas Frequentes</h2>
          <p className="text-slate-600">Tire suas dúvidas rápidas sobre nossos serviços.</p>
        </div>
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-4 flex items-center justify-between text-left focus:outline-none"
              >
                <span className="font-semibold text-slate-900">{faq.q}</span>
                {openIndex === index ? <ChevronUp className="text-blue-600" /> : <ChevronDown className="text-slate-400" />}
              </button>
              {openIndex === index && (
                <div className="px-6 pb-6 text-slate-600 animate-fadeIn">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FaqSection;
