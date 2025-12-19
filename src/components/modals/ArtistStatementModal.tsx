import NavModal from './NavModal';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ArtistStatementModal = ({ isOpen, onClose }: Props) => {
  const { language, t } = useLanguage();

  const contentRu = (
    <div className="space-y-6 text-sm leading-relaxed text-white/60">
      <p>
        «Вечное полотно» — партиципаторная цифровая видео-инсталляция, состоящая из анонимных 5-секундных крупноплановых записей глаз женщин, переживших гендерное насилие.
      </p>
      <p>
        Проект приглашает участниц добровольно и анонимно внести свой «взгляд» в коллективную визуальную память — создавая тем самым живой, постоянно расширяющийся цифровой мемориал.
      </p>
      <p>
        Каждый фрагмент — это акт свидетельства. Глаза — единственный видимый элемент — становятся символом присутствия, молчаливого сопротивления и коллективной памяти.
      </p>
      <p>
        Инсталляция существует как бесконечно разрастающееся «полотно» из глаз, воспроизводимых в цикле. Зритель погружается в это поле взглядов, где каждая пара глаз представляет уникальную, но анонимную историю.
      </p>
      <p className="text-white/40 italic">
        Этот проект не документирует насилие — он документирует присутствие тех, кто его пережил.
      </p>
    </div>
  );

  const contentEn = (
    <div className="space-y-6 text-sm leading-relaxed text-white/60">
      <p>
        "Eternal Canvas" is a participatory digital video installation consisting of anonymous 5-second close-up recordings of the eyes of women who have experienced gender-based violence.
      </p>
      <p>
        The project invites participants to voluntarily and anonymously contribute their "gaze" to a collective visual memory — creating a living, ever-expanding digital memorial.
      </p>
      <p>
        Each fragment is an act of witnessing. The eyes — the only visible element — become a symbol of presence, silent resistance, and collective memory.
      </p>
      <p>
        The installation exists as an infinitely growing "canvas" of eyes played in a loop. The viewer is immersed in this field of gazes, where each pair of eyes represents a unique but anonymous story.
      </p>
      <p className="text-white/40 italic">
        This project does not document violence — it documents the presence of those who survived it.
      </p>
    </div>
  );

  return (
    <NavModal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={t('nav.statement')}
    >
      {language === 'ru' ? contentRu : contentEn}
    </NavModal>
  );
};

export default ArtistStatementModal;
