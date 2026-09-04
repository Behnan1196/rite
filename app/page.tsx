'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Acc, EmbedVideo, renderMetin, BilgiKart } from './bilgiKart';

// Ayrı bir tutamaç yok — kartın kendisi basılı tutulunca taşınır (bkz sensors: activationConstraint.delay).
// Böylece kısa dokunuş normal tıklama olarak geçer, ~180ms basılı tutmak sürüklemeyi başlatır.
// disabled=true olan satırlar (zaman dilimi ayraçları) hiç taşınamaz ama listede yer tutmaya devam eder.
function SortableRow({ id, disabled, children }: { id: string; disabled?: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: any = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 };
  if (disabled) return <div ref={setNodeRef} style={style}>{children}</div>;
  return <div ref={setNodeRef} style={{ ...style, touchAction: 'none' }} {...attributes} {...listeners}>{children}</div>;
}

type Client = { id: string; ad: string; share_code?: string; auth_id?: string | null; meridyen_bagli?: boolean; email?: string };
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
// kart_config.stil — Meridyen Studio'da seçilen renk/tema preseti (bg = açık zemin, ac = vurgu rengi, tx = yazı rengi). Liste Meridyen'deki STIL_PRESETS ile aynı kalmalı.
const STIL_LOOKUP: Record<string, { bg: string; ac: string; tx: string }> = {
  yesil: { bg: '#e9f4e6', ac: '#5f8a4e', tx: '#2f4a2a' },
  turuncu: { bg: '#fbeee0', ac: '#d98a3d', tx: '#5c4326' },
  mavi: { bg: '#e8f0fb', ac: '#4c7fc7', tx: '#2c3e56' },
  mor: { bg: '#f1e9f7', ac: '#8a5fb0', tx: '#4a2f5c' },
};
const RANDEVU_FORMAT: [string, string][] = [['online', '💻 Online'], ['yuz_yuze', '📍 Yüz yüze']];
// 5-4-3-2-1 topraklama: sabit duyusal kategori listesi.
const TOPRAK_ADIM: [string, string][] = [['5', '5 şey GÖR'], ['4', '4 şey DOKUN'], ['3', '3 şey DUY'], ['2', '2 şey KOKLA'], ['1', '1 şey TAT']];
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
// Kişisel bilgi kartının düzenlenebilir hâli — kaynak==='Kendi' kartlarda BilgiKart yerine bu gösterilir.
// Video(lar) chip şeridinde tutulur (seçili chip altta oynar); "+ Link ekle" ile satır-içi mini formdan yeni video eklenir.
// İçerik varsayılan olarak stilli (renderMetin) görünür, üstüne dokunulunca ham metin textarea'sına döner (blur'da kaydedilir).
function BilgiKartEdit({ cfg, onSave }: { cfg: any; onSave: (cfg: any) => void }) {
  const videolar: { baslik?: string; url: string; bas?: number; bit?: number }[] = cfg?.videolar || [];
  const [vidSec, setVidSec] = useState(0);
  const [vidEkleOpen, setVidEkleOpen] = useState(false);
  const [vAd, setVAd] = useState('');
  const [vUrl, setVUrl] = useState('');
  const [vBas, setVBas] = useState('');
  const [vBit, setVBit] = useState('');
  const [icerikEdit, setIcerikEdit] = useState(false);
  const [icerikVal, setIcerikVal] = useState(cfg?.icerik || '');
  useEffect(() => { setIcerikVal(cfg?.icerik || ''); }, [cfg?.icerik]);
  const secili = videolar[Math.min(vidSec, videolar.length - 1)];
  function videoEkle() {
    if (!vUrl.trim()) return;
    const bas = parseInt(vBas) > 0 ? parseInt(vBas) : undefined;
    const bit = parseInt(vBit) > 0 ? parseInt(vBit) : undefined;
    const yeni = [...videolar, { baslik: vAd.trim() || undefined, url: vUrl.trim(), bas, bit }];
    onSave({ ...cfg, videolar: yeni });
    setVAd(''); setVUrl(''); setVBas(''); setVBit(''); setVidEkleOpen(false); setVidSec(yeni.length - 1);
  }
  function videoSil(i: number) {
    const yeni = videolar.filter((_, j) => j !== i);
    onSave({ ...cfg, videolar: yeni });
    setVidSec(0);
  }
  function icerikKaydet() {
    setIcerikEdit(false);
    if (icerikVal.trim() !== (cfg?.icerik || '')) onSave({ ...cfg, icerik: icerikVal.trim() || null });
  }
  return (
    <div className="howto">
      <div className="bilgi">
        <div style={{ margin: '0 0 6px', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {videolar.map((v, i) => (
            <span key={i} className={'chip' + (i === vidSec ? ' on' : '')} onClick={() => setVidSec(i)}>
              {v.baslik || ('Video ' + (i + 1))}{(v.bas || v.bit) ? ` ⏱${v.bas || 0}–${v.bit || '…'}sn` : ''}
              <span style={{ marginLeft: 6, opacity: 0.55 }} onClick={(e) => { e.stopPropagation(); videoSil(i); }}>✕</span>
            </span>
          ))}
          <span className="chip" style={{ borderStyle: 'dashed' }} onClick={() => setVidEkleOpen((o) => !o)}>+ Link ekle</span>
        </div>
        {vidEkleOpen && (
          <div className="daterow" style={{ margin: '0 0 8px', flexWrap: 'wrap', gap: 6 }}>
            <input value={vAd} onChange={(e) => setVAd(e.target.value)} placeholder="Video adı (ops.)" style={{ flex: 1, minWidth: 100 }} />
            <input value={vUrl} onChange={(e) => setVUrl(e.target.value)} placeholder="https://…" style={{ flex: 2, minWidth: 140 }} />
            <input value={vBas} onChange={(e) => setVBas(e.target.value.replace(/\D/g, ''))} placeholder="Başlangıç sn (ops., YouTube)" style={{ flex: 1, minWidth: 110 }} />
            <input value={vBit} onChange={(e) => setVBit(e.target.value.replace(/\D/g, ''))} placeholder="Bitiş sn (ops., YouTube)" style={{ flex: 1, minWidth: 130 }} />
            <button className="btn sm" onClick={videoEkle} disabled={!vUrl.trim()}>Ekle</button>
          </div>
        )}
        {secili && <div style={{ margin: '0 0 8px' }}><EmbedVideo url={secili.url} bas={secili.bas} bit={secili.bit} /></div>}
        {icerikEdit ? (
          <textarea autoFocus value={icerikVal} onChange={(e) => setIcerikVal(e.target.value)} onBlur={icerikKaydet} placeholder={'# Başlık\nNotun…\n- madde\n**kalın**'} style={{ width: '100%', minHeight: 100 }} />
        ) : (
          <div onClick={() => setIcerikEdit(true)} style={{ cursor: 'text', minHeight: 24 }}>
            {icerikVal.trim() ? renderMetin(icerikVal) : <div className="note" style={{ marginTop: 0 }}>Yazmak için dokun…</div>}
          </div>
        )}
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
// RandevuKart'ın düzenlenebilir hâli — kaynak==='Kendi' randevu kartlarında RandevuKart yerine bu gösterilir.
function RandevuKartEdit({ cfg, onSave }: { cfg: any; onSave: (patch: any) => void }) {
  const [saat, setSaat] = useState(cfg?.saat || '');
  const [format, setFormat] = useState(cfg?.format || 'online');
  const [yer, setYer] = useState(cfg?.yer || '');
  useEffect(() => { setSaat(cfg?.saat || ''); setFormat(cfg?.format || 'online'); setYer(cfg?.yer || ''); }, [cfg?.saat, cfg?.format, cfg?.yer]);
  return (
    <div className="kv" style={{ margin: '4px 0 8px' }}>
      <div className="k">📅 Görüşme randevusu</div>
      <div style={{ width: '100%' }}>
        <label className="fldlbl" style={{ marginTop: 0 }}>Saat (ops.)</label>
        <input type="time" value={saat} onChange={(e) => setSaat(e.target.value)} onBlur={() => onSave({ saat: saat || null })} style={{ width: 'auto' }} />
        <div style={{ margin: '6px 0' }}>{RANDEVU_FORMAT.map(([f, l]) => <span key={f} className={'chip' + (format === f ? ' on' : '')} onClick={() => { setFormat(f); onSave({ format: f }); }}>{l}</span>)}</div>
        <label className="fldlbl">{format === 'online' ? 'Görüşme linki (ops.)' : 'Adres (ops.)'}</label>
        <input value={yer} onChange={(e) => setYer(e.target.value)} onBlur={() => onSave({ yer: yer.trim() || null })} placeholder={format === 'online' ? 'https://…' : 'Adres'} />
      </div>
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
const AVATARLAR = ['🌿', '🌸', '🌙', '☀️', '🍃', '🌾', '🍄', '🪴', '🦋', '⭐'];
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
  const [screen, setScreen] = useState('ajanda');
  const [inboxOpen, setInboxOpen] = useState(false);
  const [ibGrupSec, setIbGrupSec] = useState<string | null>(null); // havuza eklerken grup seçimi açık olan inbox öğesi
  const [ibGrupVal, setIbGrupVal] = useState('Genel');
  const [ajView, setAjView] = useState<'gun' | 'ay'>('gun');
  const [selDate, setSelDate] = useState('');
  const [activities, setActivities] = useState<any[]>([]);
  const [actGroup, setActGroup] = useState('Genel');
  const [rituals, setRituals] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [ep, setEp] = useState<any>(null);
  const [anchors, setAnchors] = useState<string[]>([]);
  const [meas, setMeas] = useState<any[]>([]);
  const [cNot, setCNot] = useState<string>('');
  const [yeniRit, setYeniRit] = useState('');
  const [inbox, setInbox] = useState<any[]>([]);
  const [ibDetay, setIbDetay] = useState<any>(null);
  const [ibdAd, setIbdAd] = useState('');
  const [ibdAcik, setIbdAcik] = useState('');
  const [ibdUrl, setIbdUrl] = useState('');
  const [ibdTarih, setIbdTarih] = useState('');
  // Zaman dilimindeki + ile hızlı ekleme (havuzdan seç ya da anında not/randevu oluştur).
  const [msg, setMsg] = useState('');
  const [pushOn, setPushOn] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const [linkMode, setLinkMode] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkIds, setLinkIds] = useState<string[]>([]);
  const [expandedRutin, setExpandedRutin] = useState<Set<string>>(new Set());
  const [rutinAdEdit, setRutinAdEdit] = useState<string | null>(null);
  const [rutinAdVal, setRutinAdVal] = useState('');
  const [detay, setDetay] = useState<any>(null);
  // Az önce ＋ menüsünden oluşturulmuş, henüz bu detay ekranından hiç çıkılmamış kart — bu kart açıkken
  // mezun et / paylaş gibi "zaten var olan, tam oturmuş bir kart" için anlamlı seçenekler gizlenir.
  const [taze, setTaze] = useState<string | null>(null);
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
  // 🎓/🔔 ikonları artık Zamanlama formundaki checkbox/saat alanlarının yerini alıyor — dolu ikon zaten
  // açık olan bir şeyi (alışkanlık/bildirim) temsil ediyor, dokununca küçük bir seçenek menüsü açılıyor
  // (kapat vs. daha ağır bir işlem gibi mezun et); boş/soluk ikon dokununca direkt açıyor, çünkü o zararsız.
  const [habitMenuFor, setHabitMenuFor] = useState<any>(null);
  const [remMenuFor, setRemMenuFor] = useState<any>(null);
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
  const [kEditId, setKEditId] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [kAd, setKAd] = useState('');
  const [kAcik, setKAcik] = useState('');
  const [kGrup, setKGrup] = useState('Genel');
  const [kVin, setKVin] = useState({ baslik: '', url: '' });
  const [kMsg, setKMsg] = useState('');
  const [kShareTo, setKShareTo] = useState('');
  const [kisiler, setKisiler] = useState<any[]>([]);
  const [profilAd, setProfilAd] = useState('');
  const [kiAd, setKiAd] = useState('');
  const [kiKod, setKiKod] = useState('');
  const [paylasSel, setPaylasSel] = useState('');
  const [yeniGrupOpen, setYeniGrupOpen] = useState(false);
  const [yeniGrupAd, setYeniGrupAd] = useState('');
  const [ekstraGruplar, setEkstraGruplar] = useState<string[]>([]);
  const [ekleMenuOpen, setEkleMenuOpen] = useState(false);
  const [yeniKartOpen, setYeniKartOpen] = useState<'not' | 'randevu' | null>(null);
  const [yeniKartAdVal, setYeniKartAdVal] = useState('');
  const [ayracYeniOpen, setAyracYeniOpen] = useState(false);
  const [ayracEditId, setAyracEditId] = useState<string | null>(null);
  const [ayracAdVal, setAyracAdVal] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authPass2, setAuthPass2] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [authView, setAuthView] = useState<'hos' | 'kayit' | 'giris'>('hos');
  const [authMsg, setAuthMsg] = useState('');
  const [profilEditOpen, setProfilEditOpen] = useState(false);
  const [baglantiOpen, setBaglantiOpen] = useState(false);
  const [paylasimAyarOpen, setPaylasimAyarOpen] = useState(false);
  const [avatarSec, setAvatarSec] = useState('');
  const [profilMsg, setProfilMsg] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showNewPass2, setShowNewPass2] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  // Günün kendi kart sırası — dokunulmamış günlerde boş/undefined kalır ve blok_sira'ya (varsayılan sıra) düşülür;
  // bir günde sürükle-bırak yapılınca o günün tam sırası (üst düzey anahtarlar) burada saklanır (bkz dog_gun_duzeni).
  const [gunSiraMap, setGunSiraMap] = useState<Record<string, string[]>>({});

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
  useEffect(() => {
    if (!client || !day) return;
    // Bu günü bu oturumda daha önce hiç çekmediysek sunucudan al. Zaten yerelde varsa (ilk yüklemeden ya da
    // az önce sürükleyip bıraktığımızdan) TEKRAR ÇEKMİYORUZ — yoksa az önce kaydettiğimiz sıralama henüz
    // sunucuya ulaşmadan bu günü tekrar okursak, eski (henüz kaydedilmemiş) sırayı üzerine yazıp kullanıcının
    // az önce yaptığı sıralamayı geri alabiliyorduk (kullanıcı geri bildirimi: "başka güne gidip gelince eski
    // sırasına dönüyor").
    if (!(day in gunSiraMap)) loadGunSira(client.id, day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, day]);
  async function loadGunSira(clientId: string, tarih: string) {
    const r = await supabase.from('dog_gun_duzeni').select('sira').eq('client_id', clientId).eq('tarih', tarih).maybeSingle();
    setGunSiraMap((m) => ({ ...m, [tarih]: (r.data?.sira as string[]) || [] }));
  }
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
    setActivities(r.data || []);
  }

  async function loadData(clientId: string) {
    const r = await supabase.from('dog_rituals').select('id,ad,zaman,kategori,tip,kaynak,mezun,aktif,alan,rutin,rutin_ad,sira,baslangic,bitis,activity_id,hatirlatma_saat,blok_sira,faydalar,url,gunler,kart_tipi,kart_config,aliskanlik,aciklama,sablon_id,sablon_adim,kisisel_not').eq('client_id', clientId).order('zaman');
    setRituals(r.data || []);
    const lg = await supabase.from('dog_ritual_logs').select('id,ritual_id,tarih,yapildi').eq('client_id', clientId);
    setLogs(lg.data || []);
    const e = await supabase.from('dog_episodes').select('id,program_ad,birincil_ilgi,status').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1);
    const epRow = (e.data && e.data[0]) || null;
    setEp(epRow);
    if (epRow) {
      const a = await supabase.from('dog_anchors').select('etiket').eq('episode_id', epRow.id);
      setAnchors((a.data || []).map((x: any) => x.etiket));
      const se = await supabase.from('dog_sessions').select('notlar,tarih').eq('episode_id', epRow.id).order('tarih', { ascending: false }).limit(1);
      setCNot((se.data && se.data[0] && se.data[0].notlar) || '');
    } else { setAnchors([]); setCNot(''); }
    const m = await supabase.from('dog_measurements').select('tarih,anahtar,deger,birim').eq('client_id', clientId).order('tarih', { ascending: true }).limit(80);
    setMeas(m.data || []);
  }

  // ---------- e-posta ile kendi hesabını aç / giriş yap ----------
  async function fetchClientByAuth(userId: string, emailHint?: string): Promise<Client | null> {
    const r = await supabase.from('dog_clients').select('id,ad,share_code,auth_id,meridyen_bagli').eq('auth_id', userId).limit(1);
    if (r.error || !r.data || !r.data.length) return null;
    return { ...(r.data[0] as Client), email: emailHint };
  }
  async function girisSonrasiYukle(cli: Client) {
    setClient(cli); localStorage.setItem(LS, JSON.stringify(cli)); setAuthMsg('');
    loadData(cli.id); loadInbox(cli.id); loadKisiler(cli.id); ensureShareCode(cli); reassignPush(cli.id);
  }
  async function authGiris() {
    const email = authEmail.trim();
    if (!email || !authPass) return setAuthMsg('E-posta ve şifre gir.');
    setAuthMsg('Giriş yapılıyor…');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: authPass });
    if (error) return setAuthMsg('Hata: ' + error.message);
    const cli = await fetchClientByAuth(data.user!.id, data.user!.email || email);
    if (!cli) return setAuthMsg('Hesap bulundu ama profil bulunamadı, tekrar dener misin?');
    girisSonrasiYukle(cli);
  }
  async function authKayit() {
    const email = authEmail.trim();
    if (!email || !authPass) return setAuthMsg('E-posta ve şifre gir.');
    if (authPass.length < 6) return setAuthMsg('Şifre en az 6 karakter olmalı.');
    if (authPass !== authPass2) return setAuthMsg('Şifreler eşleşmiyor.');
    setAuthMsg('Hesap oluşturuluyor…');
    const { data, error } = await supabase.auth.signUp({ email, password: authPass });
    if (error) return setAuthMsg('Hata: ' + error.message);
    if (!data.user || !data.session) return setAuthMsg('Hesabın oluşturuldu. E-postana gelen bağlantıyla onaylayıp tekrar giriş yap.');
    let cli: Client | null = null;
    for (let i = 0; i < 5 && !cli; i++) {
      cli = await fetchClientByAuth(data.user.id, data.user.email || email);
      if (!cli) await new Promise((res) => setTimeout(res, 400));
    }
    if (!cli) return setAuthMsg('Hesap oluştu ama profilin hazırlanamadı, birazdan tekrar dener misin?');
    girisSonrasiYukle(cli);
  }
  // ---------- Meridyen bağlantısı (hesap ile bağlantı ayrı şeyler) ----------
  async function meridyeneBaglan() {
    if (!client) return;
    setMsg('Kontrol ediliyor…');
    const u = await supabase.from('dog_meridyen_uyelik').select('id,bitis').eq('client_id', client.id).order('created_at', { ascending: false }).limit(1);
    if (u.error) return setMsg('Hata: ' + u.error.message);
    const uy = u.data && u.data[0];
    const aktif = uy && (!uy.bitis || uy.bitis > new Date().toISOString());
    if (!aktif) return setMsg('Meridyen üyeliğin bulunamadı — merkezinle iletişime geç.');
    await supabase.from('dog_clients').update({ meridyen_bagli: true }).eq('id', client.id);
    const nc = { ...client, meridyen_bagli: true };
    setClient(nc); localStorage.setItem(LS, JSON.stringify(nc)); setMsg('');
    loadData(client.id); loadInbox(client.id);
  }
  async function meridyenBaglantiKes() {
    if (!client) return;
    await supabase.from('dog_clients').update({ meridyen_bagli: false }).eq('id', client.id);
    const nc = { ...client, meridyen_bagli: false };
    setClient(nc); localStorage.setItem(LS, JSON.stringify(nc));
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
  async function cikis() {
    await removePushForDevice();
    try { await supabase.auth.signOut(); } catch (_) {}
    localStorage.removeItem(LS);
    setClient(null); setPushOn(false);
    setAuthEmail(''); setAuthPass(''); setAuthPass2(''); setAuthMsg('');
  }
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
  async function ritEkle(ad: string, zaman = 'gün', kaynak = 'Kendi', tip = 'aliskanlik', alan: string | null = null, activityId: string | null = null, faydalar: string[] = [], url: string | null = null, gunler: number[] | null = null, sureG: number | null = null, programId: string | null = null, programAd: string | null = null, reload = true, basGun = 0, rutin: string | null = null, sira = 0, kartTipi: string | null = null, kartConfig: any = null, aliskanlikP: boolean | null = null, sablonId: string | null = null, sablonAdim: number | null = null, rutinAd: string | null = null) {
    if (!client || !ad.trim()) return;
    const g = gunler && gunler.length > 0 && gunler.length < 7 ? gunler : null;
    const bas = parseD(today); bas.setDate(bas.getDate() + (basGun || 0)); const basStr = iso(bas);
    let bitis: string | null = null;
    if (sureG && sureG > 0) { const e = parseD(basStr); e.setDate(e.getDate() + sureG - 1); bitis = iso(e); }
    await supabase.from('dog_rituals').insert({ client_id: client.id, ad: ad.trim(), zaman, kaynak, tip, alan, activity_id: activityId, faydalar, url, gunler: g, program: programId, program_ad: programAd, rutin, rutin_ad: rutinAd, sira, kart_tipi: kartTipi, kart_config: kartConfig, aliskanlik: aliskanlikP === null ? !bitis : aliskanlikP, aktif: true, mezun: false, baslangic: basStr, bitis, blok_sira: Date.now(), sablon_id: sablonId, sablon_adim: sablonAdim });
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
          await ritEkle(st.ad, liderSlot, 'Program', 'aliskanlik', alan0, null, st.faydalar || [], st.url || null, lider.gunler || null, spans[grp[0]].d || null, pid, prog.ad, false, spans[grp[0]].o, rutinId, k, st.kartTipi || null, st.kartConfig || null, typeof st.aliskanlik === 'boolean' ? st.aliskanlik : null, prog.sablon_id || null, idx, lider.grupAdi || null);
        } else {
          const slots = st.zamanlar && st.zamanlar.length ? st.zamanlar : ['gün'];
          for (const s of slots) await ritEkle(st.ad, s, 'Program', 'aliskanlik', alan0, null, st.faydalar || [], st.url || null, st.gunler || null, spans[idx].d || null, pid, prog.ad, false, spans[idx].o, null, 0, st.kartTipi || null, st.kartConfig || null, typeof st.aliskanlik === 'boolean' ? st.aliskanlik : null, prog.sablon_id || null, idx);
        }
      }
    }
    loadData(client.id);
  }
  function studioReset() { setKAd(''); setKAcik(''); setKGrup('Genel'); setKVin({ baslik: '', url: '' }); setKZamanlar(['gün']); setKEditId(null); setKMsg(''); }
  function openStudioEdit(a: any) {
    studioReset();
    setKAd(a.ad || ''); setKAcik(a.aciklama || ''); setKGrup(a.grup && a.grup !== 'Kişisel' ? a.grup : 'Genel'); setKVin({ baslik: '', url: (a.videolar && a.videolar[0]?.url) || '' }); setKZamanlar(a.zamanlar && a.zamanlar.length ? [a.zamanlar[0]] : [a.zaman || 'gün']); setKEditId(a.id);
    setStudioOpen(true);
  }
  // Adım zamanlama özeti: "↳ ardından · M gün" / "başla +Ng · M gün"
  function adimZamanOzet(st: any): string {
    if (st.zincirli) return '🔗 önceki ile zincir';
    const b = st.ardisik ? '↳ önceki ardından' : (st.baslaGun ? 'başla +' + st.baslaGun + 'g' : '');
    const s = st.sureGun ? st.sureGun + ' gün' : '';
    return [b, s].filter(Boolean).join(' · ');
  }
  // Havuzdaki bir aktiviteyi düzenlemek için (create akışı Ajanda'da — bkz hemenEkle). Program tasarımı Meridyen'de.
  async function studioKaydet() {
    if (!client) return;
    if (!kAd.trim()) return setKMsg('Ad gir');
    const url = kVin.url.trim();
    const row: any = { client_id: client.id, tur: 'aktivite', ad: kAd.trim(), grup: kGrup.trim() || 'Genel', faydalar: [], aciklama: kAcik || null, videolar: url ? [{ baslik: kAd.trim(), url }] : [], zaman: kZamanlar[0] || 'gün', zamanlar: kZamanlar, kaynak_etiket: 'Kendi', aktif: true };
    const r = kEditId ? await supabase.from('dog_activities').update(row).eq('id', kEditId) : await supabase.from('dog_activities').insert(row);
    if (r.error) return setKMsg('Hata: ' + r.error.message);
    const savedGrup = row.grup;
    studioReset(); loadActivities(); setStudioOpen(false); setActGroup(savedGrup);
  }
  async function loadKisiler(cid: string) {
    const r = await supabase.from('dog_clients').select('kisiler,profil_ad,avatar').eq('id', cid).single();
    setKisiler((r.data?.kisiler as any[]) || []);
    setProfilAd((r.data?.profil_ad as string) || '');
    setAvatarSec((r.data?.avatar as string) || '');
  }
  async function profilKaydet() {
    if (!client) return;
    await supabase.from('dog_clients').update({ profil_ad: profilAd.trim() || null, avatar: avatarSec || null }).eq('id', client.id);
    setProfilMsg('Kaydedildi ✓');
    setTimeout(() => { setProfilEditOpen(false); setProfilMsg(''); }, 500);
  }
  async function sifreDegistir() {
    if (!newPass || newPass.length < 6) return setPwMsg('Şifre en az 6 karakter olmalı.');
    if (newPass !== newPass2) return setPwMsg('Şifreler eşleşmiyor.');
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) return setPwMsg('Hata: ' + error.message);
    setNewPass(''); setNewPass2(''); setPwMsg('Şifren değişti ✓');
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
    closeDetay(); loadActivities();
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
  function closeDetay() { setDetay(null); setTaze(null); }
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
  // Kişisel bilgi kartı düzenlemesi (BilgiKartEdit'ten): video ekle/sil, içerik kaydet — hep 'bilgi' tipine sabitler.
  async function setBilgiCfg(id: string, cfg: any) {
    if (!client) return;
    const patch = { kart_config: cfg, kart_tipi: 'bilgi' };
    await supabase.from('dog_rituals').update(patch).eq('id', id);
    patchDetay(patch);
    loadData(client.id);
  }
  // Bir program/şablondan atanmış kartlarda ("canlı adım") detay ekranı, ritüelin kendi kart_config'i yerine
  // ŞABLONUN o adımdaki kartConfig'ini gösterir (koç şablonu güncelleyince zaten atanmış kartlara da yansısın diye).
  // Bu yüzden cümle saniyesi gibi bir düzeltme sadece dog_rituals.kart_config'e yazılırsa hiç görünmüyordu —
  // "kaydedildi" diyor ama ekran hep şablondaki eski veriyi gösterip duruyordu. Şablon bağlantılı bir kart için
  // düzeltmeyi doğrudan şablonun (dog_activities.adimlar[adım].kartConfig) üstüne yazmak gerekiyor.
  async function setSablonAdimKart(sablonId: string, adimIdx: number, cfg: any) {
    if (!detaySablon) return;
    const adimlar = [...(detaySablon.adimlar || [])];
    if (!adimlar[adimIdx]) return;
    adimlar[adimIdx] = { ...adimlar[adimIdx], kartConfig: cfg };
    const { error } = await supabase.from('dog_activities').update({ adimlar }).eq('id', sablonId);
    if (error) { console.error('setSablonAdimKart', error); return; }
    setDetaySablon((d: any) => (d ? { ...d, adimlar } : d));
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
  // Not / Randevu: ＋ menüsünden tıklayınca artık DOĞRUDAN kart yaratmıyoruz — önce küçük bir "taslak" modalı
  // açılır (ayraç ile aynı mantık: isim yaz, Kaydet'e bas), kart ancak Kaydet'e basınca oluşuyor. Kaydettikten
  // sonra tam düzenleme ekranı (openRit) açılıyor, ama yeni oluşturulduğu için mezun et/paylaş gibi "zaten var
  // olan bir kart" seçenekleri "taze" işaretiyle bir süre gizli kalıyor (bkz. isRit araç çubuğu).
  async function yeniKartKaydet() {
    if (!client || !yeniKartOpen) return;
    const randevu = yeniKartOpen === 'randevu';
    const ad = yeniKartAdVal.trim() || (randevu ? 'Yeni randevu' : 'Yeni not');
    const cfg: any = { icerik: null, videolar: [] };
    if (randevu) cfg.randevu = true;
    const ins = await supabase.from('dog_rituals').insert({ client_id: client.id, ad, zaman: 'gün', kaynak: 'Kendi', tip: 'aliskanlik', kart_tipi: 'bilgi', kart_config: cfg, aliskanlik: false, aktif: true, mezun: false, baslangic: day, bitis: day, blok_sira: Date.now() }).select().single();
    setYeniKartOpen(null);
    loadData(client.id);
    if (ins.data) { openRit(ins.data); setTaze(ins.data.id); }
  }
  // Alışkanlık: Not ile aynı içerik kartı ama baştan süregelen (bitiş tarihsiz) başlar ve alışkanlık işaretlidir —
  // zamanlama (günler/süre) ve mezun etme sadece bu şekilde oluşturulmuş kartlarda gösterilir (bkz. isRit araç çubuğu).
  // Bu da (Not/Randevu'daki taslak adımı olmadan) hemen oluşturuluyor ama "taze" işaretiyle açılıyor.
  async function hemenEkleAliskanlik() {
    if (!client) return;
    const ins = await supabase.from('dog_rituals').insert({ client_id: client.id, ad: 'Yeni alışkanlık', zaman: 'gün', kaynak: 'Kendi', tip: 'aliskanlik', kart_tipi: 'bilgi', kart_config: { icerik: null, videolar: [] }, aliskanlik: true, aktif: true, mezun: false, baslangic: day, bitis: null, blok_sira: Date.now() }).select().single();
    loadData(client.id);
    if (ins.data) { openRit(ins.data); setTaze(ins.data.id); }
  }
  // Ayraç: isimli bir bölüm başlığı — bugünden itibaren, siz silene kadar her gün aynı şekilde görünür,
  // sıradan bir kart gibi sürüklenir; gunSiraMap/dog_gun_duzeni onun da yerini günden güne hatırlar.
  async function ayracEkle(ad: string) {
    if (!client) return;
    const isim = (ad || '').trim() || 'Ayraç';
    await supabase.from('dog_rituals').insert({ client_id: client.id, ad: isim, zaman: 'gün', kaynak: 'Kendi', tip: 'aliskanlik', kart_tipi: 'ayrac', aliskanlik: true, aktif: true, mezun: false, baslangic: day, bitis: null, gunler: [], blok_sira: Date.now() });
    loadData(client.id);
  }
  async function ayracAdKaydet(id: string) {
    const ad = ayracAdVal.trim();
    setAyracEditId(null);
    if (!ad || !client) return;
    await supabase.from('dog_rituals').update({ ad }).eq('id', id);
    loadData(client.id);
  }
  async function ayracSil(id: string) {
    if (!client) return;
    if (!confirm('Bu ayracı silmek istediğine emin misin? Bugünden itibaren tüm günlerden kalkar.')) return;
    await supabase.from('dog_rituals').delete().eq('id', id);
    loadData(client.id);
  }
  // Randevu alanlarından biri değiştiğinde (RandevuKartEdit'ten) — diğer alanları koruyarak kart_config'i günceller.
  async function setRandevuCfg(id: string, patch: any) {
    if (!client) return;
    const cfg = { ...(detay?.obj?.kart_config || {}), ...patch };
    await supabase.from('dog_rituals').update({ kart_config: cfg }).eq('id', id);
    patchDetay({ kart_config: cfg });
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
  // Günler kısıtlıysa (haftanın belirli günleri), verilen tarihten itibaren o günlerden birine denk gelen ilk
  // tarihi bulur (en çok 7 gün ileri bakar — bir hafta içinde mutlaka bir eşleşme vardır). Kısıtlama yoksa
  // olduğu gibi döner.
  function ilkUygunGun(baslangic: string, gunler: number[] | null): string {
    if (!gunler || gunler.length === 0) return baslangic;
    const d = parseD(baslangic);
    for (let i = 0; i < 7; i++) { const ds = iso(d); if (gunler.includes(wday(ds))) return ds; d.setDate(d.getDate() + 1); }
    return baslangic;
  }
  async function setRitSure(id: string, gun: number | null) {
    if (!client) return;
    const rt = rituals.find((r) => r.id === id);
    let patch: any;
    if (!gun) patch = { bitis: null };
    else {
      // Süre penceresi seçili Günler'e hiç denk gelmezse kart bir daha asla görünmez (activeOn ikisini de AND
      // ile arıyor) — bu yüzden başlangıç, ilk uygun güne kaydırılıyor, süre (gün sayısı) aynen korunuyor.
      const bas0 = (rt && rt.baslangic && rt.baslangic >= today) ? rt.baslangic : today;
      const bas = ilkUygunGun(bas0, rt?.gunler || null);
      const e = parseD(bas); e.setDate(e.getDate() + gun - 1); patch = { baslangic: bas, bitis: iso(e) };
    }
    await supabase.from('dog_rituals').update(patch).eq('id', id);
    patchDetay(patch);
    loadData(client.id);
  }
  async function setRitGunler(id: string, g: number[]) {
    if (!client) return;
    const arr = g.length === 0 || g.length === 7 ? null : g;
    const rt = rituals.find((r) => r.id === id);
    let patch: any = { gunler: arr };
    // Kart zaten süreliyse (bitiş tarihi var) ve yeni seçilen günler mevcut pencereye hiç denk gelmiyorsa, aynı
    // sorunu burada da önlemek için pencereyi (süresini koruyarak) ilk uygun güne kaydırıyoruz.
    if (arr && rt?.bitis) {
      let uyumlu = false; const d = parseD(rt.baslangic);
      while (iso(d) <= rt.bitis) { if (arr.includes(wday(iso(d)))) { uyumlu = true; break; } d.setDate(d.getDate() + 1); }
      if (!uyumlu) {
        const uzunlukGun = Math.round((parseD(rt.bitis).getTime() - parseD(rt.baslangic).getTime()) / 86400000) + 1;
        const yeniBas = ilkUygunGun(rt.baslangic >= today ? rt.baslangic : today, arr);
        const e = parseD(yeniBas); e.setDate(e.getDate() + uzunlukGun - 1);
        patch = { gunler: arr, baslangic: yeniBas, bitis: iso(e) };
      }
    }
    await supabase.from('dog_rituals').update(patch).eq('id', id);
    patchDetay(patch);
    loadData(client.id);
  }
  async function setRitAliskanlik(id: string, val: boolean) {
    if (!client) return;
    const rt = rituals.find((r) => r.id === id);
    const patch: any = { aliskanlik: val };
    // Alışkanlık yap: kart o gün için tek günlük (bitis === baslangic, ör. yeni bir not) ise burada da süregelen
    // hâle getiriyoruz — yoksa "alışkanlık" işaretlense bile kart bir daha görünmezdi, kullanıcının ayrıca
    // Zamanlama'ya girip Süre'yi "Süregelen" yapması gerekirdi (kullanıcı geri bildirimi).
    if (val && rt && rt.bitis && rt.bitis === rt.baslangic) patch.bitis = null;
    await supabase.from('dog_rituals').update(patch).eq('id', id);
    patchDetay(patch);
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
    const ad = linkName.trim() || null;
    await Promise.all(linkIds.map((id, i) => supabase.from('dog_rituals').update({ rutin: rid, rutin_ad: ad, sira: i, zaman: firstSlot, blok_sira: bs }).eq('id', id)));
    cancelLink();
    loadData(client.id);
  }
  function toggleRutinExpand(rid: string) {
    setExpandedRutin((s) => { const n = new Set(s); if (n.has(rid)) n.delete(rid); else n.add(rid); return n; });
  }
  async function saveRutinAd(rid: string) {
    const ad = rutinAdVal.trim() || null;
    setRutinAdEdit(null);
    if (!client) return;
    await supabase.from('dog_rituals').update({ rutin_ad: ad }).eq('rutin', rid);
    loadData(client.id);
  }
  // Başlıktaki tek checkbox ile rutinin tüm adımlarını birlikte yapıldı/geri al yapar — hiçbiri yapılmadıysa
  // hepsini yapıldı işaretler, hepsi zaten yapıldıysa hepsini geri alır (aradaki durumda da hepsini yapıldı yapar).
  async function toggleRutinAll(members: any[]) {
    if (!client) return;
    const target = !members.every((m: any) => ritDone(m.id));
    await Promise.all(members.map(async (m: any) => {
      const ex = logs.filter((l) => l.ritual_id === m.id && l.tarih === day)[0];
      if (ex) { if (ex.yapildi !== target) await supabase.from('dog_ritual_logs').update({ yapildi: target }).eq('id', ex.id); }
      else if (target) await supabase.from('dog_ritual_logs').insert({ client_id: client.id, ritual_id: m.id, tarih: day, yapildi: true });
    }));
    loadData(client.id);
  }
  async function rutinCikar(id: string) {
    if (!client) return;
    await supabase.from('dog_rituals').update({ rutin: null, rutin_ad: null, blok_sira: Date.now() }).eq('id', id);
    loadData(client.id);
  }
  // Ajanda gün görünümü artık zaman dilimi başına ayrı bir sürükleme alanı değil, TEK akış: dilimler (Sabah/Gün
  // içi/Akşam/Serbest) sürüklenemeyen ince ayraç satırları, kartlar bu ayraçların arasında serbestçe taşınabiliyor.
  // Bir kartı bir ayracın öbür tarafına bırakmak, o kartın (zincirse tüm üyelerinin) `zaman` alanını da günceller —
  // önceden bunun için kartı açıp Zamanlama sekmesine girmek gerekiyordu (o yol hâlâ duruyor, bu ek bir kestirme).
  // Rutin (isimli grup) satırları artık ayrı satır olarak akışa gömülü: kapalıyken tek başlık satırı, açıkken
  // başlığın hemen altına her üyesi kendi satırı olarak eklenir (bkz. rows inşası). Bir aktivite (bağımsız ya da
  // zaten bir rutin üyesi) bırakıldığı TAM görsel konuma göre yerleşir — grup açıksa üyelerin arasına, kapalıysa
  // (görünürde tek satır olduğu için) başlığın hemen yanına, yani pratikte sona. Bunun dışındaki her sürükleme
  // (rutinle ilgisi olmayan bir konuma bırakma) eskisi gibi üst düzey sıralama/dilim değişimi olarak işlenir.
  // Bir üyeyi HİÇBİR rutine değmeyecek şekilde tamamen dışarı sürüklemek desteklenmiyor (görmezden gelinir,
  // veriler yeniden yüklenip görünüm eski hâline döner) — çıkarmak için ✕ (rutinCikar) kullanılır.
  async function onDragEndDay(rows: any[], e: any) {
    if (!client) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.key === active.id);
    const overIndex = rows.findIndex((r) => r.key === over.id);
    if (oldIndex < 0 || overIndex < 0) return;
    const activeRow = rows[oldIndex];
    const overRow = rows[overIndex];

    // Bir rutine katılım artık SADECE o rutinin başlığına (ya da — aynı rutin içindeyse — bir üyesine) doğrudan
    // bırakılınca oluyor. Önceden "taşındıktan sonra komşun bir rutinse katıl" mantığı vardı; bu, sıradan
    // sıralama sırasında bir rutine yakın bir yere bırakmayı bile beklenmedik şekilde rutine katıyor, sıralamayı
    // "hiç stabil değil" hissettiriyordu (kullanıcı geri bildirimi). Artık sadece rutinin kutusunun ÜSTÜNE
    // bırakmak katılım sayılıyor — yakınına bırakmak sadece sırasını değiştirir.
    const sameRoutineMemberMove = activeRow.kind === 'member' && overRow.kind === 'member' && overRow.rutin === activeRow.rutin;
    const sameRoutineToHead = activeRow.kind === 'member' && overRow.kind === 'rutinHead' && overRow.rutin === activeRow.rutin;
    const explicitJoinRoutine = (activeRow.kind === 'item' || activeRow.kind === 'member') && overRow.kind === 'rutinHead' && overRow.rutin !== activeRow.rutin;

    if (sameRoutineMemberMove || sameRoutineToHead || explicitJoinRoutine) {
      // Bir rutinin üyeleri kendi gunler/tarih aralığını koruyor (kasıtlı — biri Pzt/Çrş, biri her gün olabilir,
      // Meridyen'den gelen bir program adımı kendi başlangıç gününde devreye girebilir); o yüzden `habits`
      // (SADECE bugün aktif olanlar) değil, rutinin TÜM üyeleri (rituals) üzerinden sira yeniden hesaplanır —
      // yoksa bugün görünmeyen bir üye, görünenlerle aynı sira değerini alıp çakışabilirdi.
      const targetRutin = overRow.rutin;
      const activeId = activeRow.kind === 'member' ? activeRow.ritual.id : activeRow.members[0].id;
      const anyExisting = rituals.find((r: any) => r.rutin === targetRutin);
      const targetAd = anyExisting?.rutin_ad ?? null;
      const targetSlot = anyExisting?.zaman || 'gün';
      const allMembers = rituals.filter((r: any) => r.rutin === targetRutin && r.id !== activeId).sort((a: any, b: any) => (a.sira || 0) - (b.sira || 0));
      const insertAt = overRow.kind === 'member' ? Math.max(0, allMembers.findIndex((r: any) => r.id === overRow.ritual.id)) : allMembers.length;
      allMembers.splice(insertAt < 0 ? allMembers.length : insertAt, 0, { id: activeId });
      await Promise.all(allMembers.map((r: any, i: number) => {
        const patch: any = { sira: i };
        if (r.id === activeId) { patch.rutin = targetRutin; patch.rutin_ad = targetAd; patch.zaman = targetSlot; }
        return supabase.from('dog_rituals').update(patch).eq('id', r.id);
      }));
      loadData(client.id);
      return;
    }
    if (activeRow.kind === 'member') { loadData(client.id); return; } // rutin dışına bırakma desteklenmiyor (✕ ile çıkarılır)

    // Sıradan sürükleme (ayraçlar ve rutin başlıkları dahil) — artık zaman dilimi ayracı yok, tek düz sıra. Bu
    // güne özel kaydediliyor (dog_gun_duzeni); blok_sira'ya dokunmuyoruz, o dokunulmamış günler için varsayılan
    // sıra olarak kalıyor. Bırakılan yer (over) bir rutinin AÇIK üyesiyse, o rutinin üst-düzey konumuna (başlığına)
    // denk düşürülüyor — üyeye bırakmak artık rutine katmadığı için sıradaki karşılığı budur.
    const topRows = rows.filter((r) => r.kind !== 'member');
    const topOldIndex = topRows.findIndex((r) => r.key === active.id);
    const overKeyForTop = overRow.kind === 'member' ? 'r:' + overRow.rutin : over.id;
    const topNewIndex = topRows.findIndex((r) => r.key === overKeyForTop);
    if (topOldIndex < 0 || topNewIndex < 0) return;
    const moved = arrayMove(topRows, topOldIndex, topNewIndex);
    const gunSirasi = moved.map((r) => r.key);
    // Önce ekranı güncelle (kayıt ağ isteğini beklemeden) — yoksa kart bıraktığın an bir anlığına eski yerine
    // geri zıplayıp, kayıt bittiğinde yeni yerine atlıyordu; art arda sürüklemede bu "stabil değil" gibi
    // hissettiriyordu (kullanıcı geri bildirimi). Kayıt arka planda devam ediyor, sonucunu beklemeye gerek yok.
    setGunSiraMap((mp) => ({ ...mp, [day]: gunSirasi }));
    supabase.from('dog_gun_duzeni').upsert({ client_id: client.id, tarih: day, sira: gunSirasi }, { onConflict: 'client_id,tarih' })
      .then(({ error }) => { if (error) console.error('gün sırası kaydedilemedi:', error); });

    // Bugün ya da ileri bir günde sıralama değiştiriyorsak: süregelen (bitiş tarihi olmayan) kartların ve
    // ayraçların yeni sırası blok_sira'ya da yazılır — böylece kendi sırası hiç ayarlanmamış SONRAKİ günler de
    // bu yeni düzeni miras alır (kullanıcı isteği). Geçmiş bir günde değişiklik yapmak ileriye yansımaz. Kendi
    // sırası zaten ayarlanmış bir gün (kendi dog_gun_duzeni satırı olan) bundan etkilenmez — o günkü sıra korunur,
    // çünkü o gün için gunOrder her zaman blok_sira'dan önce gelir.
    if (day >= today) {
      const base = Date.now();
      const stamps = moved
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => (r.kind === 'item' || r.kind === 'ayrac') && r.members[0].bitis === null);
      if (stamps.length) {
        await Promise.all(stamps.map(({ r, i }) => supabase.from('dog_rituals').update({ blok_sira: base + i }).eq('id', r.members[0].id)));
        loadData(client.id);
      }
    }
  }
  async function rutinBoz(name: string) {
    if (!client) return;
    const ids = rituals.filter((r) => r.rutin === name).map((r) => r.id);
    if (!ids.length) return;
    // rutin/rutin_ad temizleniyor — aktiviteler SİLİNMİYOR, bağımsız kart olarak kalıyor. blok_sira'yı da
    // tazeleyip listede kendi zaman diliminin sonuna, göze görünür şekilde yerleşmelerini sağlıyoruz.
    await Promise.all(ids.map((id, i) => supabase.from('dog_rituals').update({ rutin: null, rutin_ad: null, blok_sira: Date.now() + i }).eq('id', id)));
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
    setMezunModal(null); setMezunPuan(0); closeDetay();
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

  // ---------- giriş / hesap oluşturma ----------
  if (!client) {
    return (
      <div className="app">
        <div className="hd"><div className="b">Rite <span>· daily rites</span></div><span style={{ marginLeft: 'auto', fontSize: 11, color: '#bfe2b0' }}>● anonim</span></div>
        <div className="main">
          {authView === 'hos' && (
            <div className="authhero">
              <div className="authmark">
                <div className="ic">🌿</div>
                <div className="word">Rite</div>
                <div className="tag">günlük ritüellerin, tek yerde</div>
              </div>
              <div className="authbtns">
                <button className="btn" onClick={() => { setAuthView('kayit'); setAuthMsg(''); }}>Hesap oluştur</button>
                <button className="btn ghost" onClick={() => { setAuthView('giris'); setAuthMsg(''); }}>Giriş yap</button>
              </div>
            </div>
          )}
          {(authView === 'giris' || authView === 'kayit') && (
            <div className="card" style={{ marginTop: 26 }}>
              <button className="linkbtn" onClick={() => { setAuthView('hos'); setAuthMsg(''); }}>‹ Geri</button>
              <h2 style={{ marginTop: 10 }}>{authView === 'kayit' ? 'Hesap oluştur' : 'Giriş yap'}</h2>
              <p className="sub">{authView === 'kayit' ? 'E-posta ve şifrenle kendi Rite hesabını oluştur.' : 'E-posta ve şifrenle giriş yap.'}</p>
              <label>E-posta</label>
              <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="ornek@eposta.com" type="email" autoCapitalize="none" autoComplete="email" />
              <label style={{ marginTop: 10 }}>Şifre</label>
              <div className="pwwrap">
                <input value={authPass} onChange={(e) => setAuthPass(e.target.value)} placeholder="En az 6 karakter" type={showPass ? 'text' : 'password'} autoComplete={authView === 'kayit' ? 'new-password' : 'current-password'} />
                <button type="button" className="pweye" onClick={() => setShowPass((s) => !s)}>{showPass ? '🙈' : '👁'}</button>
              </div>
              {authView === 'kayit' && (
                <>
                  <label style={{ marginTop: 10 }}>Şifre (tekrar)</label>
                  <div className="pwwrap">
                    <input value={authPass2} onChange={(e) => setAuthPass2(e.target.value)} placeholder="Şifreni tekrar gir" type={showPass2 ? 'text' : 'password'} autoComplete="new-password" />
                    <button type="button" className="pweye" onClick={() => setShowPass2((s) => !s)}>{showPass2 ? '🙈' : '👁'}</button>
                  </div>
                </>
              )}
              <div style={{ marginTop: 16 }}><button className="btn" onClick={authView === 'kayit' ? authKayit : authGiris}>{authView === 'kayit' ? 'Hesap oluştur' : 'Giriş yap'}</button></div>
              {authMsg && <div className="msg">{authMsg}</div>}
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button className="linkbtn" onClick={() => { setAuthView(authView === 'kayit' ? 'giris' : 'kayit'); setAuthMsg(''); }}>{authView === 'kayit' ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Hesap oluştur'}</button>
              </div>
            </div>
          )}
          <p className="note" style={{ textAlign: 'center', marginTop: 8 }}>Telefonda: tarayıcı menüsü → &quot;Ana ekrana ekle&quot;.</p>
        </div>
      </div>
    );
  }

  const bagli = !!client.meridyen_bagli;
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
  const ibBadge = inbox.filter((x) => x.durum === 'yeni').length;
  const personalActs = activities.filter((a) => a.client_id === client.id);
  const personalGroupOf = (a: any) => a.grup && a.grup !== 'Kişisel' ? a.grup : 'Genel';
  // Havuz gruplama: Genel ve Meridyen her zaman seçenek olarak durur (boş bile olsalar), üstüne kullanıcının
  // kendi eklediği gruplar eklenir — sabit iki sekme yerine büyüyebilen bir chip listesi.
  const HAVUZ_VARSAYILAN_GRUPLAR = ['Genel', 'Meridyen'];
  // ekstraGruplar: "+ yeni grup" ile önceden açılmış ama henüz hiç aktivitesi olmayan gruplar (bu oturumda) —
  // bir aktivite o gruba girince zaten personalActs üzerinden kalıcı olarak da gelir.
  const personalGroups = Array.from(new Set([...HAVUZ_VARSAYILAN_GRUPLAR, ...personalActs.map(personalGroupOf), ...ekstraGruplar]));

  function RitItem({ rt }: { rt: any }) {
    const done = ritDone(rt.id);
    const total = ritTotal(rt.id);
    const tip = rt.kart_tipi || 'standart';
    const cfg = rt.kart_config || {};
    const noDone = tip === 'anket' || tip === 'coktan' || tip === 'nefes' || tip === 'ruhhali' || tip === 'tarif' || tip === 'sukran' || tip === 'topraklama' || tip === 'pomodoro' || tip === 'beden' || tip === 'uykuoncesi' || tip === 'su' || tip === 'maruz' || tip === 'niyet' || tip === 'workout' || (tip === 'video' && cfg.done === false) || (tip === 'randevu' && cfg.done === false);
    const vurl = tip === 'video' ? (cfg.url || rt.url) : rt.url;
    const ipucu = tip === 'anket' ? '📋 doldur' : tip === 'coktan' ? '❓ yanıtla' : tip === 'diyet' ? '🍽 öğün' : tip === 'tarif' ? '🍳 tarif' : tip === 'video' ? '🎬 izle' : tip === 'nefes' ? '🫁 nefes' : tip === 'ruhhali' ? '🙂 check-in' : tip === 'workout' ? '🏋️ egzersiz' : tip === 'bilgi' ? '📄 oku' : tip === 'sukran' ? '🙏 şükran' : tip === 'topraklama' ? '🖐 topraklan' : tip === 'pomodoro' ? '🍅 odaklan' : tip === 'beden' ? '🧘 taransın' : tip === 'uykuoncesi' ? '🌙 hazırlan' : tip === 'su' ? '💧 iç' : tip === 'maruz' ? '🎯 uygula' : tip === 'niyet' ? '🧭 niyet belirle' : tip === 'randevu' ? '📅 randevu' : '';
    const meridyen = rt.kaynak === 'Meridyen'; // sağlayıcı-kaynaklı kart — kişisel kartlardan çerçeveyle ayrıştır
    const stilP = cfg.stil ? STIL_LOOKUP[cfg.stil] : null;
    return (
      <div>
        <div className={'rit' + (meridyen && !stilP ? ' rit-mer' : '')} style={stilP ? { borderLeft: '3px solid ' + stilP.ac, paddingLeft: 9 } : undefined}>
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
                <h3>Rutin oluştur</h3>
                <input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Rutin adı (ops. — ör. Sabah rutini)" style={{ marginBottom: 8 }} />
                <p className="note" style={{ marginTop: 4 }}>Aktivitelere sırayla dokun (numara = sıra). En az 2 seç. İlk seçtiğinin zaman dilimi kullanılır, hepsi o dilime taşınır. Kaydettikten sonra ajandadan başka aktiviteleri de üstüne sürükleyip rutine ekleyebilirsin.</p>
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
                {habits.length === 0 && <div className="empty">Bugün için kart yok. Aşağıdaki ＋ ile ekleyebilirsin.</div>}
                {habits.length > 0 && (() => {
                  // Artık sabit zaman dilimi ayracı yok — kartlar (ve kullanıcının eklediği ayraçlar) TEK düz,
                  // güne özel sıralı bir liste (bkz gunSiraMap / dog_gun_duzeni). Rutin (isimli grup) kapalıyken
                  // tek 'rutinHead' satırı; açıksa hemen ardından her üyesi kendi 'member' satırı olarak eklenir —
                  // böylece hem üst düzey sürükleme hem rutin-içi sürükleme AYNI düz listede, tek DndContext ile
                  // çözülüyor (bkz. onDragEndDay).
                  const rows: any[] = [];
                  const gunOrder = gunSiraMap[day]; // bu güne özel kaydedilmiş sıra (yoksa/boşsa blok_sira'ya düşülür)
                  const blokSira = (it: any) => Number(it.members[0].blok_sira) || 0;
                  const map = new Map<string, any>();
                  for (const r of habits) {
                    const key = r.rutin ? 'r:' + r.rutin : 's:' + r.id;
                    if (!map.has(key)) map.set(key, { key, rutin: r.rutin || null, rutinAd: r.rutin_ad || null, members: [] });
                    map.get(key).members.push(r);
                  }
                  const items = Array.from(map.values());
                  for (const it of items) it.members.sort((a: any, b: any) => (a.sira || 0) - (b.sira || 0));
                  if (gunOrder && gunOrder.length) {
                    items.sort((a, b) => {
                      const ia = gunOrder.indexOf(a.key), ib = gunOrder.indexOf(b.key);
                      if (ia === -1 && ib === -1) return blokSira(a) - blokSira(b);
                      if (ia === -1) return 1;
                      if (ib === -1) return -1;
                      return ia - ib;
                    });
                  } else {
                    items.sort((a, b) => blokSira(a) - blokSira(b));
                  }
                  items.forEach((it) => {
                    if (it.rutin) {
                      rows.push({ key: it.key, kind: 'rutinHead', rutin: it.rutin, rutinAd: it.rutinAd, members: it.members });
                      if (expandedRutin.has(it.rutin)) {
                        it.members.forEach((m: any, i: number) => rows.push({ key: 'm:' + m.id, kind: 'member', rutin: it.rutin, ritual: m, members: [m], isLast: i === it.members.length - 1 }));
                      }
                    } else if (it.members[0].kart_tipi === 'ayrac') {
                      rows.push({ key: it.key, kind: 'ayrac', members: it.members });
                    } else {
                      rows.push({ key: it.key, kind: 'item', members: it.members });
                    }
                  });

                  // Başlık + (açıksa) üyeler tek bir kutuymuş gibi görünsün diye kenarlar/köşeler birbirine
                  // kaynatılıyor: başlık açıkken alt kenarını kapatır, üyeler üstten kaynaşır, sadece SON üye
                  // kutuyu alttan kapatır (isLast). Girinti sadece sol iç boşlukla veriliyor.
                  const rowBody = (r: any) => {
                    if (r.kind === 'ayrac') {
                      const rt = r.members[0];
                      const editing = ayracEditId === rt.id;
                      return (
                        <div className="timediv">
                          {editing ? (
                            <input autoFocus value={ayracAdVal} onChange={(e) => setAyracAdVal(e.target.value)} onBlur={() => ayracAdKaydet(rt.id)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={{ flex: 1, fontSize: 12, padding: '4px 8px' }} />
                          ) : (
                            <span className="tl" style={{ cursor: 'pointer' }} onClick={() => { setAyracEditId(rt.id); setAyracAdVal(rt.ad); }}>{rt.ad}</span>
                          )}
                          <span className="ln" />
                          <button className="rmx" onClick={() => ayracSil(rt.id)} aria-label="ayracı sil">✕</button>
                        </div>
                      );
                    }
                    if (r.kind === 'rutinHead') {
                      const doneCount = r.members.filter((m: any) => ritDone(m.id)).length;
                      const hepsi = r.members.length > 0 && doneCount === r.members.length;
                      const acik = expandedRutin.has(r.rutin);
                      return (
                        <div className="card routine" style={acik ? { marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: 'none', paddingBottom: 8 } : undefined}>
                          <div className="rh" style={{ border: 'none', padding: 0 }}>
                            <div className={'chk' + (hepsi ? ' on' : '')} onClick={(e) => { e.stopPropagation(); toggleRutinAll(r.members); }} title="Hepsini yaptım / geri al" style={{ width: 22, height: 22, flex: '0 0 22px' }}>{hepsi ? '✓' : ''}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {rutinAdEdit === r.rutin ? (
                                <input autoFocus value={rutinAdVal} onChange={(e) => setRutinAdVal(e.target.value)} onClick={(e) => e.stopPropagation()} onBlur={() => saveRutinAd(r.rutin)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={{ width: '100%' }} />
                              ) : (
                                <div style={{ cursor: 'pointer' }} onClick={() => { if (acik) { setRutinAdEdit(r.rutin); setRutinAdVal(r.rutinAd || ''); } else { toggleRutinExpand(r.rutin); } }}>🔗 {r.rutinAd || 'Rutin'} <span style={{ fontWeight: 400, opacity: .6 }}>· {doneCount}/{r.members.length}</span></div>
                              )}
                            </div>
                            <div style={{ flex: '0 0 auto', opacity: .6, cursor: 'pointer', padding: '4px 2px' }} onClick={() => toggleRutinExpand(r.rutin)}>{acik ? '▾' : '▸'}</div>
                          </div>
                          {acik && <div style={{ textAlign: 'right', marginTop: 4 }}><button className="rboz" onClick={() => rutinBoz(r.rutin)}>rutini boz</button></div>}
                        </div>
                      );
                    }
                    if (r.kind === 'member') {
                      const rt = r.ritual;
                      const done = ritDone(rt.id);
                      return (
                        <div
                          className="card"
                          style={{
                            padding: '2px 14px 2px 30px',
                            margin: r.isLast ? '0 0 10px' : 0,
                            borderTop: '1px dashed var(--line)',
                            borderTopLeftRadius: 0,
                            borderTopRightRadius: 0,
                            borderBottomLeftRadius: r.isLast ? 14 : 0,
                            borderBottomRightRadius: r.isLast ? 14 : 0,
                            borderBottom: r.isLast ? undefined : 'none',
                          }}
                        >
                          <div className="cstep">
                            <div className={'cdot' + (done ? ' on' : '')} onClick={() => toggleRit(rt.id)}>{done ? '✓' : ''}</div>
                            <div className="cbody" style={{ cursor: 'pointer' }} onClick={() => openRit(rt)}><div className="t">{rt.ad}{ritAreas(rt).map((a: string) => <span key={a} className="tagp p-alan">{a}</span>)}{rt.kart_config?.dikey && DIKEY_LABEL[rt.kart_config.dikey] && <span className="tagp p-dikey">{DIKEY_LABEL[rt.kart_config.dikey]}</span>}</div><div className="m">{rt.hatirlatma_saat ? '🔔 ' + rt.hatirlatma_saat + ' · ' : ''}toplam {ritTotal(rt.id)}</div></div>
                            <div className="cact">
                              {rt.url && <a href={rt.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Aç">▶</a>}
                              <button onClick={(e) => { e.stopPropagation(); rutinCikar(rt.id); }} title="Rutinden çıkar">✕</button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return <div className="card" style={{ padding: '4px 10px' }}><RitItem rt={r.members[0]} /></div>;
                  };

                  return (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onDragEndDay(rows, e)}>
                      <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
                        {rows.map((r) => (
                          <SortableRow key={r.key} id={r.key}>
                            {rowBody(r)}
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
                      // Sayıma yalnız "yapılabilir" (done'lanabilir) ritüeller: mesaj tipi video (done:false) ve ayraçlar hariç.
                      const gunRit = rituals.filter((r) => !r.mezun && activeOn(r, ds) && r.kart_tipi !== 'ayrac' && !(r.kart_tipi === 'video' && r.kart_config && r.kart_config.done === false));
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
              const randevular = rituals.filter((r) => !r.mezun && r.baslangic && r.baslangic === r.bitis && r.baslangic >= today && (r.kart_tipi === 'randevu' || r.kart_config?.randevu === true)).sort((a, b) => (a.baslangic < b.baslangic ? -1 : 1));
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
            <h2>Aktivite Havuzu</h2>
            <p className="sub">Yeni bir kişisel kart Ajanda&apos;daki <b>+</b> ile oluşturulur. Burada aktiviteler gruplar halinde durur.</p>
            <div className="tabs">
              {personalGroups.map((g) => <div key={g} className={'tab' + (actGroup === g ? ' on' : '')} onClick={() => setActGroup(g)}>{g}</div>)}
              <div className="tab" onClick={() => { setYeniGrupAd(''); setYeniGrupOpen((o) => !o); }}>＋ yeni grup</div>
            </div>
            {yeniGrupOpen && (
              <div style={{ display: 'flex', gap: 6, margin: '0 0 10px' }}>
                <input value={yeniGrupAd} onChange={(e) => setYeniGrupAd(e.target.value)} placeholder="ör. Beslenme" style={{ flex: 1 }} autoFocus />
                <button className="btn sm" onClick={() => { const g = yeniGrupAd.trim(); if (!g) return; setEkstraGruplar((a) => Array.from(new Set([...a, g]))); setActGroup(g); setYeniGrupOpen(false); setYeniGrupAd(''); }}>Ekle</button>
                <button className="btn ghost sm" onClick={() => setYeniGrupOpen(false)}>Vazgeç</button>
              </div>
            )}
            <div className="card">
              {personalActs.filter((a) => personalGroupOf(a) === actGroup).length === 0 ? (
                <div className="note">Bu grupta aktivite yok.</div>
              ) : personalActs.filter((a) => personalGroupOf(a) === actGroup).map((a) => (
                <div key={a.id} className="actcard" onClick={() => openDetay(a, 'aktivite')}>
                  <div style={{ flex: 1 }}><div className="n">{a.tur === 'program' ? '🧩 ' : ''}{a.ad}{a.puan ? <span className="puanp"> {'★'.repeat(a.puan)}</span> : ''}</div><div className="o">{a.tur === 'program' ? (a.adimlar || []).length + ' adım' + (a.sure_gun ? ' · ' + a.sure_gun + ' gün' : '') : (a.kaynak_etiket === 'Mezun' ? 'Mezun · ' : '') + Array.from(new Set((a.faydalar || []).map((k: string) => faydaMap[k]?.alan).filter(Boolean))).join(' · ')}</div></div>
                  <span className="go">›</span>
                </div>
              ))}
            </div>
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
          <div className="modal top" onMouseDown={() => setInboxOpen(false)}>
          <div className="sheet topsheet" onMouseDown={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setInboxOpen(false)}>×</button>
            <h2 style={{ marginTop: 2 }}>📥 Inbox</h2>
            <div className="note" style={{ marginTop: 0 }}>Başkalarının seninle paylaştığı kartlar burada birikir. <button className="btn ghost sm" style={{ marginLeft: 6 }} onClick={() => client && loadInbox(client.id)}>🔄 Yenile</button></div>
            {inbox.length === 0 && <div className="note" style={{ textAlign: 'center', marginTop: 10 }}>Inbox boş. Sana bir şey paylaşıldığında burada göreceksin. Kendi notunu/randevunu eklemek için alttaki ＋ butonunu kullan.</div>}
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
          <div className="modal top" onMouseDown={() => setIbDetay(null)}>
          <div className="sheet topsheet" onMouseDown={(e) => e.stopPropagation()}>
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

            <div className="card profilcard">
              <div className="avatar">{avatarSec || (profilAd || client.ad || 'R').trim().charAt(0).toUpperCase()}</div>
              <div className="pinfo">
                <div className="pname">{profilAd || client.ad || 'Kullanıcı'}</div>
                {client.email && <div className="note" style={{ margin: '2px 0 0' }}>{client.email}</div>}
              </div>
              <button className="btn ghost sm" onClick={() => { setNewPass(''); setNewPass2(''); setPwMsg(''); setProfilEditOpen(true); }}>Değiştir</button>
            </div>

            <div className="card">
              <div className="mrow" style={{ borderTop: 'none' }}>
                <span>Meridyen bağlantısı</span>
                {bagli ? <span className="pstat" style={{ color: 'var(--green)' }}>✓ bağlı</span> : <span className="pstat">bağlı değil</span>}
              </div>
              <div className="rowbtns" style={{ marginTop: 6 }}><button className="btn ghost sm" onClick={() => setBaglantiOpen(true)}>{bagli ? 'Yönet' : 'Bağlan'}</button></div>
            </div>

            <div className="card">
              <div className="mrow" style={{ borderTop: 'none' }}>
                <span>Paylaşım</span>
                <span className="pstat">{kisiler.length > 0 ? kisiler.length + ' kişi' : 'kimse yok'}</span>
              </div>
              <div className="rowbtns" style={{ marginTop: 6 }}><button className="btn ghost sm" onClick={() => setPaylasimAyarOpen(true)}>Yönet</button></div>
            </div>

            <div className="card"><h3>Bildirimler</h3>
              <p className="note">Ana ekrana eklersen uygulama kapalıyken de hatırlatma alırsın.</p>
              <div className="rowbtns"><button className="btn ghost sm" onClick={enableNotifs}>{pushOn ? '🔔 Açık' : '🔔 Bildirimleri aç'}</button><button className="btn ghost sm" onClick={testPush}>Test gönder</button></div>
              {pushMsg && <div className="msg">{pushMsg}</div>}
            </div>
            <div className="card"><h3>Test</h3>
              <div className="note" style={{ marginTop: 0 }}>Ajandayı sıfırla: tüm ritüeller ve işaretler silinir (kişisel aktiviteler havuzda kalır).</div>
              <div className="rowbtns"><button className="btn ghost sm" style={{ color: 'var(--red)', borderColor: '#e6c4bd' }} onClick={resetAjanda}>Ajandayı sıfırla</button></div>
            </div>

            <button className="linkbtn" style={{ display: 'block', margin: '20px auto 6px', color: 'var(--red)' }} onClick={cikis}>Hesaptan çıkış</button>
          </div>
        )}
      </div>

      <div className="nav">
        {[['ajanda', '🗓', 'Ajanda'], ['havuz', '⊕', 'Havuz']].map(([k, ic, l]) => (
          <button key={k} className={['ajanda', 'mezunlar'].includes(screen) && k === 'ajanda' ? 'on' : screen === k ? 'on' : ''} onClick={() => setScreen(k)}><span className="ic">{ic}</span>{l}</button>
        ))}
        <button className="plus" onClick={() => setEkleMenuOpen(true)} aria-label="Ekle">＋</button>
        {[['gelisim', '📈', 'Gelişim'], ['bilgi', '⚙', 'Ayarlar']].map(([k, ic, l]) => (
          <button key={k} className={screen === k ? 'on' : ''} onClick={() => setScreen(k)}><span className="ic">{ic}</span>{l}</button>
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
        // Bilgi kartı düzenlemesi (video/içerik/cümle saniyesi): kart "canlı adım" olarak şablondan okunuyorsa
        // kaydı da şablona yazmak gerekir — yoksa ekran hep şablondaki eski veriyi göstermeye devam eder (kCfg
        // yukarıda canliAdim'i önceliklendiriyor).
        const bilgiKaydet = canliAdim && o.sablon_id
          ? (c: any) => setSablonAdimKart(o.sablon_id, o.sablon_adim ?? 0, c)
          : (c: any) => setBilgiCfg(o.id, c);
        const noDone = kTip === 'anket' || kTip === 'coktan' || kTip === 'nefes' || kTip === 'ruhhali' || kTip === 'tarif' || kTip === 'sukran' || kTip === 'topraklama' || kTip === 'pomodoro' || kTip === 'beden' || kTip === 'uykuoncesi' || kTip === 'su' || kTip === 'maruz' || kTip === 'niyet' || kTip === 'workout' || (kTip === 'video' && kCfg.done === false) || (kTip === 'randevu' && kCfg.done === false);
        const gunOzet = !o.baslangic ? "📥 Inbox'ta bekliyor" : (o.baslangic === o.bitis ? '📅 ' + kisaTarih(o.baslangic) : (o.bitis ? kisaTarih(o.baslangic) + ' → ' + kisaTarih(o.bitis) : 'süregelen · ' + kisaTarih(o.baslangic) + "'den"));
        const yarin = (() => { const d = parseD(today); d.setDate(d.getDate() + 1); return iso(d); })();
        // Meridyen'den (koçtan) gelen kart/program — doğrudan atanmış ya da şablona bağlı (sablon_id) — danışan
        // tarafından başka birine paylaşılamaz. Kendi yazdığı ya da bir arkadaşından aldığı kişisel kartlar serbest.
        const paylasilamaz = isRit ? (o.kaynak === 'Meridyen' || o.kaynak === 'Program' || !!o.sablon_id) : !!o.sablon_id;
        const stilP = kCfg.stil ? STIL_LOOKUP[kCfg.stil] : null;
        return (
        <div className="modal full" onMouseDown={() => closeDetay()}>
          <div className="sheet fullsheet" onMouseDown={(e) => e.stopPropagation()} style={stilP ? { borderTop: '4px solid ' + stilP.ac } : undefined}>
            <div className="sheetgrip" onClick={() => closeDetay()} />
            <button className="x" onClick={() => closeDetay()}>×</button>
            {isRit ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {kTip === 'bilgi' && <div className={'chk' + (ritDone(o.id) ? ' on' : '')} onClick={() => toggleRit(o.id)} title="Yaptım">{ritDone(o.id) ? '✓' : ''}</div>}
                <input className="detbaslik" value={adInput} onChange={(e) => setAdInput(e.target.value)} onBlur={() => { if (adInput.trim() && adInput.trim() !== (o.ad || '')) setRitAd(o.id, adInput); }} style={{ flex: 1 }} />
              </div>
            ) : <h2 style={{ paddingRight: 34 }}>{o.ad}</h2>}
            <div className="m">
              {isRit ? null : (
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

            {isRit && (() => {
              // Zamanlama (🕐) ve mezun etme (🎓) artık sadece Alışkanlık tipinde kişisel kartlarda gösteriliyor —
              // Not ve Randevu (ikisi de kart_tipi='bilgi', kaynak='Kendi', ama alışkanlık DEĞİL) bu ikisinden
              // arındırıldı; alışkanlık artık oluşturulurken (＋ menüsünden) seçilen bir tip, sonradan dönüştürülen
              // bir özellik değil (kullanıcı isteği).
              const kisiselBilgi = o.kaynak === 'Kendi' && kTip === 'bilgi';
              const zamanlamaGoster = !kisiselBilgi || o.aliskanlik;
              // Kart daha bu an ＋ menüsünden oluşturulduysa (taze), "zaten var olan bir kart" için anlamlı
              // mezun et / paylaş seçenekleri bir süre gizli kalır (kullanıcı isteği) — kapatıp tekrar açınca kalkar.
              const isTaze = taze === o.id;
              return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, margin: '2px 0 10px' }}>
                <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
                  {zamanlamaGoster && <button className="btn ghost sm" onClick={() => setZamanOpen(true)} title={gunOzet} aria-label="Zamanlama">🕐</button>}
                  {zamanlamaGoster && !isTaze && !o.mezun && (o.aliskanlik ? (
                    <button className="btn ghost sm" onClick={() => setHabitMenuFor(o)} title="Alışkanlık seçenekleri" aria-label="Alışkanlık seçenekleri">🎓</button>
                  ) : (
                    <button className="btn ghost sm" style={{ opacity: .4 }} onClick={() => setRitAliskanlik(o.id, true)} title="Alışkanlık yap" aria-label="Alışkanlık yap">🎓</button>
                  ))}
                  {o.hatirlatma_saat ? (
                    <button className="btn ghost sm" onClick={() => { setRemInput(o.hatirlatma_saat || ''); setRemMenuFor({ ...o, _randevu: kTip === 'randevu' || !!kCfg?.randevu }); }} title="Bildirim seçenekleri" aria-label="Bildirim seçenekleri">🔔 {o.hatirlatma_saat}</button>
                  ) : (
                    <button className="btn ghost sm" style={{ opacity: .4 }} onClick={() => { setRemInput(''); setRemMenuFor({ ...o, _randevu: kTip === 'randevu' || !!kCfg?.randevu }); }} title="Bildirim ekle" aria-label="Bildirim ekle">🔔</button>
                  )}
                  {!paylasilamaz && !isTaze && <button className="btn ghost sm" onClick={() => { setPaylasOpen(true); setKMsg(''); }} title="Paylaş" aria-label="Paylaş">↪️</button>}
                </div>
              </div>
              );
            })()}
            {/* Not eklerken/düzenlerken "bu bir randevu" seçme kutusu artık yok — Randevu, alttaki ＋ menüsünden
                kendi başına oluşturuluyor. Bir kart zaten randevu olarak oluşturulduysa (kart_config.randevu),
                burada sadece bilgilendirme gösterilir, dönüştürme seçeneği sunulmaz. */}
            {isRit && o.kaynak === 'Kendi' && kTip === 'bilgi' && !!kCfg?.randevu && (
              <div style={{ margin: '-6px 0 10px' }}>
                <span className="note" style={{ margin: 0 }}>📅 Bu bir randevu — saat için üstteki &quot;değiştir&quot;den hatırlatma, buluşma linki için aşağıdan &quot;+ Link ekle&quot;yi kullan.</span>
              </div>
            )}
            {isRit && kTip === 'standart' && kCfg?.resim && <img src={kCfg.resim} alt="" style={{ maxWidth: '100%', borderRadius: 8, margin: '4px 0 8px', display: 'block' }} />}
            {isRit && kTip === 'bilgi' && (o.kaynak === 'Kendi' ? <BilgiKartEdit cfg={kCfg} onSave={bilgiKaydet} /> : <BilgiKart cfg={kCfg} onSave={bilgiKaydet} />)}
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
            {isRit && kTip === 'randevu' && (o.kaynak === 'Kendi' ? <RandevuKartEdit cfg={kCfg} onSave={(p) => setRandevuCfg(o.id, p)} /> : <RandevuKart cfg={kCfg} />)}

            {isRit && (
              <div style={{ margin: '4px 0 8px' }}>
                <textarea value={kisiselNotInput} onChange={(e) => setKisiselNotInput(e.target.value)} onBlur={() => { if (kisiselNotInput.trim() !== (o.kisisel_not || '')) setRitKisiselNot(o.id, kisiselNotInput); }} placeholder="✎ Kendi notun (isteğe bağlı — şablon güncellense de bu değişmez)" style={{ width: '100%', minHeight: 36 }} />
              </div>
            )}

            {isRit && !noDone && kTip !== 'bilgi' && (
              <button className={'btn' + (ritDone(o.id) ? ' ghost' : '')} style={{ width: '100%', margin: '2px 0 8px' }} onClick={() => toggleRit(o.id)}>{ritDone(o.id) ? '✓ Yaptım — geri al' : '✓ Yaptım'}</button>
            )}

            {isRit && zamanOpen && (
              <div className="modal top2" onMouseDown={() => setZamanOpen(false)}>
              <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
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
              <div className="modal top2" onMouseDown={() => setPaylasOpen(false)}>
              <div className="sheet small" onMouseDown={(e) => e.stopPropagation()}>
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

            {isProg && <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => { programBaslat(o); closeDetay(); setScreen('ajanda'); }}>Ajandama başlat{o.sure_gun ? ' (' + o.sure_gun + ' gün)' : ''}</button>}
            {!isRit && !isProg && <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => { aktiviteEkleSlotlar(o); closeDetay(); setScreen('ajanda'); }}>Ajandama ekle</button>}

            {(!isRit || (personal && !isProg)) && (
              <div className="dettoolbar">
                {!isRit && !paylasilamaz && <button className="tbtn" onClick={() => { setPaylasOpen(true); setKMsg(''); }}><span className="tbic">↪️</span>Paylaş</button>}
                {personal && !isProg && <button className="tbtn" onClick={() => { closeDetay(); openStudioEdit(act); }}><span className="tbic">✎</span>Düzenle</button>}
                {!isRit && personal && <button className="tbtn danger" onClick={() => silAktivite(o)}><span className="tbic">🗑</span>Sil</button>}
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {habitMenuFor && (
        <div className="modal top2" onMouseDown={() => setHabitMenuFor(null)}>
          <div className="sheet small" onMouseDown={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setHabitMenuFor(null)}>×</button>
            <h3 style={{ marginBottom: 2 }}>🎓 {habitMenuFor.ad}</h3>
            <p className="note" style={{ marginTop: 0 }}>Bu bir alışkanlık — ne yapmak istersin?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <button className="btn ghost sm" onClick={() => { setRitAliskanlik(habitMenuFor.id, false); setHabitMenuFor(null); }}>↩️ Alışkanlıktan çıkar</button>
              <button className="btn" onClick={() => { setMezunPuan(0); setMezunModal(habitMenuFor); setHabitMenuFor(null); }}>🎓 Mezun et</button>
              <button className="btn ghost sm" onClick={() => setHabitMenuFor(null)}>Vazgeç</button>
            </div>
            <div className="note" style={{ marginTop: 8 }}>Alışkanlıktan çıkarmak zararsız — istersen tekrar işaretlersin. Mezun et ise ritüeli ajandadan tamamen kaldırır.</div>
          </div>
        </div>
      )}

      {remMenuFor && (
        <div className="modal top2" onMouseDown={() => setRemMenuFor(null)}>
          <div className="sheet small" onMouseDown={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setRemMenuFor(null)}>×</button>
            <h3 style={{ marginBottom: 2 }}>🔔 {remMenuFor.ad}</h3>
            <p className="note" style={{ marginTop: 0 }}>{remMenuFor._randevu ? 'Randevu saati' : 'Günlük hatırlatma saati'}</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
              <input type="time" style={{ width: 'auto' }} value={remInput} onChange={(e) => setRemInput(e.target.value)} />
            </div>
            <div className="note" style={{ marginBottom: 10 }}>Uygulama kapalıyken de bildirim gelir (push açıksa). Saat: Türkiye saati.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn" disabled={!remInput || remInput === (remMenuFor.hatirlatma_saat || '')} onClick={() => { setRitReminder(remMenuFor.id, remInput); setRemMenuFor(null); }}>Kaydet</button>
              {remMenuFor.hatirlatma_saat && <button className="btn ghost sm" onClick={() => { setRitReminder(remMenuFor.id, ''); setRemMenuFor(null); }}>Bildirimi kapat</button>}
              <button className="btn ghost sm" onClick={() => setRemMenuFor(null)}>Vazgeç</button>
            </div>
          </div>
        </div>
      )}

      {mezunModal && (
        <div className="modal top2" onMouseDown={() => setMezunModal(null)}>
          <div className="sheet small" onMouseDown={(e) => e.stopPropagation()}>
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
        <div className="modal" onMouseDown={() => { studioReset(); setStudioOpen(false); }}>
          <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => { studioReset(); setStudioOpen(false); }}>×</button>
            <h2>Aktiviteyi düzenle</h2>
            <p className="note" style={{ marginTop: 0 }}>Havuzdaki bu aktivitenin ad, grup, not ve bağlantısını düzenle.</p>
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
              <button className="btn" onClick={studioKaydet}>Kaydet</button>
              <button className="btn ghost sm" onClick={() => { studioReset(); setStudioOpen(false); }}>Vazgeç</button>
            </div>
            <div className="msg">{kMsg}</div>
          </div>
        </div>
      )}

      {profilEditOpen && (
        <div className="modal" onMouseDown={() => setProfilEditOpen(false)}>
          <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setProfilEditOpen(false)}>×</button>
            <h2>Profili düzenle</h2>
            <label style={{ marginTop: 0 }}>Kullanıcı adın</label>
            <input value={profilAd} onChange={(e) => setProfilAd(e.target.value)} placeholder="ör. Behnan" />
            <label className="fldlbl">Avatar</label>
            <div className="avpick">
              {AVATARLAR.map((a) => (
                <button key={a} type="button" className={'avopt' + (avatarSec === a ? ' on' : '')} onClick={() => setAvatarSec(a)}>{a}</button>
              ))}
            </div>
            <div className="card" style={{ marginTop: 14, opacity: .55 }}>
              <div className="mrow" style={{ borderTop: 'none' }}><span>Tema</span><span className="note" style={{ margin: 0 }}>yakında</span></div>
            </div>
            <div className="rowbtns" style={{ marginTop: 14 }}><button className="btn" onClick={profilKaydet}>Kaydet</button></div>
            {profilMsg && <div className="msg">{profilMsg}</div>}

            <label className="fldlbl" style={{ marginTop: 18 }}>Şifreni değiştir</label>
            <div className="pwwrap">
              <input value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Yeni şifre (en az 6 karakter)" type={showNewPass ? 'text' : 'password'} autoComplete="new-password" />
              <button type="button" className="pweye" onClick={() => setShowNewPass((s) => !s)}>{showNewPass ? '🙈' : '👁'}</button>
            </div>
            <div className="pwwrap" style={{ marginTop: 8 }}>
              <input value={newPass2} onChange={(e) => setNewPass2(e.target.value)} placeholder="Yeni şifre (tekrar)" type={showNewPass2 ? 'text' : 'password'} autoComplete="new-password" />
              <button type="button" className="pweye" onClick={() => setShowNewPass2((s) => !s)}>{showNewPass2 ? '🙈' : '👁'}</button>
            </div>
            <div className="rowbtns" style={{ marginTop: 8 }}><button className="btn ghost sm" onClick={sifreDegistir}>Şifreyi güncelle</button></div>
            {pwMsg && <div className="msg">{pwMsg}</div>}
          </div>
        </div>
      )}

      {baglantiOpen && (
        <div className="modal" onMouseDown={() => setBaglantiOpen(false)}>
          <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setBaglantiOpen(false)}>×</button>
            <h2>Meridyen bağlantısı</h2>
            <div className="mrow" style={{ borderTop: 'none' }}>
              <span>Durum</span>
              {bagli ? <span className="pstat" style={{ color: 'var(--green)' }}>✓ bağlı</span> : <span className="pstat">bağlı değil</span>}
            </div>
            <p className="note" style={{ marginTop: 6 }}>{bagli ? 'Bağlantıyı kesersen hesabın ve kişisel kartların olduğu gibi kalır, yalnız merkezinle ilişiğin kapanır.' : 'Merkezinle bağlantı kurarsan üyeliğin kontrol edilir, üyeysen anında bağlanırsın.'}</p>
            <div className="rowbtns" style={{ marginTop: 10 }}>
              {bagli ? <button className="btn ghost sm" onClick={meridyenBaglantiKes}>Bağlantıyı kes</button> : <button className="btn sm" onClick={meridyeneBaglan}>Meridyen&apos;e bağlan</button>}
            </div>
            {msg && <div className="msg">{msg}</div>}
          </div>
        </div>
      )}

      {paylasimAyarOpen && (
        <div className="modal" onMouseDown={() => setPaylasimAyarOpen(false)}>
          <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setPaylasimAyarOpen(false)}>×</button>
            <h2>Paylaşım</h2>
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
        </div>
      )}

      {ekleMenuOpen && (
        <div className="modal" onMouseDown={() => setEkleMenuOpen(false)}>
          <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
            <div className="sheetgrip" onClick={() => setEkleMenuOpen(false)} />
            <h2>Ekle</h2>
            <div className="ekleGrid">
              <button className="ekleOpt" onClick={() => { setEkleMenuOpen(false); setYeniKartAdVal(''); setYeniKartOpen('not'); }}><span className="ekic">📝</span>Not</button>
              <button className="ekleOpt" onClick={() => { setEkleMenuOpen(false); hemenEkleAliskanlik(); }}><span className="ekic">🎓</span>Alışkanlık</button>
              <button className="ekleOpt" onClick={() => { setEkleMenuOpen(false); setYeniKartAdVal(''); setYeniKartOpen('randevu'); }}><span className="ekic">📅</span>Randevu</button>
              <button className="ekleOpt" onClick={() => { setEkleMenuOpen(false); setAyracAdVal(''); setAyracYeniOpen(true); }}><span className="ekic">➖</span>Ayraç</button>
              <button className="ekleOpt" onClick={() => { setEkleMenuOpen(false); setScreen('ajanda'); setAjView('gun'); startLink(); }}><span className="ekic">🔗</span>Rutin</button>
            </div>
            <div className="note" style={{ textAlign: 'center', marginTop: 12 }}>Not içine bağlantı eklersen otomatik video kartına döner.</div>
          </div>
        </div>
      )}

      {ayracYeniOpen && (
        <div className="modal" onMouseDown={() => setAyracYeniOpen(false)}>
          <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setAyracYeniOpen(false)}>×</button>
            <h2>Yeni ayraç</h2>
            <p className="note" style={{ marginTop: 0 }}>Güne bir bölüm başlığı ekle — ör. &quot;Sabah&quot;, &quot;Egzersiz zamanı&quot;. Eklediğin günden itibaren, sen silene kadar her gün görünür.</p>
            <input autoFocus value={ayracAdVal} onChange={(e) => setAyracAdVal(e.target.value)} placeholder="ör. Sabah" onKeyDown={(e) => { if (e.key === 'Enter') { ayracEkle(ayracAdVal); setAyracYeniOpen(false); } }} />
            <div className="rowbtns" style={{ marginTop: 12 }}><button className="btn" onClick={() => { ayracEkle(ayracAdVal); setAyracYeniOpen(false); }}>Ekle</button></div>
          </div>
        </div>
      )}

      {yeniKartOpen && (
        <div className="modal" onMouseDown={() => setYeniKartOpen(null)}>
          <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setYeniKartOpen(null)}>×</button>
            <h2>{yeniKartOpen === 'randevu' ? 'Yeni randevu' : 'Yeni not'}</h2>
            <p className="note" style={{ marginTop: 0 }}>{yeniKartOpen === 'randevu' ? 'Randevuya bir başlık ver — saat ve buluşma linkini bir sonraki ekranda ekleyeceksin.' : 'Nota bir başlık ver — içeriğini bir sonraki ekranda yazacaksın.'}</p>
            <input autoFocus value={yeniKartAdVal} onChange={(e) => setYeniKartAdVal(e.target.value)} placeholder={yeniKartOpen === 'randevu' ? 'ör. Diyetisyenle görüşme' : 'ör. Alışveriş listesi'} onKeyDown={(e) => { if (e.key === 'Enter') yeniKartKaydet(); }} />
            <div className="rowbtns" style={{ marginTop: 12 }}><button className="btn" onClick={yeniKartKaydet}>Kaydet</button></div>
          </div>
        </div>
      )}

    </div>
  );
}
