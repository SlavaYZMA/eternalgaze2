import { Link } from 'react-router-dom';
import { useState } from 'react';
import { X } from 'lucide-react';

const Index = () => {
  const [showAbout, setShowAbout] = useState(false);

  return (
    <div className="min-h-screen bg-primary text-primary-foreground flex flex-col relative overflow-hidden font-mono">
      {/* Header */}
      <header className="p-6 md:p-10">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          ГОРГОНА
        </h1>
      </header>

      {/* Main content */}
      <main className="flex-1 px-6 md:px-10 pb-10">
        <div className="max-w-4xl">
          <p className="text-lg md:text-xl leading-relaxed mb-6">
            Каждая пара глаз была добавлена человеком, пережившим насилие. Они остаются здесь навсегда, пока сам человек не решит иначе.
          </p>
          <p className="text-lg md:text-xl leading-relaxed mb-12">
            Горгона никогда не отпускает взгляд. Это вечное полотно памяти — анонимное, неуничтожимое, принадлежащее только тем, кто смотрит.
          </p>
        </div>

        {/* Navigation links */}
        <nav className="space-y-4">
          <Link 
            to="/camera" 
            className="block text-2xl md:text-3xl font-bold underline underline-offset-4 hover:no-underline transition-all"
          >
            Я смотрю на вас --&gt;
          </Link>
          <Link 
            to="/canvas" 
            className="block text-2xl md:text-3xl font-bold underline underline-offset-4 hover:no-underline transition-all"
          >
            Посмотреть на все глаза --&gt;
          </Link>
        </nav>
      </main>

      {/* Footer */}
      <footer className="p-6 md:p-10 space-y-6">
        <button
          onClick={() => setShowAbout(true)}
          className="text-lg font-bold underline underline-offset-4 hover:no-underline"
        >
          О проекте --&gt;
        </button>

        {/* Social links placeholder */}
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="opacity-60">© ГОРГОНА 2024</span>
        </div>
      </footer>

      {/* About Modal */}
      {showAbout && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6"
          onClick={() => setShowAbout(false)}
        >
          <div 
            className="bg-primary text-primary-foreground max-w-2xl w-full max-h-[80vh] overflow-y-auto p-8 md:p-12 relative"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setShowAbout(false)}
              className="absolute top-4 right-4 p-2 hover:opacity-60 transition-opacity"
            >
              <X size={24} />
            </button>

            <h2 className="text-2xl md:text-3xl font-bold mb-8">О проекте</h2>
            
            <div className="space-y-6 text-base md:text-lg leading-relaxed">
              <p>
                <strong>ГОРГОНА</strong> — это анонимный цифровой мемориал, созданный для тех, кто пережил насилие.
              </p>
              <p>
                Каждый посетитель может записать короткое видео своих глаз — без лица, без имени, без какой-либо идентификации. Эти глаза становятся частью вечного полотна памяти.
              </p>
              <p>
                Видео хранится навсегда. Единственный человек, который может его удалить — это тот, кто его создал. При записи генерируется одноразовая ссылка для удаления, которую можно использовать в любой момент.
              </p>
              <p>
                Проект назван в честь Горгоны Медузы — существа, чей взгляд обращал в камень. Здесь взгляд становится символом несломленной воли и молчаливого свидетельства.
              </p>
              <p className="opacity-60 text-sm mt-8">
                Никакие личные данные не собираются. Все записи полностью анонимны.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;