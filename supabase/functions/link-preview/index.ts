import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return json({ error: 'Authentication required.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: 'Authentication required.' }, 401);

    const body = await request.json() as { url?: string; workspaceId?: string };
    if (!body.url || !body.workspaceId) return json({ error: 'URL and hub are required.' }, 400);
    const targetUrl = validatePublicUrl(body.url);

    const { data: membership } = await userClient
      .from('memberships')
      .select('id')
      .eq('workspace_id', body.workspaceId)
      .eq('user_id', authData.user.id)
      .maybeSingle();
    if (!membership) return json({ error: 'Hub access required.' }, 403);

    const { data: cached } = await userClient
      .from('link_previews')
      .select('url, title, description, image_url, site_name, fetched_at')
      .eq('workspace_id', body.workspaceId)
      .eq('url', targetUrl.toString())
      .gte('fetched_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();

    if (cached) {
      return json({ url: cached.url, title: cached.title, description: cached.description ?? '', image: cached.image_url, site_name: cached.site_name });
    }

    const { html, finalUrl } = await fetchHtml(targetUrl);
    const metadata = parseMetadata(html, finalUrl);
    await adminClient.from('link_previews').upsert({
      workspace_id: body.workspaceId,
      url: targetUrl.toString(),
      title: metadata.title,
      description: metadata.description || null,
      image_url: metadata.image,
      site_name: metadata.site_name,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,url' });

    return json({ ...metadata, url: targetUrl.toString() });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Preview unavailable.' }, 400);
  }
});

async function fetchHtml(initialUrl: URL) {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'TriCord Link Preview/1.0', Accept: 'text/html,application/xhtml+xml' },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error('The website returned an invalid redirect.');
        currentUrl = validatePublicUrl(new URL(location, currentUrl).toString());
        continue;
      }
      if (!response.ok) throw new Error('The website did not allow a preview.');
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) throw new Error('The shared URL is not a web page.');
      return { html: await readLimitedText(response, 1_000_000), finalUrl: currentUrl };
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('The website redirected too many times.');
}

async function readLimitedText(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) throw new Error('The web page is too large to preview.');
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(merged);
}

function parseMetadata(html: string, pageUrl: URL) {
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\s+[^>]*>/gi) ?? []) {
    const attricordtes = new Map<string, string>();
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) attricordtes.set(match[1].toLowerCase(), decodeHtml(match[2]));
    const key = (attricordtes.get('property') ?? attricordtes.get('name') ?? '').toLowerCase();
    const content = attricordtes.get('content');
    if (key && content) meta.set(key, content);
  }
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (meta.get('og:title') ?? meta.get('twitter:title') ?? decodeHtml(titleMatch?.[1] ?? '')).trim().slice(0, 200) || pageUrl.hostname;
  const description = (meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description') ?? '').trim().slice(0, 400);
  const rawImage = meta.get('og:image') ?? meta.get('twitter:image');
  let image: string | null = null;
  if (rawImage) {
    try { image = validatePublicUrl(new URL(rawImage, pageUrl).toString()).toString(); } catch { image = null; }
  }
  return {
    title,
    description,
    image,
    site_name: (meta.get('og:site_name') ?? pageUrl.hostname.replace(/^www\./, '')).slice(0, 100),
  };
}

function validatePublicUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only public HTTP or HTTPS links can be previewed.');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('This URL uses an unsupported port.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host === '::1' || isPrivateIpv4(host) || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) {
    throw new Error('Private network links cannot be previewed.');
  }
  return url;
}

function isPrivateIpv4(host: string) {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' } });
}
