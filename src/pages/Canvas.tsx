import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Trash2, Shield } from 'lucide-react';

interface EyeRecord {
  cid: string;
  created_at: string;
}

const ADMIN_SECRET_KEY = 'gorgona_admin_secret';
const ITEMS_PER_PAGE = 50;

const Canvas = () => {
  const [searchParams] = useSearchParams();
  const [eyes, setEyes] = useState<EyeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [deletingCid, setDeletingCid] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const storageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/eyes/`;

  // Check admin mode
  useEffect(() => {
    const adminParam = searchParams.get('admin');
    const storedSecret = localStorage.getItem(ADMIN_SECRET_KEY);
    
    if (adminParam === '1' && storedSecret) {
      setIsAdmin(true);
    } else if (adminParam === '1') {
      const secret = prompt('Введите admin secret:');
      if (secret) {
        localStorage.setItem(ADMIN_SECRET_KEY, secret);
        setIsAdmin(true);
      }
    }
  }, [searchParams]);

  const loadEyes = useCallback(async (pageNum: number, append = false) => {
    try {
      const from = pageNum * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error: queryError } = await supabase
        .from('eyes')
        .select('cid, created_at')
        .order('created_at', { ascending: true })
        .range(from, to);

      if (queryError) throw queryError;

      if (data) {
        if (append) {
          setEyes(prev => [...prev, ...data]);
        } else {
          setEyes(data);
        }
        setHasMore(data.length === ITEMS_PER_PAGE);
      }
    } catch (err: any) {
      console.error('Load error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEyes(0);

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
            setEyes(prev => [...prev, payload.new as EyeRecord]);
          } else if (payload.eventType === 'DELETE') {
            setEyes(prev => prev.filter(e => e.cid !== (payload.old as EyeRecord).cid));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadEyes]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          setPage(prev => {
            const nextPage = prev + 1;
            loadEyes(nextPage, true);
            return nextPage;
          });
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [hasMore, loading, loadEyes]);

  const handleAdminDelete = async (cid: string) => {
    if (!confirm('Удалить это видео навсегда?')) return;

    const adminSecret = localStorage.getItem(ADMIN_SECRET_KEY);
    if (!adminSecret) {
      alert('Admin secret не найден');
      return;
    }

    setDeletingCid(cid);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-eyes`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cid, adminSecret })
        }
      );

      const result = await response.json();

      if (result.success) {
        setEyes(prev => prev.filter(e => e.cid !== cid));
      } else {
        alert('Ошибка удаления: ' + (result.error || 'Unknown error'));
      }
    } catch (err: any) {
      console.error('Delete error:', err);
      alert('Ошибка сети');
    } finally {
      setDeletingCid(null);
    }
  };

  const enableAdminMode = () => {
    const secret = prompt('Введите admin secret:');
    if (secret) {
      localStorage.setItem(ADMIN_SECRET_KEY, secret);
      setIsAdmin(true);
      setShowAdminPanel(false);
    }
  };

  if (loading && eyes.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-mono">
        <p className="text-gray-500 text-lg">Загрузка глаз...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-mono">
        <p className="text-red-500 text-lg">Ошибка: {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black font-mono">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-sm">
        <div className="flex items-center justify-between p-4">
          <Link to="/" className="text-gray-500 hover:text-white">
            <ArrowLeft size={24} />
          </Link>
          
          <div className="flex items-center gap-4">
            {isAdmin && (
              <div className="bg-red-600 text-white px-3 py-1 text-xs font-bold uppercase">
                ADMIN
              </div>
            )}
            <button
              onClick={() => setShowAdminPanel(!showAdminPanel)}
              className="text-gray-500 hover:text-white p-2"
              title="Admin panel"
            >
              <Shield size={20} />
            </button>
          </div>
        </div>
        
        {/* Admin panel */}
        {showAdminPanel && (
          <div className="bg-black/95 border-t border-white/10 p-4">
            {isAdmin ? (
              <div className="text-center">
                <p className="text-green-500 text-sm mb-2">Режим администратора активен</p>
                <p className="text-gray-500 text-xs">Наведите на видео для удаления</p>
                <button
                  onClick={() => {
                    localStorage.removeItem(ADMIN_SECRET_KEY);
                    setIsAdmin(false);
                    setShowAdminPanel(false);
                  }}
                  className="mt-3 text-red-500 text-sm underline hover:no-underline"
                >
                  Выйти из режима админа
                </button>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-gray-500 text-sm mb-3">Войти как администратор</p>
                <button
                  onClick={enableAdminMode}
                  className="border border-white text-white px-6 py-2 text-sm hover:bg-white hover:text-black transition-all"
                >
                  Ввести секрет
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {eyes.length === 0 ? (
        <div className="min-h-screen flex items-center justify-center pt-16">
          <p className="text-gray-500 text-lg">Пока нет глаз</p>
        </div>
      ) : (
        <div className="pt-16">
          {/* Full-width dense grid */}
          <div 
            className="flex flex-wrap w-full"
            style={{ margin: 0, padding: 0 }}
          >
            {eyes.map((eye) => (
              <div
                key={eye.cid}
                className="relative group flex-shrink-0"
                style={{ width: 512, height: 128 }}
              >
                <video
                  src={`${storageUrl}${eye.cid}`}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover block"
                />
                
                {/* Admin delete button - always visible for admin */}
                {isAdmin && (
                  <button
                    onClick={() => handleAdminDelete(eye.cid)}
                    disabled={deletingCid === eye.cid}
                    className="absolute top-2 right-2 bg-red-600/90 hover:bg-red-500 text-white p-2 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                  >
                    {deletingCid === eye.cid ? (
                      <span className="text-xs px-1">...</span>
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Load more trigger */}
          {hasMore && (
            <div
              ref={loadMoreRef}
              className="h-20 flex items-center justify-center"
            >
              <p className="text-gray-600 text-sm">Загрузка...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Canvas;