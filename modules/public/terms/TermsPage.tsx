
import React, { useEffect } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';

const TermsPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      
      <div className="bg-[#001a33] py-16 text-white">
        <div className="container mx-auto px-6 text-center">
          <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-4">
            Termos de <span className="text-blue-400">Uso</span>
          </h1>
          <p className="text-blue-100 max-w-2xl mx-auto">
            Regras e condições para utilização dos nossos serviços.
          </p>
        </div>
      </div>

      <main className="flex-grow container mx-auto px-6 py-12 max-w-4xl text-slate-700 leading-relaxed">
        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">1. Aceitação dos Termos</h2>
            <p>
              Ao acessar o site e os serviços da Universo Cursos e Consultoria, você concorda em cumprir estes termos de serviço, todas as leis e regulamentos aplicáveis. Se você não concordar com algum desses termos, está proibido de usar ou acessar este site.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">2. Uso da Licença</h2>
            <p>
              É concedida permissão para baixar temporariamente uma cópia dos materiais (informações ou software) no site da Universo Cursos e Consultoria, apenas para visualização transitória pessoal e não comercial.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">3. Matrículas e Cancelamentos</h2>
            <p>
              As matrículas realizadas online estão sujeitas à confirmação de pagamento e disponibilidade de vagas. Políticas de cancelamento e reembolso seguem o contrato de prestação de serviços educacionais assinado no ato da matrícula.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">4. Propriedade Intelectual</h2>
            <p>
              Todo o conteúdo didático, logotipos, marcas e materiais disponibilizados são propriedade exclusiva da Universo Cursos e Consultoria ou de seus licenciadores, sendo protegidos por leis de direitos autorais.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">5. Modificações</h2>
            <p>
              A Universo Cursos e Consultoria pode revisar estes termos de serviço a qualquer momento, sem aviso prévio. Ao usar este site, você concorda em ficar vinculado à versão atual desses termos de serviço.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default TermsPage;
