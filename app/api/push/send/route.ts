import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// Meridyen (farklı origin) de bu ucu çağırabilsin diye CORS.
const CORS: Record<string, string> = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function POST(req: Request) {
  const { clientId, title, body, url } = await req.json().catch(() => ({}));
  if (!clientId) return NextResponse.json({ error: 'clientId gerekli' }, { status: 400, headers: CORS });

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:example@example.com';
  if (!pub || !priv) return NextResponse.json({ error: 'VAPID anahtarları yok (.env.local — npx web-push generate-vapid-keys)' }, { status: 500, headers: CORS });
  webpush.setVapidDetails(subject, pub, priv);

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string);
  const { data, error } = await sb.from('dog_push_subs').select('endpoint,p256dh,auth').eq('client_id', clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });

  const payload = JSON.stringify({ title: title || 'Rite', body: body || 'Bugünkü ritüellerini unutma 🌿', url: url || '/' });
  const subs = data || [];
  const results = await Promise.allSettled(
    subs.map((s: any) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload))
  );
  // Süresi dolmuş abonelikleri temizle (410/404)
  await Promise.all(
    results.map((r, i) => {
      const st = (r as any)?.reason?.statusCode;
      if (r.status === 'rejected' && (st === 404 || st === 410)) {
        return sb.from('dog_push_subs').delete().eq('endpoint', subs[i].endpoint);
      }
      return null;
    })
  );
  return NextResponse.json({ total: subs.length, sent: results.filter((r) => r.status === 'fulfilled').length }, { headers: CORS });
}
