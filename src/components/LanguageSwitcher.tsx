import { useLanguage } from '@/contexts/LanguageContext';

const LanguageSwitcher = () => {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center gap-1 text-xs tracking-wider">
      <button
        onClick={() => setLanguage('ru')}
        className={`px-2 py-1 transition-colors ${
          language === 'ru' 
            ? 'text-white' 
            : 'text-white/30 hover:text-white/60'
        }`}
      >
        RU
      </button>
      <span className="text-white/20">/</span>
      <button
        onClick={() => setLanguage('en')}
        className={`px-2 py-1 transition-colors ${
          language === 'en' 
            ? 'text-white' 
            : 'text-white/30 hover:text-white/60'
        }`}
      >
        EN
      </button>
    </div>
  );
};

export default LanguageSwitcher;
