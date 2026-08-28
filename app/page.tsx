'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Ayrı bir tutamaç yok — kartın kendisi basılı tutulunca taşınır (bkz sensors: activationConstraint.delay).
// Böylece kısa dokunuş normal tıklama olarak geçer, ~180ms basılı tutmak sürüklemeyi başlatır.
// disabled=true olan satırlar (zaman dilimi ayraçları) hiç taşınamaz ama listede yer tutmaya devam eder.
function SortableRow({ id, disabled, children }: { id: string; disabled?: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: any = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 };
  if (disabled) return <div ref={setNodeRef} style={style}>{children}</div>;
  return <div ref={setNodeRef} style={{ ...style, touchAction: 'none' }} {...attributes} {...listeners}>{children}</div>;
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
const ZAMANSIZ = 'esnek'; // zaman dilimine bağlı olmayan, isimsiz dördüncü bölüm
const SLOTS: [string, string][] = [...TODS, [ZAMANSIZ, 'Serbest']]; // seçim gerektiren yerlerde (chip/başlık) etiketli
// Haftagünü: getDay değeri (0=Paz..6=Cmt), Pazartesi-önce görüntü sırası
const GUNLER: [number, string][] = [[1, 'Pzt'], [2, 'Sal'], [3, 'Çar'], [4, 'Per'], [5, 'Cum'], [6, 'Cmt'], [0, 'Paz']];
// Akıllı kart tipleri: kod · etiket · ikon
const KARTLAR: [string, string, string][] = [['standart', 'Standart', '•'], ['bilgi', 'Bilgi', '📄'], ['video', 'Video', '🎬'], ['anket', 'Anket', '📋'], ['coktan', 'Çoktan seçmeli', '❓'], ['diyet', 'Diyet', '🍽'], ['tarif', 'Tarif', '🍳'], ['olcum', 'Ölçüm', '📏'], ['nefes', 'Nefes', '🫁'], ['ruhhali', 'Ruh hali', '🙂'], ['workout', 'Egzersiz', '🏋️'], ['sukran', 'Şükran', '🙏'], ['topraklama', '5-4-3-2-1', '🖐'], ['pomodoro', 'Odak', '🍅'], ['beden', 'Beden taraması', '🧘'], ['uykuoncesi', 'Uyku hazırlığı', '🌙'], ['su', 'Su sayacı', '💧'], ['maruz', 'Maruz bırakma', '🎯'], ['niyet', 'Niyet', '🧭'], ['randevu', 'Randevu', '📅']];
// Ölçüm anahtarları için okunur etiketler (Gelişim grafiği + kart). Bilinmeyen anahtar ham gösterilir.
const OLCU_ETIKET: Record<string, string> = { kilo: 'Kilo', boy: 'Boy', bel: 'Bel', kalca: 'Kalça', gogus: 'Göğüs', kol: 'Kol', bacak: 'Bacak', vucut_yagi: 'Vücut yağı', kas: 'Kas kütlesi', bel_kalca: 'Bel/Kalça', vki: 'VKİ', ruh_hali: 'Ruh hali', odak_dk: 'Odak (dk)', su: 'Su (bardak)' };
// Ölçüm anahtarı → varsayılan alan (statik tahmin; Meridyen'deki OLCU_INFO ile aynı). Kart_config.dikey varsa (bkz anahtarDikey) ONA öncelik verilir.
const OLCU_ALAN: Record<string, string> = { kilo: 'Beslenme', bel: 'Beslenme', kalca: 'Beslenme', vucut_yagi: 'Beslenme', bel_kalca: 'Beslenme', vki: 'Beslenme', su: 'Beslenme', gogus: 'Fitness', kol: 'Fitness', bacak: 'Fitness', kas: 'Fitness', ruh_hali: 'Mental', odak_dk: 'Mental', boy: 'Genel' };
const ALAN_SIRA = ['Beslenme', 'Fitness', 'Fizyo', 'Psikoloji', 'Mental', 'Genel', 'Diğer'];
// Rite Studio'da kart_config.dikey olarak seçilen alan etiketi → okunur ad (bkz app-meridyen/app/atama/page.tsx DIKEY_OPTS).
const DIKEY_LABEL: Record<string, string> = { beslenme: 'Beslenme', fitness: 'Fitness', fizyo: 'Fizyo', psikoloji: 'Psikoloji', mental: 'Mental', genel: 'Genel' };
const RANDEVU_FORMAT: [string, string][] = [['online', '💻 Online'], ['yuz_yuze', '📍 Yüz yüze']];
// 5-4-3-2-1 topraklama: sabit duyusal kategori listesi.
const TOPRAK_ADIM: [string, string][] = [['5', '5 şey GÖR'], ['4', '4 şey DOKUN'], ['3', '3 şey DUY'], ['2', '2 şey KOKLA'], ['1', '1 şey TAT']];
// Basit metin biçimlendirme: **kalın**
function inlineMetin(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
}
// "> " ile başlayan satırlar renkli kutucuk (callout) olur; baştaki emojiye göre renk seçilir (uyarı/bilgi/olumlu, yoksa nötr).
const CALL_WARN = ['⚠️', '⚠', '🚨', '❗️', '❗', '❌'];
const CALL_INFO = ['💡', 'ℹ️', 'ℹ', '📌', '📝'];
const CALL_OK = ['✅', '👍', '🎉', '💪'];
function calloutClass(text: string): string {
  if (CALL_WARN.some((e) => text.startsWith(e))) return 'call-warn';
  if (CALL_INFO.some((e) => text.startsWith(e))) return 'call-info';
  if (CALL_OK.some((e) => text.startsWith(e))) return 'call-ok';
  return 'call-note';
}
// # başlık, ## / ### alt başlık, - madde, > uyarı/bilgi kutusu, boş satır = paragraf ayırıcı
function renderFlow(lines: string[]): ReactNode[] {
  const out: ReactNode[] = []; let bullets: string[] = [];
  const flush = () => { if (bullets.length) { out.push(<ul key={'u' + out.length} className="bilul">{bullets.map((b, i) => <li key={i}>{inlineMetin(b)}</li>)}</ul>); bullets = []; } };
  lines.forEach((ln, idx) => {
    const s = ln.trim();
    if (!s) { flush(); return; }
    if (s.startsWith('### ')) { flush(); out.push(<div key={idx} className="bilh3">{inlineMetin(s.slice(4))}</div>); }
    else if (s.startsWith('## ')) { flush(); out.push(<div key={idx} className="bilh2">{inlineMetin(s.slice(3))}</div>); }
    else if (s.startsWith('# ')) { flush(); out.push(<div key={idx} className="bilh1">{inlineMetin(s.slice(2))}</div>); }
    else if (s.startsWith('> ')) { flush(); const txt = s.slice(2); out.push(<div key={idx} className={'call ' + calloutClass(txt)}>{inlineMetin(txt)}</div>); }
    else if (s.startsWith('- ')) { bullets.push(s.slice(2)); }
    else { flush(); out.push(<p key={idx} className="bilp">{inlineMetin(s)}</p>); }
  });
  flush(); return out;
}
// "?? Başlık" satırı = açılır (katlanır) senaryo bölümü. Öncesi normal akış.
function renderMetin(t: string): ReactNode[] {
  const lines = (t || '').split('\n');
  const blocks: { coll: boolean; title: string; lines: string[] }[] = [];
  let cur = { coll: false, title: '', lines: [] as string[] };
  for (const ln of lines) {
    if (ln.trim().startsWith('?? ')) { blocks.push(cur); cur = { coll: true, title: ln.trim().slice(3), lines: [] }; }
    else cur.lines.push(ln);
  }
  blocks.push(cur);
  return blocks.filter((b) => b.coll || b.lines.some((l) => l.trim())).map((b, i) => (
    b.coll ? <Acc key={i} title={b.title}>{renderFlow(b.lines)}</Acc> : <div key={i}>{renderFlow(b.lines)}</div>
  ));
}
const MOOD = ['😞', '😕', '😐', '🙂', '😄'];
// Nefes desenleri: faz = [etiket, saniye, çember-ölçek]
const NEFES_DESEN: Record<string, { ad: string; fazlar: [string, number, number][] }> = {
  kutu: { ad: 'Kutu 4·4·4·4', fazlar: [['Nefes al', 4, 1], ['Tut', 4, 1], ['Ver', 4, 0.5], ['Tut', 4, 0.5]] },
  '478': { ad: '4·7·8', fazlar: [['Nefes al', 4, 1], ['Tut', 7, 1], ['Ver', 8, 0.5]] },
  koheran: { ad: '5·5 dengeli', fazlar: [['Nefes al', 5, 1], ['Ver', 5, 0.5]] },
};
const kartIkon = (tip?: string | null) => (KARTLAR.find((k) => k[0] === tip)?.[2] || '');
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
// Adım pencerelerini çöz: ardisik=true ise önceki adımın bitişinden başlar.
function programSpans(adimlar: any[], sure?: number | null) {
  let cursor = 0; let prev = { o: 0, d: 0, end: 0 };
  return (adimlar || []).map((st: any, i: number) => {
    let o: number; let d: number;
    if (st.zincirli && i > 0) { o = prev.o; d = prev.d; } // gün-içi zincir → liderin penceresini devral
    else { d = st.sureGun && st.sureGun > 0 ? st.sureGun : (sure || 0); o = (st.ardisik && i > 0) ? cursor : (st.baslaGun || 0); cursor = o + (d || 0); }
    const end = o + (d || 0);
    prev = { o, d, end };
    return { o, d, end };
  });
}
// Program zaman çizelgesi (mini-Gantt): her adım ofset+süreye göre çubuk.
function ProgramTimeline({ adimlar, sure }: { adimlar: any[]; sure?: number | null }) {
  if (!adimlar || adimlar.length === 0) return null;
  const spans = programSpans(adimlar, sure);
  const total = Math.max(1, sure || 0, ...spans.map((s) => s.end), ...spans.map((s) => s.o + 1));
  return (
    <div className="tl">
      {adimlar.map((st, i) => {
        const s = spans[i];
        const left = (s.o / total) * 100;
        const w = s.d ? Math.max(4, (s.d / total) * 100) : (100 - left);
        return (
          <div key={i} className="tlrow">
            <div className="tllbl">{i + 1}. {st.ad}</div>
            <div className="tltrack"><div className={'tlbar' + (s.d ? '' : ' open')} style={{ left: left + '%', width: w + '%' }} title={'gün ' + s.o + (s.d ? '–' + s.end : '+')}></div></div>
          </div>
        );
      })}
      <div className="tlaxis"><span>gün 0</span><span>{total}. gün</span></div>
    </div>
  );
}
// Açılır-kapanır bölüm: kapalıyken özet, açıkken içerik.
function Acc({ title, summary, defaultOpen, children }: { title: string; summary?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="acc">
      <div className="acchd" onClick={() => setOpen((o) => !o)}>
        <div className="acct"><b>{title}</b>{!open && summary ? <span className="accsum"> {summary}</span> : null}</div>
        <span className="accchev">{open ? '▾' : '▸'}</span>
      </div>
      {open && <div className="accbody">{children}</div>}
    </div>
  );
}
// Video linkini tanı: YouTube / Instagram (public) → gömülü oynatıcı; değilse dış link.
function embedInfo(url?: string | null, bas?: number | null, bit?: number | null): { tur: 'yt' | 'ig'; src: string } | null {
  if (!url) return null;
  let m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/))([\w-]{6,})/);
  if (m) {
    const q: string[] = [];
    if (bas && bas > 0) q.push('start=' + Math.floor(bas));
    if (bit && bit > 0) q.push('end=' + Math.floor(bit));
    return { tur: 'yt', src: 'https://www.youtube.com/embed/' + m[1] + (q.length ? '?' + q.join('&') : '') };
  }
  m = url.match(/instagram\.com\/(reel|reels|p|tv)\/([\w-]+)/);
  if (m) { const t = m[1] === 'reels' ? 'reel' : m[1]; return { tur: 'ig', src: 'https://www.instagram.com/' + t + '/' + m[2] + '/embed' }; }
  return null;
}
function EmbedVideo({ url, bas, bit }: { url?: string | null; bas?: number | null; bit?: number | null }) {
  const info = embedInfo(url, bas, bit);
  if (!info) return url ? <a className="btn ghost sm" href={url} target="_blank" rel="noreferrer">▶ Aç</a> : null;
  if (info.tur === 'yt') return <div className="ytwrap"><iframe src={info.src} title="video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>;
  return <iframe className="igframe" src={info.src} title="video" scrolling="no" allowFullScreen />;
}
// Bilgi/makale kartı: video(lar) üstte, altında biçimli metin + kaynaklar; tek bir stilli kutu içinde. "Yaptım" işaretlemesi kart satırından/başlıktaki checkbox'tan yapılır.
// Birden fazla video = alternatifler (ör. seviye/versiyon) — sekme ile tek tek gösterilir, dikey yer sabit kalır.
function BilgiKart({ cfg }: { cfg: any }) {
  const kaynaklar: string[] = cfg?.kaynaklar || [];
  const videolar: { baslik?: string; url: string; bas?: number; bit?: number }[] = cfg?.videolar && cfg.videolar.length ? cfg.videolar : (cfg?.video ? [{ url: cfg.video }] : []);
  const [vidSec, setVidSec] = useState(0);
  const secili = videolar[Math.min(vidSec, videolar.length - 1)];
  return (
    <div className="howto">
      <div className="bilgi">
        {videolar.length > 1 && (
          <div style={{ margin: '0 0 6px' }}>
            {videolar.map((v, i) => <span key={i} className={'chip' + (i === vidSec ? ' on' : '')} onClick={() => setVidSec(i)}>{v.baslik || ('Video ' + (i + 1))}</span>)}
          </div>
        )}
        {secili && (
          <div style={{ margin: '0 0 8px' }}>
            {videolar.length === 1 && secili.baslik && <div className="fldlbl" style={{ marginTop: 0 }}>{secili.baslik}</div>}
            <EmbedVideo url={secili.url} bas={secili.bas} bit={secili.bit} />
          </div>
        )}
        {cfg?.icerik ? renderMetin(cfg.icerik) : <div className="note" style={{ marginTop: 0 }}>İçerik yok (taslak).</div>}
        {kaynaklar.length > 0 && <div className="kv" style={{ marginTop: 4 }}><div className="k">Kaynaklar</div><div className="v">{kaynaklar.map((k, i) => <div key={i} className="note" style={{ margin: '2px 0' }}>{k}</div>)}</div></div>}
      </div>
    </div>
  );
}
// Anket kartı (taslak): soruları form olarak gösterir; Gönder → ritüeli "yapıldı" işaretler.
function AnketKart({ cfg, done, onGonder }: { cfg: any; done: boolean; onGonder: () => void }) {
  const [ans, setAns] = useState<string[]>([]);
  const sorular: string[] = cfg?.sorular || [];
  return (
    <div className="kv"><div className="k">📋 Anket</div>
      <div style={{ width: '100%' }}>
        {sorular.length === 0 ? <div className="note" style={{ marginTop: 0 }}>Soru yok (taslak).</div> : sorular.map((q, i) => (
          <div key={i} style={{ marginBottom: 6 }}><label className="fldlbl" style={{ marginTop: 0 }}>{i + 1}. {q}</label><input value={ans[i] || ''} onChange={(e) => setAns((a) => { const b = [...a]; b[i] = e.target.value; return b; })} /></div>
        ))}
        {done ? <div className="note" style={{ marginTop: 4, color: 'var(--green)', fontWeight: 700 }}>✓ Gönderildi</div> : <button className="btn" onClick={onGonder}>Gönder</button>}
      </div>
    </div>
  );
}
// Çoktan seçmeli soru kartı: doğru cevaplı; seçim + Gönder → doğru/yanlış gösterir, yanıt tabloya yazılmaz (ephemeral).
function ChoktanKart({ cfg, done, onGonder }: { cfg: any; done: boolean; onGonder: () => void }) {
  const [sec, setSec] = useState<number | null>(null);
  const [gonderildi, setGonderildi] = useState(false);
  const secenekler: string[] = cfg?.secenekler || [];
  const dogru: number = typeof cfg?.dogru === 'number' ? cfg.dogru : -1;
  const showResult = gonderildi || done;
  function gonder() {
    if (sec == null) return;
    setGonderildi(true);
    if (!done) onGonder();
  }
  return (
    <div className="kv"><div className="k">❓ Soru</div>
      <div style={{ width: '100%' }}>
        {cfg?.soru && <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--ink)' }}>{cfg.soru}</div>}
        {secenekler.length === 0 ? <div className="note" style={{ marginTop: 0 }}>Seçenek yok (taslak).</div> : secenekler.map((s, i) => {
          const isSel = sec === i;
          const isCorrect = i === dogru;
          const cls = 'mcopt' + (isSel ? ' sel' : '') + (showResult && isCorrect ? ' correct' : '') + (showResult && isSel && !isCorrect ? ' wrong' : '');
          return <div key={i} className={cls} onClick={() => !showResult && setSec(i)}>{s}{showResult && isCorrect ? ' ✓' : ''}{showResult && isSel && !isCorrect ? ' ✕' : ''}</div>;
        })}
        {secenekler.length > 0 && (showResult ? (
          <div className="note" style={{ marginTop: 6, fontWeight: 700, color: sec === dogru ? 'var(--green)' : undefined }}>{dogru >= 0 ? (sec === dogru ? '✓ Doğru!' : 'Doğru cevap: ' + (secenekler[dogru] ?? '—')) : 'Gönderildi'}</div>
        ) : (
          <button className="btn" disabled={sec == null} onClick={gonder}>Gönder</button>
        ))}
      </div>
    </div>
  );
}
// Diyet kartı (akıllı tabak): tüm öğünler; miktar + alternatifler + kalori/makro/hazırlanış/resim.
// Öğünü "yedim" işaretleme + opsiyonel kısa not (farklı miktar). İşaretler/notlar yalnız danışanda kalır (kaydedilmez).
function DiyetKart({ cfg }: { cfg: any }) {
  const ogunler: any[] = cfg?.ogunler || [];
  const [yenildi, setYenildi] = useState<boolean[]>([]);
  const [notAcik, setNotAcik] = useState<number | null>(null);
  const [notlar, setNotlar] = useState<Record<number, string>>({});
  const toggle = (i: number) => setYenildi((a) => { const b = [...a]; b[i] = !b[i]; return b; });
  const yenenSay = yenildi.filter(Boolean).length;
  return (
    <div style={{ margin: '4px 0 8px' }}>
      <div className="k" style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span>🍽 Günün öğünleri</span>{ogunler.length > 0 && <span className="note" style={{ margin: 0 }}>{yenenSay}/{ogunler.length}</span>}</div>
      {ogunler.length === 0 ? <div className="note" style={{ marginTop: 0 }}>Öğün yok (taslak).</div> : ogunler.map((og: any, i: number) => {
        const on = !!yenildi[i];
        const alts: string[] = og.alternatifler || [];
        return (
          <div key={i} className={'ogun' + (on ? ' done' : '')}>
            <button className={'ogcheck' + (on ? ' on' : '')} onClick={() => toggle(i)} title="yedim">{on ? '✓' : ''}</button>
            {og.resim && <img src={og.resim} alt="" className="ogunimg" />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ogunad">{og.ad}{og.miktar ? <span className="note" style={{ margin: 0, fontWeight: 400 }}> · {og.miktar}</span> : ''}</div>
              {(og.kalori || og.makro) && <div className="note" style={{ margin: '2px 0 0' }}>{og.kalori ? og.kalori + ' kcal' : ''}{og.kalori && og.makro ? ' · ' : ''}{og.makro || ''}</div>}
              {alts.length > 0 && <div className="note" style={{ margin: '2px 0 0' }}>Alternatif: {alts.join(' · ')}</div>}
              {og.hazirlanis && <div className="note" style={{ margin: '2px 0 0' }}>Hazırlanış: {og.hazirlanis}</div>}
              <div style={{ marginTop: 4 }}><button className="minlink" onClick={() => setNotAcik(notAcik === i ? null : i)}>{notlar[i] ? '✎ ' + notlar[i] : '+ farklı miktar / not'}</button></div>
              {notAcik === i && <input autoFocus value={notlar[i] || ''} onChange={(e) => setNotlar((m) => ({ ...m, [i]: e.target.value }))} onBlur={() => setNotAcik(null)} placeholder="ör. yarısını yedim, ekmeksiz…" style={{ width: '100%', marginTop: 4 }} />}
            </div>
          </div>
        );
      })}
      {cfg?.makro && <div className="note" style={{ marginTop: 6 }}>Günlük hedef: {cfg.makro}</div>}
      {ogunler.length > 0 && <div className="note" style={{ marginTop: 4, fontSize: 11, opacity: .8 }}>İşaretler ve notlar yalnız sende kalır.</div>}
    </div>
  );
}
// Yemek tarifi kartı (bilgi kartına benzer düzen): malzemeler + yapılış + süre/porsiyon/kalori/görsel; "Denedim" → yapıldı.
function TarifKart({ cfg, done, onDenedim }: { cfg: any; done: boolean; onDenedim: () => void }) {
  const malzemeler: string[] = cfg?.malzemeler || [];
  const meta = [cfg?.sure ? '⏱ ' + cfg.sure : '', cfg?.porsiyon ? '🍽 ' + cfg.porsiyon : '', cfg?.kalori ? cfg.kalori + ' kcal' : ''].filter(Boolean).join(' · ');
  const bos = malzemeler.length === 0 && !cfg?.yapilis;
  return (
    <div className="bilgi">
      {cfg?.resim && <img src={cfg.resim} alt="" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, margin: '0 0 8px', display: 'block' }} />}
      {meta && <div className="note" style={{ marginTop: 0 }}>{meta}</div>}
      {malzemeler.length > 0 && <div style={{ marginTop: 6 }}><div className="bilh2">Malzemeler</div><ul className="bilul">{malzemeler.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
      {cfg?.yapilis && <div style={{ marginTop: 6 }}><div className="bilh2">Yapılış</div>{renderMetin(cfg.yapilis)}</div>}
      {bos && <div className="note" style={{ marginTop: 0 }}>İçerik yok (taslak).</div>}
      <div style={{ marginTop: 10 }}>{done ? <div className="note" style={{ color: 'var(--green)', fontWeight: 700 }}>✓ Denendi</div> : <button className="btn" onClick={onDenedim}>Denedim ✓</button>}</div>
    </div>
  );
}
// Ölçüm kartı: config.alanlar = [{anahtar,label,birim}]. Değerleri dog_measurements'a yazar (parent onKaydet) → Gelişim grafiğinde çıkar.
function OlcumKart({ cfg, sonDegerler, onKaydet }: { cfg: any; sonDegerler: Record<string, number>; onKaydet: (vals: { anahtar: string; deger: number; birim: string | null }[]) => void }) {
  const alanlar: any[] = (cfg?.alanlar && cfg.alanlar.length ? cfg.alanlar : []);
  const [val, setVal] = useState<Record<string, string>>({});
  const [ok, setOk] = useState(false);
  const girilen = alanlar.filter((a) => (val[a.anahtar] ?? '').trim() !== '' && !isNaN(Number(val[a.anahtar])));
  function kaydet() {
    if (girilen.length === 0) return;
    onKaydet(girilen.map((a) => ({ anahtar: a.anahtar, deger: Number(val[a.anahtar]), birim: a.birim || null })));
    setOk(true); setTimeout(() => setOk(false), 2500);
  }
  return (
    <div style={{ margin: '4px 0 8px' }}>
      <div className="k" style={{ marginBottom: 6 }}>📏 Ölçüm</div>
      {cfg?.not && <div className="note" style={{ marginTop: 0 }}>{cfg.not}</div>}
      {alanlar.length === 0 ? <div className="note" style={{ marginTop: 0 }}>Alan tanımlı değil (taslak).</div> : alanlar.map((a: any) => (
        <div key={a.anahtar} className="olcrow">
          <label>{a.label || a.anahtar}{a.birim ? ' (' + a.birim + ')' : ''}{sonDegerler[a.anahtar] != null ? <span className="note" style={{ margin: 0 }}> · son: {sonDegerler[a.anahtar]}</span> : ''}</label>
          <input type="number" inputMode="decimal" step="any" value={val[a.anahtar] ?? ''} onChange={(e) => setVal((m) => ({ ...m, [a.anahtar]: e.target.value }))} placeholder={sonDegerler[a.anahtar] != null ? String(sonDegerler[a.anahtar]) : '—'} />
        </div>
      ))}
      {alanlar.length > 0 && <div className="rowbtns" style={{ marginTop: 8 }}><button className="btn" disabled={girilen.length === 0} onClick={kaydet}>Kaydet</button>{ok && <span className="note" style={{ margin: 0, color: 'var(--green)', fontWeight: 700 }}>✓ Kaydedildi</span>}</div>}
    </div>
  );
}
// Rehberli nefes kartı: config.desen (kutu/478/koheran) + config.tekrar; çember fazlara göre büyür/küçülür, turlar bitince onFinish.
function NefesKart({ cfg, done, onFinish }: { cfg: any; done: boolean; onFinish: () => void }) {
  const desenKey = cfg?.desen && NEFES_DESEN[cfg.desen] ? cfg.desen : 'kutu';
  const tekrar = cfg?.tekrar > 0 ? cfg.tekrar : 4;
  const fazlar = NEFES_DESEN[desenKey].fazlar;
  const [running, setRunning] = useState(false);
  const [, setTick] = useState(0);
  const st = useRef({ phi: 0, cyc: 0, remain: 0, bitti: false });
  const iv = useRef<any>(null);
  const rerender = () => setTick((t) => t + 1);
  const stop = () => { if (iv.current) { clearInterval(iv.current); iv.current = null; } };
  useEffect(() => () => stop(), []);
  function enter() { st.current.remain = fazlar[st.current.phi][1]; rerender(); }
  function tickFn() {
    st.current.remain--;
    if (st.current.remain > 0) { rerender(); return; }
    st.current.phi++;
    if (st.current.phi >= fazlar.length) {
      st.current.phi = 0; st.current.cyc++;
      if (st.current.cyc >= tekrar) { stop(); setRunning(false); st.current.bitti = true; rerender(); if (!done) onFinish(); return; }
    }
    enter();
  }
  function basla() {
    if (running) return;
    if (st.current.bitti) st.current = { phi: 0, cyc: 0, remain: 0, bitti: false };
    setRunning(true); enter(); iv.current = setInterval(tickFn, 1000);
  }
  function durakla() { stop(); setRunning(false); rerender(); }
  function sifirla() { stop(); st.current = { phi: 0, cyc: 0, remain: 0, bitti: false }; setRunning(false); rerender(); }
  const faz = fazlar[st.current.phi];
  const scale = (running || st.current.remain > 0) ? faz[2] : 0.5;
  const label = st.current.bitti ? 'Bitti' : (running ? faz[0] : 'Hazır');
  const count = st.current.bitti ? '✓' : (running ? st.current.remain : '—');
  const dur = running ? faz[1] : 0.4;
  return (
    <div style={{ margin: '4px 0 8px' }}>
      <div className="nefstage">
        <div className="nefring" />
        <div className="nefcircle" style={{ transform: 'scale(' + scale + ')', transitionDuration: dur + 's' }}>
          <div className="nefphase">{label}</div>
          <div className="nefcount">{count}</div>
        </div>
      </div>
      <div className="note" style={{ textAlign: 'center', margin: '4px 0 0' }}>{NEFES_DESEN[desenKey].ad} · Tur {st.current.cyc}/{tekrar}</div>
      <div className="rowbtns" style={{ justifyContent: 'center', marginTop: 8 }}>
        <button className="btn" onClick={running ? durakla : basla}>{running ? 'Duraklat' : (st.current.bitti ? 'Tekrar' : 'Başla')}</button>
        <button className="btn ghost sm" onClick={sifirla}>Sıfırla</button>
      </div>
      {st.current.bitti && <div className="note" style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 700 }}>✓ Tamamlandı</div>}
    </div>
  );
}
// Ruh hali check-in kartı: 5'li emoji ölçek; kaydedince ölçüme (dog_measurements) yazılır.
function MoodKart({ soru, bugun, onKaydet }: { soru?: string; bugun: number | null; onKaydet: (d: number) => void }) {
  const [sel, setSel] = useState<number | null>(bugun);
  return (
    <div style={{ margin: '4px 0 8px' }}>
      <div className="k" style={{ marginBottom: 8 }}>🙂 {soru || 'Bugün nasıl hissediyorsun?'}</div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
        {MOOD.map((em, i) => { const v = i + 1; return <button key={v} className={'moodbtn' + (sel === v ? ' on' : '')} onClick={() => setSel(v)}>{em}</button>; })}
      </div>
      <div className="rowbtns" style={{ marginTop: 10 }}>
        <button className="btn" disabled={sel == null} onClick={() => sel != null && onKaydet(sel)}>{bugun != null ? 'Güncelle' : 'Kaydet'}</button>
      </div>
      {bugun != null && <div className="note" style={{ marginTop: 4 }}>Bugün {MOOD[bugun - 1]} ({bugun}/5) kaydedildi.</div>}
    </div>
  );
}
// Egzersiz kartı: hareketler (set×tekrar·ağırlık·video); her set'e dokun, hepsi bitince "Bitir" ile yapıldı.
function WorkoutKart({ cfg, done, onBitir }: { cfg: any; done: boolean; onBitir: () => void }) {
  const hareketler: any[] = cfg?.hareketler || [];
  const [dn, setDn] = useState<Record<string, boolean>>({});
  const total = hareketler.reduce((a: number, h: any) => a + (Number(h.set) || 1), 0);
  const yapilan = Object.values(dn).filter(Boolean).length;
  const key = (ei: number, si: number) => ei + '-' + si;
  return (
    <div style={{ margin: '4px 0 8px' }}>
      <div className="k" style={{ marginBottom: 6 }}>🏋️ Antrenman</div>
      {hareketler.length === 0 ? <div className="note" style={{ marginTop: 0 }}>Hareket yok (taslak).</div> : hareketler.map((h: any, ei: number) => {
        const sc = Number(h.set) || 1;
        return (
          <div key={ei} className="hareket">
            <div className="hareketad">{h.ad}{h.video && <a href={h.video} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>▶</a>}</div>
            <div className="note" style={{ margin: '2px 0 0' }}>{sc}×{h.tekrar || '—'}{h.agirlik ? ' · ' + h.agirlik : ''}{h.dinlenme ? ' · dinlenme ' + h.dinlenme : ''}</div>
            <div className="setdots">{Array.from({ length: sc }).map((_, si) => <span key={si} className={'setdot' + (dn[key(ei, si)] ? ' on' : '')} onClick={() => setDn((d) => ({ ...d, [key(ei, si)]: !d[key(ei, si)] }))}>{dn[key(ei, si)] ? '✓' : si + 1}</span>)}</div>
          </div>
        );
      })}
      {hareketler.length > 0 && <div className="note" style={{ marginTop: 6 }}>{yapilan}/{total} set</div>}
      <div className="rowbtns" style={{ marginTop: 8 }}><button className="btn" disabled={done} onClick={onBitir}>{done ? '✓ Bitti' : 'Antrenmanı bitir'}</button></div>
    </div>
  );
}
// Şükran günlüğü: 3 iyi şey (+ opsiyonel özel soru); günlük not gibi ephemeral (kaydedilmez), Kaydet → yapıldı.
function SukranKart({ cfg, done, onKaydet }: { cfg: any; done: boolean; onKaydet: () => void }) {
  const [m1, setM1] = useState(''); const [m2, setM2] = useState(''); const [m3, setM3] = useState('');
  return (
    <div className="kv"><div className="k">🙏 {cfg?.soru || 'Bugün 3 iyi şey'}</div>
      <div style={{ width: '100%' }}>
        <input value={m1} onChange={(e) => setM1(e.target.value)} placeholder="1…" style={{ marginBottom: 6 }} />
        <input value={m2} onChange={(e) => setM2(e.target.value)} placeholder="2…" style={{ marginBottom: 6 }} />
        <input value={m3} onChange={(e) => setM3(e.target.value)} placeholder="3…" style={{ marginBottom: 6 }} />
        {done ? <div className="note" style={{ marginTop: 4, color: 'var(--green)', fontWeight: 700 }}>✓ Kaydedildi</div> : <button className="btn" onClick={onKaydet}>Kaydet</button>}
        <div className="note" style={{ fontSize: 11, opacity: .8, marginTop: 4 }}>Yalnız sende kalır, kaydedilmez.</div>
      </div>
    </div>
  );
}
// Randevu kartı: danışmanın (Meridyen) oluşturduğu görüşme randevusu — saat/format/yer bilgisini gösterir.
// Tarih zaten "Ne zaman?"dan geliyor; done dış checkbox ile işaretlenir (video gibi, ayrı buton gerekmez).
function RandevuKart({ cfg }: { cfg: any }) {
  const online = (cfg?.format || 'online') === 'online';
  return (
    <div className="kv" style={{ margin: '4px 0 8px' }}>
      <div className="k">📅 Görüşme randevusu</div>
      <div style={{ width: '100%' }}>
        {cfg?.saat && <div className="note" style={{ marginTop: 0 }}>🕐 Saat: <b style={{ color: 'var(--ink)' }}>{cfg.saat}</b></div>}
        <div className="note">{online ? '💻 Online görüşme' : '📍 Yüz yüze görüşme'}</div>
        {cfg?.yer && (online
          ? <a className="btn" href={cfg.yer} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6 }}>▶ Görüşmeye katıl</a>
          : <div className="note">Adres: {cfg.yer}</div>)}
        {cfg?.not && <div className="note" style={{ marginTop: 6 }}>{cfg.not}</div>}
      </div>
    </div>
  );
}
// 5-4-3-2-1 topraklama: sabit duyusal kategori checklist; hepsi işaretlenince Bitti.
function TopraklamaKart({ done, onBitir }: { done: boolean; onBitir: () => void }) {
  const [ok, setOk] = useState<boolean[]>([false, false, false, false, false]);
  const tumu = ok.every(Boolean);
  const toggle = (i: number) => setOk((a) => { const b = [...a]; b[i] = !b[i]; return b; });
  return (
    <div style={{ margin: '4px 0 8px' }}>
      <div className="k" style={{ marginBottom: 6 }}>🖐 5-4-3-2-1 topraklama</div>
      {TOPRAK_ADIM.map(([n, l], i) => (
        <div key={n} className={'ogun' + (ok[i] ? ' done' : '')} onClick={() => toggle(i)} style={{ cursor: 'pointer' }}>
          <button className={'ogcheck' + (ok[i] ? ' on' : '')}>{ok[i] ? '✓' : ''}</button>
          <div style={{ flex: 1 }}><div className="ogunad">{l}</div></div>
        </div>
      ))}
      <div className="rowbtns" style={{ marginTop: 8 }}><button className="btn" disabled={!tumu || done} onClick={onBitir}>{done ? '✓ Bitti' : 'Bitti'}</button></div>
    </div>
  );
}
// Odak/pomodoro sayacı: geri sayım; bitince dakika dog_measurements'a eklenir (gün toplamı birikir, anahtar='odak_dk').
function PomodoroKart({ cfg, bugunDk, onFinish }: { cfg: any; bugunDk: number | null; onFinish: (dk: number) => void }) {
  const dakika = cfg?.dakika > 0 ? cfg.dakika : 25;
  const [running, setRunning] = useState(false);
  const [remain, setRemain] = useState(dakika * 60);
  const [bitti, setBitti] = useState(false);
  const iv = useRef<any>(null);
  useEffect(() => () => { if (iv.current) clearInterval(iv.current); }, []);
  function basla() {
    if (running) return;
    setRunning(true);
    iv.current = setInterval(() => {
      setRemain((r) => {
        if (r <= 1) { clearInterval(iv.current); iv.current = null; setRunning(false); setBitti(true); onFinish(dakika); return 0; }
        return r - 1;
      });
    }, 1000);
  }
  function durakla() { if (iv.current) { clearInterval(iv.current); iv.current = null; } setRunning(false); }
  function sifirla() { if (iv.current) { clearInterval(iv.current); iv.current = null; } setRunning(false); setBitti(false); setRemain(dakika * 60); }
  const mm = String(Math.floor(remain / 60)).padStart(2, '0');
  const ss = String(remain % 60).padStart(2, '0');
  return (
    <div style={{ margin: '4px 0 8px' }}>
      <div className="nefstage">
        <div className="nefcircle" style={{ transform: 'scale(1)', transitionDuration: '.4s' }}>
          <div className="nefphase">{bitti ? 'Bitti' : (running ? 'Odaklan' : 'Hazır')}</div>
          <div className="nefcount">{mm}:{ss}</div>
        </div>
      </div>
      <div className="note" style={{ textAlign: 'center', margin: '4px 0 0' }}>{dakika} dk oturum{bugunDk != null ? ' · bugün toplam ' + bugunDk + ' dk' : ''}</div>
      <div className="rowbtns" style={{ justifyContent: 'center', marginTop: 8 }}>
        <button className="btn" onClick={running ? durakla : basla}>{running ? 'Duraklat' : (bitti ? 'Tekrar' : 'Başla')}</button>
        <button className="btn ghost sm" onClick={sifirla}>Sıfırla</button>
      </div>
      {bitti && <div className="note" style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 700 }}>✓ +{dakika} dk kaydedildi</div>}
    </div>
  );
}
// Beden taraması (PMR benzeri): sıralı adımlar (etiket+süre, config'den); nefes kartıyla aynı mekanik.
function BedenKart({ cfg, done, onFinish }: { cfg: any; done: boolean; onFinish: () => void }) {
  const adimlar: { etiket: string; saniye: number }[] = (cfg?.adimlar && cfg.adimlar.length) ? cfg.adimlar : [];
  const [, setTick] = useState(0);
  const st = useRef({ i: 0, remain: 0, bitti: false });
  const iv = useRef<any>(null);
  const rerender = () => setTick((t) => t + 1);
  const stop = () => { if (iv.current) { clearInterval(iv.current); iv.current = null; } };
  useEffect(() => () => stop(), []);
  function enter() { st.current.remain = adimlar[st.current.i]?.saniye || 0; rerender(); }
  function tickFn() {
    st.current.remain--;
    if (st.current.remain > 0) { rerender(); return; }
    st.current.i++;
    if (st.current.i >= adimlar.length) { stop(); st.current.bitti = true; rerender(); if (!done) onFinish(); return; }
    enter();
  }
  function basla() {
    if (adimlar.length === 0 || iv.current) return;
    if (st.current.bitti) st.current = { i: 0, remain: 0, bitti: false };
    enter(); iv.current = setInterval(tickFn, 1000);
  }
  function durakla() { stop(); rerender(); }
  function sifirla() { stop(); st.current = { i: 0, remain: 0, bitti: false }; rerender(); }
  if (adimlar.length === 0) return <div className="note" style={{ marginTop: 0 }}>Adım yok (taslak).</div>;
  const running = !!iv.current;
  const adim = adimlar[Math.min(st.current.i, adimlar.length - 1)];
  return (
    <div style={{ margin: '4px 0 8px' }}>
      <div className="nefstage">
        <div className="nefcircle" style={{ transform: 'scale(1)', transitionDuration: '.4s' }}>
          <div className="nefphase">{st.current.bitti ? 'Bitti' : adim.etiket}</div>
          <div className="nefcount">{st.current.bitti ? '✓' : (st.current.remain || adim.saniye)}</div>
        </div>
      </div>
      <div className="note" style={{ textAlign: 'center', margin: '4px 0 0' }}>Adım {Math.min(st.current.i + 1, adimlar.length)}/{adimlar.length}</div>
      <div className="rowbtns" style={{ justifyContent: 'center', marginTop: 8 }}>
        <button className="btn" onClick={running ? durakla : basla}>{running ? 'Duraklat' : (st.current.bitti ? 'Tekrar' : 'Başla')}</button>
        <button className="btn ghost sm" onClick={sifirla}>Sıfırla</button>
      </div>
      {st.current.bitti && <div className="note" style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 700 }}>✓ Tamamlandı</div>}
    </div>
  );
}
// Uyku hazırlığı checklist: config.maddeler danışan tarafından işaretlenir; hepsi tamamsa Bitir.
function UykuKart({ cfg, done, onBitir }: { cfg: any; done: boolean; onBitir: () => void }) {
  const maddeler: string[] = cfg?.maddeler || [];
  const [ok, setOk] = useState<boolean[]>([]);
  const tumu = maddeler.length > 0 && maddeler.every((_, i) => ok[i]);
  const toggle = (i: number) => setOk((a) => { const b = [...a]; b[i] = !b[i]; return b; });
  return (
    <div style={{ margin: '4px 0 8px' }}>
      <div className="k" style={{ marginBottom: 6 }}>🌙 Uyku hazırlığı</div>
      {maddeler.length === 0 ? <div className="note" style={{ marginTop: 0 }}>Madde yok (taslak).</div> : maddeler.map((m, i) => (
        <div key={i} className={'ogun' + (ok[i] ? ' done' : '')} onClick={() => toggle(i)} style={{ cursor: 'pointer' }}>
          <button className={'ogcheck' + (ok[i] ? ' on' : '')}>{ok[i] ? '✓' : ''}</button>
          <div style={{ flex: 1 }}><div className="ogunad">{m}</div></div>
        </div>
      ))}
      {maddeler.length > 0 && <div className="rowbtns" style={{ marginTop: 8 }}><button className="btn" disabled={!tumu || done} onClick={onBitir}>{done ? '✓ Hazır' : 'Bitti'}</button></div>}
    </div>
  );
}
// Su sayacı: dokun→+1 bardak; dog_measurements'a gün toplamı olarak birikir (anahtar='su').
function SuKart({ cfg, bugun, onEkle }: { cfg: any; bugun: number | null; onEkle: (delta: number) => void }) {
  const hedef = cfg?.hedef > 0 ? cfg.hedef : 8;
  const mevcut = bugun || 0;
  return (
    <div style={{ margin: '4px 0 8px' }}>
      <div className="k" style={{ marginBottom: 8 }}>💧 Su · {mevcut}/{hedef} bardak</div>
      <div className="mbar"><div className="track"><div className="fill" style={{ width: Math.min(100, Math.round(mevcut / hedef * 100)) + '%' }} /></div></div>
      <div className="rowbtns" style={{ marginTop: 10, justifyContent: 'center' }}>
        <button className="btn ghost sm" disabled={mevcut <= 0} onClick={() => onEkle(-1)}>−1</button>
        <button className="btn" onClick={() => onEkle(1)}>+1 bardak</button>
      </div>
      {mevcut >= hedef && <div className="note" style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 700, marginTop: 6 }}>✓ Hedefe ulaşıldı</div>}
    </div>
  );
}
// CBT maruz bırakma: görev + öncesi/sonrası SUDS (0-10); ephemeral (günde tekrarlı olabileceği için tabloya yazılmaz).
function MaruzKart({ cfg, done, onBitir }: { cfg: any; done: boolean; onBitir: () => void }) {
  const [once, setOnce] = useState<number | ''>('');
  const [sonra, setSonra] = useState<number | ''>('');
  return (
    <div className="kv"><div className="k">🎯 Maruz bırakma</div>
      <div style={{ width: '100%' }}>
        {cfg?.gorev && <div style={{ fontSize: 14, marginBottom: 8 }}>{cfg.gorev}</div>}
        <label className="fldlbl" style={{ marginTop: 0 }}>Öncesi SUDS (0 rahat – 10 çok yüksek)</label>
        <input type="number" min={0} max={10} value={once} onChange={(e) => setOnce(e.target.value === '' ? '' : Number(e.target.value))} />
        <label className="fldlbl">Sonrası SUDS</label>
        <input type="number" min={0} max={10} value={sonra} onChange={(e) => setSonra(e.target.value === '' ? '' : Number(e.target.value))} />
        {done ? <div className="note" style={{ marginTop: 6, color: 'var(--green)', fontWeight: 700 }}>✓ Tamamlandı</div> : <button className="btn" style={{ marginTop: 8 }} onClick={onBitir}>Bitti</button>}
        <div className="note" style={{ fontSize: 11, opacity: .8 }}>Puanlar kaydedilmez, yalnız senin takibin için.</div>
      </div>
    </div>
  );
}
// Niyet/değer kartı: günün niyeti (serbest metin) + opsiyonel değer seçimi; ephemeral, Kaydet → yapıldı.
function NiyetKart({ cfg, done, onKaydet }: { cfg: any; done: boolean; onKaydet: () => void }) {
  const [metin, setMetin] = useState('');
  const [sec, setSec] = useState<string | null>(null);
  const degerler: string[] = cfg?.degerler || [];
  return (
    <div className="kv"><div className="k">🧭 {cfg?.soru || 'Bugünün niyeti'}</div>
      <div style={{ width: '100%' }}>
        <input value={metin} onChange={(e) => setMetin(e.target.value)} placeholder="Bugün neye odaklanmak istiyorsun?" />
        {degerler.length > 0 && <div style={{ marginTop: 8 }}>{degerler.map((d) => <span key={d} className={'chip' + (sec === d ? ' on' : '')} onClick={() => setSec(sec === d ? null : d)}>{d}</span>)}</div>}
        {done ? <div className="note" style={{ marginTop: 6, color: 'var(--green)', fontWeight: 700 }}>✓ Kaydedildi</div> : <button className="btn" style={{ marginTop: 8 }} onClick={onKaydet}>Kaydet</button>}
      </div>
    </div>
  );
}
// Inbox notu kartı: dokunulabilir; tıklayınca editör açılır.
function InboxNot({ v, onOpen }: { v: any; onOpen: () => void }) {
  const ikon = v.payload?.kartTipi === 'video' ? '🎬' : v.url ? '🔗' : v.payload?.resim ? '📷' : '📌';
  return (
    <div className="actcard" onClick={onOpen} style={{ cursor: 'pointer' }}>
      {v.payload?.resim && <img src={v.payload.resim} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flex: '0 0 auto' }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="n">{ikon} {v.baslik}</div>
        {v.payload?.aciklama && <div className="o">{v.payload.aciklama}</div>}
      </div>
      <span className="go">›</span>
    </div>
  );
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
  const [inboxOpen, setInboxOpen] = useState(false);
  const [ibGrupSec, setIbGrupSec] = useState<string | null>(null); // havuza eklerken grup seçimi açık olan inbox öğesi
  const [ibGrupVal, setIbGrupVal] = useState('Genel');
  const [ajView, setAjView] = useState<'gun' | 'ay'>('gun');
  const [selDate, setSelDate] = useState('');
  const [activities, setActivities] = useState<any[]>([]);
  const [actGroup, setActGroup] = useState('');
  const [havuzTop, setHavuzTop] = useState<'kisisel' | 'wellbeing'>('wellbeing');
  const [rituals, setRituals] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [ep, setEp] = useState<any>(null);
  const [anchors, setAnchors] = useState<string[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [meas, setMeas] = useState<any[]>([]);
  const [cNot, setCNot] = useState<string>('');
  const [yeniRit, setYeniRit] = useState('');
  const [inbox, setInbox] = useState<any[]>([]);
  const [ibDetay, setIbDetay] = useState<any>(null);
  const [ibdAd, setIbdAd] = useState('');
  const [ibdAcik, setIbdAcik] = useState('');
  const [ibdUrl, setIbdUrl] = useState('');
  const [ibdTarih, setIbdTarih] = useState('');
  const [addSlot, setAddSlot] = useState<string | null>(null);
  // Zaman dilimindeki + ile hızlı ekleme (havuzdan seç ya da anında not/randevu oluştur).
  const [slotAddOpen, setSlotAddOpen] = useState<string | null>(null);
  const [hzAd, setHzAd] = useState('');
  const [hzLink, setHzLink] = useState('');
  const [hzRandevu, setHzRandevu] = useState(false);
  const [hzSaat, setHzSaat] = useState('');
  const [hzFormat, setHzFormat] = useState('online');
  const [hzYer, setHzYer] = useState('');
  const [hzNot, setHzNot] = useState('');
  const [msg, setMsg] = useState('');
  const [pushOn, setPushOn] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const [linkMode, setLinkMode] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkIds, setLinkIds] = useState<string[]>([]);
  const [detay, setDetay] = useState<any>(null);
  const [detayAct, setDetayAct] = useState<any>(null);
  // Ritüel bir Meridyen şablonundan geldiyse (sablon_id), şablonun GÜNCEL adımını burada tutuyoruz —
  // detay açılınca canlı çekilir; içerik gösterirken önce buna, yoksa ritüelin kendi (o anki) kopyasına bakılır.
  const [detaySablon, setDetaySablon] = useState<any>(null);
  const [zamanOpen, setZamanOpen] = useState(false);
  const [grupEditOpen, setGrupEditOpen] = useState(false);
  const [grupEditVal, setGrupEditVal] = useState('');
  const [paylasOpen, setPaylasOpen] = useState(false);
  const [mezunModal, setMezunModal] = useState<any>(null);
  const [mezunPuan, setMezunPuan] = useState(0);
  const [remInput, setRemInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [adInput, setAdInput] = useState('');
  const [aciklamaInput, setAciklamaInput] = useState('');
  const [kisiselNotInput, setKisiselNotInput] = useState('');
  const [kartUrlInput, setKartUrlInput] = useState('');
  const [sureInput, setSureInput] = useState('21');
  // Artık ayrı bir tutamaç yok, kartın tamamı basılı tutulunca taşınıyor — bu yüzden gecikme (delay) daha önceki
  // (küçük tutamaca özel) 180ms'den daha uzun: kısa bir "aç/işaretle" dokunuşuyla yanlışlıkla sürüklemeyi karıştırmasın.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 300, tolerance: 6 } }));
  const [faydaList, setFaydaList] = useState<any[]>([]);
  const [alanList, setAlanList] = useState<string[]>([]);
  const [kZamanlar, setKZamanlar] = useState<string[]>(['gün']);
  const [kGunler, setKGunler] = useState<number[]>([]);
  const [kSure, setKSure] = useState('');
  const [kEditId, setKEditId] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [kAd, setKAd] = useState('');
  const [kAcik, setKAcik] = useState('');
  const [kGrup, setKGrup] = useState('Genel');
  const [kFaydalar, setKFaydalar] = useState<string[]>([]);
  const [kVids, setKVids] = useState<any[]>([]);
  const [kVin, setKVin] = useState({ baslik: '', url: '' });
  const [kMsg, setKMsg] = useState('');
  const [kShareTo, setKShareTo] = useState('');
  const [kisiler, setKisiler] = useState<any[]>([]);
  const [profilAd, setProfilAd] = useState('');
  const [kiAd, setKiAd] = useState('');
  const [kiKod, setKiKod] = useState('');
  const [paylasSel, setPaylasSel] = useState('');
  // Studio program modu (Faz B): çok adımlı, adım-bazlı slot/gün.
  const [stMode, setStMode] = useState<'aktivite' | 'program'>('aktivite');
  const [stAdimlar, setStAdimlar] = useState<any[]>([]);
  const [adAd, setAdAd] = useState('');
  const [adZ, setAdZ] = useState<string[]>(['gün']);
  const [adG, setAdG] = useState<number[]>([]);
  const [adU, setAdU] = useState('');
  const [adBas, setAdBas] = useState('');
  const [adSure, setAdSure] = useState('');
  const [adArd, setAdArd] = useState(false);
  const [adZinc, setAdZinc] = useState(false);
  const [adEdit, setAdEdit] = useState<number | null>(null);

  const today = iso(new Date());
  const day = selDate || today;
  function dayLabel(d: string) {
    const dt = parseD(d);
    return (d === today ? 'Bugün · ' : '') + dt.getDate() + ' ' + MONTHS[dt.getMonth()] + ' ' + WDFULL[dt.getDay()];
  }
  function shiftDay(delta: number) {
    const dt = parseD(selDate || today);
    dt.setDate(dt.getDate() + delta);
    setSelDate(iso(dt));
  }
  function shiftMonth(delta: number) {
    const dt = parseD(selDate || today);
    dt.setDate(1); dt.setMonth(dt.getMonth() + delta);
    setSelDate(iso(dt));
  }
  const ayLabel = (d: string) => { const dt = parseD(d); return MONTHS[dt.getMonth()] + ' ' + dt.getFullYear(); };
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
    setSelDate(iso(new Date()));
    try {
      const s = localStorage.getItem(LS);
      if (s) { const c = JSON.parse(s); setClient(c); loadData(c.id); loadInbox(c.id); loadKisiler(c.id); ensureShareCode(c); reassignPush(c.id); }
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rite Studio'dan (Meridyen) atanan kartlar başka bir oturumdan geldiği için canlı yayın yok —
  // uygulama öne gelince/sekme aktif olunca sessizce tazele, elle yenilemeye gerek kalmasın.
  useEffect(() => {
    if (!client) return;
    const tazele = () => { loadData(client.id); loadInbox(client.id); };
    const onVis = () => { if (document.visibilityState === 'visible') tazele(); };
    window.addEventListener('focus', tazele);
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('focus', tazele); document.removeEventListener('visibilitychange', onVis); };
  }, [client]);

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
    const gs = data.filter((a: any) => !a.client_id && a.tur !== 'program').map((a: any) => a.grup).filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i);
    if (gs.length) { setHavuzTop((t) => t || 'wellbeing'); setActGroup((g) => g || gs[0]); }
  }

  async function loadData(clientId: string) {
    const r = await supabase.from('dog_rituals').select('id,ad,zaman,kategori,tip,kaynak,mezun,aktif,alan,rutin,sira,baslangic,bitis,activity_id,hatirlatma_saat,blok_sira,faydalar,url,gunler,kart_tipi,kart_config,aliskanlik,aciklama,sablon_id,sablon_adim,kisisel_not').eq('client_id', clientId).order('zaman');
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
    setPushOn(true); // abonelik zaten var → UI'da "açık" göster (her açılışta yeniden açmaya gerek yok)
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
  // Güncel seri: bugünden geriye, aktif günlerde ardışık "yapıldı" sayısı (bugün henüz yapılmadıysa ceza yok).
  const ritStreak = (r: any) => {
    const gunler: string[] = [];
    for (let i = 0; i < 90; i++) { const dt = parseD(today); dt.setDate(dt.getDate() - i); const ds = iso(dt); if (activeOn(r, ds)) gunler.push(ds); }
    const yap = (ds: string) => logs.some((l) => l.ritual_id === r.id && l.tarih === ds && l.yapildi);
    let i = 0; if (gunler[0] === today && !yap(today)) i = 1;
    let c = 0; for (; i < gunler.length; i++) { if (yap(gunler[i])) c++; else break; }
    return c;
  };

  async function toggleRit(ritId: string) {
    if (!client) return;
    const ex = logs.filter((l) => l.ritual_id === ritId && l.tarih === day)[0];
    if (ex) await supabase.from('dog_ritual_logs').update({ yapildi: !ex.yapildi }).eq('id', ex.id);
    else await supabase.from('dog_ritual_logs').insert({ client_id: client.id, ritual_id: ritId, tarih: day, yapildi: true });
    loadData(client.id);
  }
  async function ritEkle(ad: string, zaman = 'gün', kaynak = 'Kendi', tip = 'aliskanlik', alan: string | null = null, activityId: string | null = null, faydalar: string[] = [], url: string | null = null, gunler: number[] | null = null, sureG: number | null = null, programId: string | null = null, programAd: string | null = null, reload = true, basGun = 0, rutin: string | null = null, sira = 0, kartTipi: string | null = null, kartConfig: any = null, aliskanlikP: boolean | null = null, sablonId: string | null = null, sablonAdim: number | null = null) {
    if (!client || !ad.trim()) return;
    const g = gunler && gunler.length > 0 && gunler.length < 7 ? gunler : null;
    const bas = parseD(today); bas.setDate(bas.getDate() + (basGun || 0)); const basStr = iso(bas);
    let bitis: string | null = null;
    if (sureG && sureG > 0) { const e = parseD(basStr); e.setDate(e.getDate() + sureG - 1); bitis = iso(e); }
    await supabase.from('dog_rituals').insert({ client_id: client.id, ad: ad.trim(), zaman, kaynak, tip, alan, activity_id: activityId, faydalar, url, gunler: g, program: programId, program_ad: programAd, rutin, sira, kart_tipi: kartTipi, kart_config: kartConfig, aliskanlik: aliskanlikP === null ? !bitis : aliskanlikP, aktif: true, mezun: false, baslangic: basStr, bitis, blok_sira: Date.now(), sablon_id: sablonId, sablon_adim: sablonAdim });
    setYeniRit('');
    if (reload) loadData(client.id);
  }
  // Çok-slotlu aktiviteyi ajandaya ekle: her slot için bir ritüel.
  async function aktiviteEkleSlotlar(o: any, override?: string) {
    if (!client) return;
    // Grup, sadece havuz kürasyonunda (client_id yok) gerçek bir "alan" taşır; kişisel aktivitelerde grup artık kullanıcının kendi havuz grubu adıdır.
    const alan0 = (!o.client_id && o.grup) ? o.grup : (o.faydalar?.length ? faydaMap[o.faydalar[0]]?.alan || null : null);
    const url0 = (o.videolar && o.videolar[0]?.url) || null;
    const slots = override ? [override] : (o.zamanlar && o.zamanlar.length ? o.zamanlar : [o.zaman || 'gün']);
    for (const s of slots) await ritEkle(o.ad, s, o.kaynak_etiket || (o.client_id ? 'Kendi' : 'Rite'), 'aliskanlik', alan0, o.id || null, o.faydalar || [], url0, o.gunler || null, o.sure_gun || null, null, null, false, 0, null, 0, o.kart_tipi || null, o.kart_config || null);
    loadData(client.id);
  }
  // Programı ajandaya başlat: her adım × her slot için ritüel, ortak program kimliğiyle.
  // Gün-içi zincir (zincirli) adımlar tek slotta, liderin penceresinde, rutin+sıra ile bağlanır.
  async function programBaslat(prog: any) {
    if (!client) return;
    const adimlar = prog.adimlar || [];
    const pid = 'P' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const spans = programSpans(adimlar, prog.sure_gun || null);
    // Gün-içi zincir gruplarını çıkar: zincirli adım öncekine katılır.
    const gruplar: number[][] = []; let cur: number[] | null = null;
    adimlar.forEach((st: any, i: number) => { if (st.zincirli && cur) cur.push(i); else { cur = [i]; gruplar.push(cur); } });
    for (const grp of gruplar) {
      const zincir = grp.length > 1;
      const lider = adimlar[grp[0]];
      const liderSlot = lider.zamanlar && lider.zamanlar.length ? lider.zamanlar[0] : 'gün';
      const rutinId = zincir ? pid + '-z' + grp[0] : null;
      for (let k = 0; k < grp.length; k++) {
        const idx = grp[k]; const st = adimlar[idx];
        const alan0 = st.faydalar?.length ? faydaMap[st.faydalar[0]]?.alan || null : null;
        if (zincir) {
          // zincir üyesi: tek slot (lider), liderin penceresi/günleri, rutin+sıra
          await ritEkle(st.ad, liderSlot, 'Program', 'aliskanlik', alan0, null, st.faydalar || [], st.url || null, lider.gunler || null, spans[grp[0]].d || null, pid, prog.ad, false, spans[grp[0]].o, rutinId, k, st.kartTipi || null, st.kartConfig || null, typeof st.aliskanlik === 'boolean' ? st.aliskanlik : null, prog.sablon_id || null, idx);
        } else {
          const slots = st.zamanlar && st.zamanlar.length ? st.zamanlar : ['gün'];
          for (const s of slots) await ritEkle(st.ad, s, 'Program', 'aliskanlik', alan0, null, st.faydalar || [], st.url || null, st.gunler || null, spans[idx].d || null, pid, prog.ad, false, spans[idx].o, null, 0, st.kartTipi || null, st.kartConfig || null, typeof st.aliskanlik === 'boolean' ? st.aliskanlik : null, prog.sablon_id || null, idx);
        }
      }
    }
    loadData(client.id);
  }
  function kToggleFayda(kod: string) { setKFaydalar((a) => (a.includes(kod) ? a.filter((x) => x !== kod) : [...a, kod])); }
  function kVidEkle() { if (!kVin.baslik.trim()) return; setKVids((a) => [...a, { baslik: kVin.baslik.trim(), url: kVin.url.trim() }]); setKVin({ baslik: '', url: '' }); }
  const kVidSil = (i: number) => setKVids((a) => a.filter((_, j) => j !== i));
  function studioReset() { setKAd(''); setKAcik(''); setKGrup('Genel'); setKFaydalar([]); setKVids([]); setKVin({ baslik: '', url: '' }); setKZamanlar(['gün']); setKGunler([]); setKSure(''); setKEditId(null); setKMsg(''); setStMode('aktivite'); setStAdimlar([]); setAdAd(''); setAdZ(['gün']); setAdG([]); setAdU(''); setAdBas(''); setAdSure(''); setAdArd(false); setAdZinc(false); setAdEdit(null); }
  function openStudioNew(grup?: string) { studioReset(); if (grup) setKGrup(grup); setStudioOpen(true); }
  function openStudioEdit(a: any) {
    studioReset();
    setKAd(a.ad || ''); setKAcik(a.aciklama || ''); setKGrup(a.grup && a.grup !== 'Kişisel' ? a.grup : 'Genel'); setKVin({ baslik: '', url: (a.videolar && a.videolar[0]?.url) || '' }); setKZamanlar(a.zamanlar && a.zamanlar.length ? [a.zamanlar[0]] : [a.zaman || 'gün']); setKEditId(a.id);
    setStudioOpen(true);
  }
  const slotToggle = (arr: string[], set: (f: (c: string[]) => string[]) => void, z: string) => set((c) => c.includes(z) ? (c.length > 1 ? c.filter((x) => x !== z) : c) : [...c, z]);
  const gunToggle = (set: (f: (c: number[]) => number[]) => void, n: number) => set((c) => c.includes(n) ? c.filter((x) => x !== n) : [...c, n]);
  function adimResetDraft() { setAdAd(''); setAdZ(['gün']); setAdG([]); setAdU(''); setAdBas(''); setAdSure(''); setAdArd(false); setAdZinc(false); setAdEdit(null); setKMsg(''); }
  function adimDuzenle(i: number) { const st = stAdimlar[i]; setAdAd(st.ad || ''); setAdZ(st.zamanlar && st.zamanlar.length ? st.zamanlar : ['gün']); setAdG(st.gunler || []); setAdU(st.url || ''); setAdBas(st.baslaGun ? String(st.baslaGun) : ''); setAdSure(st.sureGun ? String(st.sureGun) : ''); setAdArd(!!st.ardisik); setAdZinc(!!st.zincirli); setAdEdit(i); setKMsg(''); }
  function adimEkle() {
    if (!adAd.trim()) return setKMsg('Adım adı gir');
    const zinc = adZinc && (adEdit != null ? adEdit > 0 : stAdimlar.length > 0);
    const yeni = { ad: adAd.trim(), zamanlar: adZ, gunler: adG.length > 0 && adG.length < 7 ? adG : null, url: adU.trim() || null, faydalar: adEdit != null ? (stAdimlar[adEdit].faydalar || []) : [], zincirli: zinc, ardisik: !zinc && adArd, baslaGun: (zinc || adArd) ? 0 : (parseInt(adBas) > 0 ? parseInt(adBas) : 0), sureGun: parseInt(adSure) > 0 ? parseInt(adSure) : null };
    setStAdimlar((a) => (adEdit != null ? a.map((x, j) => (j === adEdit ? yeni : x)) : [...a, yeni]));
    adimResetDraft();
  }
  // Adım zamanlama özeti: "↳ ardından · M gün" / "başla +Ng · M gün"
  function adimZamanOzet(st: any): string {
    if (st.zincirli) return '🔗 önceki ile zincir';
    const b = st.ardisik ? '↳ önceki ardından' : (st.baslaGun ? 'başla +' + st.baslaGun + 'g' : '');
    const s = st.sureGun ? st.sureGun + ' gün' : '';
    return [b, s].filter(Boolean).join(' · ');
  }
  const adimSil = (i: number) => setStAdimlar((a) => a.filter((_, j) => j !== i));
  const adimMove = (i: number, dir: number) => setStAdimlar((a) => { const j = i + dir; if (j < 0 || j >= a.length) return a; const b = [...a]; [b[i], b[j]] = [b[j], b[i]]; return b; });
  // Rite: basit kişisel aktivite kaydet (create/update). Program tasarımı Meridyen'de.
  async function studioKaydet() {
    if (!client) return;
    if (!kAd.trim()) return setKMsg('Ad gir');
    const url = kVin.url.trim();
    const row: any = { client_id: client.id, tur: 'aktivite', ad: kAd.trim(), grup: kGrup.trim() || 'Genel', faydalar: [], aciklama: kAcik || null, videolar: url ? [{ baslik: kAd.trim(), url }] : [], zaman: kZamanlar[0] || 'gün', zamanlar: kZamanlar, kaynak_etiket: 'Kendi', aktif: true };
    const r = kEditId ? await supabase.from('dog_activities').update(row).eq('id', kEditId) : await supabase.from('dog_activities').insert(row);
    if (r.error) return setKMsg('Hata: ' + r.error.message);
    const savedGrup = row.grup;
    studioReset(); loadActivities(); setStudioOpen(false); setHavuzTop('kisisel'); setActGroup(savedGrup);
  }
  async function loadKisiler(cid: string) {
    const r = await supabase.from('dog_clients').select('kisiler,profil_ad').eq('id', cid).single();
    setKisiler((r.data?.kisiler as any[]) || []);
    setProfilAd((r.data?.profil_ad as string) || '');
  }
  async function profilKaydet() {
    if (!client) return;
    await supabase.from('dog_clients').update({ profil_ad: profilAd.trim() || null }).eq('id', client.id);
    setKMsg('Profil adı kaydedildi');
  }
  async function kisilerKaydet(next: any[]) {
    if (!client) return;
    setKisiler(next);
    await supabase.from('dog_clients').update({ kisiler: next }).eq('id', client.id);
  }
  function kisiEkle() {
    const ad = kiAd.trim(), kod = kiKod.trim().toUpperCase();
    if (!ad || !kod) return;
    kisilerKaydet([...kisiler, { ad, kod }]); setKiAd(''); setKiKod('');
  }
  const kisiSil = (i: number) => kisilerKaydet(kisiler.filter((_, j) => j !== i));
  const kisiAd = (kod: string) => kisiler.find((x) => x.kod === kod)?.ad;
  // Ritüel / aktivite / programı bir paylaşım koduna yolla (dog_inbox).
  async function paylas(o: any, isRit: boolean, kod: string) {
    const k = (kod || '').trim().toUpperCase();
    if (!k) return setKMsg('Kişi seç ya da kod gir');
    const rc = await supabase.from('dog_clients').select('id').eq('share_code', k).limit(1);
    if (rc.error || !rc.data || !rc.data.length) return setKMsg('Kod bulunamadı: ' + k);
    let payload: any;
    if (!isRit && o.tur === 'program') payload = { tur: 'program', ad: o.ad, adimlar: o.adimlar || [], sure_gun: o.sure_gun || null };
    else if (!isRit) payload = { tur: 'aktivite', ad: o.ad, faydalar: o.faydalar || [], aciklama: o.aciklama || null, videolar: o.videolar || [], zaman: o.zaman || 'gün', zamanlar: o.zamanlar || null, gunler: o.gunler || null, sure_gun: o.sure_gun || null, kartTipi: o.kart_tipi || null, kartConfig: o.kart_config || null, aliskanlik: o.aliskanlik };
    else payload = { tur: 'aktivite', ad: o.ad, faydalar: o.faydalar || [], url: o.url || null, zaman: o.zaman || 'gün', zamanlar: [o.zaman || 'gün'], gunler: o.gunler || null, sure_gun: null, kartTipi: o.kart_tipi || null, kartConfig: o.kart_config || null, aliskanlik: o.aliskanlik };
    const gonderen = profilAd.trim() || client?.ad || '';
    payload.from_ad = gonderen || null;
    const ins = await supabase.from('dog_inbox').insert({ client_id: rc.data[0].id, tur: 'aktivite', baslik: o.ad, payload, from_code: client?.share_code || null, durum: 'yeni' });
    if (ins.error) return setKMsg('Hata: ' + ins.error.message);
    try { await fetch('/api/push/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: rc.data[0].id, title: gonderen ? '📩 ' + gonderen : '📩 Yeni paylaşım', body: (gonderen ? gonderen + ' paylaştı: ' : '') + o.ad, url: '/' }) }); } catch (_) { /* sessiz */ }
    setKShareTo(''); setPaylasSel(''); setKMsg('Paylaşıldı → ' + (kisiAd(k) || k));
  }
  async function silAktivite(act: any) {
    if (!confirm('Bu kişisel aktivite havuzdan silinsin mi? (Ajandadaki ritüeller kalır)')) return;
    const r = await supabase.from('dog_activities').delete().eq('id', act.id);
    if (r.error) return alert('Hata: ' + r.error.message);
    setDetay(null); loadActivities();
  }
  function sureGun(rt: any): number { if (!rt.bitis) return 0; const b = parseD(rt.baslangic || today); const e = parseD(rt.bitis); return Math.round((e.getTime() - b.getTime()) / 86400000) + 1; }
  const patchDetay = (patch: any) => setDetay((d: any) => (d ? { ...d, obj: { ...d.obj, ...patch } } : d));
  // Tek detay kartı: hem ritüel (Ajanda) hem aktivite (Havuz) buradan açılır.
  async function openDetay(obj: any, tur: string) {
    setDetay({ obj, tur }); setGrupEditOpen(false); setGrupEditVal('');
    if (tur === 'ritual') {
      setAdInput(obj.ad || ''); setRemInput(obj.hatirlatma_saat || ''); setUrlInput(obj.url || ''); setAciklamaInput(obj.aciklama || ''); setKartUrlInput((obj.kart_config && obj.kart_config.url) || obj.url || ''); setKisiselNotInput(obj.kisisel_not || '');
      const n = sureGun(obj); setSureInput(n > 0 ? String(n) : '21');
      if (obj.activity_id) { const a = await supabase.from('dog_activities').select('*').eq('id', obj.activity_id).single(); setDetayAct(a.data || null); }
      else setDetayAct(null);
      if (obj.sablon_id) { const s = await supabase.from('dog_activities').select('id,adimlar').eq('id', obj.sablon_id).single(); setDetaySablon(s.data || null); }
      else setDetaySablon(null);
    } else { setDetayAct(obj); setDetaySablon(null); }
  }
  function openRit(rt: any) { openDetay(rt, 'ritual'); }
  // Havuzdaki (kişisel) bir aktivite/programın grubunu değiştir — aktivite ve program için ortak.
  async function setAktGrup(id: string, grup: string) {
    if (!client) return;
    const g = grup.trim() || 'Genel';
    await supabase.from('dog_activities').update({ grup: g }).eq('id', id);
    setDetay((d: any) => (d ? { ...d, obj: { ...d.obj, grup: g } } : d));
    setDetayAct((a: any) => (a ? { ...a, grup: g } : a));
    setGrupEditOpen(false);
    loadActivities();
  }
  async function setRitUrl(id: string, url: string) {
    if (!client) return;
    const u = url.trim() || null;
    await supabase.from('dog_rituals').update({ url: u }).eq('id', id);
    patchDetay({ url: u });
    loadData(client.id);
  }
  async function setRitAd(id: string, ad: string) {
    if (!client || !ad.trim()) return;
    await supabase.from('dog_rituals').update({ ad: ad.trim() }).eq('id', id);
    patchDetay({ ad: ad.trim() });
    loadData(client.id);
  }
  async function setRitAciklama(id: string, v: string) {
    if (!client) return;
    const a = v.trim() || null;
    await supabase.from('dog_rituals').update({ aciklama: a }).eq('id', id);
    patchDetay({ aciklama: a });
    loadData(client.id);
  }
  // Kişisel not: şablondan bağımsız, danışanın kendi kartına eklediği serbest not — şablon güncellenişi/senkronu bunu hiç etkilemez.
  async function setRitKisiselNot(id: string, v: string) {
    if (!client) return;
    const n = v.trim() || null;
    await supabase.from('dog_rituals').update({ kisisel_not: n }).eq('id', id);
    patchDetay({ kisisel_not: n });
    loadData(client.id);
  }
  async function setRitKartUrl(id: string, url: string) {
    if (!client) return;
    const u = url.trim() || null;
    const cfg = { ...(detay?.obj?.kart_config || {}), url: u };
    const patch: any = { kart_config: cfg, url: u };
    if (u && (detay?.obj?.kart_tipi || 'standart') === 'standart') patch.kart_tipi = 'video'; // link girilince video kartı olur
    await supabase.from('dog_rituals').update(patch).eq('id', id);
    patchDetay(patch);
    loadData(client.id);
  }
  // Zaman diliminin + butonundan hızlı ekleme — not/video/randevu, doğrudan o güne ve o dilime.
  function hzReset() { setHzAd(''); setHzLink(''); setHzRandevu(false); setHzSaat(''); setHzFormat('online'); setHzYer(''); setHzNot(''); }
  async function hizliEkle() {
    if (!client || !slotAddOpen || !hzAd.trim()) return;
    const linkVar = !hzRandevu && hzLink.trim();
    const kartTipi = hzRandevu ? 'randevu' : (linkVar ? 'video' : 'standart');
    const kartConfig = hzRandevu ? { saat: hzSaat.trim() || null, format: hzFormat, yer: hzYer.trim() || null, not: hzNot.trim() || null, done: true } : (linkVar ? { url: hzLink.trim(), done: true } : null);
    await supabase.from('dog_rituals').insert({ client_id: client.id, ad: hzAd.trim(), zaman: slotAddOpen, kaynak: 'Kendi', tip: 'aliskanlik', url: linkVar ? hzLink.trim() : null, kart_tipi: kartTipi, kart_config: kartConfig, aliskanlik: false, aktif: true, mezun: false, baslangic: day, bitis: day, blok_sira: Date.now() });
    hzReset(); setSlotAddOpen(null);
    loadData(client.id);
  }
  // Ne zaman? — kartı bir güne koy (tek seferlik) ya da süregelen yap.
  // Zamanlama sekmesinin ana eylemi: kartı başka bir güne "taşı". Tek günlük bir kart (baslangic===bitis)
  // için hedef gün hem başlangıç hem bitiş olur; süreli bir kart (bitis dolu, farklı) süresini KORUYARAK kayar
  // (bas→bit arasındaki gün farkı hedefe de uygulanır); süregelen (bitis=null) süregelen kalır. Eskiden bu üç
  // durum ayrım gözetmeden baslangic=bitis=hedef yapıyordu — bu da süreli/süregelen bir kartı yanlışlıkla tek
  // güne sıkıştırıyordu (karışıklığın asıl kaynağı buydu).
  async function ritTasi(id: string, hedefBas: string) {
    if (!client || !hedefBas) return;
    const rt = rituals.find((r) => r.id === id);
    const oldBas = (rt && rt.baslangic) || today;
    const oldBit = rt && rt.bitis;
    let yeniBit: string | null = null;
    if (oldBit) {
      const delta = Math.round((parseD(oldBit).getTime() - parseD(oldBas).getTime()) / 86400000);
      const e = parseD(hedefBas); e.setDate(e.getDate() + delta);
      yeniBit = iso(e);
    }
    await supabase.from('dog_rituals').update({ baslangic: hedefBas, bitis: yeniBit }).eq('id', id);
    patchDetay({ baslangic: hedefBas, bitis: yeniBit });
    loadData(client.id);
  }
  // gun: null = süregelen (bitiş kaldır); >0 = başlangıçtan itibaren N gün
  async function setRitSure(id: string, gun: number | null) {
    if (!client) return;
    const rt = rituals.find((r) => r.id === id);
    let patch: any;
    if (!gun) patch = { bitis: null };
    else { const bas = (rt && rt.baslangic && rt.baslangic >= today) ? rt.baslangic : today; const e = parseD(bas); e.setDate(e.getDate() + gun - 1); patch = { baslangic: bas, bitis: iso(e) }; }
    await supabase.from('dog_rituals').update(patch).eq('id', id);
    patchDetay(patch);
    loadData(client.id);
  }
  async function setRitGunler(id: string, g: number[]) {
    if (!client) return;
    const arr = g.length === 0 || g.length === 7 ? null : g;
    await supabase.from('dog_rituals').update({ gunler: arr }).eq('id', id);
    patchDetay({ gunler: arr });
    loadData(client.id);
  }
  async function setRitAliskanlik(id: string, val: boolean) {
    if (!client) return;
    await supabase.from('dog_rituals').update({ aliskanlik: val }).eq('id', id);
    patchDetay({ aliskanlik: val });
    loadData(client.id);
  }
  async function setRitReminder(id: string, saat: string) {
    if (!client) return;
    // Saati değiştirince "bugün gönderildi" işaretini sıfırla → yeni saat aynı gün de tetiklenir
    await supabase.from('dog_rituals').update({ hatirlatma_saat: saat || null, son_bildirim: null }).eq('id', id);
    patchDetay({ hatirlatma_saat: saat || null, son_bildirim: null });
    loadData(client.id);
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
  // Ajanda gün görünümü artık zaman dilimi başına ayrı bir sürükleme alanı değil, TEK akış: dilimler (Sabah/Gün
  // içi/Akşam/Serbest) sürüklenemeyen ince ayraç satırları, kartlar bu ayraçların arasında serbestçe taşınabiliyor.
  // Bir kartı bir ayracın öbür tarafına bırakmak, o kartın (zincirse tüm üyelerinin) `zaman` alanını da günceller —
  // önceden bunun için kartı açıp Zamanlama sekmesine girmek gerekiyordu (o yol hâlâ duruyor, bu ek bir kestirme).
  async function onDragEndDay(rows: any[], e: any) {
    if (!client) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.key === active.id);
    const newIndex = rows.findIndex((r) => r.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const moved = arrayMove(rows, oldIndex, newIndex);
    let curZ = SLOTS[0][0];
    const groups: Record<string, any[]> = {};
    moved.forEach((r) => {
      if (r.kind === 'divider') { curZ = r.z; return; }
      (groups[curZ] = groups[curZ] || []).push(r);
    });
    const updates: any[] = [];
    Object.entries(groups).forEach(([z, arr]) => {
      arr.forEach((it, idx) => {
        it.members.forEach((m: any) => {
          const patch: any = { blok_sira: idx };
          if ((m.zaman || 'gün') !== z) patch.zaman = z;
          updates.push(supabase.from('dog_rituals').update(patch).eq('id', m.id));
        });
      });
    });
    await Promise.all(updates);
    loadData(client.id);
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
  // Mezun et: memnuniyet/yarar puanıyla havuza döner (aktivite kaydı) + ritüel mezun olur.
  async function mezunEt(rt: any, puan: number) {
    if (!client) return;
    if (rt.activity_id) {
      await supabase.from('dog_activities').update({ puan: puan || null }).eq('id', rt.activity_id);
    } else {
      const alan0 = rt.faydalar?.length ? (faydaMap[rt.faydalar[0]]?.alan || 'Kişisel') : 'Kişisel';
      await supabase.from('dog_activities').insert({ client_id: client.id, tur: 'aktivite', ad: rt.ad, grup: alan0, faydalar: rt.faydalar || [], zaman: rt.zaman || 'gün', zamanlar: [rt.zaman || 'gün'], kart_tipi: rt.kart_tipi || null, kart_config: rt.kart_config || null, puan: puan || null, kaynak_etiket: 'Mezun', aktif: true, sablon_id: rt.sablon_id || null });
    }
    await supabase.from('dog_rituals').update({ mezun: true, aktif: false, bitis: today }).eq('id', rt.id);
    setMezunModal(null); setMezunPuan(0); setDetay(null);
    loadActivities(); loadData(client.id);
  }
  // Programın tüm (tarihli) adımlarının bitişini topluca ±gün kaydır.
  async function programSureDegis(pid: string, delta: number) {
    if (!client) return;
    for (const r of rituals.filter((x) => x.program === pid && x.bitis)) {
      const e = parseD(r.bitis); e.setDate(e.getDate() + delta);
      await supabase.from('dog_rituals').update({ bitis: iso(e) }).eq('id', r.id);
    }
    loadData(client.id);
  }
  async function moodKaydet(ritId: string, deger: number) {
    if (!client) return;
    await supabase.from('dog_measurements').delete().eq('client_id', client.id).eq('anahtar', 'ruh_hali').eq('tarih', today);
    await supabase.from('dog_measurements').insert({ client_id: client.id, anahtar: 'ruh_hali', deger, tarih: today });
    const m = await supabase.from('dog_measurements').select('tarih,anahtar,deger,birim').eq('client_id', client.id).order('tarih', { ascending: true }).limit(80);
    setMeas(m.data || []);
    if (!ritDone(ritId)) toggleRit(ritId);
  }
  // Ölçüm kartından gelen değerleri dog_measurements'a yaz (gün bazında upsert) → Gelişim grafiğine düşer.
  async function olcumKaydet(ritId: string, vals: { anahtar: string; deger: number; birim: string | null }[]) {
    if (!client || !vals.length) return;
    for (const v of vals) {
      await supabase.from('dog_measurements').delete().eq('client_id', client.id).eq('anahtar', v.anahtar).eq('tarih', today);
      await supabase.from('dog_measurements').insert({ client_id: client.id, anahtar: v.anahtar, deger: v.deger, birim: v.birim, tarih: today });
    }
    const m = await supabase.from('dog_measurements').select('tarih,anahtar,deger,birim').eq('client_id', client.id).order('tarih', { ascending: true }).limit(80);
    setMeas(m.data || []);
    if (!ritDone(ritId)) toggleRit(ritId);
  }
  // Gün içinde birikimli ölçüm (su, odak dk): mevcut bugünkü değere delta ekler, upsert eder. Pomodoro/Su kartları kullanır.
  async function biriktirKaydet(ritId: string, anahtar: string, delta: number, birim: string | null) {
    if (!client) return;
    const gunluk = meas.filter((m) => m.anahtar === anahtar && m.tarih === today);
    const eski = gunluk.length ? Number(gunluk[gunluk.length - 1].deger) : 0;
    const yeni = Math.max(0, eski + delta);
    await supabase.from('dog_measurements').delete().eq('client_id', client.id).eq('anahtar', anahtar).eq('tarih', today);
    await supabase.from('dog_measurements').insert({ client_id: client.id, anahtar, deger: yeni, birim, tarih: today });
    const m = await supabase.from('dog_measurements').select('tarih,anahtar,deger,birim').eq('client_id', client.id).order('tarih', { ascending: true }).limit(80);
    setMeas(m.data || []);
    if (!ritDone(ritId)) toggleRit(ritId);
  }
  async function programKaldir(pid: string, ad: string) {
    if (!client) return;
    if (!confirm('"' + ad + '" programının tüm ritüelleri ajandadan kaldırılsın mı?')) return;
    await supabase.from('dog_rituals').delete().eq('client_id', client.id).eq('program', pid);
    loadData(client.id);
  }
  async function yenidenBasla(id: string) {
    if (!client) return;
    await supabase.from('dog_rituals').update({ mezun: false, aktif: true, baslangic: today, bitis: null }).eq('id', id);
    loadData(client.id);
  }

  async function inboxSil(id: string) {
    await supabase.from('dog_inbox').delete().eq('id', id);
    if (client) loadInbox(client.id);
  }
  function openIbDetay(v: any) {
    setIbDetay(v); setIbdAd(v.baslik || ''); setIbdAcik(v.payload?.aciklama || ''); setIbdUrl((v.payload?.kartConfig && v.payload.kartConfig.url) || v.url || ''); setIbdTarih('');
  }
  async function ibKaydet() {
    if (!client || !ibDetay) return;
    const link = ibdUrl.trim();
    const payload: any = { ...(ibDetay.payload || {}) };
    if (ibdAcik.trim()) payload.aciklama = ibdAcik.trim(); else delete payload.aciklama;
    if (link) { payload.kartTipi = 'video'; payload.kartConfig = { url: link, done: false }; }
    else if (payload.kartTipi === 'video') { delete payload.kartTipi; delete payload.kartConfig; }
    await supabase.from('dog_inbox').update({ baslik: ibdAd.trim() || 'Not', url: link || null, payload: Object.keys(payload).length ? payload : null }).eq('id', ibDetay.id);
    setIbDetay({ ...ibDetay, baslik: ibdAd.trim() || 'Not', url: link || null, payload });
    loadInbox(client.id);
  }
  // Inbox kartını bir güne planla (randevu/gün) → ajandaya taşı, düzenlenen alanlarla.
  async function ibPlanla(ds: string) {
    if (!client || !ibDetay || !ds) return;
    const link = ibdUrl.trim();
    const p = ibDetay.payload || {};
    await supabase.from('dog_rituals').insert({ client_id: client.id, ad: ibdAd.trim() || 'Not', aciklama: ibdAcik.trim() || null, zaman: 'gün', kaynak: 'Inbox', tip: 'aliskanlik', url: link || null, kart_tipi: link ? 'video' : (p.kartTipi || null), kart_config: link ? { url: link, done: false } : (p.resim ? { resim: p.resim } : (p.kartConfig || null)), baslangic: ds, bitis: ds, aliskanlik: false, aktif: true, mezun: false, blok_sira: Date.now() });
    await supabase.from('dog_inbox').delete().eq('id', ibDetay.id);
    setIbDetay(null); loadInbox(client.id); loadData(client.id);
  }
  async function inboxToRitual(item: any, dayOffset: number) {
    if (!client) return;
    const d = parseD(today); d.setDate(d.getDate() + dayOffset); const ds = iso(d);
    const ad = item.baslik || 'Not';
    await supabase.from('dog_rituals').insert({ client_id: client.id, ad, zaman: 'gün', kaynak: 'Inbox', tip: 'aliskanlik', url: item.url || null, kart_tipi: item.payload?.kartTipi || null, kart_config: item.payload?.kartConfig || (item.payload?.resim ? { resim: item.payload.resim } : null), baslangic: ds, bitis: ds, aktif: true, mezun: false, blok_sira: Date.now() });
    await supabase.from('dog_inbox').delete().eq('id', item.id);
    loadInbox(client.id); loadData(client.id);
  }
  async function inboxAktiviteEkle(item: any, grup?: string) {
    if (!client) return;
    const p = item.payload || {};
    const g = (grup || '').trim();
    if (p.tur === 'program') {
      await supabase.from('dog_activities').insert({ client_id: client.id, tur: 'program', ad: p.ad, grup: g || 'Genel', adimlar: p.adimlar || [], sure_gun: p.sure_gun || null, faydalar: [], kaynak_etiket: 'Paylaşılan', aktif: true, sablon_id: p.sablon_id || null });
    } else {
      const alan0 = (p.faydalar && p.faydalar.length) ? (faydaList.find((f) => f.kod === p.faydalar[0])?.alan || null) : null;
      await supabase.from('dog_activities').insert({ client_id: client.id, tur: 'aktivite', ad: p.ad, grup: g || alan0 || 'Genel', faydalar: p.faydalar || [], aciklama: p.aciklama || null, videolar: p.videolar || null, zaman: p.zaman || 'gün', zamanlar: p.zamanlar || null, gunler: p.gunler || null, sure_gun: p.sure_gun || null, kart_tipi: p.kartTipi || null, kart_config: p.kartConfig || null, kaynak_etiket: 'Paylaşılan', aktif: true });
    }
    await supabase.from('dog_inbox').delete().eq('id', item.id);
    setIbGrupSec(null); setIbGrupVal('Genel');
    loadActivities(); loadInbox(client.id);
  }
  // Paylaşılanı doğrudan ajandaya al (gönderenin varsayılan zamanlaması / program adımlarıyla).
  async function inboxAktiviteAjanda(item: any) {
    if (!client) return;
    const p = item.payload || {};
    if (p.tur === 'program') {
      await programBaslat({ ad: p.ad, adimlar: p.adimlar || [], sure_gun: p.sure_gun || null, sablon_id: p.sablon_id || null });
    } else {
      const alan0 = (p.faydalar && p.faydalar.length) ? (faydaList.find((f) => f.kod === p.faydalar[0])?.alan || null) : null;
      const slots = p.zamanlar && p.zamanlar.length ? p.zamanlar : [p.zaman || 'gün'];
      for (const s of slots) await ritEkle(p.ad || item.baslik, s, 'Paylaşılan', 'aliskanlik', alan0, null, p.faydalar || [], (p.videolar && p.videolar[0]?.url) || null, p.gunler || null, p.sure_gun || null, null, null, false, 0, null, 0, p.kartTipi || null, p.kartConfig || null, typeof p.aliskanlik === 'boolean' ? p.aliskanlik : null);
      loadData(client.id);
    }
    await supabase.from('dog_inbox').delete().eq('id', item.id);
    loadInbox(client.id); setScreen('ajanda');
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
  // Tarihsiz (baslangic yok) ritüel = Inbox kartı; ajandada görünmez.
  const activeOn = (r: any, d: string) => !!r.baslangic && r.baslangic <= d && (!r.bitis || d <= r.bitis) && (!r.gunler || r.gunler.length === 0 || r.gunler.includes(wday(d)));
  const habits = rituals.filter((r) => !r.mezun && activeOn(r, day));
  const mezunlar = rituals.filter((r) => r.mezun);
  // Çalışan programlar: program kimliğine göre grupla (ilerleme + süre kontrolü için).
  const programGruplari = Object.values(rituals.filter((r) => r.program && !r.mezun).reduce((acc: any, r: any) => {
    const g = acc[r.program] || (acc[r.program] = { pid: r.program, ad: r.program_ad || 'Program', bas: r.baslangic || today, bit: r.bitis || null, n: 0 });
    g.n++;
    if (r.baslangic && r.baslangic < g.bas) g.bas = r.baslangic;
    if (r.bitis && (!g.bit || r.bitis > g.bit)) g.bit = r.bitis;
    return acc;
  }, {} as any)) as any[];
  const faydaMap: Record<string, any> = {};
  faydaList.forEach((f) => { faydaMap[f.kod] = f; });
  const ritAreas = (rt: any): string[] => {
    if (rt.faydalar && rt.faydalar.length) return Array.from(new Set(rt.faydalar.map((k: string) => faydaMap[k]?.alan).filter(Boolean)));
    return rt.alan ? [rt.alan] : [];
  };
  const measByKey: Record<string, any[]> = {};
  meas.forEach((m) => { (measByKey[m.anahtar] = measByKey[m.anahtar] || []).push(m); });
  // Kartlara atanan opsiyonel "alan" (dikey) etiketinden ölçüm anahtarı → dikey haritası çıkar (OLCU_ALAN'ın statik tahminine göre öncelikli).
  const anahtarDikey: Record<string, string> = {};
  rituals.forEach((r) => {
    const dikey = r.kart_config?.dikey;
    if (!dikey) return;
    if (r.kart_tipi === 'olcum') (r.kart_config?.alanlar || []).forEach((a: any) => { if (a?.anahtar) anahtarDikey[a.anahtar] = dikey; });
    else if (r.kart_tipi === 'ruhhali') anahtarDikey['ruh_hali'] = dikey;
    else if (r.kart_tipi === 'pomodoro') anahtarDikey['odak_dk'] = dikey;
    else if (r.kart_tipi === 'su') anahtarDikey['su'] = dikey;
  });
  const days7 = lastDays(7);
  const last30 = lastDays(30);
  const weekArr = weekDays(day);
  const gelHabits = rituals;
  const uyumHabits = rituals.filter((r) => r.aliskanlik && !r.mezun);
  const weekHabits = rituals.filter((r) => r.aliskanlik && weekArr.some((d) => activeOn(r, d)));
  const beslenmePlan = plans.find((p) => p.vertical === 'beslenme');
  const ibBadge = inbox.filter((x) => x.durum === 'yeni').length;
  const curatedActs = activities.filter((a) => !a.client_id && a.tur !== 'program');
  const personalActs = activities.filter((a) => a.client_id === client.id);
  const actGroups = curatedActs.map((a) => a.grup).filter((v, i, arr) => arr.indexOf(v) === i);
  const personalGroupOf = (a: any) => a.grup && a.grup !== 'Kişisel' ? a.grup : 'Genel';
  const personalGroups = personalActs.map(personalGroupOf).filter((v, i, arr) => arr.indexOf(v) === i);

  function RitItem({ rt }: { rt: any }) {
    const done = ritDone(rt.id);
    const total = ritTotal(rt.id);
    const tip = rt.kart_tipi || 'standart';
    const cfg = rt.kart_config || {};
    const noDone = tip === 'anket' || tip === 'coktan' || tip === 'nefes' || tip === 'ruhhali' || tip === 'tarif' || tip === 'sukran' || tip === 'topraklama' || tip === 'pomodoro' || tip === 'beden' || tip === 'uykuoncesi' || tip === 'su' || tip === 'maruz' || tip === 'niyet' || tip === 'workout' || (tip === 'video' && cfg.done === false) || (tip === 'randevu' && cfg.done === false);
    const vurl = tip === 'video' ? (cfg.url || rt.url) : rt.url;
    const ipucu = tip === 'anket' ? '📋 doldur' : tip === 'coktan' ? '❓ yanıtla' : tip === 'diyet' ? '🍽 öğün' : tip === 'tarif' ? '🍳 tarif' : tip === 'video' ? '🎬 izle' : tip === 'nefes' ? '🫁 nefes' : tip === 'ruhhali' ? '🙂 check-in' : tip === 'workout' ? '🏋️ egzersiz' : tip === 'bilgi' ? '📄 oku' : tip === 'sukran' ? '🙏 şükran' : tip === 'topraklama' ? '🖐 topraklan' : tip === 'pomodoro' ? '🍅 odaklan' : tip === 'beden' ? '🧘 taransın' : tip === 'uykuoncesi' ? '🌙 hazırlan' : tip === 'su' ? '💧 iç' : tip === 'maruz' ? '🎯 uygula' : tip === 'niyet' ? '🧭 niyet belirle' : tip === 'randevu' ? '📅 randevu' : '';
    const meridyen = rt.kaynak === 'Meridyen'; // sağlayıcı-kaynaklı kart — kişisel kartlardan çerçeveyle ayrıştır
    return (
      <div>
        <div className={'rit' + (meridyen ? ' rit-mer' : '')}>
          <div className={'chk' + (done ? ' on' : '')} onClick={() => (noDone ? openRit(rt) : toggleRit(rt.id))} title={noDone ? 'Aç' : 'Yaptım'}>{done ? '✓' : (noDone ? kartIkon(tip) : '')}</div>
          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openRit(rt)}>
            <div className="t">{rt.ad}
              {ritAreas(rt).map((a) => <span key={a} className="tagp p-alan">{a}</span>)}
              {cfg.dikey && DIKEY_LABEL[cfg.dikey] && <span className="tagp p-dikey">{DIKEY_LABEL[cfg.dikey]}</span>}
            </div>
            <div className="m">{[rt.hatirlatma_saat && '🔔 ' + rt.hatirlatma_saat, rt.bitis && 'bitiş ' + kisaTarih(rt.bitis), ipucu].filter(Boolean).join(' · ')}</div>
          </div>
          {vurl && <a className="playbtn" href={vurl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Aç">▶</a>}
          <button className="rmx" onClick={() => ritSil(rt.id)} title="Kaldır">✕</button>
        </div>
        {!rt.mezun && !rt.bitis && rt.aliskanlik && total >= 21 && (
          <div className="retirebox">🎉 <div>&quot;{rt.ad}&quot; {total} kez yapıldı — artık otomatik. <b>Mezun edip</b> listeni sadeleştirelim mi?</div><button className="rb" onClick={() => { setMezunPuan(0); setMezunModal(rt); }}>Mezun et</button></div>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <div className="hd">
        <div className="b">Rite <span>· {client.ad}</span></div>
        <button className="ibtn" onClick={() => { setInboxOpen(true); if (client) loadInbox(client.id); }}>📥{ibBadge > 0 && <span className="bdg">{ibBadge}</span>}</button>
      </div>

      <div className="main">
        {/* ---------- AJANDA ---------- */}
        {screen === 'ajanda' && (
          <div>
            <div className="ajhead">
              <h2>Ajanda</h2>
              <div className="vswitch">
                <div className={'vseg' + (ajView === 'gun' ? ' on' : '')} onClick={() => setAjView('gun')}>Gün</div>
                <div className={'vseg' + (ajView === 'ay' ? ' on' : '')} onClick={() => setAjView('ay')}>📅 Ay</div>
              </div>
            </div>
            <div className="datenav">
              <button className="arrow" onClick={() => (ajView === 'ay' ? shiftMonth(-1) : shiftDay(-1))}>‹</button>
              <div className="dlabel" onClick={() => setSelDate(today)}>
                {ajView === 'ay' ? ayLabel(day) : dayLabel(day)}
                {day !== today && <div className="totoday">↺ bugüne dön</div>}
              </div>
              <button className="arrow" onClick={() => (ajView === 'ay' ? shiftMonth(1) : shiftDay(1))}>›</button>
            </div>

            {ajView === 'gun' && (
              <div className="weekstrip">
                {weekDays(day).map((d) => {
                  const dt = parseD(d);
                  return (
                    <div key={d} className={'wday' + (d === day ? ' on' : '') + (d === today ? ' today' : '')} onClick={() => setSelDate(d)}>
                      <div className="wl">{WD[wday(d)]}</div>
                      <div className="wn">{dt.getDate()}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {ajView === 'gun' && habits.length > 0 && (() => {
              const doneCount = habits.filter((r) => ritDone(r.id)).length;
              const pct = Math.round((doneCount / habits.length) * 100);
              return (
                <div className="dayprog">
                  <div className="bar"><i style={{ width: pct + '%' }} /></div>
                  <span className="lbl">{doneCount}/{habits.length} tamamlandı</span>
                </div>
              );
            })()}

            {programGruplari.length > 0 && <div style={{ marginBottom: 4 }}>{programGruplari.map((g) => {
              const gunNo = Math.max(1, Math.round((parseD(today).getTime() - parseD(g.bas).getTime()) / 86400000) + 1);
              const toplam = g.bit ? Math.round((parseD(g.bit).getTime() - parseD(g.bas).getTime()) / 86400000) + 1 : null;
              const pct = toplam ? Math.min(100, Math.round(gunNo / toplam * 100)) : 0;
              const bitti = toplam ? gunNo > toplam : false;
              return (
                <div key={g.pid} className="card" style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <b>🧩 {g.ad}</b>
                    <span className="note" style={{ margin: 0, whiteSpace: 'nowrap' }}>{toplam ? (bitti ? '✓ tamamlandı' : 'gün ' + Math.min(gunNo, toplam) + '/' + toplam) : 'gün ' + gunNo}</span>
                  </div>
                  {toplam && <div className="track" style={{ marginTop: 4 }}><div className="fill" style={{ width: pct + '%' }} /></div>}
                  <div className="rowbtns" style={{ marginTop: 6 }}>
                    <button className="btn ghost sm" onClick={() => programSureDegis(g.pid, 7)}>+7 gün</button>
                    <button className="btn ghost sm" onClick={() => programSureDegis(g.pid, -7)}>−7 gün</button>
                    <button className="btn ghost sm" style={{ color: 'var(--red)', borderColor: '#e6c4bd' }} onClick={() => programKaldir(g.pid, g.ad)}>Kaldır</button>
                  </div>
                </div>
              );
            })}</div>}

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
                {(() => {
                  // Zaman dilimleri artık kutu değil — sürüklenemeyen (disabled) birer ayraç satırı; kartların
                  // hepsi TEK akışta, bir ayracın öbür tarafına bırakılınca zaman dilimi de değişir (onDragEndDay).
                  const rows: any[] = [];
                  SLOTS.forEach(([z, lbl]) => {
                    rows.push({ key: 'div:' + z, kind: 'divider', z, lbl });
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
                    items.forEach((it) => rows.push({ ...it, kind: 'item' }));
                  });

                  const itemBody = (it: any) => it.rutin ? (
                    <div className="card routine">
                      <div className="chain">
                        {it.members.map((rt: any, i: number) => {
                          const done = ritDone(rt.id);
                          return (
                            <div key={rt.id} className="cstep">
                              <div className={'cdot' + (done ? ' on' : '')} onClick={() => toggleRit(rt.id)}>{done ? '✓' : ''}</div>
                              <div className="cbody" style={{ cursor: 'pointer' }} onClick={() => openRit(rt)}><div className="t">{i === 0 && <span style={{ marginRight: 4 }}>🔗</span>}{rt.ad}{ritAreas(rt).map((a) => <span key={a} className="tagp p-alan">{a}</span>)}{rt.kart_config?.dikey && DIKEY_LABEL[rt.kart_config.dikey] && <span className="tagp p-dikey">{DIKEY_LABEL[rt.kart_config.dikey]}</span>}</div><div className="m">{rt.hatirlatma_saat ? '🔔 ' + rt.hatirlatma_saat + ' · ' : ''}toplam {ritTotal(rt.id)}</div></div>
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
                    <div className="card" style={{ padding: '4px 10px' }}><RitItem rt={it.members[0]} /></div>
                  );

                  return (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onDragEndDay(rows, e)}>
                      <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
                        {rows.map((r) => r.kind === 'divider' ? (
                          <SortableRow key={r.key} id={r.key} disabled>
                            <div className="timediv">
                              <span className="tl">{r.lbl}</span>
                              <span className="ln" />
                              <button className="slotadd" onClick={() => setSlotAddOpen(r.z)} aria-label="ekle">+</button>
                            </div>
                          </SortableRow>
                        ) : (
                          <SortableRow key={r.key} id={r.key}>
                            {itemBody(r)}
                          </SortableRow>
                        ))}
                      </SortableContext>
                    </DndContext>
                  );
                })()}

                {pushMsg && <div className="msg">{pushMsg}</div>}
              </div>
            ))}

            {ajView === 'ay' && (() => {
              const base = parseD(day); const y = base.getFullYear(), mo = base.getMonth();
              const startDow = (new Date(y, mo, 1).getDay() + 6) % 7; // Pzt=0
              const gunSay = new Date(y, mo + 1, 0).getDate();
              const cells: (string | null)[] = [];
              for (let i = 0; i < startDow; i++) cells.push(null);
              for (let d = 1; d <= gunSay; d++) cells.push(iso(new Date(y, mo, d)));
              while (cells.length % 7) cells.push(null);
              return (
                <div className="card">
                  <div className="calhead">{['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((w) => <span key={w}>{w}</span>)}</div>
                  <div className="calgrid">
                    {cells.map((ds, i) => {
                      if (!ds) return <div key={i} className="calcell empty" />;
                      // Sayıma yalnız "yapılabilir" (done'lanabilir) ritüeller: mesaj tipi video (done:false) hariç.
                      const gunRit = rituals.filter((r) => !r.mezun && activeOn(r, ds) && !(r.kart_tipi === 'video' && r.kart_config && r.kart_config.done === false));
                      const n = gunRit.length;
                      const done = gunRit.filter((r) => logs.some((l) => l.ritual_id === r.id && l.tarih === ds && l.yapildi)).length;
                      return (
                        <button key={i} className={'calcell' + (ds === today ? ' today' : '') + (ds === day ? ' sel' : '')} onClick={() => { setSelDate(ds); setAjView('gun'); }}>
                          <span className="calnum">{parseD(ds).getDate()}</span>
                          {n > 0 && <span className={'calcount' + (done >= n ? ' full' : '')}>{done}/{n}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="note" style={{ marginTop: 6 }}>Her günde yapılan/planlanan task. Bir güne dokun → o güne git.</div>
                </div>
              );
            })()}

            {ajView === 'ay' && (() => {
              const randevular = rituals.filter((r) => !r.mezun && r.baslangic && r.baslangic === r.bitis && r.baslangic >= today).sort((a, b) => (a.baslangic < b.baslangic ? -1 : 1));
              if (randevular.length === 0) return null;
              return (
                <div style={{ marginTop: 10 }}>
                  <div className="tod">📅 Yaklaşan randevular</div>
                  {randevular.map((r) => (
                    <div key={r.id} className="actcard" onClick={() => openRit(r)}>
                      <div style={{ flex: 1 }}>
                        <div className="n">{kartIkon(r.kart_tipi) || '📅'} {r.ad}</div>
                        <div className="o">{dayLabel(r.baslangic)}{r.hatirlatma_saat ? ' · 🔔 ' + r.hatirlatma_saat : ''}</div>
                      </div>
                      <span className="go">›</span>
                    </div>
                  ))}
                </div>
              );
            })()}

          </div>
        )}

        {/* ---------- HAVUZ ---------- */}
        {screen === 'havuz' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h2 style={{ margin: 0 }}>Aktivite Havuzu</h2>
              <button className="btn sm" onClick={() => openStudioNew(havuzTop === 'kisisel' && actGroup !== 'Genel' ? actGroup : undefined)}>＋ Yeni</button>
            </div>
            <p className="sub">Kendi aktiviteni <b>＋ Yeni</b> ile oluştur ya da hazır gruplardan seç.</p>
            {addSlot && <div className="banner">➕ <div><b>{SLOTS.find((t) => t[0] === addSlot)?.[1]}</b>&apos;a ekleniyor — bir aktivite seç.</div><button className="bb" onClick={() => setAddSlot(null)}>İptal</button></div>}
            <div className="vswitch">
              <div className={'vseg' + (havuzTop === 'kisisel' ? ' on' : '')} onClick={() => { setHavuzTop('kisisel'); setActGroup(personalGroups[0] || 'Genel'); }}>Kişisel</div>
              <div className={'vseg' + (havuzTop === 'wellbeing' ? ' on' : '')} onClick={() => { setHavuzTop('wellbeing'); setActGroup(actGroups[0] || ''); }}>Well-being</div>
            </div>
            {havuzTop === 'kisisel' ? (
              <>
                <div className="tabs">
                  {personalGroups.map((g) => <div key={g} className={'tab' + (actGroup === g ? ' on' : '')} onClick={() => setActGroup(g)}>{g}</div>)}
                  <div className="tab" onClick={() => openStudioNew()}>＋ yeni grup</div>
                </div>
                <div className="card">
                  {personalActs.filter((a) => personalGroupOf(a) === actGroup).length === 0 ? (
                    <div className="note">Bu grupta kişisel aktivite yok. <button className="linkbtn" onClick={() => openStudioNew(actGroup)}>＋ Tasarla</button> ile oluştur.</div>
                  ) : personalActs.filter((a) => personalGroupOf(a) === actGroup).map((a) => (
                    <div key={a.id} className="actcard" onClick={() => openDetay(a, 'aktivite')}>
                      <div style={{ flex: 1 }}><div className="n">{a.tur === 'program' ? '🧩 ' : ''}{a.ad}{a.puan ? <span className="puanp"> {'★'.repeat(a.puan)}</span> : ''}</div><div className="o">{a.tur === 'program' ? (a.adimlar || []).length + ' adım' + (a.sure_gun ? ' · ' + a.sure_gun + ' gün' : '') : (a.kaynak_etiket === 'Mezun' ? 'Mezun · ' : '') + Array.from(new Set((a.faydalar || []).map((k: string) => faydaMap[k]?.alan).filter(Boolean))).join(' · ')}</div></div>
                      <span className="go">›</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="tabs">
                  {actGroups.map((g) => <div key={g} className={'tab' + (actGroup === g ? ' on' : '')} onClick={() => setActGroup(g)}>{g}</div>)}
                </div>
                <div className="card">
                  {curatedActs.filter((a) => a.grup === actGroup).map((a) => (
                    <div key={a.id} className="actcard" onClick={() => openDetay(a, 'aktivite')}>
                      <div style={{ flex: 1 }}><div className="n">{a.ad}</div><div className="o">{a.ozet || ''}</div></div>
                      <span className="go">›</span>
                    </div>
                  ))}
                  {curatedActs.filter((a) => a.grup === actGroup).length === 0 && <div className="note">Bu grupta aktivite yok.</div>}
                </div>
              </>
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
            {measByKey['ruh_hali'] && <div className="card"><h3>Ruh hali (son 7 gün)</h3>
              <div style={{ fontSize: 24, letterSpacing: 6 }}>{measByKey['ruh_hali'].slice(-7).map((m: any, i: number) => <span key={i} title={m.tarih}>{MOOD[Math.round(Number(m.deger)) - 1] || '·'}</span>)}</div>
              {(() => { const arr = measByKey['ruh_hali'].slice(-7).map((m: any) => Number(m.deger)); const ort = arr.reduce((a: number, b: number) => a + b, 0) / arr.length; return <div className="note" style={{ marginTop: 4 }}>Ortalama: {MOOD[Math.round(ort) - 1]} ({ort.toFixed(1)}/5)</div>; })()}
            </div>}
            {uyumHabits.length > 0 && <div className="card"><h3>Alışkanlık serileri 🔥</h3>
              {(() => { const rows = uyumHabits.map((r) => ({ r, s: ritStreak(r) })).sort((a, b) => b.s - a.s); return rows.map(({ r, s }) => (
                <div key={r.id} className="mrow"><span>{r.ad}</span><b>{s > 0 ? '🔥 ' + s + ' gün' : '—'}</b></div>
              )); })()}
              <div className="soul">Seri = art arda yaptığın gün sayısı; bugünü kaçırmadıysan kırılmaz. Kısa seri de bir başlangıç.</div>
            </div>}
            <div className="card"><h3>Bu hafta (alışkanlık ızgarası)</h3>
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
            <div className="card"><h3>Ölçümler</h3>
              {(() => {
                const keys = Object.keys(measByKey).filter((k) => k !== 'ruh_hali');
                if (keys.length === 0) return <div className="note">Ölçüm kartıyla girdiğinde ya da koçun girince burada grafikleşir.</div>;
                const gruplar: Record<string, string[]> = {};
                keys.forEach((k) => {
                  const alan = (anahtarDikey[k] && DIKEY_LABEL[anahtarDikey[k]]) || OLCU_ALAN[k] || 'Diğer';
                  (gruplar[alan] = gruplar[alan] || []).push(k);
                });
                return ALAN_SIRA.filter((a) => gruplar[a]).map((alan) => (
                  <div key={alan} style={{ marginBottom: 6 }}>
                    <div className="note" style={{ margin: '4px 0 2px', fontWeight: 800, textTransform: 'uppercase', fontSize: 10, letterSpacing: .3 }}>{alan}</div>
                    {gruplar[alan].map((k) => {
                      const arr = measByKey[k]; const l = arr[arr.length - 1];
                      const son = arr.slice(-7).map((m: any) => Number(m.deger)); const mn = Math.min(...son), mx = Math.max(...son);
                      return <div key={k} className="mrow"><span>{OLCU_ETIKET[k] || k}<span className="msprk">{son.map((v: number, i: number) => <i key={i} style={{ height: (mx > mn ? ((v - mn) / (mx - mn)) * 100 : 50) + '%' }} />)}</span></span><b>{l.deger} {l.birim || ''}</b></div>;
                    })}
                  </div>
                ));
              })()}
            </div>
            <div className="card"><h3>Alışkanlık uyumu (bu hafta)</h3>
              <div className="mrow" style={{ borderTop: 'none' }}><span>Tamamlanan</span><b>%{(() => { let act = 0, done = 0; days7.forEach((d) => uyumHabits.forEach((r) => { if (activeOn(r, d)) { act++; if (logs.some((l) => l.ritual_id === r.id && l.tarih === d && l.yapildi)) done++; } })); return act ? Math.round((done / act) * 100) : 0; })()}</b></div>
            </div>
            <div className="card"><h3>Aylık alışkanlık uyumu (aktif günlere göre)</h3>
              {(() => {
                const rows = uyumHabits.map((rt) => {
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
        {inboxOpen && (
          <div className="modal top" onClick={() => setInboxOpen(false)}>
          <div className="sheet topsheet" onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setInboxOpen(false)}>×</button>
            <h2 style={{ marginTop: 2 }}>📥 Inbox</h2>
            <div className="note" style={{ marginTop: 0 }}>Başkalarının seninle paylaştığı kartlar burada birikir. <button className="btn ghost sm" style={{ marginLeft: 6 }} onClick={() => client && loadInbox(client.id)}>🔄 Yenile</button></div>
            {inbox.length === 0 && <div className="note" style={{ textAlign: 'center', marginTop: 10 }}>Inbox boş. Sana bir şey paylaşıldığında burada göreceksin. Kendi notunu/randevunu eklemek için zaman dilimindeki + butonunu kullan.</div>}
            {inbox.map((v) => v.tur !== 'aktivite' ? (
              <InboxNot key={v.id} v={v} onOpen={() => openIbDetay(v)} />
            ) : (
              <div key={v.id} className="card">
                {(
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>🎁 {v.baslik || v.payload?.ad}</div>
                    <div className="note" style={{ margin: '2px 0' }}>{v.payload?.from_ad ? 'Kimden: ' + v.payload.from_ad : 'Paylaşım'}{v.from_code ? ' · ' + v.from_code : ''}</div>
                    {(v.payload?.faydalar || []).length > 0 && <div>{Array.from(new Set((v.payload.faydalar || []).map((k: string) => faydaMap[k]?.alan).filter(Boolean))).map((a: any) => <span key={a} className="tagp p-alan">{a}</span>)}</div>}
                    {v.payload?.aciklama && <div className="note" style={{ marginTop: 4 }}>{v.payload.aciklama}</div>}
                    {ibGrupSec === v.id && (
                      <div style={{ margin: '6px 0' }}>
                        <label className="fldlbl" style={{ marginTop: 0 }}>Hangi grupta saklansın?</label>
                        {personalGroups.length > 0 && <div style={{ margin: '2px 0 6px' }}>{personalGroups.map((g) => <span key={g} className={'chip' + (ibGrupVal === g ? ' on' : '')} onClick={() => setIbGrupVal(g)}>{g}</span>)}</div>}
                        <input value={ibGrupVal} onChange={(e) => setIbGrupVal(e.target.value)} placeholder="ör. Genel, Beslenme… (yeni grup için yaz)" />
                        <div className="rowbtns" style={{ marginTop: 6 }}>
                          <button className="btn sm" onClick={() => inboxAktiviteEkle(v, ibGrupVal)}>Kaydet</button>
                          <button className="btn ghost sm" onClick={() => { setIbGrupSec(null); setIbGrupVal('Genel'); }}>Vazgeç</button>
                        </div>
                      </div>
                    )}
                    <div className="rowbtns">
                      {v.durum === 'alindi'
                        ? <span className="note" style={{ margin: 0, color: 'var(--green)', fontWeight: 700 }}>✓ Alındı</span>
                        : ibGrupSec !== v.id && <>
                            <button className="btn ghost sm" onClick={() => inboxAktiviteAjanda(v)}>Ajandama ekle</button>
                            <button className="btn ghost sm" onClick={() => { setIbGrupSec(v.id); setIbGrupVal('Genel'); }}>Havuzuma ekle</button>
                          </>}
                      <button className="btn ghost sm" style={{ color: 'var(--red)', borderColor: '#e6c4bd' }} onClick={() => inboxSil(v.id)}>Sil</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          </div>
        )}

        {ibDetay && (
          <div className="modal top" onClick={() => setIbDetay(null)}>
          <div className="sheet topsheet" onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setIbDetay(null)}>×</button>
            <input className="detbaslik" value={ibdAd} onChange={(e) => setIbdAd(e.target.value)} onBlur={ibKaydet} placeholder="Başlık" />
            {ibDetay.payload?.resim && <img src={ibDetay.payload.resim} alt="" style={{ maxWidth: '100%', borderRadius: 8, margin: '4px 0', display: 'block' }} />}
            {ibdUrl.trim() && /^https?:\/\//i.test(ibdUrl.trim()) && <div style={{ margin: '4px 0' }}><EmbedVideo url={ibdUrl.trim()} /></div>}
            <label className="fldlbl">Açıklama</label>
            <textarea value={ibdAcik} onChange={(e) => setIbdAcik(e.target.value)} onBlur={ibKaydet} placeholder="Açıklama / not…" style={{ width: '100%', minHeight: 44 }} />
            <label className="fldlbl">Video linki (ops.)</label>
            <input value={ibdUrl} onChange={(e) => setIbdUrl(e.target.value)} onBlur={ibKaydet} placeholder="https://youtube.com/… (girince video kartı olur)" />
            <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 10 }}>
              <label className="fldlbl" style={{ marginTop: 0 }}>Ne zaman?</label>
              <div className="rowbtns">
                <button className="btn ghost sm" onClick={() => ibPlanla(today)}>→ Bugüne</button>
                <button className="btn ghost sm" onClick={() => { const d = parseD(today); d.setDate(d.getDate() + 1); ibPlanla(iso(d)); }}>→ Yarına</button>
              </div>
              <div className="rowbtns" style={{ marginTop: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>📅</span>
                <input type="date" min={today} value={ibdTarih} onChange={(e) => setIbdTarih(e.target.value)} style={{ width: 'auto' }} />
                <button className="btn sm" disabled={!ibdTarih} onClick={() => ibPlanla(ibdTarih)}>Randevu (o güne)</button>
              </div>
              <div className="note">Tarihsizken Inbox'ta kalır. Bir gün seçince ajandaya taşınır.</div>
            </div>
            <div style={{ textAlign: 'center', marginTop: 10 }}><button className="btn ghost sm" style={{ color: 'var(--red)', borderColor: '#e6c4bd' }} onClick={() => { inboxSil(ibDetay.id); setIbDetay(null); }}>Sil</button></div>
          </div>
          </div>
        )}

        {/* ---------- HIZLI EKLE (zaman dilimi +) ---------- */}
        {slotAddOpen && (
          <div className="modal" onClick={() => { hzReset(); setSlotAddOpen(null); }}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <button className="x" onClick={() => { hzReset(); setSlotAddOpen(null); }}>×</button>
              <h2 style={{ marginTop: 2 }}>{SLOTS.find((t) => t[0] === slotAddOpen)?.[1]}&apos;a ekle</h2>
              <button className="btn ghost" style={{ width: '100%', marginTop: 6 }} onClick={() => { const z = slotAddOpen; hzReset(); setAddSlot(z); setSlotAddOpen(null); setScreen('havuz'); }}>📚 Havuzdan seç</button>
              <div className="note" style={{ textAlign: 'center', margin: '8px 0' }}>— ya da hızlı ekle —</div>
              <label className="fldlbl" style={{ marginTop: 0 }}>Başlık</label>
              <input value={hzAd} onChange={(e) => setHzAd(e.target.value)} placeholder="ör. Su iç, Doktor görüşmesi…" />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={hzRandevu} onChange={(e) => setHzRandevu(e.target.checked)} /> Bu bir görüşme randevusu</label>
              {hzRandevu ? (
                <>
                  <label className="fldlbl">Saat (ops.)</label>
                  <input type="time" value={hzSaat} onChange={(e) => setHzSaat(e.target.value)} style={{ width: 'auto' }} />
                  <div style={{ margin: '6px 0' }}>{RANDEVU_FORMAT.map(([f, l]) => <span key={f} className={'chip' + (hzFormat === f ? ' on' : '')} onClick={() => setHzFormat(f)}>{l}</span>)}</div>
                  <label className="fldlbl">{hzFormat === 'online' ? 'Görüşme linki (ops.)' : 'Adres (ops.)'}</label>
                  <input value={hzYer} onChange={(e) => setHzYer(e.target.value)} placeholder={hzFormat === 'online' ? 'https://…' : 'Adres'} />
                  <label className="fldlbl">Not (ops.)</label>
                  <textarea value={hzNot} onChange={(e) => setHzNot(e.target.value)} style={{ width: '100%', minHeight: 44 }} />
                </>
              ) : (
                <>
                  <label className="fldlbl">Video linki (ops.)</label>
                  <input value={hzLink} onChange={(e) => setHzLink(e.target.value)} placeholder="https://…" />
                </>
              )}
              <div className="rowbtns" style={{ marginTop: 10 }}>
                <button className="btn" onClick={hizliEkle} disabled={!hzAd.trim()}>Ekle</button>
                <button className="btn ghost sm" onClick={() => { hzReset(); setSlotAddOpen(null); }}>Vazgeç</button>
              </div>
            </div>
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
            <div className="card"><h3>Profil</h3>
              <label className="fldlbl" style={{ marginTop: 0 }}>Görünen adın (paylaşımlarında "kimden" olarak görünür)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={profilAd} onChange={(e) => setProfilAd(e.target.value)} placeholder="ör. Behnan" />
                <button className="btn sm" style={{ whiteSpace: 'nowrap' }} onClick={profilKaydet}>Kaydet</button>
              </div>
            </div>
            <div className="card"><h3>Paylaşım</h3>
              <div className="mrow" style={{ borderTop: 'none' }}><span>Paylaşım kodun</span><b style={{ letterSpacing: 1 }}>{client.share_code || '…'}</b></div>
              <div className="note" style={{ marginTop: 2 }}>Bu kodu verdiğin kişiler sana ritüel/aktivite yollayabilir; sen de aşağıda tanımladığın kişilere paylaşırsın.</div>
              <label className="fldlbl">Kişiler</label>
              {kisiler.length === 0 ? <div className="note" style={{ marginTop: 0 }}>Henüz kişi yok.</div> : kisiler.map((ki, i) => (
                <div key={i} className="mrow"><span>{ki.ad} <span className="note" style={{ margin: 0 }}>· {ki.kod}</span></span><button className="btn ghost sm" style={{ color: 'var(--red)', borderColor: '#e6c4bd' }} onClick={() => kisiSil(i)}>Sil</button></div>
              ))}
              <div className="grid" style={{ marginTop: 6 }}>
                <div><input value={kiAd} onChange={(e) => setKiAd(e.target.value)} placeholder="Ad (ör. Eşim)" /></div>
                <div style={{ display: 'flex', gap: 6 }}><input value={kiKod} onChange={(e) => setKiKod(e.target.value)} placeholder="RT-XXXXX" autoCapitalize="characters" /><button className="btn sm" onClick={kisiEkle}>Ekle</button></div>
              </div>
            </div>
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

      {detay && (() => {
        const isRit = detay.tur === 'ritual';
        const o = detay.obj;
        const act = detayAct;
        const areas = ritAreas(o);
        const fydNames = ((isRit ? o.faydalar : (act?.faydalar || o.faydalar)) || []).map((k: string) => faydaMap[k]?.ad || k);
        const hasBilgi = act && (act.ozet || act.aciklama || act.nasil || (act.videolar || []).length || (act.alternatifler || []).length || act.dikkat || act.kaynak);
        const personal = act && act.client_id;
        const isProg = !isRit && o.tur === 'program';
        // Ritüel bir Meridyen şablonundan geldiyse (sablon_id) ve şablon canlı olarak çekilebildiyse içerik ORADAN
        // okunur — koç şablonu güncellediğinde her yerde görünür. Şablon silinmiş/erişilemezse ritüelin kendi
        // (atandığı andaki) kopyasına sessizce düşer, içerik hiç kaybolmaz.
        const canliAdim = isRit && detaySablon ? (detaySablon.adimlar || [])[o.sablon_adim ?? 0] : null;
        const kTip = (isRit ? (canliAdim?.kartTipi || o.kart_tipi) : act?.kart_tipi) || 'standart';
        const kCfg = (isRit ? (canliAdim?.kartConfig || o.kart_config) : act?.kart_config) || {};
        const aciklamaGoster = isRit ? (canliAdim ? (canliAdim.aciklama || null) : o.aciklama) : o.aciklama;
        const noDone = kTip === 'anket' || kTip === 'coktan' || kTip === 'nefes' || kTip === 'ruhhali' || kTip === 'tarif' || kTip === 'sukran' || kTip === 'topraklama' || kTip === 'pomodoro' || kTip === 'beden' || kTip === 'uykuoncesi' || kTip === 'su' || kTip === 'maruz' || kTip === 'niyet' || kTip === 'workout' || (kTip === 'video' && kCfg.done === false) || (kTip === 'randevu' && kCfg.done === false);
        const gunOzet = !o.baslangic ? "📥 Inbox'ta bekliyor" : (o.baslangic === o.bitis ? '📅 ' + kisaTarih(o.baslangic) : (o.bitis ? kisaTarih(o.baslangic) + ' → ' + kisaTarih(o.bitis) : 'süregelen · ' + kisaTarih(o.baslangic) + "'den"));
        const yarin = (() => { const d = parseD(today); d.setDate(d.getDate() + 1); return iso(d); })();
        // Meridyen'den (koçtan) gelen kart/program — doğrudan atanmış ya da şablona bağlı (sablon_id) — danışan
        // tarafından başka birine paylaşılamaz. Kendi yazdığı ya da bir arkadaşından aldığı kişisel kartlar serbest.
        const paylasilamaz = isRit ? (o.kaynak === 'Meridyen' || o.kaynak === 'Program' || !!o.sablon_id) : !!o.sablon_id;
        return (
        <div className="modal full" onClick={() => setDetay(null)}>
          <div className="sheet fullsheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheetgrip" onClick={() => setDetay(null)} />
            <button className="x" onClick={() => setDetay(null)}>×</button>
            {isRit ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {kTip === 'bilgi' && <div className={'chk' + (ritDone(o.id) ? ' on' : '')} onClick={() => toggleRit(o.id)} title="Yaptım">{ritDone(o.id) ? '✓' : ''}</div>}
                <input className="detbaslik" value={adInput} onChange={(e) => setAdInput(e.target.value)} onBlur={() => { if (adInput.trim() && adInput.trim() !== (o.ad || '')) setRitAd(o.id, adInput); }} style={{ flex: 1 }} />
              </div>
            ) : <h2 style={{ paddingRight: 34 }}>{o.ad}</h2>}
            <div className="m">
              {isRit ? (o.kaynak || '') : (
                personal ? (
                  <span style={{ cursor: 'pointer' }} onClick={() => { setGrupEditVal(personalGroupOf(o)); setGrupEditOpen(true); }}>{personalGroupOf(o)} · değiştir ✎</span>
                ) : (o.grup || '')
              )}
              {act?.kanit_duzeyi && <span className="evi">kanıt: {act.kanit_duzeyi}</span>}
            </div>
            {!isRit && personal && grupEditOpen && (
              <div style={{ margin: '2px 0 10px' }}>
                {personalGroups.length > 0 && <div style={{ margin: '0 0 6px' }}>{personalGroups.map((g) => <span key={g} className={'chip' + (grupEditVal === g ? ' on' : '')} onClick={() => setGrupEditVal(g)}>{g}</span>)}</div>}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={grupEditVal} onChange={(e) => setGrupEditVal(e.target.value)} placeholder="yeni grup için yaz" style={{ flex: 1 }} />
                  <button className="btn sm" onClick={() => setAktGrup(o.id, grupEditVal)}>Kaydet</button>
                  <button className="btn ghost sm" onClick={() => setGrupEditOpen(false)}>Vazgeç</button>
                </div>
              </div>
            )}
            {areas.length > 0 && <div style={{ margin: '6px 0' }}>{areas.map((a) => <span key={a} className="tagp p-alan">{a}</span>)}</div>}

            {isRit && kTip !== 'bilgi' && kTip !== 'tarif' && (o.kaynak === 'Kendi' ? (
              <textarea value={aciklamaInput} onChange={(e) => setAciklamaInput(e.target.value)} onBlur={() => { if (aciklamaInput.trim() !== (o.aciklama || '')) setRitAciklama(o.id, aciklamaInput); }} placeholder="Açıklama / not ekle…" style={{ width: '100%', minHeight: 44, margin: '2px 0 8px' }} />
            ) : (
              aciklamaGoster && <div className="howto"><div className="k">📋 Nasıl yapılır</div><div className="v">{aciklamaGoster}</div></div>
            ))}

            {isRit && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '2px 0 10px' }}>
                <div className="note" style={{ cursor: 'pointer' }} onClick={() => setZamanOpen(true)}>{gunOzet} · değiştir ✎</div>
                <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
                  {!o.mezun && o.aliskanlik && <button className="btn ghost sm" onClick={() => { setMezunPuan(0); setMezunModal(o); }} title="Mezun et" aria-label="Mezun et">🎓</button>}
                  {!paylasilamaz && <button className="btn ghost sm" onClick={() => { setPaylasOpen(true); setKMsg(''); }} title="Paylaş" aria-label="Paylaş">↪️</button>}
                </div>
              </div>
            )}

            {isRit && kTip === 'standart' && kCfg?.resim && <img src={kCfg.resim} alt="" style={{ maxWidth: '100%', borderRadius: 8, margin: '4px 0 8px', display: 'block' }} />}
            {isRit && kTip === 'bilgi' && <BilgiKart cfg={kCfg} />}
            {isRit && kTip === 'video' && <div style={{ margin: '4px 0 8px' }}>
              {(kCfg.url || o.url) && <EmbedVideo url={kCfg.url || o.url} />}
              {!o.sablon_id && <div className="daterow" style={{ marginTop: 6 }}><input value={kartUrlInput} onChange={(e) => setKartUrlInput(e.target.value)} onBlur={() => { if (kartUrlInput.trim() !== ((o.kart_config && o.kart_config.url) || o.url || '')) setRitKartUrl(o.id, kartUrlInput); }} placeholder="Video linki (düzenle)…" style={{ flex: 1 }} /></div>}
            </div>}
            {isRit && kTip === 'anket' && <AnketKart cfg={kCfg} done={ritDone(o.id)} onGonder={() => { if (!ritDone(o.id)) toggleRit(o.id); }} />}
            {isRit && kTip === 'coktan' && <ChoktanKart cfg={kCfg} done={ritDone(o.id)} onGonder={() => { if (!ritDone(o.id)) toggleRit(o.id); }} />}
            {isRit && kTip === 'diyet' && <DiyetKart cfg={kCfg} />}
            {isRit && kTip === 'tarif' && <TarifKart cfg={kCfg} done={ritDone(o.id)} onDenedim={() => { if (!ritDone(o.id)) toggleRit(o.id); }} />}
            {isRit && kTip === 'olcum' && <OlcumKart cfg={kCfg} sonDegerler={(() => { const r: Record<string, number> = {}; meas.forEach((m) => { r[m.anahtar] = Number(m.deger); }); return r; })()} onKaydet={(vals) => olcumKaydet(o.id, vals)} />}
            {isRit && kTip === 'nefes' && <NefesKart cfg={kCfg} done={ritDone(o.id)} onFinish={() => { if (!ritDone(o.id)) toggleRit(o.id); }} />}
            {isRit && kTip === 'ruhhali' && <MoodKart soru={kCfg.soru} bugun={(() => { const arr = meas.filter((m) => m.anahtar === 'ruh_hali' && m.tarih === today); return arr.length ? Number(arr[arr.length - 1].deger) : null; })()} onKaydet={(d) => moodKaydet(o.id, d)} />}
            {isRit && kTip === 'workout' && <WorkoutKart cfg={kCfg} done={ritDone(o.id)} onBitir={() => { if (!ritDone(o.id)) toggleRit(o.id); }} />}
            {isRit && kTip === 'sukran' && <SukranKart cfg={kCfg} done={ritDone(o.id)} onKaydet={() => { if (!ritDone(o.id)) toggleRit(o.id); }} />}
            {isRit && kTip === 'topraklama' && <TopraklamaKart done={ritDone(o.id)} onBitir={() => { if (!ritDone(o.id)) toggleRit(o.id); }} />}
            {isRit && kTip === 'pomodoro' && <PomodoroKart cfg={kCfg} bugunDk={(() => { const arr = meas.filter((m) => m.anahtar === 'odak_dk' && m.tarih === today); return arr.length ? Number(arr[arr.length - 1].deger) : null; })()} onFinish={(dk) => biriktirKaydet(o.id, 'odak_dk', dk, 'dk')} />}
            {isRit && kTip === 'beden' && <BedenKart cfg={kCfg} done={ritDone(o.id)} onFinish={() => { if (!ritDone(o.id)) toggleRit(o.id); }} />}
            {isRit && kTip === 'uykuoncesi' && <UykuKart cfg={kCfg} done={ritDone(o.id)} onBitir={() => { if (!ritDone(o.id)) toggleRit(o.id); }} />}
            {isRit && kTip === 'su' && <SuKart cfg={kCfg} bugun={(() => { const arr = meas.filter((m) => m.anahtar === 'su' && m.tarih === today); return arr.length ? Number(arr[arr.length - 1].deger) : null; })()} onEkle={(delta) => biriktirKaydet(o.id, 'su', delta, 'bardak')} />}
            {isRit && kTip === 'maruz' && <MaruzKart cfg={kCfg} done={ritDone(o.id)} onBitir={() => { if (!ritDone(o.id)) toggleRit(o.id); }} />}
            {isRit && kTip === 'niyet' && <NiyetKart cfg={kCfg} done={ritDone(o.id)} onKaydet={() => { if (!ritDone(o.id)) toggleRit(o.id); }} />}
            {isRit && kTip === 'randevu' && <RandevuKart cfg={kCfg} />}

            {isRit && (
              <div style={{ margin: '4px 0 8px' }}>
                <textarea value={kisiselNotInput} onChange={(e) => setKisiselNotInput(e.target.value)} onBlur={() => { if (kisiselNotInput.trim() !== (o.kisisel_not || '')) setRitKisiselNot(o.id, kisiselNotInput); }} placeholder="✎ Kendi notun (isteğe bağlı — şablon güncellense de bu değişmez)" style={{ width: '100%', minHeight: 36 }} />
              </div>
            )}

            {isRit && !noDone && kTip !== 'bilgi' && (
              <button className={'btn' + (ritDone(o.id) ? ' ghost' : '')} style={{ width: '100%', margin: '2px 0 8px' }} onClick={() => toggleRit(o.id)}>{ritDone(o.id) ? '✓ Yaptım — geri al' : '✓ Yaptım'}</button>
            )}

            {isRit && zamanOpen && (
              <div className="modal top2" onClick={() => setZamanOpen(false)}>
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <button className="x" onClick={() => setZamanOpen(false)}>×</button>
                <h3 style={{ marginBottom: 6 }}>🕐 Zamanlama</h3>
                <div className="kv"><div className="k">Hangi güne taşı</div>
                  <div>
                    <span className={'chip' + (o.baslangic === today ? ' on' : '')} onClick={() => ritTasi(o.id, today)}>Bugün</span>
                    <span className={'chip' + (o.baslangic === yarin ? ' on' : '')} onClick={() => ritTasi(o.id, yarin)}>Yarın</span>
                    <input type="date" value={o.baslangic || ''} onChange={(e) => e.target.value && ritTasi(o.id, e.target.value)} style={{ width: 'auto', marginLeft: 4 }} />
                  </div>
                  <div className="note">{gunOzet}{o.bitis && o.bitis !== o.baslangic ? ' — süresi korunarak taşınır' : ''}</div>
                </div>
                <div className="kv"><div className="k">Süre</div>
                  <div>
                    <span className={'chip' + (!o.bitis ? ' on' : '')} onClick={() => setRitSure(o.id, null)}>Süregelen</span>
                    <span className={'chip' + (o.bitis ? ' on' : '')} onClick={() => setRitSure(o.id, parseInt(sureInput) || 21)}>Süreli</span>
                    {o.bitis && <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
                      <input type="number" min={1} value={sureInput} onChange={(e) => setSureInput(e.target.value)} style={{ width: 60 }} /> gün
                      <button className="btn sm" onClick={() => setRitSure(o.id, parseInt(sureInput) || 21)}>Uygula</button>
                    </span>}
                  </div>
                  {o.bitis && <div className="note">Başlangıç {kisaTarih(o.baslangic)} · bitiş {kisaTarih(o.bitis)}</div>}
                </div>
                <div className="kv"><div className="k">Günler</div>
                  <div>
                    <span className={'chip' + ((!o.gunler || o.gunler.length === 0) ? ' on' : '')} onClick={() => setRitGunler(o.id, [])}>Her gün</span>
                    {GUNLER.map(([n, l]) => {
                      const sel = !!(o.gunler && o.gunler.includes(n));
                      return <span key={n} className={'chip' + (sel ? ' on' : '')} onClick={() => { const cur: number[] = o.gunler ? [...o.gunler] : []; const nx = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]; setRitGunler(o.id, nx); }}>{l}</span>;
                    })}
                  </div>
                </div>
                <div className="kv"><div className="k">Takip</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!o.aliskanlik} onChange={(e) => setRitAliskanlik(o.id, e.target.checked)} /> Alışkanlık olarak haftalık takipte göster</label>
                </div>
                <div className="kv"><div className="k">Günlük hatırlatma</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="time" style={{ width: 'auto' }} value={remInput} onChange={(e) => setRemInput(e.target.value)} />
                    <button className="btn sm" disabled={remInput === (o.hatirlatma_saat || '')} onClick={() => setRitReminder(o.id, remInput)}>Kaydet</button>
                    {o.hatirlatma_saat && <button className="btn sm ghost" onClick={() => { setRemInput(''); setRitReminder(o.id, ''); }}>Kapat</button>}
                  </div>
                  <div className="note">Uygulama kapalıyken de bildirim gelir (push açıksa). Saat: Türkiye saati.</div>
                </div>
              </div>
              </div>
            )}

            {hasBilgi && (
              <Acc title="Bilgi" summary="nedir · nasıl · video · kaynak">
                {act.ozet && <p style={{ fontSize: 13, marginTop: 2, color: '#3a362e', lineHeight: 1.5 }}>{act.ozet}</p>}
                {act.aciklama && <div className="kv"><div className="k">Nedir / neden</div><div className="v">{act.aciklama}</div></div>}
                {act.nasil && <div className="kv"><div className="k">Nasıl yapılır</div><div className="v">{act.nasil}</div></div>}
                {(act.videolar || []).length > 0 && <div className="kv"><div className="k">Videolar</div><div style={{ width: '100%' }}>{act.videolar.map((v: any, i: number) => <div key={i} style={{ marginBottom: 6 }}>{v.baslik && <div className="note" style={{ margin: '0 0 2px' }}>{v.baslik}</div>}<EmbedVideo url={v.url} /></div>)}</div></div>}
                {(act.alternatifler || []).length > 0 && <div className="kv"><div className="k">Alternatifler</div><div className="v">{act.alternatifler.join(' · ')}</div></div>}
                {act.dikkat && <div className="kv"><div className="k">Dikkat edilecekler</div><div className="dikkat">⚠ {act.dikkat}</div></div>}
                {act.kaynak && <div className="kv"><div className="k">Kaynak</div><div className="v">{act.kaynak}</div></div>}
                {fydNames.length > 0 && <div className="kv"><div className="k">Faydalar</div><div className="v">{fydNames.join(' · ')}</div></div>}
              </Acc>
            )}
            {!hasBilgi && !isProg && fydNames.length > 0 && (
              <Acc title="Faydalar" summary={fydNames.slice(0, 3).join(' · ')}><div className="v">{fydNames.join(' · ')}</div></Acc>
            )}

            {isProg && (o.adimlar || []).length > 0 && (
              <Acc title="Zaman çizelgesi" summary={(o.adimlar || []).length + ' adım'} defaultOpen>
                <ProgramTimeline adimlar={o.adimlar || []} sure={o.sure_gun || null} />
              </Acc>
            )}

            {isProg && (
              <Acc title="Adımlar" summary={(o.adimlar || []).length + ' adım' + (o.sure_gun ? ' · ' + o.sure_gun + ' gün' : '')}>
                {(o.adimlar || []).map((st: any, i: number) => (
                  <div key={i} className="kv"><div className="k">{i + 1}</div><div className="v"><b>{st.ad}</b> <span className="note" style={{ margin: 0 }}>{(st.zamanlar || ['gün']).map((z: string) => TODS.find((t) => t[0] === z)?.[1]).join('+')} · {gunlerLabel(st.gunler)}{adimZamanOzet(st) ? ' · ' + adimZamanOzet(st) : ''}{st.url ? ' · 🔗' : ''}</span></div></div>
                ))}
              </Acc>
            )}

            {paylasOpen && (
              <div className="modal top2" onClick={() => setPaylasOpen(false)}>
              <div className="sheet small" onClick={(e) => e.stopPropagation()}>
                <button className="x" onClick={() => setPaylasOpen(false)}>×</button>
                <h3 style={{ marginBottom: 4 }}>📤 Paylaş</h3>
                <p className="note" style={{ marginTop: 0 }}><b>{o.ad}</b></p>
                {kisiler.length > 0 ? (<>
                  <label className="fldlbl">Kişi</label>
                  <div>{kisiler.map((ki, i) => <button key={i} className={'chip' + (paylasSel === ki.kod ? ' on' : '')} onClick={() => { setPaylasSel(ki.kod); setKShareTo(''); }}>{ki.ad}</button>)}</div>
                </>) : <div className="note">Henüz kişi yok — Ayarlar → Paylaşım'dan ekle. Ya da kod gir:</div>}
                <label className="fldlbl">Kod (ops.)</label>
                <input value={kShareTo} onChange={(e) => { setKShareTo(e.target.value); setPaylasSel(''); }} placeholder="RT-XXXXX" autoCapitalize="characters" />
                <div style={{ marginTop: 10 }}><button className="btn" onClick={() => paylas(o, isRit, paylasSel || kShareTo)}>Paylaş</button></div>
                {kMsg && <div className="msg">{kMsg}</div>}
              </div>
              </div>
            )}

            {isProg && <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => { programBaslat(o); setDetay(null); setScreen('ajanda'); }}>Ajandama başlat{o.sure_gun ? ' (' + o.sure_gun + ' gün)' : ''}</button>}
            {!isRit && !isProg && <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => { aktiviteEkleSlotlar(o, addSlot || undefined); setDetay(null); setAddSlot(null); setScreen('ajanda'); }}>Ajandama ekle{addSlot ? ' (' + (SLOTS.find((t) => t[0] === addSlot)?.[1]) + ')' : ''}</button>}

            {(!isRit || (personal && !isProg)) && (
              <div className="dettoolbar">
                {!isRit && !paylasilamaz && <button className="tbtn" onClick={() => { setPaylasOpen(true); setKMsg(''); }}><span className="tbic">↪️</span>Paylaş</button>}
                {personal && !isProg && <button className="tbtn" onClick={() => { setDetay(null); openStudioEdit(act); }}><span className="tbic">✎</span>Düzenle</button>}
                {!isRit && personal && <button className="tbtn danger" onClick={() => silAktivite(o)}><span className="tbic">🗑</span>Sil</button>}
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {mezunModal && (
        <div className="modal top2" onClick={() => setMezunModal(null)}>
          <div className="sheet small" onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setMezunModal(null)}>×</button>
            <h3 style={{ marginBottom: 2 }}>🎓 Mezun et</h3>
            <p className="note" style={{ marginTop: 0 }}><b>{mezunModal.ad}</b> — bu alışkanlık ne kadar yararlı/tatmin ediciydi? Puanla, havuzuna bu bilgiyle dönsün.</p>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', margin: '8px 0' }}>
              {[1, 2, 3, 4, 5].map((n) => <button key={n} className="starbtn" onClick={() => setMezunPuan(n)}>{n <= mezunPuan ? '★' : '☆'}</button>)}
            </div>
            <div className="rowbtns" style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => mezunEt(mezunModal, mezunPuan)}>Mezun et</button>
              <button className="btn ghost sm" onClick={() => setMezunModal(null)}>Vazgeç</button>
            </div>
            <div className="note" style={{ marginTop: 4 }}>Puan opsiyonel — vermeden de mezun edebilirsin. Ritüel ajandadan kalkar, aktivite havuzda kalır.</div>
          </div>
        </div>
      )}

      {studioOpen && (
        <div className="modal" onClick={() => { studioReset(); setStudioOpen(false); }}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => { studioReset(); setStudioOpen(false); }}>×</button>
            <h2>{kEditId ? 'Aktiviteyi düzenle' : 'Kişisel aktivite'}</h2>
            <p className="note" style={{ marginTop: 0 }}>Kendi aktiviteni notlarıyla oluştur; havuzuna kaydedersin, sonra ajandana eklersin.</p>
            <label>Ad</label>
            <input value={kAd} onChange={(e) => setKAd(e.target.value)} placeholder="ör. Badem'le sabah parkı" />
            <label className="fldlbl">Grup (havuzunda gruplamak için — var olanı seç ya da yeni yaz)</label>
            {personalGroups.length > 0 && <div style={{ margin: '2px 0 6px' }}>{personalGroups.map((g) => <span key={g} className={'chip' + (kGrup === g ? ' on' : '')} onClick={() => setKGrup(g)}>{g}</span>)}</div>}
            <input value={kGrup} onChange={(e) => setKGrup(e.target.value)} placeholder="ör. Genel, Ev, Sabah rutini… (yeni grup için yaz)" />
            <label className="fldlbl">Notların (ops.)</label>
            <textarea value={kAcik} onChange={(e) => setKAcik(e.target.value)} placeholder="Nasıl yapılır, ipuçları, hatırlatmalar…" />
            <label className="fldlbl">Bağlantı (ops.)</label>
            <input value={kVin.url} onChange={(e) => setKVin((s) => ({ ...s, url: e.target.value }))} placeholder="https://youtube.com/…" />
            <label className="fldlbl">Zaman dilimi</label>
            <div>{TODS.map(([z, l]) => <span key={z} className={'chip' + (kZamanlar[0] === z ? ' on' : '')} onClick={() => setKZamanlar([z])}>{l}</span>)}</div>
            <div className="rowbtns" style={{ marginTop: 14 }}>
              <button className="btn" onClick={studioKaydet}>{kEditId ? 'Kaydet' : 'Havuza kaydet'}</button>
              <button className="btn ghost sm" onClick={() => { studioReset(); setStudioOpen(false); }}>Vazgeç</button>
            </div>
            <p className="note" style={{ marginTop: 6 }}>Günler, süre ve hatırlatmayı ajandaya ekledikten sonra kartından ayarlarsın.</p>
            <div className="msg">{kMsg}</div>
          </div>
        </div>
      )}

    </div>
  );
}
