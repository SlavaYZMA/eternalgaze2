import NavModal from './NavModal';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const AboutModal = ({ isOpen, onClose }: Props) => {
  const { language, t } = useLanguage();

  const contentRu = (
    <div className="space-y-6 text-sm leading-relaxed text-white/60">
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
  );

  const contentEn = (
    <div className="space-y-6 text-sm leading-relaxed text-white/60">
      <p>
        <span className="text-white/80">GORGONA</span> is an anonymous digital memorial for those who have experienced violence.
      </p>
      <p>
        Each visitor can record a short video of their eyes — without face, without name, without identification. These eyes become part of an eternal canvas of memory.
      </p>
      <p>
        The video is stored forever. The only person who can delete it is the one who created it.
      </p>
      <p>
        The project is named after Gorgon Medusa — a being whose gaze turned others to stone. Here, the gaze becomes a symbol of unbroken will.
      </p>
      <p className="text-white/30 text-xs pt-4 border-t border-white/10">
        No personal data is collected. All recordings are completely anonymous.
      </p>
    </div>
  );

  return (
    <NavModal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={t('nav.about')}
    >
      {language === 'ru' ? contentRu : contentEn}
    </NavModal>
  );
};

export default AboutModal;
