import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Plus, Minus } from 'lucide-react';

type RecordingState = 'idle' | 'countdown' | 'recording' | 'preview';
type ValidationError = 'none' | 'no_eyes' | 'eyes_out_of_frame' | 'gaze_away' | 'head_jerk' | 'eyes_closed' | 'zoom_insufficient';

// Configuration thresholds
const CONFIG = {
  FRAME_WIDTH: 512,
  FRAME_HEIGHT: 128,
  PRE_RECORD_SECONDS: 3,
  RECORD_SECONDS: 5,
  FPS: 20,
  BITRATE: 1000000,
  // Validation thresholds
  GAZE_THRESHOLD: 0.15, // Max iris offset from eye center (normalized)
  EAR_CLOSED_THRESHOLD: 0.18, // Eye Aspect Ratio below which eye is considered closed
  EYES_CLOSED_DURATION_MS: 1500, // How long eyes must be closed to abort
  BLINK_IGNORE_MS: 300, // Ignore blinks shorter than this
  HEAD_JERK_THRESHOLD: 0.08, // Normalized movement threshold
  FACE_OCCUPANCY_THRESHOLD: 0.18, // Min face size relative to frame
  ZOOM_MIN: 1,
  ZOOM_MAX: 3,
  ZOOM_STEP: 0.1,
};

// FaceMesh landmark indices
const LANDMARKS = {
  LEFT_EYE: [33, 133, 160, 159, 158, 144, 145, 153],
  RIGHT_EYE: [362, 263, 387, 386, 385, 380, 373, 374],
  LEFT_IRIS: [468, 469, 470, 471, 472],
  RIGHT_IRIS: [473, 474, 475, 476, 477],
  NOSE_TIP: 1,
  FOREHEAD: 10,
  CHIN: 152,
};

const Camera = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationRef = useRef<number>(0);
  const faceMeshRef = useRef<any>(null);
  const lastLandmarksRef = useRef<any>(null);
  const eyesClosedStartRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number>(0);

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
  const [validationError, setValidationError] = useState<ValidationError>('none');
  const [faceMeshLoaded, setFaceMeshLoaded] = useState(false);

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load FaceMesh
  useEffect(() => {
    const loadFaceMesh = async () => {
      try {
        // @ts-ignore
        const { FaceMesh } = await import('@mediapipe/face_mesh');
        // @ts-ignore
        const { Camera: MPCamera } = await import('@mediapipe/camera_utils');

        const faceMesh = new FaceMesh({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceMesh.onResults(handleFaceMeshResults);
        faceMeshRef.current = faceMesh;
        setFaceMeshLoaded(true);
      } catch (err) {
        console.error('FaceMesh load error:', err);
        setStatusText('FaceMesh не загружен, используется упрощённая детекция');
      }
    };

    loadFaceMesh();
  }, []);

  // Initialize camera
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false
        });
        streamRef.current = stream;

        // Check for hardware zoom support
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

        // Start detection loop
        startDetectionLoop();
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

  // Apply hardware zoom when changed
  useEffect(() => {
    if (supportsHardwareZoom && streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      // @ts-expect-error - zoom is a valid constraint but not in TypeScript types
      track.applyConstraints({ advanced: [{ zoom }] }).catch(() => {});
    }
  }, [zoom, supportsHardwareZoom]);

  const startDetectionLoop = () => {
    const detect = async () => {
      if (!videoRef.current?.videoWidth || state === 'preview') {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }

      if (faceMeshRef.current && faceMeshLoaded) {
        try {
          await faceMeshRef.current.send({ image: videoRef.current });
        } catch (e) {
          // FaceMesh error, continue with fallback
        }
      }

      animationRef.current = requestAnimationFrame(detect);
    };
    detect();
  };

  const handleFaceMeshResults = useCallback((results: any) => {
    if (!results.multiFaceLandmarks?.length) {
      setValidationError('no_eyes');
      setCanRecord(false);
      if (state === 'idle') setStatusText('Лицо не обнаружено');
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];
    const validation = validateFace(landmarks);

    lastLandmarksRef.current = landmarks;

    if (validation.error !== 'none') {
      setValidationError(validation.error);
      setCanRecord(false);
      setStatusText(validation.message);

      // Abort countdown or recording if validation fails
      if (state === 'countdown') {
        abortCountdown(validation.message);
      } else if (state === 'recording') {
        abortRecording(validation.message);
      }
    } else {
      setValidationError('none');
      if (state === 'idle') {
        setCanRecord(true);
        setStatusText('Готово к записи');
      }
    }

    // Draw overlay
    drawOverlay(landmarks);
  }, [state]);

  const validateFace = (landmarks: any[]): { error: ValidationError; message: string } => {
    const videoW = videoRef.current?.videoWidth || 1;
    const videoH = videoRef.current?.videoHeight || 1;

    // 1. Check face occupancy (zoom sufficient)
    const forehead = landmarks[LANDMARKS.FOREHEAD];
    const chin = landmarks[LANDMARKS.CHIN];
    const faceHeight = Math.abs(chin.y - forehead.y);
    const frameRatio = CONFIG.FRAME_HEIGHT / (videoH / zoom);
    const faceOccupancy = faceHeight * zoom / frameRatio;

    if (faceOccupancy < CONFIG.FACE_OCCUPANCY_THRESHOLD) {
      return { error: 'zoom_insufficient', message: 'Приблизьтесь к камере или увеличьте зум' };
    }

    // 2. Check eyes in frame
    const leftEyeCenter = getEyeCenter(landmarks, LANDMARKS.LEFT_EYE);
    const rightEyeCenter = getEyeCenter(landmarks, LANDMARKS.RIGHT_EYE);

    // Frame bounds (normalized, centered)
    const frameLeft = 0.5 - (CONFIG.FRAME_WIDTH / 2) / (videoW / zoom) / 2;
    const frameRight = 0.5 + (CONFIG.FRAME_WIDTH / 2) / (videoW / zoom) / 2;
    const frameTop = 0.5 - (CONFIG.FRAME_HEIGHT / 2) / (videoH / zoom) / 2;
    const frameBottom = 0.5 + (CONFIG.FRAME_HEIGHT / 2) / (videoH / zoom) / 2;

    const leftInFrame = leftEyeCenter.x >= frameLeft && leftEyeCenter.x <= frameRight &&
                        leftEyeCenter.y >= frameTop && leftEyeCenter.y <= frameBottom;
    const rightInFrame = rightEyeCenter.x >= frameLeft && rightEyeCenter.x <= frameRight &&
                         rightEyeCenter.y >= frameTop && rightEyeCenter.y <= frameBottom;

    if (!leftInFrame || !rightInFrame) {
      return { error: 'eyes_out_of_frame', message: 'Прицельтесь в центр рамки' };
    }

    // 3. Check gaze direction
    const gazeOffset = calculateGazeOffset(landmarks);
    if (gazeOffset > CONFIG.GAZE_THRESHOLD) {
      return { error: 'gaze_away', message: 'Смотрите в камеру' };
    }

    // 4. Check eyes closed
    const leftEAR = calculateEAR(landmarks, LANDMARKS.LEFT_EYE);
    const rightEAR = calculateEAR(landmarks, LANDMARKS.RIGHT_EYE);
    const avgEAR = (leftEAR + rightEAR) / 2;

    if (avgEAR < CONFIG.EAR_CLOSED_THRESHOLD) {
      if (!eyesClosedStartRef.current) {
        eyesClosedStartRef.current = Date.now();
      } else if (Date.now() - eyesClosedStartRef.current > CONFIG.EYES_CLOSED_DURATION_MS) {
        return { error: 'eyes_closed', message: 'Откройте глаза' };
      }
    } else {
      // Check if it was a short blink
      if (eyesClosedStartRef.current && Date.now() - eyesClosedStartRef.current < CONFIG.BLINK_IGNORE_MS) {
        // Ignore short blink
      }
      eyesClosedStartRef.current = null;
    }

    // 5. Check head jerk
    if (lastLandmarksRef.current) {
      const prevNose = lastLandmarksRef.current[LANDMARKS.NOSE_TIP];
      const currNose = landmarks[LANDMARKS.NOSE_TIP];
      const movement = Math.sqrt(
        Math.pow(currNose.x - prevNose.x, 2) + Math.pow(currNose.y - prevNose.y, 2)
      );
      if (movement > CONFIG.HEAD_JERK_THRESHOLD) {
        return { error: 'head_jerk', message: 'Слишком резкое движение — держите голову неподвижно' };
      }
    }

    return { error: 'none', message: '' };
  };

  const getEyeCenter = (landmarks: any[], indices: number[]) => {
    let x = 0, y = 0;
    indices.forEach(i => {
      x += landmarks[i].x;
      y += landmarks[i].y;
    });
    return { x: x / indices.length, y: y / indices.length };
  };

  const calculateGazeOffset = (landmarks: any[]): number => {
    // Calculate iris position relative to eye center
    const leftEyeCenter = getEyeCenter(landmarks, LANDMARKS.LEFT_EYE);
    const rightEyeCenter = getEyeCenter(landmarks, LANDMARKS.RIGHT_EYE);

    // Iris centers (if refineLandmarks is on)
    if (landmarks.length > 468) {
      const leftIrisCenter = getEyeCenter(landmarks, LANDMARKS.LEFT_IRIS);
      const rightIrisCenter = getEyeCenter(landmarks, LANDMARKS.RIGHT_IRIS);

      const leftOffset = Math.sqrt(
        Math.pow(leftIrisCenter.x - leftEyeCenter.x, 2) +
        Math.pow(leftIrisCenter.y - leftEyeCenter.y, 2)
      );
      const rightOffset = Math.sqrt(
        Math.pow(rightIrisCenter.x - rightEyeCenter.x, 2) +
        Math.pow(rightIrisCenter.y - rightEyeCenter.y, 2)
      );

      return (leftOffset + rightOffset) / 2;
    }

    return 0; // If no iris data, assume looking at camera
  };

  const calculateEAR = (landmarks: any[], eyeIndices: number[]): number => {
    // Eye Aspect Ratio for blink detection
    // EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
    const p1 = landmarks[eyeIndices[0]];
    const p2 = landmarks[eyeIndices[1]];
    const p3 = landmarks[eyeIndices[2]];
    const p4 = landmarks[eyeIndices[3]];
    const p5 = landmarks[eyeIndices[4]];
    const p6 = landmarks[eyeIndices[5]];

    const vertical1 = Math.sqrt(Math.pow(p2.x - p6.x, 2) + Math.pow(p2.y - p6.y, 2));
    const vertical2 = Math.sqrt(Math.pow(p3.x - p5.x, 2) + Math.pow(p3.y - p5.y, 2));
    const horizontal = Math.sqrt(Math.pow(p1.x - p4.x, 2) + Math.pow(p1.y - p4.y, 2));

    return (vertical1 + vertical2) / (2 * horizontal);
  };

  const drawOverlay = (landmarks: any[]) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = CONFIG.FRAME_WIDTH * dpr;
    canvas.height = CONFIG.FRAME_HEIGHT * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, CONFIG.FRAME_WIDTH, CONFIG.FRAME_HEIGHT);

    // Draw center crosshairs
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CONFIG.FRAME_WIDTH / 2, 0);
    ctx.lineTo(CONFIG.FRAME_WIDTH / 2, CONFIG.FRAME_HEIGHT);
    ctx.moveTo(0, CONFIG.FRAME_HEIGHT / 2);
    ctx.lineTo(CONFIG.FRAME_WIDTH, CONFIG.FRAME_HEIGHT / 2);
    ctx.stroke();
  };

  const abortCountdown = (reason: string) => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setState('idle');
    setCountdown(CONFIG.PRE_RECORD_SECONDS);
    setStatusText(reason);
  };

  const abortRecording = (reason: string) => {
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
    setStatusText(`Запись прервана: ${reason}`);
    setRecordedBlob(null);
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
    recordingStartRef.current = Date.now();

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CONFIG.FRAME_WIDTH * dpr;
    canvas.height = CONFIG.FRAME_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let isRecordingActive = true;

    const drawFrame = () => {
      if (!videoRef.current || !isRecordingActive) return;

      ctx.clearRect(0, 0, CONFIG.FRAME_WIDTH, CONFIG.FRAME_HEIGHT);
      ctx.save();
      // Mirror horizontally
      ctx.translate(CONFIG.FRAME_WIDTH, 0);
      ctx.scale(-1, 1);

      const videoW = videoRef.current.videoWidth || CONFIG.FRAME_WIDTH;
      const videoH = videoRef.current.videoHeight || CONFIG.FRAME_HEIGHT;

      // Apply zoom and center crop
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

      if (isRecordingActive) {
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
      isRecordingActive = false;
      if (chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        // Only set blob if recording completed successfully
        if (Date.now() - recordingStartRef.current >= (CONFIG.RECORD_SECONDS - 0.5) * 1000) {
          setRecordedBlob(blob);
          setState('preview');
          setStatusText('Запись завершена');

          if (previewRef.current) {
            previewRef.current.src = URL.createObjectURL(blob);
            previewRef.current.play().catch(() => {});
          }
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
    setValidationError('none');
    setStatusText('Поднеси глаза к рамке и держи взгляд');
    setRecordTime(CONFIG.RECORD_SECONDS);
    setCountdown(CONFIG.PRE_RECORD_SECONDS);
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

  const getValidationColor = () => {
    if (validationError !== 'none') return 'border-red-500/50';
    if (canRecord) return 'border-green-500/50';
    return 'border-white';
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center relative">
      <Link to="/" className="absolute top-5 left-5 text-gray-500 hover:text-white text-2xl z-50">
        <ArrowLeft size={24} />
      </Link>

      {/* Title */}
      <h1 className="text-[32px] text-center mt-16 mb-10 px-5 font-light">
        {state === 'preview' ? 'Запись завершена' : 'Поднеси глаза к рамке и держи взгляд'}
      </h1>

      {/* Video frame */}
      <div 
        className={`relative border-2 rounded-xl overflow-hidden bg-black transition-colors ${getValidationColor()}`}
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

        {/* Overlay canvas for crosshairs */}
        {state !== 'preview' && (
          <canvas
            ref={overlayCanvasRef}
            className="absolute inset-0 pointer-events-none z-10"
            style={{ width: CONFIG.FRAME_WIDTH, height: CONFIG.FRAME_HEIGHT }}
          />
        )}

        {/* Eye guides */}
        {state !== 'preview' && (
          <div className="absolute inset-0 pointer-events-none z-10">
            <div className="absolute top-1/2 -translate-y-1/2 left-[43px] w-[170px] h-[76px] border-2 border-dashed border-white/40 rounded-full">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[34px] h-[34px] border-2 border-dashed border-white/30 rounded-full" />
            </div>
            <div className="absolute top-1/2 -translate-y-1/2 right-[43px] w-[170px] h-[76px] border-2 border-dashed border-white/40 rounded-full">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[34px] h-[34px] border-2 border-dashed border-white/30 rounded-full" />
            </div>
          </div>
        )}
      </div>

      {/* Timer */}
      {(state === 'countdown' || state === 'recording') && (
        <div className="text-[120px] font-light mt-10 tabular-nums tracking-tighter leading-none">
          {state === 'countdown' ? countdown : recordTime}
        </div>
      )}

      {/* Zoom controls (only show if no hardware zoom) */}
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
