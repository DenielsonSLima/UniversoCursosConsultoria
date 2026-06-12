
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Quote } from 'lucide-react';
import LoginForm from './components/LoginForm';
import { loginService } from './login.service';
import { LoginCredentials } from './login.types';

const quotes = [
  { text: "A educação é a arma mais poderosa que você pode usar para mudar o mundo.", author: "Nelson Mandela" },
  { text: "O investimento em conhecimento rende os melhores juros.", author: "Benjamin Franklin" },
  { text: "Aprender é a única coisa de que a mente nunca se cansa, nunca tem medo e nunca se arrepende.", author: "Leonardo da Vinci" },
  { text: "A educação tem raízes amargas, mas os seus frutos são doces.", author: "Aristóteles" },
  { text: "O ser humano é aquilo que a educação faz dele.", author: "Immanuel Kant" },
  { text: "Educação não transforma o mundo. Educação muda as pessoas. Pessoas transformam o mundo.", author: "Paulo Freire" },
  { text: "O conhecimento é a chave que abre todas as portas.", author: "Autor Desconhecido" },
];

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = React.useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [dailyQuote, setDailyQuote] = useState(quotes[0]);

  // Atualiza o relógio a cada segundo
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Seleciona uma frase aleatória ao montar o componente
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    setDailyQuote(randomQuote);

    return () => clearInterval(timer);
  }, []);

  const handleLogin = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    
    try {
      // Simulação de delay para feedback visual
      await new Promise(resolve => setTimeout(resolve, 1500));

      const email = credentials.email.toLowerCase();
      const password = credentials.password;
      
      // Lógica de Acesso Provisória (Hardcoded para demonstração)
      if (email === 'gestor@universo.com' && password === '123456') {
        navigate('/gestor');
        return;
      }

      // Fallback para outros perfis (baseado apenas no email por enquanto)
      if (email.includes('professor')) {
        navigate('/professor');
      } else if (email.includes('aluno')) {
        navigate('/aluno');
      } else if (email.includes('gestor')) {
        // Fallback genérico se o usuário esquecer a senha específica mas usar a palavra gestor
        navigate('/gestor');
      } else {
        alert('Usuário não encontrado. Tente: gestor@universo.com / 123456');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Formatadores de data e hora
  const formattedDate = currentTime.toLocaleDateString('pt-BR', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
  
  const formattedTime = currentTime.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <div className="min-h-screen w-full flex bg-slate-50 font-sans">
      
      {/* Lado Esquerdo - Identidade Visual (Degradê Azul Royal para Petróleo) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[#001a33] items-center justify-center">
        {/* Imagem de Fundo base */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1920" 
            alt="Universidade" 
            className="w-full h-full object-cover opacity-60"
          />
          {/* Degradê ajustado para ser mais transparente e permitir ver a imagem */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#4169E1]/70 to-[#001a33]/90 mix-blend-multiply"></div>
        </div>

        {/* Card com Efeito Vidro (Glassmorphism) */}
        <div className="relative z-10 w-full max-w-xl p-8">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-[3rem] p-12 text-center relative overflow-hidden group hover:bg-white/15 transition-all duration-500 flex flex-col items-center">
            
            {/* Efeito de brilho decorativo no vidro */}
            <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-gradient-to-br from-white/10 via-transparent to-transparent rotate-45 pointer-events-none"></div>

            <div className="relative z-10 w-full">
              
              {/* Relógio e Data */}
              <div className="mb-10 flex flex-col items-center text-blue-100 border-b border-white/10 pb-6 w-full">
                <p className="uppercase tracking-[0.2em] text-[10px] font-bold mb-1 opacity-80">
                  {formattedDate}
                </p>
                <div className="text-4xl font-mono font-bold tracking-widest text-white flex items-center gap-3">
                  <Clock size={24} className="text-blue-400" />
                  {formattedTime}
                </div>
              </div>

              {/* Logo */}
              <div className="mb-8 transform transition-transform duration-500 cursor-default">
                <h1 className="text-6xl font-black tracking-tighter uppercase drop-shadow-lg mb-2 text-white">
                  Universo
                </h1>
                <div className="h-1.5 w-32 bg-gradient-to-r from-transparent via-white/50 to-transparent mx-auto rounded-full mb-4"></div>
                <h2 className="text-lg font-medium tracking-[0.35em] uppercase text-blue-50 drop-shadow-md">
                  Cursos e Consultoria
                </h2>
              </div>
              
              {/* Frase do Dia */}
              <div className="bg-white/5 rounded-2xl p-6 border border-white/5 mb-8">
                <div className="flex justify-center mb-4 text-blue-300 opacity-50">
                  <Quote size={24} />
                </div>
                <p className="text-white text-lg font-light leading-relaxed italic mb-4">
                  "{dailyQuote.text}"
                </p>
                <p className="text-xs uppercase tracking-widest font-bold text-blue-200">
                  — {dailyQuote.author}
                </p>
              </div>

              <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 pt-4">
                © {new Date().getFullYear()} Portal Acadêmico
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lado Direito - Formulário de Login */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 relative">
        {/* Botão Voltar */}
        <button 
          onClick={() => navigate('/')}
          className="absolute top-8 left-8 flex items-center gap-2 text-slate-500 hover:text-[#4169E1] transition-colors text-sm font-bold uppercase tracking-widest group"
        >
          <div className="p-2 rounded-full bg-white border border-slate-200 shadow-sm group-hover:border-[#4169E1] transition-colors">
            <ArrowLeft size={16} />
          </div>
          <span className="hidden sm:inline">Voltar ao site</span>
        </button>

        <div className="w-full max-w-md">
          <div className="mb-10 text-center lg:text-left">
            {/* Logo visível apenas no Mobile */}
            <div className="lg:hidden mb-8 inline-block">
              <span className="block text-3xl font-black text-[#001a33] uppercase tracking-tighter">Universo</span>
              <span className="block text-[10px] tracking-[0.25em] text-blue-600 uppercase font-bold">Cursos e Consultoria</span>
            </div>

            <h2 className="text-3xl font-black text-[#001a33] mb-3">Bem-vindo de volta!</h2>
            <p className="text-slate-500">Por favor, insira suas credenciais para acessar o portal.</p>
          </div>

          <LoginForm 
            onSubmit={handleLogin} 
            isLoading={isLoading} 
            onBack={() => navigate('/')} 
          />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
