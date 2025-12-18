import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Trash2, Shield } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface EyeRecord {
  cid: string;
  created_at: string;
}

const ADMIN_SECRET_KEY = 'gorgona_admin_secret';
const ITEMS_PER_PAGE = 100;
const VIDEO_WIDTH = 512;
const VIDEO_HEIGHT = 128;
const MIN_VIDEO_WIDTH = 150;

const Canvas = () => {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const [eyes, setEyes] = useState<EyeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [deletingCid, setDeletingCid] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [itemWidth, setItemWidth] = useState(VIDEO_WIDTH);
  const [itemsPerRow, setItemsPerRow] = useState(4);
  
  const containerRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const storageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/eyes/`;

  // Calculate layout: adaptive grid, no horizontal gaps when enough content
  const calculateLayout = useCallback(() => {
    const viewportWidth = window.innerWidth;
    
    // Calculate base items per row at standard size
    const baseItemsPerRow = Math.max(1, Math.floor(viewportWidth / VIDEO_WIDTH));
    
    // If viewport is smaller than MIN_VIDEO_WIDTH, use min width with scroll
    if (viewportWidth < MIN_VIDEO_WIDTH) {
      setItemWidth(MIN_VIDEO_WIDTH);
      setItemsPerRow(1);
      return;
    }

    // Calculate item width to exactly fill viewport
    // This eliminates horizontal gaps
    const calculatedWidth = viewportWidth / baseItemsPerRow;
    
    // Ensure minimum width
    if (calculatedWidth < MIN_VIDEO_WIDTH) {
      const adjustedItemsPerRow = Math.max(1, Math.floor(viewportWidth / MIN_VIDEO_WIDTH));
      setItemWidth(viewportWidth / adjustedItemsPerRow);
      setItemsPerRow(adjustedItemsPerRow);
    } else {
      setItemWidth(calculatedWidth);
      setItemsPerRow(baseItemsPerRow);
    }
  }, []);

  useEffect(() => {
    calculateLayout();
    window.addEventListener('resize', calculateLayout);
    return () => window.removeEventListener('resize', calculateLayout);
  }, [calculateLayout]);

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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cid, adminSecret })
        }
      );

      const result = await response.json();

      if (result.success) {
        setEyes(prev => prev.filter(e => e.cid !== cid));
      } else {
        alert('Ошибка: ' + (result.error || 'Unknown error'));
      }
    } catch (err: any) {
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

  // Calculate item height maintaining aspect ratio
  const itemHeight = Math.round((itemWidth / VIDEO_WIDTH) * VIDEO_HEIGHT);

  if (loading && eyes.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-mono">
        <p className="text-white/30 text-sm tracking-widest">{t('canvas.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-mono">
        <p className="text-red-500/60 text-sm">Ошибка: {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black font-mono">
      {/* Fixed header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black via-black/80 to-transparent pointer-events-none">
        <div className="flex items-center justify-between p-4 md:p-6 pointer-events-auto">
          <Link to="/" className="text-white/40 hover:text-white transition-colors">
            <ArrowLeft size={24} />
          </Link>
          
          <div className="flex items-center gap-4">
            {isAdmin && (
              <span className="text-red-500 text-xs font-bold tracking-widest">
                {t('canvas.admin')}
              </span>
            )}
            <button
              onClick={() => setShowAdminPanel(!showAdminPanel)}
              className="text-white/20 hover:text-white/60 transition-colors"
            >
              <Shield size={18} />
            </button>
          </div>
        </div>
        
        {showAdminPanel && (
          <div className="bg-black/95 border-b border-white/10 p-4 pointer-events-auto">
            {isAdmin ? (
              <div className="text-center">
                <p className="text-white/40 text-xs mb-3">Режим администратора активен</p>
                <button
                  onClick={() => {
                    localStorage.removeItem(ADMIN_SECRET_KEY);
                    setIsAdmin(false);
                    setShowAdminPanel(false);
                  }}
                  className="text-red-500/60 text-xs hover:text-red-500 transition-colors"
                >
                  Выйти
                </button>
              </div>
            ) : (
              <div className="text-center">
                <button
                  onClick={enableAdminMode}
                  className="px-6 py-2 border border-white/20 text-white/40 text-xs hover:bg-white/5 transition-colors"
                >
                  Войти как администратор
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {eyes.length === 0 ? (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-white/20 text-sm tracking-widest">{t('canvas.empty')}</p>
        </div>
      ) : (
        <>
          {/* Full-width grid - no horizontal gaps */}
          <div 
            ref={containerRef}
            className="flex flex-wrap"
            style={{ paddingTop: 80 }}
          >
            {eyes.map((eye) => (
              <div
                key={eye.cid}
                className="relative group flex-shrink-0"
                style={{ 
                  width: itemWidth, 
                  height: itemHeight,
                }}
              >
                <video
                  src={`${storageUrl}${eye.cid}`}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover block"
                />
                
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                
                {/* Admin delete button */}
                {isAdmin && (
                  <button
                    onClick={() => handleAdminDelete(eye.cid)}
                    disabled={deletingCid === eye.cid}
                    className="absolute top-2 right-2 bg-black/80 hover:bg-red-600 text-white/60 hover:text-white p-2 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                  >
                    {deletingCid === eye.cid ? (
                      <span className="text-xs">...</span>
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Scroll hint shadow at bottom */}
          {hasMore && (
            <div className="fixed bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          )}

          {/* Load more trigger */}
          {hasMore && (
            <div ref={loadMoreRef} className="h-32 flex items-center justify-center">
              <p className="text-white/20 text-xs tracking-widest">{t('canvas.loading')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Canvas;
