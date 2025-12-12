-- Create table for storing eyes videos
CREATE TABLE public.eyes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cid TEXT NOT NULL UNIQUE,
  type TEXT DEFAULT 'video',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for one-time delete tokens
CREATE TABLE public.delete_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cid TEXT NOT NULL REFERENCES public.eyes(cid) ON DELETE CASCADE,
  delete_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.eyes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delete_tokens ENABLE ROW LEVEL SECURITY;

-- Eyes table: anyone can read (for canvas display)
CREATE POLICY "Anyone can view eyes"
ON public.eyes
FOR SELECT
USING (true);

-- Delete tokens: no public access (only via service key in edge functions)
-- No policies needed - edge functions use service role

-- Enable realtime for eyes table (for live updates on canvas)
ALTER PUBLICATION supabase_realtime ADD TABLE public.eyes;

-- Create storage bucket for eye videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('eyes', 'eyes', true);

-- Storage policies: anyone can read, edge function handles uploads
CREATE POLICY "Anyone can view eye videos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'eyes');