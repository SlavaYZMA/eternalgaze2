import { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'ru' | 'en';

interface Translations {
  [key: string]: {
    ru: string;
    en: string;
  };
}

export const translations: Translations = {
  // Navigation
  'nav.about': { ru: 'О проекте', en: 'About' },
  'nav.statement': { ru: 'Заявление художника', en: 'Artist Statement' },
  'nav.ethics': { ru: 'Этика', en: 'Ethics' },
  'nav.participate': { ru: 'Как участвовать', en: 'How to Participate' },
  'nav.contacts': { ru: 'Контакты', en: 'Contacts' },
  
  // Index page
  'index.title': { ru: 'ГОРГОНА', en: 'GORGONA' },
  'index.subtitle1': { ru: 'ВЕЧНОЕ', en: 'ETERNAL' },
  'index.subtitle2': { ru: 'ПОЛОТНО', en: 'CANVAS' },
  'index.description': { 
    ru: 'Каждая пара глаз принадлежит человеку, пережившему насилие. Они остаются здесь навсегда, пока сам человек не решит иначе.',
    en: 'Each pair of eyes belongs to someone who has experienced violence. They remain here forever, unless they choose otherwise.'
  },
  'index.record': { ru: 'ЗАПИСАТЬ', en: 'RECORD' },
  'index.watch': { ru: 'СМОТРЕТЬ', en: 'VIEW' },
  
  // Camera page
  'camera.instruction': { 
    ru: 'Смотрите прямо в камеру. Запись начнётся автоматически.',
    en: 'Look directly at the camera. Recording will start automatically.'
  },
  'camera.lookAtCamera': { ru: 'Смотрите прямо в камеру', en: 'Look at the camera' },
  'camera.recording': { ru: 'ЗАПИСЬ', en: 'REC' },
  'camera.paused': { ru: 'ПАУЗА', en: 'PAUSED' },
  'camera.saved': { ru: 'СОХРАНЕНО', en: 'SAVED' },
  'camera.deleteLink': { ru: 'Ссылка для удаления:', en: 'Delete link:' },
  'camera.viewCanvas': { ru: 'СМОТРЕТЬ ПОЛОТНО', en: 'VIEW CANVAS' },
  
  // Identity confirmation
  'camera.identity': {
    ru: 'Я подтверждаю, что идентифицирую себя как женщина, пережившая гендерное насилие, и делаю это честно.',
    en: 'I confirm that I identify as a woman who has experienced gender-based violence, and I do so honestly.'
  },
  'camera.confirm': { ru: 'ПОДТВЕРДИТЬ', en: 'CONFIRM' },
  
  // Consent
  'camera.consent': { ru: 'Я принимаю условия участия', en: 'I accept the terms of participation' },
  'camera.viewConsent': { ru: 'Просмотреть условия', en: 'View terms' },
  'camera.save': { ru: 'СОХРАНИТЬ НАВСЕГДА', en: 'SAVE FOREVER' },
  'camera.retake': { ru: 'ПЕРЕСНЯТЬ', en: 'RETAKE' },
  'camera.download': { ru: 'СКАЧАТЬ', en: 'DOWNLOAD' },
  
  // Support
  'support.title': { ru: 'Ресурсы поддержки', en: 'Support Resources' },
  'support.trigger': { 
    ru: '⚠️ Предупреждение о триггерах: Этот проект затрагивает темы насилия.',
    en: '⚠️ Trigger Warning: This project addresses themes of violence.'
  },
  'support.hotlines': { ru: 'Горячие линии:', en: 'Hotlines:' },
  
  // Canvas
  'canvas.loading': { ru: 'ЗАГРУЗКА...', en: 'LOADING...' },
  'canvas.empty': { ru: 'НЕТ ЗАПИСЕЙ', en: 'NO RECORDINGS' },
  'canvas.admin': { ru: 'АДМИН', en: 'ADMIN' },
  
  // About modal
  'about.title': { ru: 'О ПРОЕКТЕ', en: 'ABOUT' },
  'about.p1': {
    ru: 'ГОРГОНА — анонимный цифровой мемориал для тех, кто пережил насилие.',
    en: 'GORGONA is an anonymous digital memorial for those who have experienced violence.'
  },
  'about.p2': {
    ru: 'Каждый посетитель может записать короткое видео своих глаз — без лица, без имени, без идентификации. Эти глаза становятся частью вечного полотна памяти.',
    en: 'Each visitor can record a short video of their eyes — without face, without name, without identification. These eyes become part of an eternal canvas of memory.'
  },
  'about.p3': {
    ru: 'Видео хранится навсегда. Единственный человек, который может его удалить — тот, кто его создал.',
    en: 'The video is stored forever. The only person who can delete it is the one who created it.'
  },
  'about.p4': {
    ru: 'Проект назван в честь Горгоны Медузы — существа, чей взгляд обращал в камень. Здесь взгляд становится символом несломленной воли.',
    en: 'The project is named after Gorgon Medusa — a being whose gaze turned others to stone. Here, the gaze becomes a symbol of unbroken will.'
  },
  'about.privacy': {
    ru: 'Никакие личные данные не собираются. Все записи полностью анонимны.',
    en: 'No personal data is collected. All recordings are completely anonymous.'
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>('ru');

  const t = (key: string): string => {
    const translation = translations[key];
    if (!translation) return key;
    return translation[language];
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};
