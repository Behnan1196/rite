'use client';
import { useEffect, useState } from 'react';
import { BilgiKart } from '../bilgiKart';

// Meridyen Studio'dan postMessage ile beslenen, salt-okunur CANLI ÖNİZLEME sayfası.
// Studio bunu bir iframe içinde açar ve taslak değiştikçe {source:'meridyen-onizleme', tip, cfg} mesajı gönderir.
// Buradaki <BilgiKart> bileşeni page.tsx'in (danışan ekranının) kullandığı BİREBİR AYNI kod (bkz app/bilgiKart.tsx) —
// önizleme ile Rite'ta gerçekten görünen şey arasında yorum farkı olmasın diye kod paylaşılıyor, yeniden yazılmıyor.
// Kaydetme yok: onSave hiç geçilmiyor, bu yüzden BilgiKart otomatik olarak salt-okunur modda render eder.
export default function Onizleme() {
  const [tip, setTip] = useState<string>('');
  const [cfg, setCfg] = useState<any>({});
  const [hazir, setHazir] = useState(false);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data;
      if (!d || d.source !== 'meridyen-onizleme') return;
      if (d.tip) setTip(d.tip);
      if (d.cfg) setCfg(d.cfg);
      setHazir(true);
    }
    window.addEventListener('message', onMessage);
    // Studio'ya "yüklendim, ilk taslağı gönder" sinyali — iframe her zaman parent'tan önce hazır olmayabilir,
    // parent da bu sinyali bekleyip ilk postMessage'ı ona göre gönderiyor (bkz Meridyen tarafındaki iframe onLoad).
    try { window.parent?.postMessage({ source: 'rite-onizleme', ready: true }, '*'); } catch (_) { /* sessiz */ }
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!hazir) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Önizleme bekleniyor…</div>;
  }
  if (tip !== 'bilgi') {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Bu kart tipi için henüz canlı önizleme yok — Studio'daki basit önizlemeye bakabilirsin.</div>;
  }
  return (
    <div style={{ maxWidth: 460, margin: '0 auto', padding: 12 }}>
      <BilgiKart cfg={cfg} />
    </div>
  );
}
