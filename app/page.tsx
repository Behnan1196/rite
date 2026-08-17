'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableItem({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="sortrow">
      <button className="draghandle" {...attributes} {...listeners} aria-label="taşı">⋮⋮</button>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

type Client = { id: string; ad: string; code: string; share_code?: string };
const LS = 'rite_client';

const POOL: Record<string, { ad: string; dsc: string; zaman: string; flag?: string }[]> = {
  def: [
    { ad: '🌅 Sabah 3’lü', dsc: 'Işık + yürüyüş + su — hazır rutin.', zaman: 'sabah' },
    { ad: '🌙 Uyku hazırlığı', dsc: 'Ekran sınırı + nefes + sabit saat.', zaman: 'akşam' },
    { ad: 'Uyaran kontrolü (CBT-I)', dsc: 'Yatağı yalnız uyku için kullan.', zaman: 'akşam' },
    { ad: 'Günlük yürüyüş', dsc: 'Enerji, uyku, ruh hâli — çapraz fayda.', zaman: 'gün' },
    { ad: 'Denge & kuvvet', dsc: 'Haftada 2-3.', zaman: 'gün', flag: '⚠ ağrı/öykü varsa hekim onayı' },
  ],
  afh: [
    { ad: '3 şükran', dsc: 'Her akşam 3 iyi şey.', zaman: 'akşam' },
    { ad: 'Nezaket eylemi', dsc: 'Günde bir küçük iyilik.', zaman: 'gün' },
  ],
  mer: [
    { ad: 'Davranışsal aktivasyon', dsc: 'Düşük ruh hâlinde adım adım.', zaman: 'gün', flag: '⚠ süregelen çökkünlükte uzman' },
    { ad: 'Diyafram nefesi', dsc: 'Parasempatik aktivasyon; stres.', zaman: 'gün' },
  ],
};
const POOL_KAYNAK: Record<string, string> = { def: 'Rite', afh: 'AfH', mer: 'Meridyen' };
const TODS: [string, string][] = [['sabah', 'Sabah'], ['gün', 'Gün içi'], ['akşam', 'Akşam']];
const SLOTBG: Record<string, string> = { sabah: '#fbf6ec', 'gün': '#f2f5ee', 'akşam': '#eef1f7' };
// Haftagünü: getDay değeri (0=Paz..6=Cmt), Pazartesi-önce görüntü sırası
const GUNLER: [number, string][] = [[1, 'Pzt'], [2, 'Sal'], [3, 'Çar'], [4, 'Per'], [5, 'Cum'], [6, 'Cmt'], [0, 'Paz']];
function gunlerLabel(g?: number[] | null): string {
  if (!g || g.length === 0) return 'her gün';
  if (g.length === 7) return 'her gün';
  const m: Record<number, string> = Object.fromEntries(GUNLER.map(([n, l]) => [n, l]));
  return GUNLER.filter(([n]) => g.includes(n)).map(([n]) => m[n]).join('·');
}
function kisaTarih(d?: string | null): string {
  if (!d) return '';
  const p = d.split('-');
  return p.length === 3 ? p[2] + '.' + p[1] : d;
}
const WD = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];
const WDFULL = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseD = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
function lastDays(n: number) {
  const a: string[] = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); a.push(iso(d)); }
  return a;
}
function urlB64ToUint8(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function Rite() {
  const [client, setClient] = useState<Client | null>(null);
  const [code, setCode] = useState('');
  const [screen, setScreen] = useState('ajanda');
  const [ajView, setAjView] = useState<'gun' | 'hafta'>('gun');
  const [selDate, setSelDate] = useState('');
  const [activities, setActivities] = useState<any[]>([]);
  const [actGroup, setActGroup] = useState('');
  const [actModal, setActModal] = useState<any>(null);
  const [rituals, setRituals] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [ep, setEp] = useState<any>(null);
  const [anchors, setAnchors] = useState<string[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [meas, setMeas] = useState<any[]>([]);
  const [cNot, setCNot] = useState<string>('');
  const [yeniRit, setYeniRit] = useState('');
  const [dayNote, setDayNote] = useState('');
  const [inbox, setInbox] = useState<any[]>([]);
  const [ib, setIb] = useState({ t: '', u: '' });
  const [addSlot, setAddSlot] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [pushOn, setPushOn] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const [linkMode, setLinkMode] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkIds, setLinkIds] = useState<string[]>([]);
  const [ritModal, setRitModal] = useState<any>(null);
  const [remInput, setRemInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [adInput, setAdInput] = useState('');
  const [sureInput, setSureInput] = useState('21');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));
  const [faydaList, setFaydaList] = useState<any[]>([]);
  const [alanList, setAlanList] = useState<string[]>([]);
  const [stAd, setStAd] = useState('');
  const [stFaydalar, setStFaydalar] = useState<string[]>([]);
  const [stZaman, setStZaman] = useState('gün');
  const [stSaat, setStSaat] = useState('');
  const [stAjanda, setStAjanda] = useState(true);
  const [stMsg, setStMsg] = useState('');
  const [kAct, setKAct] = useState<any>(null);
  const [kAd, setKAd] = useState('');
  const [kAcik, setKAcik] = useState('');
  const [kFaydalar, setKFaydalar] = useState<string[]>([]);
  const [kVids, setKVids] = useState<any[]>([]);
  const [kVin, setKVin] = useState({ baslik: '', url: '' });
  const [kMsg, setKMsg] = useState('');
  const [kShareTo, setKShareTo] = useState('');

  const today = iso(new Date());
  const day = selDate || today;
  function dayLabel(d: string) {
    const dt = parseD(d);
    const wd = WDFULL[dt.getDay()];
    return d === today ? 'Bugün · ' + wd : dt.getDate() + ' ' + MONTHS[dt.getMonth()] + ' · ' + wd;
  }
  function shiftDay(delta: number) {
    const dt = parseD(selDate || today);
    dt.setDate(dt.getDate() + delta);
    setSelDate(iso(dt));
  }
  function weekDays(d: string) {
    const dt = parseD(d);
    const dow = (dt.getDay() + 6) % 7; // Pazartesi=0
    const mon = new Date(dt);
    mon.setDate(dt.getDate() - dow);
    const arr: string[] = [];
    for (let i = 0; i < 7; i++) { const x = new Date(mon); x.setDate(mon.getDate() + i); arr.push(iso(x)); }
    return arr;
  }
  function weekLabel(d: string) {
    const w = weekDays(d);
    const a = parseD(w[0]), b = parseD(w[6]);
    return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
  }

  useEffect(() => {
    if (client && day) { try { setDayNote(localStorage.getItem('rite_note_' + client.id + '_' + day) || ''); } catch (_) {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, client]);

  useEffect(() => {
    setSelDate(iso(new Date()));
    try {
      const s = localStorage.getItem(LS);
      if (s) { const c = JSON.parse(s); setClient(c); loadData(c.id); loadInbox(c.id); ensureShareCode(c); reassignPush(c.id); }
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadInbox(cid: string) {
    const r = await supabase.from('dog_inbox').select('*').eq('client_id', cid).order('created_at', { ascending: false });
    setInbox(r.data || []);
  }
  async function ensureShareCode(cli: Client) {
    if (cli.share_code) return;
    const sc = 'RT-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    await supabase.from('dog_clients').update({ share_code: sc }).eq('id', cli.id);
    const nc = { ...cli, share_code: sc };
    setClient(nc); localStorage.setItem(LS, JSON.stringify(nc));
  }

  useEffect(() => { loadActivities(); loadFaydalar(); loadAreas(); }, []);
  async function loadFaydalar() {
    const r = await supabase.from('dog_faydalar').select('kod,ad,alan,kanit_duzeyi,sira').eq('aktif', true).order('sira');
    setFaydaList(r.data || []);
  }
  async function loadAreas() {
    const r = await supabase.from('dog_ref_items').select('ad,sira').eq('tur', 'wellbeing_alan').eq('aktif', true).order('sira');
    setAlanList((r.data || []).map((x: any) => x.ad));
  }
  async function loadActivities() {
    const r = await supabase.from('dog_activities').select('*').eq('aktif', true).order('grup').order('sira');
    const data = r.data || [];
    setActivities(data);
    const gs = data.map((a: any) => a.grup).filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i);
    if (gs.length) setActGroup((g) => g || gs[0]);
  }

  async function loadData(clientId: string) {
    const r = await supabase.from('dog_rituals').select('id,ad,zaman,kategori,tip,kaynak,mezun,aktif,alan,rutin,sira,baslangic,bitis,activity_id,hatirlatma_saat,blok_sira,faydalar,url,gunler').eq('client_id', clientId).order('zaman');
    setRituals(r.data || []);
    const lg = await supabase.from('dog_ritual_logs').select('id,ritual_id,tarih,yapildi').eq('client_id', clientId);
    setLogs(lg.data || []);
    const e = await supabase.from('dog_episodes').select('id,program_ad,birincil_ilgi,status').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1);
    const epRow = (e.data && e.data[0]) || null;
    setEp(epRow);
    if (epRow) {
      const a = await supabase.from('dog_anchors').select('etiket').eq('episode_id', epRow.id);
      setAnchors((a.data || []).map((x: any) => x.etiket));
      const pl = await supabase.from('dog_plans').select('vertical,params,status').eq('episode_id', epRow.id);
      setPlans(pl.data || []);
      const se = await supabase.from('dog_sessions').select('notlar,tarih').eq('episode_id', epRow.id).order('tarih', { ascending: false }).limit(1);
      setCNot((se.data && se.data[0] && se.data[0].notlar) || '');
    } else { setAnchors([]); setPlans([]); setCNot(''); }
    const m = await supabase.from('dog_measurements').select('tarih,anahtar,deger,birim').eq('client_id', clientId).order('tarih', { ascending: true }).limit(80);
    setMeas(m.data || []);
  }

  async function pair() {
    const c = code.trim().toUpperCase();
    if (!c) return setMsg('Kod gir');
    const r = await supabase.from('dog_clients').select('id,ad,code,share_code').eq('code', c).limit(1);
    if (r.error) return setMsg('Hata: ' + r.error.message);
    if (!r.data || !r.data.length) return setMsg('Kod bulunamadı (ör. RITE-AB12C).');
    const cli = r.data[0] as Client;
    setClient(cli); localStorage.setItem(LS, JSON.stringify(cli)); setMsg('');
    loadData(cli.id); loadInbox(cli.id); ensureShareCode(cli); reassignPush(cli.id);
  }
  async function currentSub() {
    try { if (!('serviceWorker' in navigator)) return null; const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch (_) { return null; }
  }
  async function reassignPush(clientId: string) {
    const sub = await currentSub(); if (!sub) return;
    const j: any = sub.toJSON();
    await supabase.from('dog_push_subs').upsert({ client_id: clientId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' });
  }
  async function removePushForDevice() {
    const sub = await currentSub(); if (!sub) return;
    const j: any = sub.toJSON();
    await supabase.from('dog_push_subs').delete().eq('endpoint', j.endpoint);
  }
  async function cikis() { await removePushForDevice(); localStorage.removeItem(LS); setClient(null); setCode(''); setPushOn(false); }
  async function resetAjanda() {
    if (!client) return;
    if (!confirm('Ajandadaki TÜM ritüeller ve işaretler silinsin mi? (Kişisel aktiviteler havuzda kalır; geri alınamaz)')) return;
    await supabase.from('dog_ritual_logs').delete().eq('client_id', client.id);
    await supabase.from('dog_rituals').delete().eq('client_id', client.id);
    loadData(client.id);
    setScreen('ajanda');
  }

  const ritDone = (id: string) => logs.some((l) => l.ritual_id === id && l.tarih === day && l.yapildi);
  const ritTotal = (id: string) => logs.filter((l) => l.ritual_id === id && l.yapildi).length;

  async function toggleRit(ritId: string) {
    if (!client) return;
    const ex = logs.filter((l) => l.ritual_id === ritId && l.tarih === day)[0];
    if (ex) await supabase.from('dog_ritual_logs').update({ yapildi: !ex.yapildi }).eq('id', ex.id);
    else await supabase.from('dog_ritual_logs').insert({ client_id: client.id, ritual_id: ritId, tarih: day, yapildi: true });
    loadData(client.id);
  }
  async function ritEkle(ad: string, zaman = 'gün', kaynak = 'Kendi', tip = 'aliskanlik', alan: string | null = null, activityId: string | null = null, faydalar: string[] = [], url: string | null = null) {
    if (!client || !ad.trim()) return;
    await supabase.from('dog_rituals').insert({ client_id: client.id, ad: ad.trim(), zaman, kaynak, tip, alan, activity_id: activityId, faydalar, url, aktif: true, mezun: false, baslangic: today, blok_sira: Date.now() });
    setYeniRit('');
    loadData(client.id);
  }
  function toggleFayda(kod: string) { setStFaydalar((a) => (a.includes(kod) ? a.filter((x) => x !== kod) : [...a, kod])); }
  async function studioKaydet() {
    if (!client) return;
    if (!stAd.trim()) return setStMsg('Aktivite adı gir');
    const alan0 = stFaydalar.length ? (faydaList.find((f) => f.kod === stFaydalar[0])?.alan || null) : null;
    const act = await supabase.from('dog_activities').insert({ client_id: client.id, ad: stAd.trim(), grup: alan0, faydalar: stFaydalar, zaman: stZaman, kaynak_etiket: 'Kendi', aktif: true }).select().single();
    if (act.error) return setStMsg('Hata: ' + act.error.message);
    if (stAjanda) {
      const rr = await supabase.from('dog_rituals').insert({ client_id: client.id, ad: stAd.trim(), zaman: stZaman, kaynak: 'Kendi', tip: 'aliskanlik', alan: alan0, faydalar: stFaydalar, activity_id: act.data.id, hatirlatma_saat: stSaat || null, aktif: true, mezun: false, baslangic: today, blok_sira: Date.now() });
      if (rr.error) return setStMsg('Aktivite kaydedildi; ajanda hatası: ' + rr.error.message);
    }
    setStAd(''); setStFaydalar([]); setStZaman('gün'); setStSaat(''); setStMsg(''); setAddSlot(null);
    loadActivities(); loadData(client.id);
    setActGroup('__kisisel'); if (stAjanda) setScreen('ajanda');
  }
  function openKAct(a: any) { setKAct(a); setKAd(a.ad || ''); setKAcik(a.aciklama || ''); setKFaydalar(a.faydalar || []); setKVids(a.videolar || []); setKVin({ baslik: '', url: '' }); setKMsg(''); }
  function kToggleFayda(kod: string) { setKFaydalar((a) => (a.includes(kod) ? a.filter((x) => x !== kod) : [...a, kod])); }
  function kVidEkle() { if (!kVin.baslik.trim()) return; setKVids((a) => [...a, { baslik: kVin.baslik.trim(), url: kVin.url.trim() }]); setKVin({ baslik: '', url: '' }); }
  const kVidSil = (i: number) => setKVids((a) => a.filter((_, j) => j !== i));
  async function kSave() {
    if (!kAct) return;
    const alan0 = kFaydalar.length ? (faydaList.find((f) => f.kod === kFaydalar[0])?.alan || null) : null;
    const r = await supabase.from('dog_activities').update({ ad: kAd.trim(), aciklama: kAcik || null, faydalar: kFaydalar, videolar: kVids, grup: alan0 }).eq('id', kAct.id);
    if (r.error) return setKMsg('Hata: ' + r.error.message);
    setKMsg('Kaydedildi'); setKAct((p: any) => ({ ...p, ad: kAd.trim(), aciklama: kAcik, faydalar: kFaydalar, videolar: kVids, grup: alan0 })); loadActivities();
  }
  async function kEkleAjanda() {
    if (!kAct || !client) return;
    const alan0 = kFaydalar.length ? (faydaList.find((f) => f.kod === kFaydalar[0])?.alan || null) : null;
    await ritEkle(kAd.trim() || kAct.ad, addSlot || kAct.zaman || 'gün', 'Kendi', 'aliskanlik', alan0, kAct.id, kFaydalar, (kVids && kVids[0]?.url) || null);
    setKAct(null); setAddSlot(null); setScreen('ajanda');
  }
  async function kSil() {
    if (!kAct) return;
    if (!confirm('Bu kişisel aktivite havuzdan silinsin mi? (Ajandadaki ritüeller kalır)')) return;
    const r = await supabase.from('dog_activities').delete().eq('id', kAct.id);
    if (r.error) return setKMsg('Hata: ' + r.error.message);
    setKAct(null); loadActivities();
  }
  async function kPaylas() {
    if (!kAct) return;
    const kod = kShareTo.trim().toUpperCase();
    if (!kod) return setKMsg('Alıcının paylaşım kodunu gir');
    const rc = await supabase.from('dog_clients').select('id').eq('share_code', kod).limit(1);
    if (rc.error || !rc.data || !rc.data.length) return setKMsg('Kod bulunamadı: ' + kod);
    const ins = await supabase.from('dog_inbox').insert({ client_id: rc.data[0].id, tur: 'aktivite', baslik: kAd.trim() || kAct.ad, payload: { ad: kAd.trim() || kAct.ad, faydalar: kFaydalar, aciklama: kAcik || null, videolar: kVids }, from_code: client?.share_code || null, durum: 'yeni' });
    if (ins.error) return setKMsg('Hata: ' + ins.error.message);
    setKShareTo(''); setKMsg('Gönderildi → ' + kod);
  }
  function sureGun(rt: any): number { if (!rt.bitis) return 0; const b = parseD(rt.baslangic || today); const e = parseD(rt.bitis); return Math.round((e.getTime() - b.getTime()) / 86400000) + 1; }
  function openRit(rt: any) { setRitModal(rt); setRemInput(rt.hatirlatma_saat || ''); setUrlInput(rt.url || ''); setAdInput(rt.ad || ''); const n = sureGun(rt); setSureInput(n > 0 ? String(n) : '21'); }
  async function setRitUrl(id: string, url: string) {
    if (!client) return;
    const u = url.trim() || null;
    await supabase.from('dog_rituals').update({ url: u }).eq('id', id);
    setRitModal((p: any) => (p ? { ...p, url: u } : p));
    loadData(client.id);
  }
  async function setRitAd(id: string, ad: string) {
    if (!client || !ad.trim()) return;
    await supabase.from('dog_rituals').update({ ad: ad.trim() }).eq('id', id);
    setRitModal((p: any) => (p ? { ...p, ad: ad.trim() } : p));
    loadData(client.id);
  }
  // sureGunSay: null = süregelen (bitiş kaldır); >0 = başlangıçtan itibaren N gün
  async function setRitSure(id: string, gun: number | null) {
    if (!client) return;
    const rt = rituals.find((r) => r.id === id);
    let patch: any;
    if (!gun) patch = { bitis: null };
    else { const bas = (rt && rt.baslangic && rt.baslangic >= today) ? rt.baslangic : today; const e = parseD(bas); e.setDate(e.getDate() + gun - 1); patch = { baslangic: bas, bitis: iso(e) }; }
    await supabase.from('dog_rituals').update(patch).eq('id', id);
    setRitModal((p: any) => (p ? { ...p, ...patch } : p));
    loadData(client.id);
  }
  async function setRitGunler(id: string, g: number[]) {
    if (!client) return;
    const arr = g.length === 0 || g.length === 7 ? null : g;
    await supabase.from('dog_rituals').update({ gunler: arr }).eq('id', id);
    setRitModal((p: any) => (p ? { ...p, gunler: arr } : p));
    loadData(client.id);
  }
  async function setRitZaman(id: string, z: string) {
    if (!client) return;
    const rt = rituals.find((r) => r.id === id);
    if (rt?.rutin) await supabase.from('dog_rituals').update({ zaman: z }).eq('rutin', rt.rutin); // zincirse tüm üyeler
    else await supabase.from('dog_rituals').update({ zaman: z }).eq('id', id);
    setRitModal((p: any) => (p ? { ...p, zaman: z } : p));
    loadData(client.id);
  }
  async function setRitTip(id: string, t: string) {
    if (!client) return;
    await supabase.from('dog_rituals').update({ tip: t }).eq('id', id);
    setRitModal((p: any) => (p ? { ...p, tip: t } : p));
    loadData(client.id);
  }
  async function setRitReminder(id: string, saat: string) {
    if (!client) return;
    // Saati değiştirince "bugün gönderildi" işaretini sıfırla → yeni saat aynı gün de tetiklenir
    await supabase.from('dog_rituals').update({ hatirlatma_saat: saat || null, son_bildirim: null }).eq('id', id);
    setRitModal((p: any) => (p ? { ...p, hatirlatma_saat: saat || null, son_bildirim: null } : p));
    loadData(client.id);
  }
  async function openKB(rt: any) {
    if (!rt.activity_id) return;
    const a = await supabase.from('dog_activities').select('*').eq('id', rt.activity_id).single();
    if (a.data) { setRitModal(null); setActModal(a.data); }
  }
  async function ritSil(id: string) {
    if (!client) return;
    const rt = rituals.find((r) => r.id === id);
    const hasHistory = logs.some((l) => l.ritual_id === id && l.yapildi) || !!(rt && rt.baslangic && rt.baslangic < today);
    if (hasHistory) {
      if (!confirm('Yarından itibaren kaldırılsın mı? Geçmiş kayıtların korunur.')) return;
      await supabase.from('dog_rituals').update({ bitis: today }).eq('id', id);
    } else {
      if (!confirm('Bu ritüel silinsin mi?')) return;
      await supabase.from('dog_rituals').delete().eq('id', id);
    }
    loadData(client.id);
  }
  function startLink() { setLinkMode(true); setLinkName(''); setLinkIds([]); setMsg(''); }
  function cancelLink() { setLinkMode(false); setLinkName(''); setLinkIds([]); }
  function toggleLink(id: string) { setLinkIds((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id])); }
  async function saveLink() {
    if (!client) return;
    if (linkIds.length < 2) return setMsg('En az 2 aktivite seç');
    const rid = 'r' + Date.now().toString(36);
    const firstSlot = rituals.find((r) => r.id === linkIds[0])?.zaman || 'gün';
    const bs = Date.now();
    await Promise.all(linkIds.map((id, i) => supabase.from('dog_rituals').update({ rutin: rid, sira: i, zaman: firstSlot, blok_sira: bs }).eq('id', id)));
    cancelLink();
    loadData(client.id);
  }
  async function moveStep(rn: string, i: number, dir: number) {
    if (!client) return;
    const steps = rituals.filter((r) => r.rutin === rn).sort((a, b) => (a.sira || 0) - (b.sira || 0));
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const a = steps[i], b = steps[j];
    await supabase.from('dog_rituals').update({ sira: b.sira || 0 }).eq('id', a.id);
    await supabase.from('dog_rituals').update({ sira: a.sira || 0 }).eq('id', b.id);
    loadData(client.id);
  }
  async function rutinCikar(id: string) {
    if (!client) return;
    await supabase.from('dog_rituals').update({ rutin: null }).eq('id', id);
    loadData(client.id);
  }
  async function onDragEndSlot(items: any[], e: any) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.key === active.id);
    const newIndex = items.findIndex((i) => i.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const ordered = arrayMove(items, oldIndex, newIndex);
    await Promise.all(ordered.flatMap((it: any, idx: number) => it.members.map((m: any) => supabase.from('dog_rituals').update({ blok_sira: idx }).eq('id', m.id))));
    if (client) loadData(client.id);
  }
  async function rutinBoz(name: string) {
    if (!client) return;
    const ids = rituals.filter((r) => r.rutin === name).map((r) => r.id);
    if (!ids.length) return;
    await supabase.from('dog_rituals').update({ rutin: null }).in('id', ids);
    loadData(client.id);
  }
  async function emekli(id: string) {
    if (!client) return;
    await supabase.from('dog_rituals').update({ mezun: true, aktif: false, bitis: today }).eq('id', id);
    loadData(client.id);
  }
  async function yenidenBasla(id: string) {
    if (!client) return;
    await supabase.from('dog_rituals').update({ mezun: false, aktif: true, baslangic: today, bitis: null }).eq('id', id);
    loadData(client.id);
  }

  function saveNote(v: string) {
    setDayNote(v);
    if (client) localStorage.setItem('rite_note_' + client.id + '_' + day, v);
  }
  async function inboxYakala() {
    if (!client || !ib.t.trim()) return;
    await supabase.from('dog_inbox').insert({ client_id: client.id, tur: 'not', baslik: ib.t.trim(), url: ib.u.trim() || null, durum: 'yeni' });
    setIb({ t: '', u: '' });
    loadInbox(client.id);
  }
  async function panodanEkle() {
    try {
      const txt = (await navigator.clipboard.readText())?.trim();
      if (!txt) return setKMsg('');
      const isUrl = /^https?:\/\//i.test(txt);
      setIb({ t: isUrl ? '' : txt.slice(0, 80), u: isUrl ? txt : '' });
    } catch (_) { /* izin verilmedi */ }
  }
  async function inboxSlot(id: string, slot: string) {
    await supabase.from('dog_inbox').update({ slot, durum: 'alindi' }).eq('id', id);
    if (client) loadInbox(client.id);
  }
  async function inboxSil(id: string) {
    await supabase.from('dog_inbox').delete().eq('id', id);
    if (client) loadInbox(client.id);
  }
  async function inboxToRitual(item: any, dayOffset: number) {
    if (!client) return;
    const d = parseD(today); d.setDate(d.getDate() + dayOffset); const ds = iso(d);
    const ad = (item.tur === 'link' ? 'İzle: ' : '') + (item.baslik || '');
    await supabase.from('dog_rituals').insert({ client_id: client.id, ad, zaman: 'gün', kaynak: 'Inbox', tip: 'aliskanlik', url: item.url || null, baslangic: ds, bitis: ds, aktif: true, mezun: false, blok_sira: Date.now() });
    await supabase.from('dog_inbox').delete().eq('id', item.id);
    loadInbox(client.id); loadData(client.id);
  }
  async function inboxAktiviteEkle(item: any) {
    if (!client) return;
    const p = item.payload || {};
    const alan0 = (p.faydalar && p.faydalar.length) ? (faydaList.find((f) => f.kod === p.faydalar[0])?.alan || null) : null;
    await supabase.from('dog_activities').insert({ client_id: client.id, ad: p.ad, grup: alan0, faydalar: p.faydalar || [], aciklama: p.aciklama || null, videolar: p.videolar || null, kaynak_etiket: 'Paylaşılan', aktif: true });
    await supabase.from('dog_inbox').update({ durum: 'alindi' }).eq('id', item.id);
    loadActivities(); loadInbox(client.id);
  }

  async function enableNotifs() {
    if (!client) return;
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return setPushMsg('Bu cihaz push desteklemiyor.');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return setPushMsg('Bildirim izni verilmedi.');
      const reg = await navigator.serviceWorker.ready;
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapid) return setPushMsg('VAPID public key ayarlı değil.');
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(vapid) });
      const j: any = sub.toJSON();
      await supabase.from('dog_push_subs').upsert({ client_id: client.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' });
      setPushOn(true); setPushMsg('Bildirimler açık ✓');
    } catch (err: any) { setPushMsg('Hata: ' + (err?.message || String(err))); }
  }
  async function testPush() {
    if (!client) return;
    const r = await fetch('/api/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: client.id, title: 'Rite', body: 'Test 🌿 — kapalıyken de gelir.' }) });
    const j = await r.json().catch(() => ({}));
    setPushMsg(j.error ? 'Hata: ' + j.error : 'Gönderildi: ' + j.sent + '/' + j.total);
  }

  // ---------- pairing ----------
  if (!client) {
    return (
      <div className="app">
        <div className="hd"><div className="b">Rite <span>· daily rites</span></div><span style={{ marginLeft: 'auto', fontSize: 11, color: '#bfe2b0' }}>● anonim</span></div>
        <div className="main">
          <div className="card" style={{ marginTop: 26 }}>
            <h2>Merkeze bağlan</h2>
            <p className="sub">Merkezinden/koçundan aldığın <b>eşleştirme kodunu</b> gir. Hesap yok, e-posta yok — kod yalnızca yerel bir anahtar.</p>
            <label>Eşleştirme kodu</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="RITE-AB12C" autoCapitalize="characters" />
            <div style={{ marginTop: 12 }}><button className="btn" onClick={pair}>Bağlan</button></div>
            <div className="msg">{msg}</div>
          </div>
          <p className="note" style={{ textAlign: 'center', marginTop: 8 }}>Telefonda: tarayıcı menüsü → &quot;Ana ekrana ekle&quot;.</p>
        </div>
      </div>
    );
  }

  const wday = (d: string) => new Date(d + 'T00:00:00').getDay();
  const activeOn = (r: any, d: string) => (!r.baslangic || r.baslangic <= d) && (!r.bitis || d <= r.bitis) && (!r.gunler || r.gunler.length === 0 || r.gunler.includes(wday(d)));
  const habits = rituals.filter((r) => !r.mezun && activeOn(r, day));
  const mezunlar = rituals.filter((r) => r.mezun);
  const faydaMap: Record<string, any> = {};
  faydaList.forEach((f) => { faydaMap[f.kod] = f; });
  const ritAreas = (rt: any): string[] => {
    if (rt.faydalar && rt.faydalar.length) return Array.from(new Set(rt.faydalar.map((k: string) => faydaMap[k]?.alan).filter(Boolean)));
    return rt.alan ? [rt.alan] : [];
  };
  const measByKey: Record<string, any[]> = {};
  meas.forEach((m) => { (measByKey[m.anahtar] = measByKey[m.anahtar] || []).push(m); });
  const days7 = lastDays(7);
  const last30 = lastDays(30);
  const weekArr = weekDays(day);
  const gelHabits = rituals;
  const weekHabits = rituals.filter((r) => weekArr.some((d) => activeOn(r, d)));
  const beslenmePlan = plans.find((p) => p.vertical === 'beslenme');
  const ibBadge = inbox.filter((x) => x.durum === 'yeni').length;
  const curatedActs = activities.filter((a) => !a.client_id);
  const personalActs = activities.filter((a) => a.client_id === client.id);
  const actGroups = curatedActs.map((a) => a.grup).filter((v, i, arr) => arr.indexOf(v) === i);

  function providerTag(kaynak: string) {
    if (kaynak === 'Meridyen') return <span className="tagp p-mer">Meridyen</span>;
    if (kaynak === 'AfH') return <span className="tagp p-afh">AfH</span>;
    if (kaynak === 'Kendi') return <span className="tagp p-own">Kendi</span>;
    return null;
  }

  function RitItem({ rt }: { rt: any }) {
    const done = ritDone(rt.id);
    const total = ritTotal(rt.id);
    return (
      <div>
        <div className="rit">
          <div className={'chk' + (done ? ' on' : '')} onClick={() => toggleRit(rt.id)}>{done ? '✓' : ''}</div>
          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openRit(rt)}>
            <div className="t">{rt.ad}
              {providerTag(rt.kaynak)}
              {ritAreas(rt).map((a) => <span key={a} className="tagp p-alan">{a}</span>)}
            </div>
            <div className="m">{rt.hatirlatma_saat ? '🔔 ' + rt.hatirlatma_saat + ' · ' : ''}{gunlerLabel(rt.gunler)}{rt.bitis ? ' · bitiş ' + kisaTarih(rt.bitis) : ''} · toplam {total}</div>
          </div>
          {rt.url && <a className="playbtn" href={rt.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Aç">▶</a>}
          <button className="rmx" onClick={() => ritSil(rt.id)} title="Kaldır">✕</button>
        </div>
        {!rt.mezun && !rt.bitis && total >= 21 && (
          <div className="retirebox">🎉 <div>&quot;{rt.ad}&quot; {total} kez yapıldı — artık otomatik. <b>Emekli edip</b> listeni sadeleştirelim mi?</div><button className="rb" onClick={() => emekli(rt.id)}>Emekli et</button></div>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <div className="hd">
        <div className="b">Rite <span>· {client.ad}</span></div>
        <button className="ibtn" onClick={() => setScreen('inbox')}>📥{ibBadge > 0 && <span className="bdg">{ibBadge}</span>}</button>
      </div>

      <div className="main">
        {/* ---------- AJANDA ---------- */}
        {screen === 'ajanda' && (
          <div>
            <h2>Ajanda</h2>
            <div className="daterow">
              <button className="arrow" onClick={() => shiftDay(ajView === 'hafta' ? -7 : -1)}>‹</button>
              <div className="dlabel">{ajView === 'hafta' ? weekLabel(day) : dayLabel(day)}</div>
              <button className="arrow" onClick={() => shiftDay(ajView === 'hafta' ? 7 : 1)}>›</button>
              {day !== today && <button className="today" onClick={() => setSelDate(today)}>Bugün</button>}
            </div>
            <div className="vswitch">
              {(['gun', 'hafta'] as const).map((v) => <div key={v} className={'vseg' + (ajView === v ? ' on' : '')} onClick={() => setAjView(v)}>{v === 'gun' ? 'Gün' : 'Hafta'}</div>)}
            </div>

            {ajView === 'gun' && (linkMode ? (
              <div className="card">
                <h3>Zincir (rutin) oluştur — aktiviteleri sırayla bağla</h3>
                <p className="note" style={{ marginTop: 4 }}>Aktivitelere sırayla dokun (numara = sıra). En az 2. Ad gerekmez; ilk sıradakine 🔗 gelir. İlk seçtiğinin zaman dilimi kullanılır, hepsi o dilime taşınır.</p>
                <div style={{ marginTop: 4 }}>
                  {habits.filter((r) => !r.rutin).map((rt) => {
                    const idx = linkIds.indexOf(rt.id);
                    return (
                      <div key={rt.id} className="rit" style={{ cursor: 'pointer' }} onClick={() => toggleLink(rt.id)}>
                        <div className={'chk' + (idx >= 0 ? ' on' : '')}>{idx >= 0 ? idx + 1 : ''}</div>
                        <div style={{ flex: 1 }}><div className="t">{rt.ad}</div><div className="m">{rt.zaman || 'gün'}{rt.alan ? ' · ' + rt.alan : ''}</div></div>
                      </div>
                    );
                  })}
                  {habits.filter((r) => !r.rutin).length === 0 && <div className="note">Bağlanacak (rutine girmemiş) aktivite yok.</div>}
                </div>
                <div className="rowbtns"><button className="btn" onClick={saveLink}>Kaydet</button><button className="btn ghost sm" onClick={cancelLink}>Vazgeç</button></div>
                <div className="msg">{msg}</div>
              </div>
            ) : (
              <div>
                {TODS.map(([z, lbl]) => {
                  const slotRits = habits.filter((r) => (r.zaman || 'gün') === z);
                  const map = new Map<string, any>();
                  for (const r of slotRits) {
                    const key = r.rutin ? 'r:' + r.rutin : 's:' + r.id;
                    if (!map.has(key)) map.set(key, { key, rutin: r.rutin || null, members: [] });
                    map.get(key).members.push(r);
                  }
                  const items = Array.from(map.values());
                  for (const it of items) it.members.sort((a: any, b: any) => (a.sira || 0) - (b.sira || 0));
                  items.sort((a, b) => (Number(a.members[0].blok_sira) || 0) - (Number(b.members[0].blok_sira) || 0));
                  return (
                    <div key={z} style={{ background: SLOTBG[z], borderRadius: 12, padding: '2px 8px 6px', margin: '10px 0' }}>
                      <div className="slothead">
                        <div className="tod" style={{ margin: '6px 4px 2px' }}>{lbl}</div>
                        <button className="slotadd" onClick={() => { setAddSlot(z); setStZaman(z); setScreen('havuz'); }} aria-label="ekle">+</button>
                      </div>
                      {items.length === 0 ? <div className="note" style={{ padding: '2px 4px 6px' }}>Boş — sağdaki + ile ekle.</div> : (
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onDragEndSlot(items, e)}>
                        <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
                          {items.map((it) => (
                            <SortableItem key={it.key} id={it.key}>
                              {it.rutin ? (
                                <div className="card routine">
                                  <div className="chain">
                                    {it.members.map((rt: any, i: number) => {
                                      const done = ritDone(rt.id);
                                      return (
                                        <div key={rt.id} className="cstep">
                                          <div className={'cdot' + (done ? ' on' : '')} onClick={() => toggleRit(rt.id)}>{done ? '✓' : ''}</div>
                                          <div className="cbody" style={{ cursor: 'pointer' }} onClick={() => openRit(rt)}><div className="t">{i === 0 && <span style={{ marginRight: 4 }}>🔗</span>}{rt.ad}{ritAreas(rt).map((a) => <span key={a} className="tagp p-alan">{a}</span>)}</div><div className="m">{rt.hatirlatma_saat ? '🔔 ' + rt.hatirlatma_saat + ' · ' : ''}toplam {ritTotal(rt.id)}</div></div>
                                          <div className="cact">
                                            {rt.url && <a href={rt.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Aç">▶</a>}
                                            <button onClick={() => moveStep(it.rutin, i, -1)}>↑</button>
                                            <button onClick={() => moveStep(it.rutin, i, 1)}>↓</button>
                                            <button onClick={() => rutinCikar(rt.id)} title="Zincirden çıkar">✕</button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div style={{ textAlign: 'right', marginTop: 2 }}><button className="rboz" onClick={() => rutinBoz(it.rutin)}>zinciri boz</button></div>
                                </div>
                              ) : (
                                <div className="card" style={{ padding: '4px 14px' }}><RitItem rt={it.members[0]} /></div>
                              )}
                            </SortableItem>
                          ))}
                        </SortableContext>
                      </DndContext>
                      )}
                    </div>
                  );
                })}

                <div className="tod">Bugüne not</div>
                <div className="card">
                  <input value={dayNote} onChange={(e) => saveNote(e.target.value)} placeholder="Serbest not — izlenmez, sadece bugün burada durur." />
                </div>

                <div className="rowbtns">
                  <button className="btn ghost sm" onClick={startLink}>＋ Zincir/rutin oluştur</button>
                  {mezunlar.length > 0 && <button className="btn ghost sm" onClick={() => setScreen('mezunlar')}>🎓 Mezunlar ({mezunlar.length})</button>}
                </div>
                {pushMsg && <div className="msg">{pushMsg}</div>}
              </div>
            ))}

            {ajView === 'hafta' && (
              <div className="card">
                <p className="note" style={{ marginBottom: 8 }}>Haftalık uyum — yalnız alışkanlıklar izlenir.</p>
                <table className="tracker">
                  <thead><tr><th style={{ textAlign: 'left' }}>Alışkanlık</th>{weekArr.map((d) => <th key={d}>{WD[parseD(d).getDay()]}</th>)}</tr></thead>
                  <tbody>
                    {weekHabits.map((rt) => (
                      <tr key={rt.id}><td className="h">{rt.ad}</td>
                        {weekArr.map((d) => {
                          if (!activeOn(rt, d)) return <td key={d}><span className="dot na"></span></td>;
                          const ok = logs.some((l) => l.ritual_id === rt.id && l.tarih === d && l.yapildi);
                          return <td key={d}><span className={'dot ' + (ok ? 'y' : 'n')}>{ok ? '✓' : '·'}</span></td>;
                        })}
                      </tr>
                    ))}
                    {weekHabits.length === 0 && <tr><td className="h" colSpan={8}>Bu hafta alışkanlık yok.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        )}

        {/* ---------- HAVUZ ---------- */}
        {screen === 'havuz' && (
          <div>
            <h2>Aktivite Havuzu</h2>
            <p className="sub">Anlamlı gruplar; her aktivitenin detay + kaynak sayfası var. Beğendiğini ritüellerine ekle.</p>
            {addSlot && <div className="banner">➕ <div><b>{TODS.find((t) => t[0] === addSlot)?.[1]}</b>&apos;a ekleniyor — bir aktivite seç.</div><button className="bb" onClick={() => setAddSlot(null)}>İptal</button></div>}
            <div className="tabs">
              <div className={'tab' + (actGroup === '__kisisel' ? ' on' : '')} onClick={() => setActGroup('__kisisel')}>Kişisel</div>
              {actGroups.map((g) => <div key={g} className={'tab' + (actGroup === g ? ' on' : '')} onClick={() => setActGroup(g)}>{g}</div>)}
              <div className={'tab' + (actGroup === '__own' ? ' on' : '')} onClick={() => setActGroup('__own')}>＋ Tasarla</div>
            </div>
            {actGroup === '__own' ? (
              <div className="card">
                <h3>Aktivite tasarla — Rite Studio</h3>
                <label>Aktivite adı</label>
                <input value={stAd} onChange={(e) => setStAd(e.target.value)} placeholder="ör. Badem'le sabah parkı" />
                <label className="fldlbl">Kapsadığı faydalar (sırayla seç = öncelik)</label>
                <div>{faydaList.map((f) => { const idx = stFaydalar.indexOf(f.kod); return (
                  <span key={f.kod} className={'chip' + (idx >= 0 ? ' on' : '')} onClick={() => toggleFayda(f.kod)}>{idx >= 0 ? (idx + 1) + '. ' : ''}{f.ad}</span>
                ); })}</div>
                {stFaydalar.length > 0 && <div className="note" style={{ marginTop: 6 }}>Kapsanan alanlar: <b>{Array.from(new Set(stFaydalar.map((k) => faydaMap[k]?.alan).filter(Boolean))).join(' · ')}</b></div>}
                <div className="grid" style={{ marginTop: 8 }}>
                  <div><label>Zaman dilimi</label><select value={stZaman} onChange={(e) => setStZaman(e.target.value)}><option value="sabah">Sabah</option><option value="gün">Gün</option><option value="akşam">Akşam</option></select></div>
                  <div><label>Hatırlatma (ops.)</label><input type="time" value={stSaat} onChange={(e) => setStSaat(e.target.value)} /></div>
                </div>
                <label className="fldlbl" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={stAjanda} onChange={(e) => setStAjanda(e.target.checked)} /> Bugünden ajandama da ekle</label>
                <div style={{ marginTop: 10 }}><button className="btn" onClick={studioKaydet}>Kaydet (havuza)</button></div>
                <div className="msg">{stMsg}</div>
                <p className="note" style={{ marginTop: 8 }}>Aktiviten havuzdaki <b>Kişisel</b>&apos;e kalıcı düşer; kartından sonradan açıklama/video ekleyip zenginleştirebilirsin.</p>
              </div>
            ) : actGroup === '__kisisel' ? (
              <div className="card">
                {personalActs.length === 0 ? <div className="note">Henüz kişisel aktivite yok. <button className="linkbtn" onClick={() => setActGroup('__own')}>＋ Tasarla</button> ile oluştur.</div> : personalActs.map((a) => (
                  <div key={a.id} className="actcard" onClick={() => openKAct(a)}>
                    <div style={{ flex: 1 }}><div className="n">{a.ad}</div><div className="o">{Array.from(new Set((a.faydalar || []).map((k: string) => faydaMap[k]?.alan).filter(Boolean))).join(' · ')}</div></div>
                    <span className="go">›</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card">
                {curatedActs.filter((a) => a.grup === actGroup).map((a) => (
                  <div key={a.id} className="actcard" onClick={() => setActModal(a)}>
                    <div style={{ flex: 1 }}><div className="n">{a.ad}</div><div className="o">{a.ozet || ''}</div></div>
                    <span className="go">›</span>
                  </div>
                ))}
                {curatedActs.filter((a) => a.grup === actGroup).length === 0 && <div className="note">Bu grupta aktivite yok.</div>}
              </div>
            )}
          </div>
        )}

        {/* ---------- DESTEK ---------- */}
        {screen === 'destek' && (
          <div>
            <h2>Destek</h2>
            <p className="sub">Rite bir wellbeing merkezine ya da bağımsız uzmana bağlanır. Merkeze bağlıysan tüm hizmetler tek seferde açılır. Anonim kalırsın.</p>
            <div className="prov">
              <div className="ptop"><div className="pic">M</div><div><div className="pn">Meridyen Wellbeing Center</div><div className="pd">Beslenme + fitness + wellbeing + klinik kapı — koordineli</div></div><span className="pstat" style={{ color: 'var(--green)' }}>✓ bağlı</span></div>
              <div className="rowbtns"><button className="btn ghost sm" onClick={() => setScreen('ogun')}>Öğün Planı →</button><button className="btn ghost sm" onClick={() => setScreen('gelisim')}>Gelişim →</button></div>
            </div>
            <div className="prov dim"><div className="ptop"><div className="pic" style={{ background: 'var(--green)' }}>D</div><div><div className="pn">Bağımsız diyetisyen</div><div className="pd">Tek hizmet — yalnız öğün planı</div></div><span className="pstat">yakında</span></div></div>
            <div className="prov dim"><div className="ptop"><div className="pic">F</div><div><div className="pn">Fitness / Fizyo / Psikoloji</div><div className="pd">Program teslimatı</div></div><span className="pstat">yakında</span></div></div>
            <div className="soul"><b>Rite seni bağlamaz.</b> Bağlantı opsiyonel; istediğinde <button className="linkbtn" onClick={cikis}>kes</button>, verin sende kalır.</div>
          </div>
        )}

        {/* ---------- ÖĞÜN PLANI ---------- */}
        {screen === 'ogun' && (
          <div>
            <button className="linkbtn" onClick={() => setScreen('destek')}>‹ Destek</button>
            <h2 style={{ marginTop: 6 }}>Öğün Planı</h2>
            {beslenmePlan ? (
              <>
                <div className="card">
                  <h3>Program</h3>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{ep?.program_ad || 'Beslenme'}</div>
                  {(beslenmePlan.params?.mufredat || []).map((u: any, i: number) => (
                    <div key={i} className="meal"><div className="mt">{u.ad}{u.odak ? ' — ' + u.odak : ''}</div>{(u.maddeler || []).map((m: string, j: number) => <div key={j} className="mi">• {m}</div>)}</div>
                  ))}
                </div>
                {cNot && <div className="card" style={{ background: 'var(--green2)', borderColor: '#bfe2d4' }}><h3>Koç notu</h3><p style={{ fontSize: 12, color: '#256b53', lineHeight: 1.55 }}>{cNot}</p></div>}
                <div className="soul">Beğenmediğin öğünü ileride <b>eşdeğeriyle değiştir</b> — plan bozulmaz (çıpa + makro içinde). Ayrıntılı tabak düzeni koçta; sende yalnız güvenli takas. (Ayrıntılı menü Beslenme modülü üretince dolar.)</div>
              </>
            ) : (
              <div className="empty">🍽<br />Henüz beslenme planı yok.<br /><span>Koçun plan açınca burada görünür.</span></div>
            )}
          </div>
        )}

        {/* ---------- GELİŞİM ---------- */}
        {screen === 'gelisim' && (
          <div>
            <h2>Gelişim</h2>
            <div className="card"><h3>Kapsama — bu hafta</h3>
              {(() => {
                const base = alanList.length ? alanList : Array.from(new Set(faydaList.map((f) => f.alan)));
                const areaCount: Record<string, number> = {};
                base.forEach((a) => { areaCount[a] = 0; });
                days7.forEach((d) => rituals.forEach((rt) => {
                  if (logs.some((l) => l.ritual_id === rt.id && l.tarih === d && l.yapildi)) ritAreas(rt).forEach((a) => { areaCount[a] = (areaCount[a] || 0) + 1; });
                }));
                const areas = Object.keys(areaCount);
                const max = Math.max(1, ...areas.map((a) => areaCount[a]));
                const touched = areas.filter((a) => areaCount[a] > 0).length;
                if (!areas.length) return <div className="note">Alan tanımlı değil.</div>;
                return (
                  <>
                    <div className="note" style={{ marginTop: 0, marginBottom: 8 }}><b>{touched}/{areas.length}</b> yaşam alanına dokundun.</div>
                    {areas.map((a) => {
                      const c = areaCount[a];
                      return (
                        <div key={a} className="mbar">
                          <div className="l"><span style={{ color: c ? undefined : 'var(--muted)' }}>{a}{c ? '' : ' · boş'}</span><b>{c}</b></div>
                          <div className="track"><div className="fill" style={{ width: (c / max) * 100 + '%', opacity: c ? 1 : 0.25 }} /></div>
                        </div>
                      );
                    })}
                    <div className="soul">Boş alanlar = fırsat. Bir aktivitenin çok alanı birden kapsaması = kaldıraç (Badem yürüyüşü gibi tek aktivite 3-4 alan).</div>
                  </>
                );
              })()}
            </div>
            <div className="card"><h3>Readiness (son 7 gün)</h3>
              <div className="spark">{days7.map((d) => {
                const sched = gelHabits.filter((r) => activeOn(r, d));
                const done = sched.filter((r) => logs.some((l) => l.ritual_id === r.id && l.tarih === d && l.yapildi)).length;
                const h = sched.length ? Math.round((done / sched.length) * 100) : 0;
                return <i key={d} style={{ height: Math.max(4, h) + '%' }} />;
              })}</div>
            </div>
            <div className="card"><h3>Ölçümler</h3>
              {Object.keys(measByKey).length === 0 ? <div className="note">Koçun ölçüm girince görünür.</div> : Object.keys(measByKey).slice(0, 6).map((k) => {
                const arr = measByKey[k]; const l = arr[arr.length - 1];
                return <div key={k} className="mrow"><span>{k}</span><b>{l.deger} {l.birim || ''}</b></div>;
              })}
            </div>
            <div className="card"><h3>Ritüel uyumu (bu hafta)</h3>
              <div className="mrow" style={{ borderTop: 'none' }}><span>Tamamlanan</span><b>%{(() => { let act = 0, done = 0; days7.forEach((d) => gelHabits.forEach((r) => { if (activeOn(r, d)) { act++; if (logs.some((l) => l.ritual_id === r.id && l.tarih === d && l.yapildi)) done++; } })); return act ? Math.round((done / act) * 100) : 0; })()}</b></div>
            </div>
            <div className="card"><h3>Aylık uyum (aktif günlere göre)</h3>
              {(() => {
                const rows = gelHabits.map((rt) => {
                  const act = last30.filter((d) => activeOn(rt, d));
                  if (!act.length) return null;
                  const n = act.filter((d) => logs.some((l) => l.ritual_id === rt.id && l.tarih === d && l.yapildi)).length;
                  const pct = Math.round((n / act.length) * 100);
                  return <div key={rt.id} className="mbar"><div className="l"><span>{rt.ad}</span><b>%{pct} <span className="note" style={{ margin: 0 }}>({n}/{act.length})</span></b></div><div className="track"><div className="fill" style={{ width: pct + '%' }} /></div></div>;
                }).filter(Boolean);
                return rows.length ? rows : <div className="note">Alışkanlık yok.</div>;
              })()}
              <div className="soul">Düşük uyum = başarısızlık değil, sinyal. Yüzde, ritüelin yalnız <b>aktif olduğu günler</b> üzerinden hesaplanır.</div>
            </div>
            {cNot && <div className="card"><h3>Koç notu</h3><p style={{ fontSize: 12, color: '#4a565c', lineHeight: 1.55 }}>{cNot}</p></div>}
          </div>
        )}

        {/* ---------- INBOX ---------- */}
        {screen === 'inbox' && (
          <div>
            <h2>📥 Inbox</h2>
            <p className="sub">Aklına takılan / yeri belli olmayan her şeyin ilk durağı: not, görev, link, ve sana gelen paylaşımlar. Sonra bir güne yerleştir ya da havuza/ritüele çevir.</p>
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="note" style={{ marginTop: 0, flex: 1 }}>Paylaşım kodun: <b>{client.share_code || '…'}</b> <span style={{ color: 'var(--muted)' }}>· başkaları buraya gönderebilir</span></div>
                <button className="btn ghost sm" onClick={() => client && loadInbox(client.id)}>🔄 Yenile</button>
              </div>
            </div>
            <div className="card">
              <label>Yakala</label>
              <input value={ib.t} onChange={(e) => setIb((s) => ({ ...s, t: e.target.value }))} placeholder="Aklına ne takıldıysa yaz…" />
              <input style={{ marginTop: 8 }} value={ib.u} onChange={(e) => setIb((s) => ({ ...s, u: e.target.value }))} placeholder="https:// (varsa link, ops.)" />
              <div className="rowbtns">
                <button className="btn" onClick={inboxYakala}>Yakala</button>
                <button className="btn ghost sm" onClick={panodanEkle}>📋 Panodan</button>
              </div>
              <p className="note" style={{ marginTop: 6 }}>YouTube&apos;da <b>Linki Kopyala</b> → <b>Panodan</b> → <b>Yakala</b>. (iOS&apos;ta doğrudan &quot;Paylaş → Rite&quot; native uygulamada gelecek.)</p>
            </div>
            {inbox.length === 0 && <div className="note" style={{ textAlign: 'center', marginTop: 10 }}>Inbox boş.</div>}
            {inbox.map((v) => (
              <div key={v.id} className="card">
                {v.tur === 'aktivite' ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>🎁 {v.baslik || v.payload?.ad}</div>
                    <div className="note" style={{ margin: '2px 0' }}>Aktivite paylaşımı{v.from_code ? ' · ' + v.from_code : ''}</div>
                    {(v.payload?.faydalar || []).length > 0 && <div>{Array.from(new Set((v.payload.faydalar || []).map((k: string) => faydaMap[k]?.alan).filter(Boolean))).map((a: any) => <span key={a} className="tagp p-alan">{a}</span>)}</div>}
                    {v.payload?.aciklama && <div className="note" style={{ marginTop: 4 }}>{v.payload.aciklama}</div>}
                    <div className="rowbtns">
                      {v.durum === 'alindi'
                        ? <span className="note" style={{ margin: 0, color: 'var(--green)', fontWeight: 700 }}>✓ Havuzuna eklendi</span>
                        : <button className="btn ghost sm" onClick={() => inboxAktiviteEkle(v)}>Havuzuma ekle</button>}
                      <button className="btn ghost sm" style={{ color: 'var(--red)', borderColor: '#e6c4bd' }} onClick={() => inboxSil(v.id)}>Sil</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{v.url ? '🔗 ' : '📌 '}{v.baslik}</div>
                    {v.url && <a href={v.url} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>{v.url}</a>}
                    <div className="rowbtns">
                      <button className="btn ghost sm" onClick={() => inboxToRitual(v, 0)}>→ Bugüne</button>
                      <button className="btn ghost sm" onClick={() => inboxToRitual(v, 1)}>→ Yarına</button>
                      <button className="btn ghost sm" style={{ color: 'var(--red)', borderColor: '#e6c4bd' }} onClick={() => inboxSil(v.id)}>Sil</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ---------- MEZUNLAR ---------- */}
        {screen === 'mezunlar' && (
          <div>
            <button className="linkbtn" onClick={() => setScreen('ajanda')}>‹ Ajanda</button>
            <h2 style={{ marginTop: 6 }}>🎓 Mezunlar</h2>
            <p className="sub">Otomatikleşip emekli ettiğin ritüeller. İstediğinde yeniden başlat.</p>
            {mezunlar.length === 0 ? <div className="empty">Henüz mezun ritüel yok.</div> : mezunlar.map((rt) => (
              <div key={rt.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{rt.ad}</div><div className="m">Mezun · {ritTotal(rt.id)} kez</div></div>
                <button className="btn ghost sm" onClick={() => yenidenBasla(rt.id)}>Yeniden başlat</button>
              </div>
            ))}
          </div>
        )}

        {/* ---------- BİLGİ ---------- */}
        {screen === 'bilgi' && (
          <div>
            <h2>Ayarlar</h2>
            <div className="card"><h3>Gizlilik-önce</h3><p className="note">Anonim. Hesap yok, e-posta yok. Reklam/veri satışı yok — Rite bir hediye.</p></div>
            <div className="card"><h3>Anti-retention</h3><p className="note">Olgunlaşan ritüelleri emekli eder; seni bağımlı değil özerk kılar. Düşük uyumu suçlamaz, sinyal sayar.</p></div>
            <div className="card"><h3>Bildirimler</h3>
              <p className="note">Ana ekrana eklersen uygulama kapalıyken de hatırlatma alırsın.</p>
              <div className="rowbtns"><button className="btn ghost sm" onClick={enableNotifs}>{pushOn ? '🔔 Açık' : '🔔 Bildirimleri aç'}</button><button className="btn ghost sm" onClick={testPush}>Test gönder</button></div>
              {pushMsg && <div className="msg">{pushMsg}</div>}
            </div>
            <div className="card"><h3>Güvenlik</h3><p className="note">Bazı ritüeller hekim onayı ister (⚠). Rite teşhis/tedavi aracı değildir; doğru kapıyı gösterir.</p></div>
            <div className="card"><h3>Test</h3>
              <div className="note" style={{ marginTop: 0 }}>Ajandayı sıfırla: tüm ritüeller ve işaretler silinir (kişisel aktiviteler havuzda kalır).</div>
              <div className="rowbtns"><button className="btn ghost sm" style={{ color: 'var(--red)', borderColor: '#e6c4bd' }} onClick={resetAjanda}>Ajandayı sıfırla</button></div>
            </div>
            <div style={{ textAlign: 'center', marginTop: 6 }}><button className="btn ghost sm" onClick={cikis}>Bağlantıyı kes / çıkış</button></div>
          </div>
        )}
      </div>

      <div className="nav">
        {[['ajanda', '🗓', 'Ajanda'], ['havuz', '⊕', 'Havuz'], ['destek', '🩺', 'Destek'], ['gelisim', '📈', 'Gelişim'], ['bilgi', '⚙', 'Ayarlar']].map(([k, ic, l]) => (
          <button key={k} className={['ajanda', 'mezunlar'].includes(screen) && k === 'ajanda' ? 'on' : screen === k ? 'on' : ''} onClick={() => setScreen(k)}><span className="ic">{ic}</span>{l}</button>
        ))}
      </div>

      {actModal && (
        <div className="modal" onClick={() => setActModal(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setActModal(null)}>×</button>
            <h2>{actModal.ad}</h2>
            <div className="m">{actModal.grup}{actModal.kanit_duzeyi && <span className="evi">kanıt: {actModal.kanit_duzeyi}</span>}</div>
            {actModal.ozet && <p style={{ fontSize: 13, marginTop: 8, color: '#3a362e', lineHeight: 1.5 }}>{actModal.ozet}</p>}
            {actModal.aciklama && <div className="kv"><div className="k">Nedir / neden</div><div className="v">{actModal.aciklama}</div></div>}
            {actModal.nasil && <div className="kv"><div className="k">Nasıl yapılır</div><div className="v">{actModal.nasil}</div></div>}
            {(actModal.videolar || []).length > 0 && <div className="kv"><div className="k">Videolar</div>{actModal.videolar.map((v: any, i: number) => <a key={i} className="vidlink" href={v.url} target="_blank" rel="noreferrer">▶ {v.baslik}</a>)}</div>}
            {(actModal.alternatifler || []).length > 0 && <div className="kv"><div className="k">Alternatifler</div><div className="v">{actModal.alternatifler.join(' · ')}</div></div>}
            {actModal.dikkat && <div className="kv"><div className="k">Dikkat edilecekler</div><div className="dikkat">⚠ {actModal.dikkat}</div></div>}
            {actModal.kaynak && <div className="kv"><div className="k">Kaynak</div><div className="v">{actModal.kaynak}</div></div>}
            <div style={{ marginTop: 16 }}><button className="btn" onClick={() => { ritEkle(actModal.ad, addSlot || actModal.zaman || 'gün', actModal.kaynak_etiket || 'Rite', 'aliskanlik', actModal.grup || (actModal.faydalar?.length ? faydaMap[actModal.faydalar[0]]?.alan : null) || null, actModal.id || null, actModal.faydalar || [], (actModal.videolar && actModal.videolar[0]?.url) || null); setActModal(null); setAddSlot(null); setScreen('ajanda'); }}>Ritüellerime ekle{addSlot ? ' (' + (TODS.find((t) => t[0] === addSlot)?.[1]) + ')' : ''}</button></div>
          </div>
        </div>
      )}

      {ritModal && (
        <div className="modal" onClick={() => setRitModal(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setRitModal(null)}>×</button>
            <div className="daterow" style={{ marginTop: 2, marginBottom: 4 }}>
              <input value={adInput} onChange={(e) => setAdInput(e.target.value)} style={{ flex: 1, fontWeight: 700, fontSize: 16 }} />
              <button className="btn ghost sm" disabled={!adInput.trim() || adInput.trim() === (ritModal.ad || '')} onClick={() => setRitAd(ritModal.id, adInput)}>Kaydet</button>
            </div>
            <div className="m">{ritModal.kaynak || ''}</div>
            {ritAreas(ritModal).length > 0 && <div className="kv"><div className="k">Yaşam alanları</div><div>{ritAreas(ritModal).map((a) => <span key={a} className="tagp p-alan">{a}</span>)}</div></div>}
            {(ritModal.faydalar || []).length > 0 && <div className="kv"><div className="k">Faydalar</div><div className="v">{ritModal.faydalar.map((k: string) => faydaMap[k]?.ad || k).join(' · ')}</div></div>}

            <div className="kv"><div className="k">Bağlantı</div>
              <div className="daterow">
                <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://youtube.com/…" style={{ flex: 1 }} />
                <button className="btn ghost sm" onClick={() => setRitUrl(ritModal.id, urlInput)}>Kaydet</button>
                {ritModal.url && <a className="btn ghost sm" href={ritModal.url} target="_blank" rel="noreferrer">▶ Aç</a>}
              </div>
            </div>

            <div className="kv"><div className="k">Süre</div>
              <div>
                <span className={'chip' + (!ritModal.bitis ? ' on' : '')} onClick={() => setRitSure(ritModal.id, null)}>Süregelen</span>
                <span className={'chip' + (ritModal.bitis ? ' on' : '')} onClick={() => setRitSure(ritModal.id, parseInt(sureInput) || 21)}>Tarihli</span>
                {ritModal.bitis && <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
                  <input type="number" min={1} value={sureInput} onChange={(e) => setSureInput(e.target.value)} style={{ width: 60 }} /> gün
                  <button className="btn sm" onClick={() => setRitSure(ritModal.id, parseInt(sureInput) || 21)}>Uygula</button>
                </span>}
              </div>
              {ritModal.bitis && <div className="note">Başlangıç {kisaTarih(ritModal.baslangic)} · bitiş {kisaTarih(ritModal.bitis)}</div>}
            </div>

            <div className="kv"><div className="k">Günler</div>
              <div>
                <span className={'chip' + ((!ritModal.gunler || ritModal.gunler.length === 0) ? ' on' : '')} onClick={() => setRitGunler(ritModal.id, [])}>Her gün</span>
                {GUNLER.map(([n, l]) => {
                  const sel = !!(ritModal.gunler && ritModal.gunler.includes(n));
                  return <span key={n} className={'chip' + (sel ? ' on' : '')} onClick={() => { const cur: number[] = ritModal.gunler ? [...ritModal.gunler] : []; const nx = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]; setRitGunler(ritModal.id, nx); }}>{l}</span>;
                })}
              </div>
            </div>

            <div className="kv"><div className="k">Zaman dilimi</div>
              <div>{TODS.map(([z, l]) => <span key={z} className={'chip' + ((ritModal.zaman || 'gün') === z ? ' on' : '')} onClick={() => setRitZaman(ritModal.id, z)}>{l}</span>)}</div>
            </div>

            <div className="kv"><div className="k">Günlük hatırlatma</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="time" style={{ width: 'auto' }} value={remInput} onChange={(e) => setRemInput(e.target.value)} />
                <button className="btn sm" disabled={remInput === (ritModal.hatirlatma_saat || '')} onClick={() => setRitReminder(ritModal.id, remInput)}>Kaydet</button>
                {ritModal.hatirlatma_saat && <button className="btn sm ghost" onClick={() => { setRemInput(''); setRitReminder(ritModal.id, ''); }}>Kapat</button>}
              </div>
              <div className="note">Uygulama kapalıyken de bildirim gelir (push açıksa). Saat: Türkiye saati.</div>
            </div>

            {ritModal.activity_id && (
              <div style={{ marginTop: 14 }}><button className="btn ghost" onClick={() => openKB(ritModal)}>📖 Bilgi kartını aç (nasıl yapılır · kaynak · video)</button></div>
            )}

            <div className="rowbtns" style={{ marginTop: 14 }}>
              <button className="btn sm ghost" onClick={() => { const id = ritModal.id; setRitModal(null); ritSil(id); }}>Kaldır</button>
              {!ritModal.mezun && !ritModal.bitis && <button className="btn sm ghost" onClick={() => { const id = ritModal.id; setRitModal(null); emekli(id); }}>Emekli et</button>}
            </div>
          </div>
        </div>
      )}

      {kAct && (
        <div className="modal" onClick={() => setKAct(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setKAct(null)}>×</button>
            <h2>Kişisel aktivite</h2>
            <label>Ad</label>
            <input value={kAd} onChange={(e) => setKAd(e.target.value)} />
            <label className="fldlbl">Faydalar (sırayla = öncelik)</label>
            <div>{faydaList.map((f) => { const idx = kFaydalar.indexOf(f.kod); return (
              <span key={f.kod} className={'chip' + (idx >= 0 ? ' on' : '')} onClick={() => kToggleFayda(f.kod)}>{idx >= 0 ? (idx + 1) + '. ' : ''}{f.ad}</span>
            ); })}</div>
            {kFaydalar.length > 0 && <div className="note" style={{ marginTop: 6 }}>Kapsanan alanlar: <b>{Array.from(new Set(kFaydalar.map((k) => faydaMap[k]?.alan).filter(Boolean))).join(' · ')}</b></div>}
            <label className="fldlbl">Açıklama / nasıl (kendi notların)</label>
            <textarea value={kAcik} onChange={(e) => setKAcik(e.target.value)} />
            <label className="fldlbl">Videolar</label>
            {kVids.map((v: any, i: number) => (
              <div key={i} className="warnbox" style={{ background: '#f4efe6', borderColor: '#e7e0d2', color: '#5c554a', margin: '4px 0' }}><b>{v.baslik}</b> <span className="note" style={{ margin: 0 }}>{v.url}</span><button className="rmx" style={{ float: 'right' }} onClick={() => kVidSil(i)}>✕</button></div>
            ))}
            <div className="grid" style={{ marginTop: 4 }}>
              <div><label>Video başlık</label><input value={kVin.baslik} onChange={(e) => setKVin((s) => ({ ...s, baslik: e.target.value }))} /></div>
              <div><label>URL</label><input value={kVin.url} onChange={(e) => setKVin((s) => ({ ...s, url: e.target.value }))} placeholder="https://youtube.com/…" /></div>
            </div>
            <div style={{ marginTop: 6 }}><button className="btn ghost sm" onClick={kVidEkle}>+ Video ekle</button></div>
            <label className="fldlbl">Başka kullanıcıya gönder (paylaşım kodu)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={kShareTo} onChange={(e) => setKShareTo(e.target.value)} placeholder="RT-XXXXX" autoCapitalize="characters" />
              <button className="btn sm" style={{ whiteSpace: 'nowrap' }} onClick={kPaylas}>Gönder</button>
            </div>
            <div className="rowbtns" style={{ marginTop: 14 }}>
              <button className="btn" onClick={kSave}>Kaydet</button>
              <button className="btn ghost sm" onClick={kEkleAjanda}>Ajandama ekle</button>
              <button className="btn ghost sm" style={{ color: 'var(--red)', borderColor: '#e6c4bd' }} onClick={kSil}>Sil</button>
            </div>
            <div className="msg">{kMsg}</div>
          </div>
        </div>
      )}
    </div>
  );
}
