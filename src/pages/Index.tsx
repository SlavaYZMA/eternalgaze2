import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface EyeRecord {
  cid: string;
}

const Index = () => {
  const [showAbout, setShowAbout] = useState(false);
  const [backgroundEyes, setBackgroundEyes] = useState<EyeRecord[]>([]);

  const storageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/eyes/`;

  useEffect(() => {
    // Load some eyes for background
    const loadEyes = async () => {
      const { data } = await supabase
        .from('eyes')
        .select('cid')
        .limit(20);
      if (data) setBackgroundEyes(data);
    };
    loadEyes();
  }, []);

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden font-mono">
      
      {/* Background canvas preview - very dim */}
      {backgroundEyes.length > 0 && (
        <div className="absolute inset-0 opacity-[0.08] pointer-events-none">
          <div className="flex flex-wrap w-full">
            {backgroundEyes.map((eye, i) => (
              <div key={eye.cid + i} className="flex-shrink-0" style={{ width: 512, height: 128 }}>
                <video
                  src={`${storageUrl}${eye.cid}`}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="p-6 md:p-10">
          <h1 className="text-lg md:text-xl font-bold tracking-[0.3em] text-white/90">
            ГОРГОНА
          </h1>
        </header>

        {/* Main content - centered like patternradio */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 -mt-20">
          <div className="max-w-2xl text-center">
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-light tracking-wide mb-8 leading-tight">
              <span className="text-white">ВЕЧНОЕ</span>
              <span className="text-white/40 ml-4">ПОЛОТНО</span>
            </h2>
            
            <p className="text-white/40 text-sm md:text-base leading-relaxed max-w-lg mx-auto mb-12 tracking-wide">
              Каждая пара глаз принадлежит человеку, пережившему насилие. 
              Они остаются здесь навсегда, пока сам человек не решит иначе.
            </p>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link 
                to="/camera" 
                className="px-10 py-4 border border-white text-white text-sm tracking-[0.2em] hover:bg-white hover:text-black transition-all duration-300"
              >
                ЗАПИСАТЬ
              </Link>
              <Link 
                to="/canvas" 
                className="px-10 py-4 border border-white/30 text-white/60 text-sm tracking-[0.2em] hover:border-white hover:text-white transition-all duration-300"
              >
                СМОТРЕТЬ
              </Link>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="p-6 md:p-10 flex items-center justify-between">
          <button
            onClick={() => setShowAbout(true)}
            className="text-white/30 text-xs tracking-widest hover:text-white/60 transition-colors"
          >
            О ПРОЕКТЕ
          </button>
          <span className="text-white/20 text-xs tracking-widest">© 2024</span>
        </footer>
      </div>

      {/* About Modal */}
      {showAbout && (
        <div 
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-6"
          onClick={() => setShowAbout(false)}
        >
          <div 
            className="bg-black border border-white/10 max-w-xl w-full max-h-[80vh] overflow-y-auto p-8 md:p-12 relative"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setShowAbout(false)}
              className="absolute top-4 right-4 text-white/30 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl tracking-[0.2em] mb-8 text-white/90">О ПРОЕКТЕ</h2>
            
            <div className="space-y-6 text-sm leading-relaxed text-white/50">
              <p>
                <span className="text-white/80">ГОРГОНА</span> — анонимный цифровой мемориал для тех, кто пережил насилие.
              </p>
              <p>
                Каждый посетитель может записать короткое видео своих глаз — без лица, без имени, без идентификации. Эти глаза становятся частью вечного полотна памяти.
              </p>
              <p>
                Видео хранится навсегда. Единственный человек, который может его удалить — тот, кто его создал.
              </p>
              <p>
                Проект назван в честь Горгоны Медузы — существа, чей взгляд обращал в камень. Здесь взгляд становится символом несломленной воли.
              </p>
              <p className="text-white/30 text-xs pt-4 border-t border-white/10">
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