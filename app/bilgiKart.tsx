'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

// Rite'ın gerçek 'Bilgi kartı' detay görünümü ve onun bağımlı fonksiyonları — hem app/page.tsx (danışan ekranı)
// hem app/onizleme/page.tsx (Meridyen Studio'dan postMessage ile beslenen canlı önizleme) tarafından içe aktarılır.
// Tek kaynak olmasının amacı: Studio'daki önizleme ile Rite'ta gerçekten görünen şey arasında YORUM FARKI olmasın.

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
// YouTube için enablejsapi=1 + playsinline=1 her zaman eklenir: cümle segmentlerini "postMessage" komutuyla (src'yi
// yeniden yükletmeden) oynatabilmek için gerekli — src'yi değiştirip autoplay=1 ile yeniden yükletmek mobil
// tarayıcıların otomatik oynatma kısıtlarına takılıyordu (masaüstünde çalışıp telefonda çalışmamasının sebebi buydu).
function embedInfo(url?: string | null, bas?: number | null, bit?: number | null): { tur: 'yt' | 'ig'; src: string } | null {
  if (!url) return null;
  let m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/))([\w-]{6,})/);
  if (m) {
    const q: string[] = ['enablejsapi=1', 'playsinline=1'];
    if (bas && bas > 0) q.push('start=' + Math.floor(bas));
    if (bit && bit > 0) q.push('end=' + Math.floor(bit));
    if (typeof window !== 'undefined') q.push('origin=' + encodeURIComponent(window.location.origin));
    return { tur: 'yt', src: 'https://www.youtube.com/embed/' + m[1] + '?' + q.join('&') };
  }
  m = url.match(/instagram\.com\/(reel|reels|p|tv)\/([\w-]+)/);
  if (m) { const t = m[1] === 'reels' ? 'reel' : m[1]; return { tur: 'ig', src: 'https://www.instagram.com/' + t + '/' + m[2] + '/embed' }; }
  return null;
}
// iframeRef verilirse YouTube oynatıcısına dışarıdan postMessage komutu (seekTo/playVideo/pauseVideo) gönderilebilir.
function EmbedVideo({ url, bas, bit, iframeRef }: { url?: string | null; bas?: number | null; bit?: number | null; iframeRef?: { current: HTMLIFrameElement | null } }) {
  const info = embedInfo(url, bas, bit);
  if (!info) return url ? <a className="btn ghost sm" href={url} target="_blank" rel="noreferrer">▶ Aç</a> : null;
  if (info.tur === 'yt') return <div className="ytwrap"><iframe ref={iframeRef} src={info.src} title="video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>;
  return <iframe className="igframe" src={info.src} title="video" scrolling="no" allowFullScreen />;
}
// Tarayıcının yerel TTS'i (Web Speech API) ile metni sesli okur — dil öğrenim kartlarında kelime/cümle telaffuzu için.
function speak(text?: string | null, rate = 0.85, lang = 'ru-RU') {
  try {
    if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = rate;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (_) { /* sessiz */ }
}
// "495" ya da "8:15" gibi bir saniye değerini "8:15" gösterime çevirir; yarım saniye varsa "8:15.5" olarak gösterir
// (ince ayar 0.5 saniyelik adımlarla çalıştığı için tam saniyeye yuvarlarsak değişikliğin etkisi görünmüyordu).
function saniyeStr(s?: number | null): string {
  if (s == null || isNaN(s)) return '';
  const m = Math.floor(s / 60);
  const sn = s % 60;
  const snStr = Number.isInteger(sn) ? String(sn).padStart(2, '0') : sn.toFixed(1).padStart(4, '0');
  return m + ':' + snStr;
}

// Bilgi/makale kartı: video(lar) üstte, altında biçimli metin + kaynaklar; tek bir stilli kutu içinde. "Yaptım" işaretlemesi kart satırından/başlıktaki checkbox'tan yapılır.
// Birden fazla video = alternatifler (ör. seviye/versiyon) — sekme ile tek tek gösterilir, dikey yer sabit kalır.
function BilgiKart({ cfg, onSave }: { cfg: any; onSave?: (cfg: any) => void }) {
  const kaynaklar: string[] = cfg?.kaynaklar || [];
  const videolar: { baslik?: string; url: string; bas?: number; bit?: number }[] = cfg?.videolar && cfg.videolar.length ? cfg.videolar : (cfg?.video ? [{ url: cfg.video }] : []);
  const sozluk: { ru: string; okunus?: string; tr?: string; baglam?: string }[] = cfg?.sozluk || [];
  const cumleler: { ru: string; tr?: string; bas?: number; bit?: number; not?: string }[] = cfg?.cumleler || [];
  const [vidSec, setVidSec] = useState(0);
  const [cumleModal, setCumleModal] = useState<number | null>(null);
  const [localBas, setLocalBas] = useState<number | undefined>(undefined);
  const [localBit, setLocalBit] = useState<number | undefined>(undefined);
  const [savedFlash, setSavedFlash] = useState(false);
  const secili = videolar[Math.min(vidSec, videolar.length - 1)];
  const acikCumle = cumleModal != null ? cumleler[cumleModal] : null;
  const ytRef = useRef<HTMLIFrameElement>(null);
  const bitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalYtRef = useRef<HTMLIFrameElement>(null);
  const modalBitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // localBas/localBit'in en son değerini setTimeout içinden okumak için: state'i doğrudan okumak eski (kapanış anındaki)
  // değeri verirdi, bu da art arda hızlı dokunuşlarda bir önceki değişikliğin üzerine yazıp kaybetmesine yol açıyordu.
  const localRef = useRef<{ bas?: number; bit?: number }>({});
  useEffect(() => { localRef.current = { bas: localBas, bit: localBit }; }, [localBas, localBit]);
  useEffect(() => () => { if (bitTimerRef.current) clearTimeout(bitTimerRef.current); if (modalBitTimerRef.current) clearTimeout(modalBitTimerRef.current); if (flashTimerRef.current) clearTimeout(flashTimerRef.current); if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);
  // Modal başka bir cümleye geçtiğinde (önceki/sonraki), o cümlenin gerçek bas/bit'ini yerel taslağa yükler —
  // ince ayar düğmeleri kayıt tamamlanmasını beklemeden bu yerel değeri değiştirip anında geri bildirim verir.
  useEffect(() => {
    if (cumleModal != null) { const c = cumleler[cumleModal]; setLocalBas(c?.bas); setLocalBit(c?.bit); }
  }, [cumleModal]);
  // Kaydı, cümlenin cfg'deki DİĞER alanlarını (ru/tr/not) değil sadece bas/bit'i localRef'ten alarak yapar — böylece
  // arka arkaya bas'a sonra bit'e dokunulduğunda ikinci kayıt, birincisinin henüz supabase'den geri dönmemiş hâlini
  // ("eski" cumleler dizisini) temel alıp ilk değişikliği geri almıyor. Ayrıca 450ms'lik bir gecikmeyle "debounce"
  // ediliyor: hızlı art arda dokunuşlarda tek bir kayıt gider, ara adımlar network sırasına göre birbirini ezmez.
  function persistCumle(idx: number) {
    if (!onSave) return;
    const { bas, bit } = localRef.current;
    const arr = cumleler.map((c, j) => j === idx ? { ...c, bas, bit } : c);
    onSave({ ...cfg, cumleler: arr });
  }
  function flushSave() {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; if (cumleModal != null) persistCumle(cumleModal); }
  }
  function scheduleSave() {
    if (cumleModal == null) return;
    const idx = cumleModal;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { saveTimerRef.current = null; persistCumle(idx); }, 450);
  }
  // Cümleye dokununca video src'sini değiştirip yeniden yüklemek yerine, halihazırda yüklü YouTube oynatıcısına
  // postMessage komutuyla (seekTo/playVideo) "atla ve oynat" komutu gönderilir — bir iframe yeniden yüklemesi
  // olmadığı için mobil tarayıcıların otomatik oynatma engeline takılmıyor (src değiştirip autoplay=1 denemek takılıyordu).
  function ytKomut(func: string, args: any[] = []) {
    try { ytRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*'); } catch (_) { /* sessiz */ }
  }
  function cumleOynat(c: { bas?: number; bit?: number }) {
    const bas = c.bas || 0;
    ytKomut('seekTo', [bas, true]);
    ytKomut('playVideo', []);
    if (bitTimerRef.current) clearTimeout(bitTimerRef.current);
    if (c.bit != null && c.bit > bas) bitTimerRef.current = setTimeout(() => ytKomut('pauseVideo', []), (c.bit - bas + 0.3) * 1000);
  }
  // Modal içindeki video, listedekinden ayrı bir iframe/ref kullanır — modal açıkken oradaki oynatıcıyı komutlar.
  function modalYtKomut(func: string, args: any[] = []) {
    try { modalYtRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*'); } catch (_) { /* sessiz */ }
  }
  function modalOynat() {
    const bas = localBas || 0;
    modalYtKomut('seekTo', [bas, true]);
    modalYtKomut('playVideo', []);
    if (modalBitTimerRef.current) clearTimeout(modalBitTimerRef.current);
    if (localBit != null && localBit > bas) modalBitTimerRef.current = setTimeout(() => modalYtKomut('pauseVideo', []), (localBit - bas + 0.3) * 1000);
  }
  // İnce ayar: yerel değeri anında değiştirip görünür geri bildirim verir (✓ kaydedildi); asıl kayıt scheduleSave
  // ile 450ms geciktirilerek arkada yapılır (bkz. persistCumle/scheduleSave üstteki not).
  function modalNudge(alan: 'bas' | 'bit', delta: number) {
    if (cumleModal == null) return;
    const cur = alan === 'bas' ? (localBas ?? 0) : (localBit ?? 0);
    const yeni = Math.max(0, +(cur + delta).toFixed(1));
    if (alan === 'bas') setLocalBas(yeni); else setLocalBit(yeni);
    setSavedFlash(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setSavedFlash(false), 900);
    scheduleSave();
  }
  // Başka cümleye geçmeden ya da modalı kapatmadan önce, bekleyen (henüz 450ms dolmamış) kaydı hemen gönderir —
  // aksi halde o zamanlayıcı hâlâ ESKİ cümle indeksine kayıtlıyken kullanıcı zaten yeni cümleye geçmiş olabilirdi.
  function cumleGit(i: number) {
    if (i < 0 || i >= cumleler.length) return;
    flushSave();
    setCumleModal(i);
  }
  function cumleKapat() {
    flushSave();
    setCumleModal(null);
  }
  return (
    <>
    <div className="howto">
      <div className="bilgi">
        {videolar.length > 1 && (
          <div style={{ margin: '0 0 6px' }}>
            {videolar.map((v, i) => <span key={i} className={'chip' + (i === vidSec ? ' on' : '')} onClick={() => setVidSec(i)}>{v.baslik || ('Video ' + (i + 1))}</span>)}
          </div>
        )}
        {secili && (
          <div style={{ margin: '0 0 8px', position: 'sticky', top: 44, zIndex: 1, background: 'var(--card2, #f6f4ee)', paddingTop: 2, paddingBottom: 4, boxShadow: '0 6px 8px -6px rgba(24,21,16,.18)' }}>
            {videolar.length === 1 && secili.baslik && <div className="fldlbl" style={{ marginTop: 0 }}>{secili.baslik}</div>}
            <EmbedVideo url={secili.url} bas={secili.bas} bit={secili.bit} iframeRef={ytRef} />
          </div>
        )}
        {cfg?.icerik ? renderMetin(cfg.icerik) : <div className="note" style={{ marginTop: 0 }}>İçerik yok (taslak).</div>}
        {kaynaklar.length > 0 && <div className="kv" style={{ marginTop: 4 }}><div className="k">Kaynaklar</div><div className="v">{kaynaklar.map((k, i) => <div key={i} className="note" style={{ margin: '2px 0' }}>{k}</div>)}</div></div>}
        {sozluk.length > 0 && (
          <Acc title="📚 Sözlük" summary={sozluk.length + ' kelime'}>
            {sozluk.map((v, i) => (
              <div key={i} style={{ margin: '4px 0' }}>
                <div><b>{v.ru}</b>{v.okunus ? <span className="note" style={{ margin: 0 }}> ({v.okunus})</span> : null}<span style={{ marginLeft: 6, cursor: 'pointer' }} onClick={() => speak(v.ru)}>🔊</span></div>
                {v.tr && <div className="note" style={{ marginTop: 2 }}>{v.tr}</div>}
                {v.baglam && <div className="note" style={{ marginTop: 2, fontStyle: 'italic' }}>{v.baglam}</div>}
              </div>
            ))}
          </Acc>
        )}
        {cumleler.length > 0 && (
          <Acc title="💬 Cümle kalıpları" summary={cumleler.length + ' cümle'}>
            {cumleler.map((c, i) => (
              <div key={i} style={{ margin: '4px 0' }}>
                <div>
                  <b>{c.ru}</b>
                  <span style={{ marginLeft: 6, cursor: 'pointer' }} onClick={() => speak(c.ru)}>🔊</span>
                  {(c.bas != null || c.bit != null) && secili && <span style={{ marginLeft: 6, cursor: 'pointer', color: '#1f7a4d', fontWeight: 600 }} onClick={() => cumleOynat(c)}>▶ {saniyeStr(c.bas) || '0:00'}{c.bit != null ? '–' + saniyeStr(c.bit) : ''}</span>}
                  {onSave && <span style={{ marginLeft: 6, cursor: 'pointer', opacity: 0.55 }} onClick={() => setCumleModal(i)}>✎</span>}
                </div>
                {c.tr && <div className="note" style={{ marginTop: 2 }}>{c.tr}</div>}
                {c.not && <div className="note" style={{ marginTop: 2, fontStyle: 'italic' }}>{c.not}</div>}
              </div>
            ))}
          </Acc>
        )}
      </div>
    </div>
    {acikCumle && (
      <div className="modal top2 full" onMouseDown={cumleKapat}>
        <div className="sheet cumlesheet" onMouseDown={(e) => e.stopPropagation()}>
          <button className="x" onClick={cumleKapat}>×</button>
          <div className="cumlebody">
            {secili && (
              <div style={{ margin: '0 0 10px' }}>
                <EmbedVideo url={secili.url} bas={secili.bas} bit={secili.bit} iframeRef={modalYtRef} />
              </div>
            )}
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.4 }}>{acikCumle.ru}</div>
            {acikCumle.tr && <div style={{ fontSize: 17, color: 'var(--ink)', marginTop: 8 }}>{acikCumle.tr}</div>}
            {acikCumle.not && (
              <div className="howto" style={{ marginTop: 10 }}>
                <div className="v" style={{ fontSize: 15, fontStyle: 'italic' }}>{acikCumle.not}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
              <button className="btn ghost sm" onClick={() => speak(acikCumle.ru)}>🔊 Dinle</button>
              {(localBas != null || localBit != null) && <button className="btn sm" onClick={modalOynat}>▶ Oynat</button>}
            </div>
          </div>
          <div className="cumlefoot">
            {onSave && (localBas != null || localBit != null) && (
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
                {localBas != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="note" style={{ margin: 0 }}>Başl.</span>
                    <button className="btn ghost sm" style={{ padding: '4px 11px' }} onClick={() => modalNudge('bas', -0.5)}>−</button>
                    <b style={{ minWidth: 48, textAlign: 'center', display: 'inline-block', fontSize: 13 }}>{saniyeStr(localBas)}</b>
                    <button className="btn ghost sm" style={{ padding: '4px 11px' }} onClick={() => modalNudge('bas', 0.5)}>+</button>
                  </div>
                )}
                {localBit != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="note" style={{ margin: 0 }}>Bitiş</span>
                    <button className="btn ghost sm" style={{ padding: '4px 11px' }} onClick={() => modalNudge('bit', -0.5)}>−</button>
                    <b style={{ minWidth: 48, textAlign: 'center', display: 'inline-block', fontSize: 13 }}>{saniyeStr(localBit)}</b>
                    <button className="btn ghost sm" style={{ padding: '4px 11px' }} onClick={() => modalNudge('bit', 0.5)}>+</button>
                  </div>
                )}
                <span style={{ fontSize: 12, color: '#1f7a4d', fontWeight: 700, visibility: savedFlash ? 'visible' : 'hidden' }}>✓ kaydedildi</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <button className="btn ghost sm" disabled={cumleModal === 0} onClick={() => cumleGit((cumleModal as number) - 1)}>‹ Önceki</button>
              <span className="note" style={{ margin: 0 }}>{(cumleModal as number) + 1} / {cumleler.length}</span>
              <button className="btn ghost sm" disabled={cumleModal === cumleler.length - 1} onClick={() => cumleGit((cumleModal as number) + 1)}>Sonraki ›</button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export { inlineMetin, calloutClass, renderFlow, renderMetin, Acc, embedInfo, EmbedVideo, speak, saniyeStr, BilgiKart };
