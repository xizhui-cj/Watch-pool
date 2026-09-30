import { DurableObject } from 'cloudflare:workers';

const json = (body, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

function validVideo(v) {
  return v && typeof v.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v.id) &&
    typeof v.title === 'string' && v.title.trim().length > 0 && v.title.length <= 200 &&
    typeof v.url === 'string' && v.url.length <= 2000 &&
    (!v.url || (() => { try { return ['http:', 'https:'].includes(new URL(v.url).protocol); } catch { return false; } })()) &&
    Array.isArray(v.tags) && v.tags.length <= 50 && v.tags.every(t => typeof t === 'string' && t.length <= 100) &&
    typeof v.watched === 'boolean';
}

export class WatchPool extends DurableObject {
  async fetch(request) {
    if (request.method === 'GET') return json({ videos: (await this.ctx.storage.get('videos')) || [] });
    if (request.method !== 'PATCH') return json({ error: 'Method not allowed' }, 405);
    if (Number(request.headers.get('Content-Length')) > 1000000) return json({ error: 'Too large' }, 413);
    let patch;
    try {
      const text = await request.text();
      if (text.length > 1000000) return json({ error: 'Too large' }, 413);
      patch = JSON.parse(text);
    } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!patch || typeof patch !== 'object' || !Array.isArray(patch.upserts) || patch.upserts.length > 5000 || !patch.upserts.every(validVideo) ||
        !Array.isArray(patch.deletes) || patch.deletes.length > 5000 ||
        !patch.deletes.every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id))) {
      return json({ error: 'Invalid videos' }, 400);
    }
    const result = await this.ctx.storage.transaction(async storage => {
      let videos = (await storage.get('videos')) || [];
      const deletions = new Set(patch.deletes);
      videos = videos.filter(video => !deletions.has(video.id));
      for (const video of [...patch.upserts].reverse()) {
        const clean = { id: video.id, title: video.title, url: video.url, tags: video.tags, watched: video.watched };
        const index = videos.findIndex(item => item.id === video.id);
        if (index >= 0) videos[index] = clean;
        else videos.unshift(clean);
      }
      if (videos.length > 5000 || new TextEncoder().encode(JSON.stringify(videos)).length > 1500000) return null;
      await storage.put('videos', videos);
      return videos;
    });
    return result ? json({ videos: result }) : json({ error: 'Collection limit reached' }, 413);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/videos') {
      const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json({ error: 'Unauthorized' }, 401);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      if (hash !== env.ACCESS_KEY_HASH) return json({ error: 'Unauthorized' }, 401);
      if (request.method !== 'GET' && request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) {
        return json({ error: 'Invalid origin' }, 403);
      }
      return env.WATCH_POOL.get(env.WATCH_POOL.idFromName('personal-collection')).fetch(request);
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'no-cache');
    return new Response(response.body, { status: response.status, headers });
  }
};
