import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const TZ = 'Europe/Istanbul';
const WINDOW = 5; // dk — cron aralığıyla aynı olmalı

function istNow() {
  const now = new Date();
  const t = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const [hh, mm] = t.split(':').map(Number);
  const dstr = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now); // YYYY-MM-DD
  return { min: hh * 60 + mm, dstr };
}

function authed(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // secret yoksa açık (pilot) — önerilir: CRON_SECRET tanımla
  const auth = req.headers.get('authorization') || '';
  const key = new URL(req.url).searchParams.get('key');
  return auth === `Bearer ${secret}` || key === secret;
}

async function run() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:example@example.com';
  if (!pub || !priv) return NextResponse.json({ error: 'VAPID anahtarları yok' }, { status: 500 });
  webpush.setVapidDetails(subject, pub, priv);

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string);
  const { min, dstr } = istNow();

  const { data: rits } = await sb.from('dog_rituals').select('id,ad,client_id,hatirlatma_saat,baslangic,bitis,son_bildirim').not('hatirlatma_saat', 'is', null);
  const due = (rits || []).filter((r: any) => {
    const [h, m] = String(r.hatirlatma_saat).split(':').map(Number);
    const rm = h * 60 + m;
    const diff = min - rm;
    const active = (!r.baslangic || r.baslangic <= dstr) && (!r.bitis || dstr <= r.bitis);
    const notSentToday = !r.son_bildirim || r.son_bildirim !== dstr;
    return active && notSentToday && diff >= 0 && diff < WINDOW;
  });

  let sent = 0;
  for (const r of due) {
    const { data: subs } = await sb.from('dog_push_subs').select('endpoint,p256dh,auth').eq('client_id', (r as any).client_id);
    const payload = JSON.stringify({ title: 'Rite', body: (r as any).ad + ' — zamanı geldi 🌿', url: '/' });
    for (const s of subs || []) {
      try {
        await webpush.sendNotification({ endpoint: (s as any).endpoint, keys: { p256dh: (s as any).p256dh, auth: (s as any).auth } }, payload);
        sent++;
      } catch (e: any) {
        const st = e?.statusCode;
        if (st === 404 || st === 410) await sb.from('dog_push_subs').delete().eq('endpoint', (s as any).endpoint);
      }
    }
    // Günde bir kez: bu ritüel için işaretle (cron sık çağrılsa da tekrar gönderme)
    await sb.from('dog_rituals').update({ son_bildirim: dstr }).eq('id', (r as any).id);
  }
  return NextResponse.json({ checked: (rits || []).length, due: due.length, sent });
}

export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return run();
}
export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return run();
}
