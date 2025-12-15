import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Plus, Minus } from 'lucide-react';

type RecordingState = 'idle' | 'countdown' | 'recording' | 'preview';

// Configuration
const CONFIG = {
  FRAME_WIDTH: 512,
  FRAME_HEIGHT: 128,
  PRE_RECORD_SECONDS: 3,
  RECORD_SECONDS: 5,
  FPS: 20,
  BITRATE: 1000000,
  ZOOM_MIN: 1,
  ZOOM_MAX: 3,
  ZOOM_STEP: 0.1,
  STABLE_FRAMES_REQUIRED: 20,
  MOTION_THRESHOLD: 15,
  HEAD_JERK_THRESHOLD: 40,
};

const Camera = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationRef = useRef<number>(0);
  const stableFramesRef = useRef(0);
  const previousFrameRef = useRef<ImageData | null>(null);
  const recordingStartRef = useRef<number>(0);
  const abortedRef = useRef(false);

  const [state, setState] = useState<RecordingState>('idle');
  const [countdown, setCountdown] = useState(CONFIG.PRE_RECORD_SECONDS);
  const [recordTime, setRecordTime] = useState(CONFIG.RECORD_SECONDS);
  const [statusText, setStatusText] = useState('Инициализация камеры...');
  const [canRecord, setCanRecord] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [deleteUrl, setDeleteUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [supportsHardwareZoom, setSupportsHardwareZoom] = useState(false);

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize camera
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false
        });
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities?.() as Record<string, unknown>;
        if (capabilities && 'zoom' in capabilities) {
          setSupportsHardwareZoom(true);
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatusText('Поднеси глаза к рамке и держи взгляд');

        startMotionDetection();
      } catch (err) {
        console.error('Camera error:', err);
        setStatusText('Ошибка доступа к камере');
      }
    };

    initCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    };
  }, []);

  // Apply hardware zoom
  useEffect(() => {
    if (supportsHardwareZoom && streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      // @ts-expect-error - zoom is valid but not in TS types
      track.applyConstraints({ advanced: [{ zoom }] }).catch(() => {});
    }
  }, [zoom, supportsHardwareZoom]);

  const startMotionDetection = () => {
    const detectionCanvas = document.createElement('canvas');
    detectionCanvas.width = 160;
    detectionCanvas.height = 120;
    const ctx = detectionCanvas.getContext('2d')!;

    const detect = () => {
      if (!videoRef.current?.videoWidth) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }

      ctx.drawImage(videoRef.current, 0, 0, 160, 120);
      const currentFrame = ctx.getImageData(0, 0, 160, 120);

      if (previousFrameRef.current) {
        let diff = 0;
        for (let i = 0; i < currentFrame.data.length; i += 4) {
          diff += Math.abs(currentFrame.data[i] - previousFrameRef.current.data[i]);
        }
        diff /= (currentFrame.data.length / 4);

        // Check for stability in idle/countdown states
        if (state === 'idle') {
          if (diff < CONFIG.MOTION_THRESHOLD) {
            stableFramesRef.current++;
            if (stableFramesRef.current >= CONFIG.STABLE_FRAMES_REQUIRED) {
              if (!canRecord) {
                setCanRecord(true);
                setStatusText('Готово к записи');
              }
            }
          } else {
            stableFramesRef.current = 0;
            if (canRecord && diff > CONFIG.HEAD_JERK_THRESHOLD) {
              setCanRecord(false);
              setStatusText('Держите голову неподвижно');
            }
          }
        }

        // During countdown - check for jerks
        if (state === 'countdown' && diff > CONFIG.HEAD_JERK_THRESHOLD) {
          abortCountdown('Слишком резкое движение — повторите');
        }

        // During recording - check for jerks
        if (state === 'recording' && diff > CONFIG.HEAD_JERK_THRESHOLD) {
          abortRecording('Слишком резкое движение — запись прервана');
        }
      }

      previousFrameRef.current = currentFrame;
      animationRef.current = requestAnimationFrame(detect);
    };

    detect();
  };

  const abortCountdown = (reason: string) => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setState('idle');
    setCountdown(CONFIG.PRE_RECORD_SECONDS);
    setStatusText(reason);
    stableFramesRef.current = 0;
    setCanRecord(false);
  };

  const abortRecording = (reason: string) => {
    abortedRef.current = true;
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    chunksRef.current = [];
    setState('idle');
    setRecordTime(CONFIG.RECORD_SECONDS);
    setStatusText(reason);
    stableFramesRef.current = 0;
    setCanRecord(false);
  };

  const startCountdown = useCallback(() => {
    if (state !== 'idle' || !canRecord) return;
    setState('countdown');
    setCountdown(CONFIG.PRE_RECORD_SECONDS);
    setStatusText('Запись начнётся через...');

    let count = CONFIG.PRE_RECORD_SECONDS;
    countdownIntervalRef.current = setInterval(() => {
      count--;
      setCountdown(count);
      if (count <= 0) {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        startRecording();
      }
    }, 1000);
  }, [state, canRecord]);

  const startRecording = useCallback(() => {
    setState('recording');
    setRecordTime(CONFIG.RECORD_SECONDS);
    setStatusText('Идёт запись...');
    chunksRef.current = [];
    abortedRef.current = false;
    recordingStartRef.current = Date.now();

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CONFIG.FRAME_WIDTH * dpr;
    canvas.height = CONFIG.FRAME_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let isActive = true;

    const drawFrame = () => {
      if (!videoRef.current || !isActive) return;

      ctx.clearRect(0, 0, CONFIG.FRAME_WIDTH, CONFIG.FRAME_HEIGHT);
      ctx.save();
      ctx.translate(CONFIG.FRAME_WIDTH, 0);
      ctx.scale(-1, 1);

      const videoW = videoRef.current.videoWidth || CONFIG.FRAME_WIDTH;
      const videoH = videoRef.current.videoHeight || CONFIG.FRAME_HEIGHT;

      const effectiveZoom = supportsHardwareZoom ? 1 : zoom;
      const scaledW = videoW / effectiveZoom;
      const scaledH = videoH / effectiveZoom;
      const scale = Math.max(CONFIG.FRAME_WIDTH / scaledW, CONFIG.FRAME_HEIGHT / scaledH);
      const sw = Math.round(CONFIG.FRAME_WIDTH / scale);
      const sh = Math.round(CONFIG.FRAME_HEIGHT / scale);
      const sx = Math.round((videoW - sw) / 2);
      const sy = Math.round((videoH - sh) / 2);

      ctx.drawImage(videoRef.current, sx, sy, sw, sh, 0, 0, CONFIG.FRAME_WIDTH, CONFIG.FRAME_HEIGHT);
      ctx.restore();

      if (isActive) {
        requestAnimationFrame(drawFrame);
      }
    };
    drawFrame();

    const canvasStream = canvas.captureStream(CONFIG.FPS);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: CONFIG.BITRATE
    });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      isActive = false;
      
      // Only process if not aborted
      if (!abortedRef.current && chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        setState('preview');
        setStatusText('Запись завершена');

        if (previewRef.current) {
          previewRef.current.src = URL.createObjectURL(blob);
          previewRef.current.play().catch(() => {});
        }
      }
    };

    recorder.start(100);

    let count = CONFIG.RECORD_SECONDS;
    recordIntervalRef.current = setInterval(() => {
      count--;
      setRecordTime(count);
      if (count <= 0) {
        if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
        recordIntervalRef.current = null;
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }
    }, 1000);
  }, [zoom, supportsHardwareZoom]);

  const resetRecording = () => {
    setState('idle');
    setRecordedBlob(null);
    setDeleteUrl(null);
    setCanRecord(false);
    setStatusText('Поднеси глаза к рамке и держи взгляд');
    setRecordTime(CONFIG.RECORD_SECONDS);
    setCountdown(CONFIG.PRE_RECORD_SECONDS);
    stableFramesRef.current = 0;
    if (previewRef.current) {
      previewRef.current.src = '';
    }
  };

  const saveForever = async () => {
    if (!recordedBlob) return;

    setIsSaving(true);
    setStatusText('Сохранение...');

    try {
      const formData = new FormData();
      formData.append('video', recordedBlob, 'eye-recording.webm');

      const { data, error } = await supabase.functions.invoke('save-eyes', {
        body: formData
      });

      if (error) throw error;

      if (data?.success) {
        setStatusText('Сохранено навсегда!');
        setDeleteUrl(data.deleteUrl);
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error('Save error:', err);
      setStatusText('Ошибка сохранения: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const downloadVideo = () => {
    if (!recordedBlob) return;
    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eye-recording-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const adjustZoom = (delta: number) => {
    setZoom(prev => Math.max(CONFIG.ZOOM_MIN, Math.min(CONFIG.ZOOM_MAX, prev + delta)));
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center relative">
      <Link to="/" className="absolute top-5 left-5 text-gray-500 hover:text-white text-2xl z-50">
        <ArrowLeft size={24} />
      </Link>

      <h1 className="text-[32px] text-center mt-16 mb-10 px-5 font-light">
        {state === 'preview' ? 'Запись завершена' : 'Поднеси глаза к рамке и держи взгляд'}
      </h1>

      {/* Video frame */}
      <div 
        className={`relative border-2 rounded-xl overflow-hidden bg-black transition-colors ${
          canRecord ? 'border-green-500/50' : 'border-white'
        }`}
        style={{ width: CONFIG.FRAME_WIDTH, height: CONFIG.FRAME_HEIGHT }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute top-1/2 left-1/2 min-w-full min-h-full object-cover ${state === 'preview' ? 'hidden' : ''}`}
          style={{
            transform: `translate(-50%, -50%) scaleX(-1) scale(${supportsHardwareZoom ? 1 : zoom})`,
          }}
        />
        <video
          ref={previewRef}
          playsInline
          loop
          muted
          className={`w-full h-full object-cover ${state !== 'preview' ? 'hidden' : ''}`}
        />

        {/* Eye guides */}
        {state !== 'preview' && (
          <div className="absolute inset-0 pointer-events-none z-10">
            {/* Center crosshairs */}
            <div className="absolute top-1/2 left-0 right-0 h-px bg-white/20" />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20" />
            {/* Eye outlines */}
            <div className="absolute top-1/2 -translate-y-1/2 left-[43px] w-[170px] h-[76px] border-2 border-dashed border-white/40 rounded-full" />
            <div className="absolute top-1/2 -translate-y-1/2 right-[43px] w-[170px] h-[76px] border-2 border-dashed border-white/40 rounded-full" />
          </div>
        )}
      </div>

      {/* Timer */}
      {(state === 'countdown' || state === 'recording') && (
        <div className="text-[120px] font-light mt-10 tabular-nums tracking-tighter leading-none">
          {state === 'countdown' ? countdown : recordTime}
        </div>
      )}

      {/* Zoom controls */}
      {state === 'idle' && !supportsHardwareZoom && (
        <div className="flex items-center gap-4 mt-6">
          <button
            onClick={() => adjustZoom(-CONFIG.ZOOM_STEP)}
            className="w-10 h-10 rounded-full border border-white/30 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <Minus size={18} />
          </button>
          <span className="text-gray-400 text-sm w-20 text-center">
            Zoom: {zoom.toFixed(1)}x
          </span>
          <button
            onClick={() => adjustZoom(CONFIG.ZOOM_STEP)}
            className="w-10 h-10 rounded-full border border-white/30 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <Plus size={18} />
          </button>
        </div>
      )}

      {/* Status */}
      <div className="text-gray-500 text-base mt-5 text-center px-4 max-w-md">
        {statusText}
      </div>

      {/* Start button */}
      {state === 'idle' && (
        <div className="mt-10">
          <button
            onClick={startCountdown}
            disabled={!canRecord}
            className={`bg-transparent border-2 px-14 py-5 text-lg font-medium rounded-lg uppercase tracking-wide transition-all ${
              canRecord
                ? 'text-white border-white hover:bg-white hover:text-black cursor-pointer'
                : 'text-gray-600 border-gray-600 cursor-not-allowed'
            }`}
          >
            ЗАПИСАТЬ
          </button>
        </div>
      )}

      {/* Preview buttons */}
      {state === 'preview' && (
        <div className="flex flex-col items-center gap-4 mt-10">
          <button
            onClick={resetRecording}
            className="bg-transparent text-white border-2 border-white px-10 py-4 text-base font-medium rounded-lg uppercase tracking-wide min-w-[280px] hover:bg-white hover:text-black transition-all"
          >
            ЗАПИСАТЬ ЗАНОВО
          </button>
          <button
            onClick={saveForever}
            disabled={isSaving || !!deleteUrl}
            className="bg-white text-black border-2 border-white px-10 py-4 text-base font-medium rounded-lg uppercase tracking-wide min-w-[280px] hover:bg-gray-200 transition-all disabled:opacity-50"
          >
            {isSaving ? 'СОХРАНЕНИЕ...' : deleteUrl ? 'СОХРАНЕНО' : 'ОСТАВИТЬ НАВСЕГДА'}
          </button>
          <button
            onClick={downloadVideo}
            className="bg-transparent text-white border-2 border-white px-10 py-4 text-base font-medium rounded-lg uppercase tracking-wide min-w-[280px] hover:bg-white hover:text-black transition-all"
          >
            СКАЧАТЬ НА КОМПЬЮТЕР
          </button>
        </div>
      )}

      {/* Delete URL */}
      {deleteUrl && (
        <div className="mt-5 text-center max-w-md px-4">
          <p className="text-gray-500 text-sm mb-2">Ссылка для удаления (одноразовая):</p>
          <a href={deleteUrl} className="text-white text-sm break-all hover:underline">
            {deleteUrl}
          </a>
        </div>
      )}

      {/* Hidden canvas for recording */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Camera;
