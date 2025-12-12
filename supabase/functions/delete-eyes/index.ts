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
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      console.log('delete-eyes: No token provided');
      return new Response(
        JSON.stringify({ error: 'Token required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('delete-eyes: Processing token:', token);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find CID by token
    const { data: tokenData, error: tokenError } = await supabase
      .from('delete_tokens')
      .select('cid')
      .eq('delete_token', token)
      .maybeSingle();

    if (tokenError) {
      console.error('delete-eyes: Token lookup error:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokenData) {
      console.log('delete-eyes: Token not found or already used');
      return new Response(
        JSON.stringify({ error: 'Token not found or already used' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cid = tokenData.cid;
    console.log('delete-eyes: Found CID:', cid);

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('eyes')
      .remove([cid]);

    if (storageError) {
      console.error('delete-eyes: Storage delete error:', storageError);
      // Continue anyway to clean up database
    }

    // Delete from database (cascade will handle delete_tokens)
    const { error: dbError } = await supabase
      .from('eyes')
      .delete()
      .eq('cid', cid);

    if (dbError) {
      console.error('delete-eyes: Database delete error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('delete-eyes: Successfully deleted:', cid);

    return new Response(
      JSON.stringify({ success: true, message: 'Eyes deleted forever' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('delete-eyes: Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});