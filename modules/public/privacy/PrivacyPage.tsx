
import React, { useEffect } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';

const PrivacyPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      
      <div className="bg-[#001a33] py-16 text-white">
        <div className="container mx-auto px-6 text-center">
          <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-4">
            Política de <span className="text-blue-400">Privacidade</span>
          </h1>
          <p className="text-blue-100 max-w-2xl mx-auto">
            Entenda como coletamos, usamos e protegemos seus dados.
          </p>
        </div>
      </div>

      <main className="flex-grow container mx-auto px-6 py-12 max-w-4xl text-slate-700 leading-relaxed">
        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">1. Introdução</h2>
            <p>
              A Universo Cursos e Consultoria valoriza a privacidade de seus usuários, alunos e parceiros. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos suas informações pessoais ao utilizar nosso site e serviços.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">2. Coleta de Dados</h2>
            <p className="mb-2">Coletamos informações pessoais que você nos fornece voluntariamente ao:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Preencher formulários de contato ou matrícula;</li>
              <li>Inscrever-se em nossa newsletter;</li>
              <li>Acessar nossa área do aluno ou portal do gestor.</li>
            </ul>
            <p className="mt-2">Os dados podem incluir nome, e-mail, telefone, CPF, endereço e dados acadêmicos.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">3. Uso das Informações</h2>
            <p>Utilizamos seus dados para:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Processar matrículas e emitir certificados;</li>
              <li>Comunicar informações sobre cursos e aulas;</li>
              <li>Melhorar nossos serviços e atendimento;</li>
              <li>Cumprir obrigações legais e regulatórias.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">4. Proteção de Dados</h2>
            <p>
              Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados contra acesso não autorizado, perda ou alteração. Utilizamos criptografia e servidores seguros.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">5. Compartilhamento</h2>
            <p>
              Não vendemos suas informações pessoais. Podemos compartilhar dados com órgãos reguladores (como Secretarias de Educação) quando exigido por lei para fins de certificação.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">6. Contato</h2>
            <p>
              Para dúvidas sobre esta política ou para exercer seus direitos de titular de dados, entre em contato através do e-mail: contato@universoconsultoria.com
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default PrivacyPage;
