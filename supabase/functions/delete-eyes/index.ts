import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Admin secret for admin deletions (should be set as environment variable in production)
const ADMIN_SECRET = Deno.env.get('ADMIN_SECRET') || 'gorgona_admin_2024';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle POST (admin delete) or GET (user delete by token)
    if (req.method === 'POST') {
      // Admin delete
      const body = await req.json();
      const { cid, adminSecret } = body;

      if (!adminSecret || adminSecret !== ADMIN_SECRET) {
        console.log('delete-eyes: Invalid admin secret');
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!cid) {
        return new Response(
          JSON.stringify({ error: 'CID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('delete-eyes: Admin deleting CID:', cid);

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('eyes')
        .remove([cid]);

      if (storageError) {
        console.error('delete-eyes: Storage delete error:', storageError);
      }

      // Delete from database
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

      // Also delete associated token
      await supabase
        .from('delete_tokens')
        .delete()
        .eq('cid', cid);

      console.log('delete-eyes: Admin successfully deleted:', cid);

      return new Response(
        JSON.stringify({ success: true, message: 'Eyes deleted by admin' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET - user delete by token
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
