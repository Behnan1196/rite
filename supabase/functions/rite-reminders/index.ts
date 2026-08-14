// Supabase Edge Function — Rite saatli hatırlatma push'u (Vercel'siz).
// Deploy:  supabase functions deploy rite-reminders   (ya da Dashboard → Edge Functions → yeni fonksiyon, bu içeriği yapıştır)
// Gizliler (Dashboard → Edge Functions → Secrets — RITE_ öneki habit-tracker'la çakışmasın diye):
//   RITE_VAPID_SUBJECT   = mailto:senin-email
//   RITE_VAPID_PUBLIC_KEY  = rite'ın public VAPID (istemcideki NEXT_PUBLIC_VAPID_PUBLIC_KEY ile AYNI)
//   RITE_VAPID_PRIVATE_KEY = rite'ın private VAPID (gizli)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik sağlanır.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
webpush.setVapidDetails(
  Deno.env.get('RITE_VAPID_SUBJECT')!,
  Deno.env.get('RITE_VAPID_PUBLIC_KEY')!,
  Deno.env.get('RITE_VAPID_PRIVATE_KEY')!,
);

const TZ = 'Europe/Istanbul';
function localParts(tz: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${v('year')}-${v('month')}-${v('day')}`, h: Number(v('hour')), m: Number(v('minute')) };
}

Deno.serve(async () => {
  const local = localParts(TZ);
  const nowMin = local.h * 60 + local.m;

  const { data: rits, error } = await supabase
    .from('dog_rituals')
    .select('id,client_id,ad,hatirlatma_saat,baslangic,bitis,son_bildirim')
    .not('hatirlatma_saat', 'is', null);
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0, due = 0;
  for (const r of rits ?? []) {
    const [rh, rm] = String((r as any).hatirlatma_saat).split(':').map(Number);
    const diff = nowMin - (rh * 60 + rm);
    if (!(diff >= 0 && diff <= 2)) continue;                          // saat penceresi (2 dk tolerans)
    if ((r as any).baslangic && local.date < (r as any).baslangic) continue;
    if ((r as any).bitis && local.date > (r as any).bitis) continue; // aktif aralık
    if ((r as any).son_bildirim === local.date) continue;            // günde bir
    due++;

    // Önce işaretle (aynı dakikada çift tetiklenmeyi önle)
    await supabase.from('dog_rituals').update({ son_bildirim: local.date }).eq('id', (r as any).id);

    const { data: subs } = await supabase.from('dog_push_subs').select('*').eq('client_id', (r as any).client_id);
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: (s as any).endpoint, keys: { p256dh: (s as any).p256dh, auth: (s as any).auth } },
          JSON.stringify({ title: 'Rite', body: `${(r as any).ad} — zamanı geldi 🌿`, tag: `rite-${(r as any).id}-${local.date}`, url: '/' }),
        );
        sent++;
      } catch (e) {
        const st = (e as { statusCode?: number }).statusCode;
        if (st === 404 || st === 410) await supabase.from('dog_push_subs').delete().eq('id', (s as any).id);
      }
    }
  }
  return Response.json({ checked: rits?.length ?? 0, due, sent, saat: `${String(local.h).padStart(2, '0')}:${String(local.m).padStart(2, '0')}` });
});
