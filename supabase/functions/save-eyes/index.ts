import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('save-eyes: Starting upload process');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse multipart form data
    const formData = await req.formData();
    const videoFile = formData.get('video') as File;
    
    if (!videoFile) {
      console.error('save-eyes: No video file provided');
      return new Response(
        JSON.stringify({ error: 'No video file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('save-eyes: Received video file, size:', videoFile.size);

    // Generate unique filename
    const fileId = crypto.randomUUID();
    const fileName = `eyes-${Date.now()}-${fileId.slice(0, 8)}.webm`;
    
    // Upload to Supabase Storage
    const arrayBuffer = await videoFile.arrayBuffer();
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('eyes')
      .upload(fileName, arrayBuffer, {
        contentType: 'video/webm',
        upsert: false
      });

    if (uploadError) {
      console.error('save-eyes: Upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('save-eyes: File uploaded successfully:', uploadData.path);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('eyes')
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;
    console.log('save-eyes: Public URL:', publicUrl);

    // Save to database (use filename as CID for simplicity)
    const { error: dbError } = await supabase
      .from('eyes')
      .insert({ cid: fileName, type: 'video' });

    if (dbError) {
      console.error('save-eyes: Database insert error:', dbError);
      return new Response(
        JSON.stringify({ error: dbError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate delete token
    const deleteToken = crypto.randomUUID();
    const { error: tokenError } = await supabase
      .from('delete_tokens')
      .insert({ cid: fileName, delete_token: deleteToken });

    if (tokenError) {
      console.error('save-eyes: Token insert error:', tokenError);
      // Continue anyway, deletion just won't work
    }

    const siteUrl = req.headers.get('origin') || 'https://lovable.dev';
    
    console.log('save-eyes: Success! CID:', fileName);

    return new Response(
      JSON.stringify({
        success: true,
        cid: fileName,
        url: publicUrl,
        deleteUrl: `${siteUrl}/delete?token=${deleteToken}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('save-eyes: Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});