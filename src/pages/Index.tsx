import { Link } from 'react-router-dom';

const Index = () => {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background effect */}
      <div 
        className="fixed inset-0 opacity-[0.09] pointer-events-none"
        style={{
          backgroundSize: '80px 20px',
          backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)'
        }}
      />

      {/* Main content */}
      <div className="relative z-10 text-center">
        <h1 className="text-3xl md:text-4xl font-bold mb-12 tracking-wide">
          ГОРГОНА НИКОГДА НЕ ОТПУСКАЕТ ВЗГЛЯД
        </h1>

        <div className="flex flex-col sm:flex-row gap-5 justify-center">
          <Link to="/camera">
            <button className="bg-red-800 hover:bg-red-600 text-white px-10 py-5 text-2xl rounded-xl transition-all hover:scale-105 min-w-[280px]">
              Я СМОТРЮ НА ВАС
            </button>
          </Link>
          
          <Link to="/canvas">
            <button className="bg-white hover:bg-gray-200 text-black px-10 py-5 text-2xl rounded-xl transition-all hover:scale-105 min-w-[280px]">
              ПОСМОТРЕТЬ НА ВСЕ ГЛАЗА
            </button>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-8 left-0 w-full text-center text-sm text-gray-500 px-4">
        <p>Каждая пара глаз была добавлена человеком, пережившим насилие.</p>
        <p>Они остаются здесь навсегда, пока сам человек не решит иначе.</p>
      </div>
    </div>
  );
};

export default Index;