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

type Client = { id: string; ad: string; code: string };
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
const TODS: [string, string][] = [['sabah', 'Sabah'], ['gün', 'Gün'], ['akşam', 'Akşam']];
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
  const [msg, setMsg] = useState('');
  const [pushOn, setPushOn] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const [linkMode, setLinkMode] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkIds, setLinkIds] = useState<string[]>([]);
  const [ritModal, setRitModal] = useState<any>(null);
  const [remInput, setRemInput] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));
  const [faydaList, setFaydaList] = useState<any[]>([]);
  const [stAd, setStAd] = useState('');
  const [stFaydalar, setStFaydalar] = useState<string[]>([]);
  const [stZaman, setStZaman] = useState('gün');
  const [stSaat, setStSaat] = useState('');
  const [stMsg, setStMsg] = useState('');

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
      if (s) { const c = JSON.parse(s); setClient(c); loadData(c.id); loadLocal(c.id); }
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadLocal(cid: string) {
    try {
      setInbox(JSON.parse(localStorage.getItem('rite_inbox_' + cid) || '[]'));
    } catch (_) {}
  }

  useEffect(() => { loadActivities(); loadFaydalar(); }, []);
  async function loadFaydalar() {
    const r = await supabase.from('dog_faydalar').select('kod,ad,alan,kanit_duzeyi,sira').eq('aktif', true).order('sira');
    setFaydaList(r.data || []);
  }
  async function loadActivities() {
    const r = await supabase.from('dog_activities').select('*').eq('aktif', true).order('grup').order('sira');
    const data = r.data || [];
    setActivities(data);
    const gs = data.map((a: any) => a.grup).filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i);
    if (gs.length) setActGroup((g) => g || gs[0]);
  }

  async function loadData(clientId: string) {
    const r = await supabase.from('dog_rituals').select('id,ad,zaman,kategori,tip,kaynak,mezun,aktif,alan,rutin,sira,baslangic,bitis,activity_id,hatirlatma_saat,blok_sira,faydalar').eq('client_id', clientId).order('zaman');
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
    const r = await supabase.from('dog_clients').select('id,ad,code').eq('code', c).limit(1);
    if (r.error) return setMsg('Hata: ' + r.error.message);
    if (!r.data || !r.data.length) return setMsg('Kod bulunamadı (ör. RITE-AB12C).');
    const cli = r.data[0] as Client;
    setClient(cli); localStorage.setItem(LS, JSON.stringify(cli)); setMsg('');
    loadData(cli.id); loadLocal(cli.id);
  }
  function cikis() { localStorage.removeItem(LS); setClient(null); setCode(''); }

  const ritDone = (id: string) => logs.some((l) => l.ritual_id === id && l.tarih === day && l.yapildi);
  const ritTotal = (id: string) => logs.filter((l) => l.ritual_id === id && l.yapildi).length;

  async function toggleRit(ritId: string) {
    if (!client) return;
    const ex = logs.filter((l) => l.ritual_id === ritId && l.tarih === day)[0];
    if (ex) await supabase.from('dog_ritual_logs').update({ yapildi: !ex.yapildi }).eq('id', ex.id);
    else await supabase.from('dog_ritual_logs').insert({ client_id: client.id, ritual_id: ritId, tarih: day, yapildi: true });
    loadData(client.id);
  }
  async function ritEkle(ad: string, zaman = 'gün', kaynak = 'Kendi', tip = 'aliskanlik', alan: string | null = null, activityId: string | null = null) {
    if (!client || !ad.trim()) return;
    await supabase.from('dog_rituals').insert({ client_id: client.id, ad: ad.trim(), zaman, kaynak, tip, alan, activity_id: activityId, aktif: true, mezun: false, baslangic: today, blok_sira: Date.now() });
    setYeniRit('');
    loadData(client.id);
  }
  function toggleFayda(kod: string) { setStFaydalar((a) => (a.includes(kod) ? a.filter((x) => x !== kod) : [...a, kod])); }
  async function studioKaydet() {
    if (!client) return;
    if (!stAd.trim()) return setStMsg('Aktivite adı gir');
    const alan0 = stFaydalar.length ? (faydaList.find((f) => f.kod === stFaydalar[0])?.alan || null) : null;
    const r = await supabase.from('dog_rituals').insert({
      client_id: client.id, ad: stAd.trim(), zaman: stZaman, kaynak: 'Kendi', tip: 'aliskanlik',
      alan: alan0, faydalar: stFaydalar, activity_id: null, hatirlatma_saat: stSaat || null,
      aktif: true, mezun: false, baslangic: today, blok_sira: Date.now(),
    });
    if (r.error) return setStMsg('Hata: ' + r.error.message);
    setStAd(''); setStFaydalar([]); setStZaman('gün'); setStSaat(''); setStMsg('');
    loadData(client.id);
    setScreen('ajanda');
  }
  function openRit(rt: any) { setRitModal(rt); setRemInput(rt.hatirlatma_saat || ''); }
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
  function inboxEkle() {
    if (!client || !ib.t.trim()) return;
    const next = [{ id: Date.now(), title: ib.t.trim(), url: ib.u.trim(), slot: '' }, ...inbox];
    setInbox(next); localStorage.setItem('rite_inbox_' + client.id, JSON.stringify(next)); setIb({ t: '', u: '' });
  }
  function inboxSlot(id: number, slot: string) {
    if (!client) return;
    const next = inbox.map((x) => (x.id === id ? { ...x, slot } : x));
    setInbox(next); localStorage.setItem('rite_inbox_' + client.id, JSON.stringify(next));
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

  const activeOn = (r: any, d: string) => (!r.baslangic || r.baslangic <= d) && (!r.bitis || d <= r.bitis);
  const habits = rituals.filter((r) => r.tip !== 'hatirlatma' && activeOn(r, day));
  const reminders = rituals.filter((r) => r.tip === 'hatirlatma' && activeOn(r, day));
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
  const gelHabits = rituals.filter((r) => r.tip !== 'hatirlatma');
  const weekHabits = rituals.filter((r) => r.tip !== 'hatirlatma' && weekArr.some((d) => activeOn(r, d)));
  const beslenmePlan = plans.find((p) => p.vertical === 'beslenme');
  const ibBadge = inbox.filter((x) => !x.slot).length;
  const actGroups = activities.map((a) => a.grup).filter((v, i, arr) => arr.indexOf(v) === i);

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
              <span className={'typechip ' + (rt.tip === 'hatirlatma' ? 't-rem' : 't-hab')}>{rt.tip === 'hatirlatma' ? 'hatırlatma' : 'alışkanlık'}</span>
              {providerTag(rt.kaynak)}
              {ritAreas(rt).map((a) => <span key={a} className="tagp p-alan">{a}</span>)}
            </div>
            <div className="m">{rt.zaman || 'gün'}{rt.hatirlatma_saat ? ' · 🔔 ' + rt.hatirlatma_saat : ''} · toplam {total}</div>
          </div>
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
        <button className={'bell' + (pushOn ? ' on' : '')} onClick={enableNotifs}>{pushOn ? '🔔' : '🔔'}</button>
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
                  if (!slotRits.length) return null;
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
                    <div key={z}>
                      <div className="tod">{lbl}</div>
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
                    </div>
                  );
                })}
                {habits.length === 0 && <div className="card"><div className="note">Henüz ritüel yok. <button className="linkbtn" onClick={() => setScreen('havuz')}>Havuz&apos;dan ekle →</button></div></div>}

                {reminders.length > 0 && <>
                  <div className="tod">Randevu & hatırlatma</div>
                  <div className="card" style={{ padding: '4px 14px' }}>{reminders.map((rt) => <RitItem key={rt.id} rt={rt} />)}</div>
                </>}

                <div className="tod">Bugüne not</div>
                <div className="card">
                  <input value={dayNote} onChange={(e) => saveNote(e.target.value)} placeholder="Serbest not — izlenmez, sadece bugün burada durur." />
                </div>

                <div className="rowbtns">
                  <button className="btn ghost sm" onClick={() => setScreen('havuz')}>+ Ritüel ekle</button>
                  <button className="btn ghost sm" onClick={startLink}>＋ Rutin oluştur</button>
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
            <div className="tabs">
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
                <div style={{ marginTop: 10 }}><button className="btn" onClick={studioKaydet}>Ajandama ekle</button></div>
                <div className="msg">{stMsg}</div>
                <p className="note" style={{ marginTop: 8 }}>Gerçek hayattaki aktiviteni tanımla, kapsadığı faydaları seç — Rite bunları yaşam alanlarına dönüştürür.</p>
              </div>
            ) : (
              <div className="card">
                {activities.filter((a) => a.grup === actGroup).map((a) => (
                  <div key={a.id} className="actcard" onClick={() => setActModal(a)}>
                    <div style={{ flex: 1 }}><div className="n">{a.ad}</div><div className="o">{a.ozet || ''}</div></div>
                    <span className="go">›</span>
                  </div>
                ))}
                {activities.filter((a) => a.grup === actGroup).length === 0 && <div className="note">Bu grupta aktivite yok. (schema-09 çalıştırıldı mı?)</div>}
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
            <p className="sub">Başka uygulamalardan gönderdiğin video/linkler buraya düşer. Önizle, sonra bir güne yerleştir — &quot;watch later mezarlığı&quot; bitsin.</p>
            <div className="card">
              <label>Link/başlık ekle</label>
              <input value={ib.t} onChange={(e) => setIb((s) => ({ ...s, t: e.target.value }))} placeholder="Başlık (ör. Sabah mobilite akışı)" />
              <input style={{ marginTop: 8 }} value={ib.u} onChange={(e) => setIb((s) => ({ ...s, u: e.target.value }))} placeholder="https:// (opsiyonel)" />
              <div style={{ marginTop: 10 }}><button className="btn ghost" onClick={inboxEkle}>Ekle</button></div>
            </div>
            {inbox.map((v) => (
              <div key={v.id} className="card">
                <div style={{ fontSize: 13, fontWeight: 700 }}>{v.title}</div>
                {v.url && <a href={v.url} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>{v.url}</a>}
                <div className="rowbtns">
                  {['Bugün', 'Yarın', 'Hafta sonu'].map((s) => <button key={s} className={'btn ghost sm'} onClick={() => inboxSlot(v.id, s)}>{v.slot === s ? '✓ ' + s : s}</button>)}
                </div>
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
            <h2>Rite hakkında</h2>
            <div className="card"><h3>Gizlilik-önce</h3><p className="note">Anonim. Hesap yok, e-posta yok. Reklam/veri satışı yok — Rite bir hediye.</p></div>
            <div className="card"><h3>Anti-retention</h3><p className="note">Olgunlaşan ritüelleri emekli eder; seni bağımlı değil özerk kılar. Düşük uyumu suçlamaz, sinyal sayar.</p></div>
            <div className="card"><h3>Bildirimler</h3>
              <p className="note">Ana ekrana eklersen uygulama kapalıyken de hatırlatma alırsın.</p>
              <div className="rowbtns"><button className="btn ghost sm" onClick={enableNotifs}>{pushOn ? '🔔 Açık' : '🔔 Bildirimleri aç'}</button><button className="btn ghost sm" onClick={testPush}>Test gönder</button></div>
              {pushMsg && <div className="msg">{pushMsg}</div>}
            </div>
            <div className="card"><h3>Güvenlik</h3><p className="note">Bazı ritüeller hekim onayı ister (⚠). Rite teşhis/tedavi aracı değildir; doğru kapıyı gösterir.</p></div>
            <div style={{ textAlign: 'center', marginTop: 6 }}><button className="btn ghost sm" onClick={cikis}>Bağlantıyı kes / çıkış</button></div>
          </div>
        )}
      </div>

      <div className="nav">
        {[['ajanda', '🗓', 'Ajanda'], ['havuz', '⊕', 'Havuz'], ['destek', '🩺', 'Destek'], ['gelisim', '📈', 'Gelişim'], ['bilgi', 'ⓘ', 'Bilgi']].map(([k, ic, l]) => (
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
            <div style={{ marginTop: 16 }}><button className="btn" onClick={() => { ritEkle(actModal.ad, actModal.zaman || 'gün', actModal.kaynak_etiket || 'Rite', 'aliskanlik', actModal.grup || null, actModal.id || null); setActModal(null); setScreen('ajanda'); }}>Ritüellerime ekle</button></div>
          </div>
        </div>
      )}

      {ritModal && (
        <div className="modal" onClick={() => setRitModal(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setRitModal(null)}>×</button>
            <h2>{ritModal.ad}</h2>
            <div className="m">{ritModal.kaynak || ''}</div>
            {ritAreas(ritModal).length > 0 && <div className="kv"><div className="k">Yaşam alanları</div><div>{ritAreas(ritModal).map((a) => <span key={a} className="tagp p-alan">{a}</span>)}</div></div>}
            {(ritModal.faydalar || []).length > 0 && <div className="kv"><div className="k">Faydalar</div><div className="v">{ritModal.faydalar.map((k: string) => faydaMap[k]?.ad || k).join(' · ')}</div></div>}

            <div className="kv"><div className="k">Tür</div>
              <div>{[['aliskanlik', 'Alışkanlık'], ['hatirlatma', 'Hatırlatma']].map(([t, l]) => (
                <span key={t} className={'chip' + ((ritModal.tip || 'aliskanlik') === t ? ' on' : '')} onClick={() => setRitTip(ritModal.id, t)}>{l}</span>
              ))}</div>
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
    </div>
  );
}
