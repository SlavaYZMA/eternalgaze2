import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft } from 'lucide-react';

interface EyeRecord {
  cid: string;
  created_at: string;
}

const Canvas = () => {
  const [eyes, setEyes] = useState<EyeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const storageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/eyes/`;

  useEffect(() => {
    const loadEyes = async () => {
      try {
        const { data, error } = await supabase
          .from('eyes')
          .select('cid, created_at')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setEyes(data || []);
      } catch (err: any) {
        console.error('Load error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadEyes();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('eyes-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'eyes'
        },
        (payload) => {
          console.log('Realtime update:', payload);
          if (payload.eventType === 'INSERT') {
            setEyes(prev => [payload.new as EyeRecord, ...prev]);
          } else if (payload.eventType === 'DELETE') {
            setEyes(prev => prev.filter(e => e.cid !== (payload.old as EyeRecord).cid));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-gray-500 text-lg">Загрузка глаз...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-red-500 text-lg">Ошибка: {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <Link 
        to="/" 
        className="fixed top-5 left-5 text-gray-500 hover:text-white text-2xl z-50"
      >
        <ArrowLeft size={24} />
      </Link>

      {eyes.length === 0 ? (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-500 text-lg">Пока нет глаз</p>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center pt-16">
          {eyes.map((eye) => (
            <video
              key={eye.cid}
              src={`${storageUrl}${eye.cid}`}
              autoPlay
              loop
              muted
              playsInline
              className="w-[512px] h-[128px] object-cover block"
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Canvas;