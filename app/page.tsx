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
  // touchAction:'none' (2026-09-17'ye kadar) telefonda bu satırın üzerinden BAŞLAYAN her dokunuşta tarayıcının
  // doğal kaydırmasını tamamen devre dışı bırakıyordu — 300ms'lik activationConstraint gecikmesi hiç devreye
  // girmeden, touchstart anında tarayıcı "bu elemanda hiçbir yerleşik dokunma davranışı yok" kararını veriyordu
  // (Behnan: "aktivite kartlarının olmadığı bir yerden tutarak kaydırmam gerekiyor, notların üzerinde sorun
  // olmuyor" — Notlar bu SortableRow/DndContext'e hiç girmiyor, o yüzden onlarda sorun yoktu). dnd-kit'in kendi
  // önerdiği gecikmeli-basılı-tutma deseni: 'manipulation' (çift-dokunuş yakınlaştırmayı kapatır ama doğal
  // kaydırmayı SERBEST bırakır) — 300ms+6px eşiği dolmadan parmak yukarı/aşağı kayarsa tarayıcı normal
  // kaydırmayı üstleniyor, basılı tutma süresi dolarsa PointerSensor devreye girip sürüklemeyi başlatıyor.
  return <div ref={setNodeRef} style={{ ...style, touchAction: 'manipulation' }} {...attributes} {...listeners}>{children}</div>;
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
// Gelişim ekranındaki ＋ (hızlı Ölçüm ekle) için varsayılan birimler — Ruh hali/Odak/Su hariç, onların zaten
// kendi kartları var (MoodKart/pomodoro/su sayacı). Kullanıcı isterse birimi elle değiştirebiliyor.
const OLCU_BIRIM: Record<string, string> = { kilo: 'kg', boy: 'cm', bel: 'cm', kalca: 'cm', gogus: 'cm', kol: 'cm', bacak: 'cm', vucut_yagi: '%', kas: 'kg', bel_kalca: '', vki: '' };
const OLCU_HIZLI_ANAHTAR = Object.keys(OLCU_ETIKET).filter((k) => !['ruh_hali', 'odak_dk', 'su'].includes(k));
// Rite Studio'da kart_config.dikey olarak seçilen alan etiketi → okunur ad (bkz app-meridyen/app/atama/page.tsx DIKEY_OPTS).
const DIKEY_LABEL: Record<string, string> = { beslenme: 'Beslenme', fitness: 'Fitness', fizyo: 'Fizyo', psikoloji: 'Psikoloji', mental: 'Mental', genel: 'Genel' };
// Kişisel "pil" (v1): kişinin kendi Alışkanlık/Yapılacak/Randevu kartlarını opsiyonel olarak etiketlediği,
// 65 yaşında birinin bile anlayacağı sade dört yaşam alanı — dikey (Rite Studio/koç tarafı) ile karıştırılmasın,
// bu tamamen kişisel kullanım için, kart_config.pilAlan alanına yazılıyor. Ajanda'nın gün görünümünde, bu
// etikete göre son 7 günün ağırlıklı tamamlanma oranı bir "pil" olarak gösteriliyor (kullanıcı isteği: kendi
// kendine slider'la değerlendirme yerine, zaten işaretlenen kartlardan kendiliğinden türeyen sürtünmesiz bir
// gösterge — bkz. loadData altındaki pil hesaplama notları). İlk versiyon, alan tipine göre daha da geliştirilecek.
const PIL_ALAN: Record<string, string> = { hareket: 'Hareket', beslenme: 'Beslenme', mesgale: 'Meşgale', sosyal: 'Sosyal' };
const PIL_ALAN_SIRA = ['hareket', 'beslenme', 'mesgale', 'sosyal'];
// Home sekmesi (v1): uygulamayı ilk açtığında görülen, tamamen öznel öz-değerlendirme ekranı — PIL_ALAN'dan
// (kart etiketleme / otomatik pil) BİLEREK ayrı tutuluyor, ikisi farklı amaçlara hizmet ediyor (kullanıcı
// isteği: "bunlar tamamen kendi şahsi değerlendirmesi, aktivite kartlarına bağlı değil"). Değerler
// dog_measurements'a anahtar='home_'+alan olarak yazılıyor (ruh_hali ile aynı desen) — günlük bir "check-in"
// değil, kişi değiştirene kadar kalan bir durum; o yüzden gösterirken "bugünün kaydı" değil o anahtarın en
// son (herhangi bir tarihteki) değeri okunuyor.
const HOME_SEVIYE = ['Zayıf', 'İdare eder', 'İyi', 'Mükemmel'];
// Home kartlarındaki dikey "termometre" göstergesinin dilim renkleri — HOME_SEVIYE ile aynı sırada (kırmızıdan
// yeşile). Kullanıcı isteği: kart metnini okumadan bir bakışta renkten durumu anlayabilmek.
const HOME_SEVIYE_RENK = ['#8b3223', '#d98a3d', '#8a8f3e', '#8fbf72'];
// Home'un alanları artık sabit bir JS listesi değil, iki katmanlı: (1) kanonik İÇERİK — dog_meridyen_alanlar
// tablosu (ad/neden/checklist/örnekler), Rite Studio'dan (app-meridyen/atama) TEK yerden yönetiliyor, bkz.
// meridyenAlanlarLib; (2) danışanın Havuz/Kütüphane'sindeki kalıcı grup tablosunda (dog_gruplar, kullanıcının
// değiştiremeyeceği kilitli "Meridyen" kökünün alt grupları) sadece "hangi alan (anahtar) + görünür mü + sırası
// ne" taşıyan ince satırlar — bkz. ensureMeridyenGrubu, homeAlanlar. 2026-09 (Behnan kararı — "Alanlar"
// mimarisi, "hep senkronize olacaklar"): içerik burada hiç tutulmuyor/düzenlenmiyor, bir danışana bir alanın
// atanması Rite Studio'daki "Ata" fonksiyonuyla oluyor — eskiden burada duran sabit 13-alan JS listesi
// (HOME_ALAN_VARSAYILAN) ve otomatik toplu tohumlama bu yüzden kaldırıldı.
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
// Bir ritüel satırının "Not" (yapışkan not) tipi olup olmadığı — RitItem'ın kendisinde VE onu saran liste
// satırında (kart arka planı/köşeleri için) aynı koşul iki yerde tekrarlanmasın diye ortak bir yardımcı.
function isNotKart(rt: any): boolean {
  const cfg = rt?.kart_config || {};
  // gorev (Aktivite'nin "Bugün" hâli) da hariç — o da bitissiz/her gün görünür ama checkbox'ı ve kendi ikonu
  // olan ayrı bir tip, Not'un yapışkan-not (ikonsuz, checkbox'sız, tam sarı satır) görünümüne girmemeli.
  // cfg.genel eski/kaldırılmış "Kart" tipinin işaretiydi (bkz. 2026-09-16 kaldırma notu) — artık kontrol
  // edilmiyor, olası eski bir kayıt varsa da diğer alanlara göre Not/Aktivite/Randevu'dan birine düşüyor.
  return rt?.kart_tipi === 'bilgi' && rt?.kaynak === 'Kendi' && !cfg.randevu && !cfg.gorev && !rt?.aliskanlik;
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
// Açıklama HER ZAMAN ortak/tek bir alan (hangi video seçili olursa olsun aynı metin) — alternatif videolar
// (aynı egzersiz için birkaç video) senaryosunda boş kalmasın diye. Bir videoya has bir şey eklemek istersen
// (playlist senaryosu — her videonun kendi notu) o video seçiliyken ayrı, isteğe bağlı "bu videoya özel not"
// alanına yazarsın; o zaman ortak açıklamanın altında EK olarak görünür, ortak açıklamanın yerini almaz.
// Randevu kartlarında (randevu=true) video yerine tek bir resim linki gösterilir.
// sn (sayı) -> "dk:sn" gösterim string'i (input alanlarında ve şerit rozetinde kullanılır).
function saniyeStr(sn?: number): string {
  if (sn == null) return '';
  const m = Math.floor(sn / 60), s = sn % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : String(s);
}
// "dk:sn" ya da düz saniye string'i -> sn (sayı). Boşsa undefined.
function strSaniye(str: string): number | undefined {
  const t = str.trim();
  if (!t) return undefined;
  if (t.includes(':')) {
    const [mm, ss] = t.split(':');
    return (parseInt(mm) || 0) * 60 + (parseInt(ss) || 0);
  }
  const n = parseInt(t);
  return isNaN(n) ? undefined : n;
}
// Randevu resmi yüklemeden önce tarayıcıda küçültür (telefon fotoğrafları 5-15MB olabiliyor) — hem yükleme
// hızlanıyor hem de sunucudaki 8MB sınırına takılma ihtimali kalmıyor. createImageBitmap yoksa (çok eski
// tarayıcı) dosya olduğu gibi yüklenir.
async function resimKucult(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return file; }
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return blob || file;
}
function BilgiKartEdit({ cfg, onSave, randevu, readOnly, notTasarimi, sadeceAciklama, tekVideo, cokluVideo, videoEkleTetik, onVideoEkleTetikKapat, videoYok, ekAyri, icerikBaslikTuret, onIcerikBaslikTuret, baslikKaynagi, icerikOdakTetik, onIcerikOdakTetikKapat }: { cfg: any; onSave: (cfg: any) => void; randevu?: boolean; readOnly?: boolean; notTasarimi?: boolean; sadeceAciklama?: boolean; tekVideo?: boolean; cokluVideo?: boolean; videoEkleTetik?: boolean; onVideoEkleTetikKapat?: () => void; videoYok?: boolean; ekAyri?: boolean; icerikBaslikTuret?: boolean; onIcerikBaslikTuret?: (ilkSatir: string) => void; baslikKaynagi?: string; icerikOdakTetik?: boolean; onIcerikOdakTetikKapat?: () => void }) {
  const videolar: { baslik?: string; url: string; bas?: number; bit?: number; ozelNot?: string }[] = cfg?.videolar || [];
  const [vidSec, setVidSec] = useState(0);
  // cokluVideo (Alışkanlık, 2026-09-16 — "çoklu video" tasarımı): video ekleme artık sayfa seviyesindeki
  // Bildirim/Ek şeridindeki "🎬 Video" düğmesinden (bkz. videoEkleTetik) tetikleniyor, kendi satır-içi
  // ＋ düğmesi yok. Videonun üstündeki şerit de sadece seçim + ⚙️ Ayarla taşıyor (bkz. aşağıdaki ayarAcik) —
  // ekleme/düzenleme/silme hep bu tek modalde toplanıyor.
  const [ayarAcik, setAyarAcik] = useState(false);
  // vidFormMode: 'add' = boş formla yeni video; 'edit' = seçili videoyu (secili) doldurup düzenler; null = kapalı.
  const [vidFormMode, setVidFormMode] = useState<'add' | 'edit' | null>(null);
  const [vAd, setVAd] = useState('');
  const [vUrl, setVUrl] = useState('');
  const [vBas, setVBas] = useState('');
  const [vBit, setVBit] = useState('');
  const [vAciklama, setVAciklama] = useState('');
  // baslikKaynagi (2026-09-18, Behnan isteği — önce Not'ta "Yeni not ekle" ön-doldurma, sonra Aktivite'ye de
  // genelleştirildi: "kullanıcılar not girişinde alışıyorlarsa aktivitede de yabancılık çekmeyebilir"): artık
  // hiçbir kişisel kart türünde (Not/Aktivite) ayrı bir Ad girişi yok — kartın adı hep içeriğin ilk satırından
  // türüyor (bkz. icerikBaslikTuret). İçerik kutusu boşken bir isim kaynağı sunmak için parent bu prop'ta
  // kartın MEVCUT `ad`'ını taşıyor: taze bir taslakta bu, yeniTaslakAc/yeniHavuzTaslakAc'ın koyduğu "Yeni not"/
  // "Yeni aktivite" varsayılanı; bu değişiklikten ÖNCE oluşturulmuş, içeriği hiç olmayan eski bir kartta ise
  // kartın gerçek (elle girilmiş) adı — böylece hiçbir eski kartın adı "kaybolmuyor", sadece artık ayrı bir
  // alanda değil, içerik kutusunun ilk satırında görünüyor/düzenleniyor. İçerik zaten doluysa (hem tazede hem
  // eskide) baslikKaynagi'ye hiç dokunulmuyor, cfg.icerik aynen kullanılıyor.
  const icerikOnDolduruldu = !(cfg?.icerik || '').trim() && !!(baslikKaynagi && baslikKaynagi.trim());
  const [icerikEdit, setIcerikEdit] = useState(icerikOnDolduruldu);
  const [icerikVal, setIcerikVal] = useState(() => {
    const mevcut = cfg?.icerik || '';
    if (mevcut.trim()) return mevcut;
    return baslikKaynagi && baslikKaynagi.trim() ? baslikKaynagi.trim() + '\n' : mevcut;
  });
  const icerikRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!icerikOnDolduruldu) return;
    const el = icerikRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // icerikOdakTetik (2026-09-18, Behnan isteği — Kaydet artık her zaman enabled, boş Not'ta tıklanınca buraya
  // yönlendiriyor): sayfa seviyesindeki notOdakAcik bayrağı true olunca (kisiselDuzenleKaydet/taslakKaydet boş
  // içerikle karşılaşıp kaydetmeden dönünce) içerik kutusunu düzenleme moduna alıp odaklıyoruz — videoEkleTetik
  // ile AYNI tek-atımlık desen (üstte true olunca iş yapılır, hemen ardından onIcerikOdakTetikKapat ile bayrak
  // false'a geri çekilir). Textarea icerikEdit false iken DOM'da yok, o yüzden focus'u doğrudan burada değil,
  // icerikEdit true olduktan SONRAKİ render'da (aşağıdaki ikinci effect, odakBekliyorRef ile) uyguluyoruz.
  const odakBekliyorRef = useRef(false);
  useEffect(() => {
    if (!icerikOdakTetik) return;
    odakBekliyorRef.current = true;
    setIcerikEdit(true);
    onIcerikOdakTetikKapat?.();
  }, [icerikOdakTetik]);
  useEffect(() => {
    if (odakBekliyorRef.current && icerikEdit) {
      odakBekliyorRef.current = false;
      icerikRef.current?.focus();
    }
  }, [icerikEdit]);
  const RESIM_MAX = 3;
  function resimlerdenAl(c: any): string[] {
    if (Array.isArray(c?.resimler)) return c.resimler.filter((x: any) => typeof x === 'string' && x.trim());
    return c?.resim ? [c.resim] : [];
  }
  const [resimler, setResimler] = useState<string[]>(() => resimlerdenAl(cfg));
  const [resimYuklemeIndex, setResimYuklemeIndex] = useState<number | null>(null);
  const [resimHata, setResimHata] = useState('');
  const [resimBuyukIndex, setResimBuyukIndex] = useState<number | null>(null);
  const resimInputRef = useRef<HTMLInputElement>(null);
  const [yer, setYer] = useState(cfg?.yer || '');
  // tekVideo ("Kart" tipi — kullanıcı isteği: "sadece bir video linki girmesi yeterli, isim/saniye/açıklama
  // olmasın") — tek satırlık link alanı doğrudan cfg.videolar[0]'ı okur/yazar, formuAc/vidFormMode akışını hiç
  // kullanmıyor; vUrl'i cfg değiştiğinde (kart değişince ya da kayıt sonrası) senkron tutuyoruz.
  useEffect(() => { if (tekVideo) setVUrl(cfg?.videolar?.[0]?.url || ''); }, [tekVideo, cfg?.videolar]);
  // baslikKaynagi'deki ön-doldurma yukarıdaki useState initializer'ında zaten uygulanıyor — bu effect de AYNI
  // formülü kullanıyor (cfg?.icerik boşsa baslikKaynagi'ye düş), yoksa mount anında bu effect (her useEffect
  // gibi ilk render'dan hemen sonra da çalışır) icerikVal'i "" ile ezip ön-doldurmayı anında silerdi.
  useEffect(() => {
    const mevcut = cfg?.icerik || '';
    setIcerikVal(mevcut.trim() ? mevcut : (baslikKaynagi && baslikKaynagi.trim() ? baslikKaynagi.trim() + '\n' : mevcut));
  }, [cfg?.icerik]);
  useEffect(() => { setResimler(resimlerdenAl(cfg)); }, [cfg?.resim, cfg?.resimler]);
  useEffect(() => { setYer(cfg?.yer || ''); }, [cfg?.yer]);
  const secili = videolar[Math.min(vidSec, videolar.length - 1)];
  // Video ekleme/düzenleme formunu aç: 'edit' iken seçili videonun alanlarıyla doldurur, 'add' iken boş açar.
  function formuAc(mode: 'add' | 'edit') {
    if (mode === 'edit' && secili) {
      setVAd(secili.baslik || ''); setVUrl(secili.url); setVBas(saniyeStr(secili.bas)); setVBit(saniyeStr(secili.bit)); setVAciklama(secili.ozelNot || '');
    } else {
      setVAd(''); setVUrl(''); setVBas(''); setVBit(''); setVAciklama('');
    }
    setVidFormMode(mode);
  }
  function formuKapat() { setVidFormMode(null); }
  // cokluVideo: sayfa seviyesindeki "🎬 Video" düğmesine basılınca (videoEkleTetik true olunca) burada aynı
  // ekleme modalini (vidFormMode='add') açıyoruz, sonra tetikleyiciyi hemen sıfırlıyoruz (one-shot) — asıl
  // form kapanışı/kaydı yine formuKapat/videoKaydet üzerinden, bu bayrağın kendisi sadece "aç" komutu.
  useEffect(() => { if (videoEkleTetik) { formuAc('add'); onVideoEkleTetikKapat?.(); } }, [videoEkleTetik]);
  // Link + ad + dk:sn aralığı + (md) açıklama — tek form hem "Ekle" hem "Kaydet" (düzenle) için kullanılıyor.
  function videoKaydet() {
    if (!vUrl.trim()) return;
    const yeniVideo = { baslik: vAd.trim() || undefined, url: vUrl.trim(), bas: strSaniye(vBas), bit: strSaniye(vBit), ozelNot: vAciklama.trim() || undefined };
    let yeni: typeof videolar;
    if (vidFormMode === 'edit') {
      yeni = videolar.map((vd, i) => (i === vidSec ? yeniVideo : vd));
    } else {
      yeni = [...videolar, yeniVideo];
      setVidSec(yeni.length - 1);
    }
    onSave({ ...cfg, videolar: yeni });
    formuKapat();
  }
  function videoSil(i: number) {
    const yeni = videolar.filter((_, j) => j !== i);
    onSave({ ...cfg, videolar: yeni });
    setVidSec(0);
    if (vidFormMode === 'edit') formuKapat();
  }
  // notTasarimi'in düzenleme modundaki liste görünümünde, bir satıra dokununca hem seçip hem de formunu tek
  // seferde açmak için — formuAc('edit') her zaman `secili`yi (bir önceki render'daki vidSec) okuduğundan, aynı
  // tıklamada hem setVidSec(i) hem formuAc('edit') çağırmak bayat kapanış (stale closure) yüzünden yanlış
  // videoyu doldururdu. Bu yüzden videolar[i]'den doğrudan okuyor.
  function satirDuzenAc(i: number) {
    const v = videolar[i];
    if (!v) return;
    setVAd(v.baslik || ''); setVUrl(v.url); setVBas(saniyeStr(v.bas)); setVBit(saniyeStr(v.bit)); setVAciklama(v.ozelNot || '');
    setVidSec(i);
    setVidFormMode('edit');
  }
  // notTasarimi'in düzenleme modunda video ekleme/düzenleme artık modal değil — satırın (ya da "＋ Video ekle"
  // satırının) hemen altına açılan aynı alan seti (kullanıcı isteği: "fazladan bir modal çıkmasına gerek yok").
  // Legacy (Havuz taslağı, howto) yol hâlâ kendi modalini kullanıyor, bu değişkeni paylaşmıyor.
  const vidFormAlanlarJsx = (
    <>
      <div className="daterow" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        <input value={vUrl} onChange={(e) => setVUrl(e.target.value)} placeholder="https://… (şart)" style={{ flex: 2, minWidth: 160 }} />
        <input value={vAd} onChange={(e) => setVAd(e.target.value)} placeholder="Video adı (ops.)" style={{ flex: 1, minWidth: 110 }} />
      </div>
      <div className="daterow" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        <input value={vBas} onChange={(e) => setVBas(e.target.value.replace(/[^\d:]/g, ''))} placeholder="Başlangıç dk:sn (ops.)" style={{ flex: 1, minWidth: 120 }} />
        <input value={vBit} onChange={(e) => setVBit(e.target.value.replace(/[^\d:]/g, ''))} placeholder="Bitiş dk:sn (ops.)" style={{ flex: 1, minWidth: 120 }} />
      </div>
      <textarea value={vAciklama} onChange={(e) => setVAciklama(e.target.value)} placeholder="Bu videoya özel açıklama (ops.)" style={{ width: '100%', minHeight: 60 }} />
    </>
  );
  function icerikKaydet() {
    setIcerikEdit(false);
    if (icerikVal.trim() !== (cfg?.icerik || '')) onSave({ ...cfg, icerik: icerikVal.trim() || null });
    // icerikBaslikTuret (önce Not'ta, 2026-09-17 — "başlık ve açıklamanın teke düşmesi", Apple Notes esintili;
    // 2026-09-18'de Aktivite'ye de genelleştirildi): ayrı bir Ad alanı yok, kart adı içeriğin ilk (boş olmayan)
    // satırından türetiliyor. Boş satır/tamamen boş içerikte önceki başlık (ör. "Yeni not"/"Yeni aktivite" ya
    // da eski bir kartın gerçek adı) olduğu gibi kalıyor — hiçbir zaman boş bir başlığa düşmüyor.
    if (icerikBaslikTuret) {
      const ilkSatir = icerikVal.split('\n').map((s: string) => s.trim()).find((s: string) => s) || '';
      if (ilkSatir) onIcerikBaslikTuret?.(ilkSatir.length > 80 ? ilkSatir.slice(0, 80).trim() + '…' : ilkSatir);
    }
  }
  // Dosyadan resim yükle (Hostinger'a, bkz. app/api/upload) — resim kutucuklarından birine tıklanınca
  // (boşsa yeni ekler, doluysa üzerindeki ✎ değiştirir) açılır; ayrı, görünür bir link kutusu yok.
  // En fazla RESIM_MAX (3) resim; resim[0] geriye dönük uyum için ayrıca cfg.resim'e de yazılır.
  async function resimDosyaSecildi(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const idx = resimYuklemeIndex;
    setResimHata('');
    try {
      const kucuk = await resimKucult(f);
      const fd = new FormData();
      fd.append('file', kucuk, 'resim.jpg');
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Yükleme başarısız');
      const yeni = idx != null && idx < resimler.length
        ? resimler.map((u, i) => (i === idx ? data.url : u))
        : [...resimler, data.url].slice(0, RESIM_MAX);
      setResimler(yeni);
      onSave({ ...cfg, resimler: yeni, resim: yeni[0] || null });
    } catch (err: any) {
      setResimHata(err?.message || 'Yükleme başarısız');
    } finally {
      setResimYuklemeIndex(null);
    }
  }
  function resimSil(i: number) {
    const yeni = resimler.filter((_, j) => j !== i);
    setResimler(yeni);
    onSave({ ...cfg, resimler: yeni, resim: yeni[0] || null });
    setResimBuyukIndex((cur) => (cur === i ? null : cur != null && cur > i ? cur - 1 : cur));
  }
  function yerKaydet() {
    const v = yer.trim() || null;
    if (v === (cfg?.yer || null)) return;
    onSave({ ...cfg, yer: v });
  }
  // Resim kutucukları (en fazla RESIM_MAX): hem Randevu'nun kendi bölümünde hem de (yeni) Not/Alışkanlık'ın
  // medya şeridinde aynı bileşen kullanılıyor — kullanıcı isteği: "oradaki resim özelliği tek kart sistemine
  // eklenebilir". Bir fonksiyon bileşeni değil, düz bir JSX değeri: her render'da closure'daki güncel state'i
  // okur ama React'ı yeni bir bileşen tipi sanıp DOM'u sıfırdan kurmasına yol açmaz.
  // Kompakt "ek" (attachment) görünümü — SADECE notTasarimi'nin (Not/Alışkanlık/Kart) medya şeridinde
  // kullanılıyor; Randevu kendi bölümünde hâlâ yukarıdaki büyük resimGridJsx'i kullanıyor, bu yüzden Randevu'nun
  // görünümü değişmiyor. Kullanıcı isteği: "foto yükleme çok yer tutuyor boş görünümde, onu bir attachment
  // olarak düşünelim ve en altta olabilir" — 108px'lik boş kutu yerine küçük (36px) küçük resimler + ince bir
  // "📎 Fotoğraf ekle" satırı; video şeridinin altında, bölümün en altında gösteriliyor.
  const resimAttachmentJsx = (
    <>
      {(resimler.length > 0 || (!readOnly && resimler.length < RESIM_MAX)) && (
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {resimler.map((url, i) => (
            <div
              key={i}
              style={{ position: 'relative', width: 36, height: 36, borderRadius: 8, overflow: 'hidden', flex: '0 0 auto', border: '1px solid var(--line)', cursor: 'zoom-in' }}
              onClick={() => setResimBuyukIndex(i)}
              title="Büyütmek için tıkla"
            >
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {!readOnly && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); resimSil(i); }}
                  title="Kaldır"
                  style={{
                    position: 'absolute', right: 0, top: 0, width: 14, height: 14, borderRadius: '0 0 0 7px',
                    border: 'none', background: 'rgba(24,21,16,.65)', color: '#fff', fontSize: 8, lineHeight: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {!readOnly && resimler.length < RESIM_MAX && (
            <span
              className="chip"
              style={{ borderStyle: 'dashed' }}
              onClick={() => { if (resimYuklemeIndex == null) resimInputRef.current?.click(); }}
              title="Fotoğraf ekle"
            >
              {resimYuklemeIndex != null ? '…' : '📎 Fotoğraf ekle'}
            </span>
          )}
          {!readOnly && <input ref={resimInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={resimDosyaSecildi} />}
        </div>
      )}
      {resimHata && <div className="note" style={{ color: 'var(--red)', marginTop: 2 }}>{resimHata}</div>}
      {resimBuyukIndex != null && resimler[resimBuyukIndex] && (
        <div className="modal" style={{ alignItems: 'center' }} onMouseDown={() => setResimBuyukIndex(null)}>
          <img src={resimler[resimBuyukIndex]} alt="" style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 10, display: 'block' }} />
        </div>
      )}
    </>
  );
  const resimGridJsx = (
    <>
      {(resimler.length > 0 || !readOnly) && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Array.from({ length: Math.min(resimler.length + (!readOnly && resimler.length < RESIM_MAX ? 1 : 0), RESIM_MAX) }).map((_, i) => {
              const url = resimler[i];
              const yukleniyorBu = resimYuklemeIndex === i;
              return (
                <div
                  key={i}
                  style={{
                    position: 'relative', width: 108, height: 108, borderRadius: 14, overflow: 'hidden', flex: '0 0 auto',
                    background: '#f4efe6', border: url ? '1px solid var(--line)' : '1px dashed var(--line)',
                    cursor: url ? 'zoom-in' : (readOnly ? 'default' : 'pointer'),
                  }}
                  onClick={() => {
                    if (url) setResimBuyukIndex(i);
                    else if (!readOnly && resimYuklemeIndex == null) { setResimYuklemeIndex(i); resimInputRef.current?.click(); }
                  }}
                  title={url ? 'Büyütmek için tıkla' : (readOnly ? undefined : 'Resim eklemek için tıkla')}
                >
                  {url ? (
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    !readOnly && (
                      <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {yukleniyorBu ? (
                          <span style={{ fontSize: 22, opacity: 0.55 }}>…</span>
                        ) : (
                          <>
                            <span style={{ fontSize: 38, opacity: 0.5 }}>📷</span>
                            <span style={{
                              position: 'absolute', right: 14, bottom: 14, width: 24, height: 24, borderRadius: '50%',
                              background: '#8a8168', color: '#fff', fontSize: 16, fontWeight: 700, lineHeight: 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
                            }}>+</span>
                          </>
                        )}
                      </div>
                    )
                  )}
                  {!readOnly && url && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); if (resimYuklemeIndex == null) { setResimYuklemeIndex(i); resimInputRef.current?.click(); } }}
                        disabled={resimYuklemeIndex != null}
                        title="Resmi değiştir"
                        style={{
                          position: 'absolute', right: 5, bottom: 5, width: 28, height: 28, borderRadius: '50%',
                          border: 'none', background: 'rgba(24,21,16,.6)', color: '#fff', fontSize: 13,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
                        }}
                      >
                        {yukleniyorBu ? '…' : '✎'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); resimSil(i); }}
                        title="Resmi kaldır"
                        style={{
                          position: 'absolute', right: 5, top: 5, width: 22, height: 22, borderRadius: '50%',
                          border: 'none', background: 'rgba(24,21,16,.6)', color: '#fff', fontSize: 12,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
                        }}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {!readOnly && <input ref={resimInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={resimDosyaSecildi} />}
          {resimHata && <div className="note" style={{ color: 'var(--red)', marginTop: 2 }}>{resimHata}</div>}
        </div>
      )}
      {resimBuyukIndex != null && resimler[resimBuyukIndex] && (
        <div className="modal" style={{ alignItems: 'center' }} onMouseDown={() => setResimBuyukIndex(null)}>
          <img src={resimler[resimBuyukIndex]} alt="" style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 10, display: 'block' }} />
        </div>
      )}
    </>
  );
  return (
    // Not tasarımında (notTasarimi) bilerek kutu/yeşil-çizgi görünümü (.howto) yok — o, sanki bu kutu asıl
    // kart gibi görünmesine yol açıyordu (kullanıcı geri bildirimi). Düz metin tipografisi (.bilgi) kalıyor.
    <div className={notTasarimi ? undefined : 'howto'}>
      <div className="bilgi">
        {randevu && (
          <div style={{ margin: '0 0 10px' }}>
            <div className="k">📅 Randevu</div>
            {readOnly ? (
              <>
                {yer.trim() && <div style={{ marginTop: 2 }}>{yer}</div>}
              </>
            ) : (
              <input value={yer} onChange={(e) => setYer(e.target.value)} onBlur={yerKaydet} placeholder="Detay / yer (ops.) — link, adres, doktor adı…" style={{ width: '100%' }} />
            )}
            {/* ekAyri (Randevu, isKisisel altında): eski büyük foto ızgarası burada artık gösterilmiyor —
                tek dosyalık ek, sayfa seviyesinde Bildirim'le aynı satıra taşındı (kullanıcı isteği). */}
            {!ekAyri && resimGridJsx}
          </div>
        )}
        {/* Not/Alışkanlık'ta (notTasarimi) Açıklama ve Video/Resim (medya) şeridinin sırası, eski tasarımdan
            farklı olarak Açıklama ÖNCE geliyor (kullanıcı isteği — "kart adı, açıklama, altında video şeridi").
            JSX'i iki kez yazmak yerine flex + order kullanıyoruz: notTasarimi'de açıklama=1/medya=2,
            Randevu/Alışkanlık'ın eski (howto) tasarımında ise medya=1/açıklama=2 — Havuz taslağı hâlâ bu eski
            sırayı kullanıyor (bkz. call site, orada notTasarimi=false kalıyor). */}
        {!randevu && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ order: cokluVideo ? 2 : (notTasarimi ? 1 : 2) }}>
              {/* Kişisel kartlarda Açıklama artık düz metin — Meridyen'in md ile yazdığı içerikten farklı olarak
                  kullanıcıdan hiçbir sözdizimi (#, **, -…) beklemiyoruz, sadece satır aralarını koruyoruz. */}
              {(!readOnly || icerikVal.trim()) && <div className="k">Açıklama</div>}
              {readOnly ? (
                icerikVal.trim() ? <div style={{ whiteSpace: 'pre-wrap' }}>{icerikVal}</div> : null
              ) : icerikEdit ? (
                // notTasarimi: Ad alanıyla aynı yalın karakter (şeffaf zemin, aynı yazı stili) ama ince bir çerçeve
                // ile ayrı bir alan olduğu belli oluyor (kullanıcı isteği); baştan 3-4 satır yükseklikte açılsın
                // diye rows kullanılıyor.
                <div style={{ position: 'relative' }}>
                  <textarea
                    ref={icerikRef}
                    autoFocus={!icerikOnDolduruldu}
                    rows={notTasarimi ? 4 : undefined}
                    value={icerikVal}
                    onChange={(e) => setIcerikVal(e.target.value)}
                    onBlur={icerikKaydet}
                    placeholder={'Notunu yaz…'}
                    style={notTasarimi
                      ? { width: '100%', minHeight: 0, border: '1px solid var(--line)', borderRadius: 8, outline: 'none', background: 'transparent', padding: '8px 28px 8px 8px', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6, color: 'var(--ink)', resize: 'vertical', boxSizing: 'border-box' }
                      : { width: '100%', minHeight: 100 }}
                  />
                  {/* Temizle (✕) — Behnan isteği (2026-09-18): "Yeni not" ön-dolgusunu çoğunlukla silmek
                      gerekeceği için, arama kutularındaki gibi sağ üstte tek dokunuşla temizleme. onMouseDown'da
                      preventDefault ŞART — yoksa tıklama textarea'da önce blur tetikler (icerikKaydet çalışıp
                      icerikEdit'i false yapar, kutu kapanır), temizleme hiç gerçekleşmeden düzenleme modundan
                      çıkılmış olurdu. İçerik boşken buton zaten hiç görünmüyor (arama kutusu deseniyle aynı). */}
                  {notTasarimi && icerikVal.trim() && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setIcerikVal(''); icerikRef.current?.focus(); }}
                      title="Temizle"
                      style={{ position: 'absolute', top: 6, right: 6, background: 'none', border: 'none', padding: 2, fontSize: 14, color: 'var(--muted)', cursor: 'pointer', lineHeight: 1 }}
                    >✕</button>
                  )}
                </div>
              ) : (
                // notTasarimi: dokunmadan önceki bu görünüm de textarea ile aynı çerçeveyi ve min-yüksekliği (4 satır +
                // padding) alıyor — yoksa tıklayınca kutu aniden büyüyüp kayıyormuş gibi bir sıçrama oluyordu
                // (kullanıcı geri bildirimi).
                <div onClick={() => setIcerikEdit(true)} style={notTasarimi
                  ? { cursor: 'text', minHeight: 92, whiteSpace: 'pre-wrap', border: '1px solid var(--line)', borderRadius: 8, padding: 8, fontSize: 14, lineHeight: 1.6, boxSizing: 'border-box' }
                  : { cursor: 'text', minHeight: 24, whiteSpace: 'pre-wrap' }}>
                  {icerikVal.trim() ? icerikVal : (
                    // notTasarimi: placeholder metni de textarea'nın kendi placeholder'ıyla (Notunu yaz…) AYNI
                    // font büyüklüğünde — farklı olursa dokununca yazı boyu değişiyormuş gibi bir sıçrama izlenimi
                    // veriyordu (kullanıcı geri bildirimi).
                    <div className={notTasarimi ? undefined : 'note'} style={notTasarimi ? { marginTop: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--muted)' } : { marginTop: 0 }}>Yazmak için dokun…</div>
                  )}
                </div>
              )}
            </div>
            {/* sadeceAciklama (SADECE "Kart" tipi, notTasarimi'in bir üst kümesi): video+resim bloğu ilk açılışta
                gizli kalır, "+ Daha fazla" ile açılır — kullanıcı isteği: "ilk açtığında basit bir notu rahatça
                girmeli, diğer fonksiyonlar kafasını karıştırmamalı". Not/Alışkanlık/Randevu bu prop'u hiç
                geçmiyor (undefined → aşağıdaki koşul her zaman true), o yüzden davranışları değişmiyor. */}
            {!(notTasarimi && sadeceAciklama) && (
            <div style={{ order: cokluVideo ? 1 : (notTasarimi ? 2 : 1) }}>
              {/* videoYok (Not) — kartta video alanı hiç yok, sadece resim (bkz. aşağıdaki resimAttachmentJsx)
                  kalıyor (kullanıcı isteği: bir yapışkan notta video gereksiz). */}
              {videoYok ? null : cokluVideo ? (
                // cokluVideo (Alışkanlık, 2026-09-16): video ekleme sayfa seviyesindeki "🎬 Video" düğmesinden
                // (videoEkleTetik) tetiklenir, burada kendi ＋ tetikleyicisi YOK. 1+ video varken üstte sadece
                // seçim şeridi + en sağda ⚙️ Ayarla (mevcut videoları düzenle/sil — bkz. aşağıdaki ayarAcik
                // modali); embed her zaman açıklamanın ÜSTÜNDE (bkz. yukarıdaki order).
                <div style={{ margin: '0 0 12px' }}>
                  {videolar.length > 0 ? (
                    <>
                      <div style={{ margin: '0 0 8px', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                        {videolar.map((v, i) => (
                          <span key={i} className={'chip' + (i === vidSec ? ' on' : '')} onClick={() => setVidSec(i)}>
                            {v.baslik || ('Video ' + (i + 1))}{(v.bas != null || v.bit != null) ? ` ⏱${saniyeStr(v.bas) || '0'}–${v.bit != null ? saniyeStr(v.bit) : '…'}` : ''}
                          </span>
                        ))}
                        {!readOnly && <span className="chip" style={{ borderStyle: 'dashed' }} onClick={() => setAyarAcik(true)} title="Videoları ayarla (sil, saniye…)">⚙️ Ayarla</span>}
                      </div>
                      {secili && <EmbedVideo url={secili.url} bas={secili.bas} bit={secili.bit} />}
                      {secili?.ozelNot && (
                        <div style={{ margin: '10px 0 0' }}>
                          <div className="note" style={{ margin: '0 0 2px', fontWeight: 700 }}>🎬 Bu videoya özel</div>
                          <div style={{ whiteSpace: 'pre-wrap' }}>{secili.ozelNot}</div>
                        </div>
                      )}
                    </>
                  ) : null}
                  {/* Ekleme/düzenleme modali (formuAc/formuKapat/videoKaydet) — dışarıdan (🎬 Video düğmesi,
                      videoEkleTetik) VEYA aşağıdaki Ayarla modalinden açılır, ikisi de aynı vidFormMode'u
                      paylaşır. */}
                  {!readOnly && vidFormMode && (
                    <div className="modal top2" onMouseDown={formuKapat}>
                      <div className="sheet small" onMouseDown={(e) => e.stopPropagation()}>
                        <button className="x" onClick={formuKapat}>×</button>
                        <h3 style={{ marginBottom: 8 }}>🎬 {vidFormMode === 'edit' ? 'Videoyu düzenle' : 'Video ekle'}</h3>
                        {vidFormAlanlarJsx}
                        <div className="rowbtns" style={{ marginTop: 6 }}>
                          <button className="btn sm" onClick={videoKaydet} disabled={!vUrl.trim()}>{vidFormMode === 'edit' ? 'Kaydet' : 'Ekle'}</button>
                          <button className="btn ghost sm" onClick={formuKapat}>Vazgeç</button>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Ayarla modali: mevcut videoların düz listesi — satıra dokununca hemen altında (aynı
                      formuAc/vidFormAlanlarJsx) düzenleme açılır, ayrı bir ✕ ile silinir. Yeni video eklemek
                      buradan değil, her zaman sayfa seviyesindeki "🎬 Video" düğmesinden. */}
                  {ayarAcik && (
                    <div className="modal" onMouseDown={() => { setAyarAcik(false); formuKapat(); }}>
                      <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
                        <button className="x" onClick={() => { setAyarAcik(false); formuKapat(); }}>×</button>
                        <h3 style={{ marginBottom: 8 }}>🎬 Videolar</h3>
                        {videolar.length === 0 && <div className="note">Henüz video yok.</div>}
                        {videolar.map((v, i) => (
                          <div key={i}>
                            <div
                              onClick={() => (vidFormMode === 'edit' && vidSec === i ? formuKapat() : satirDuzenAc(i))}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', borderTop: i === 0 ? undefined : '1px solid var(--line)' }}
                            >
                              <span style={{ flex: 1, fontSize: 13 }}>{v.baslik || ('Video ' + (i + 1))}{(v.bas != null || v.bit != null) ? ` ⏱${saniyeStr(v.bas) || '0'}–${v.bit != null ? saniyeStr(v.bit) : '…'}` : ''}</span>
                              <span style={{ fontSize: 11, color: 'var(--muted)', opacity: .6 }}>{(vidFormMode === 'edit' && vidSec === i) ? '▴' : '▾'}</span>
                              <span style={{ opacity: 0.55 }} onClick={(e) => { e.stopPropagation(); videoSil(i); }}>✕</span>
                            </div>
                            {vidFormMode === 'edit' && vidSec === i && (
                              <div style={{ padding: '7px 8px', borderRadius: 8, background: 'var(--card2,#f6f4ee)', margin: '2px 0 8px' }}>
                                {vidFormAlanlarJsx}
                                <div className="rowbtns" style={{ marginTop: 6 }}>
                                  <button className="btn sm" onClick={videoKaydet} disabled={!vUrl.trim()}>Kaydet</button>
                                  <button className="btn ghost sm" onClick={() => videoSil(i)}>Sil</button>
                                  <button className="btn ghost sm" onClick={formuKapat}>Vazgeç</button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : tekVideo ? (
                // "Kart" tipi — kullanıcı isteği: "sadece bir video linki girmesi yeterli, ismi zaten kartın
                // adından belli olur, saniye ayarları ve videoya özel açıklama da olmasın". Liste/ekle-formu
                // yerine tek satırlık link alanı; videolar[0] dışında hiçbir alan kullanılmıyor.
                <div style={{ margin: '0 0 12px', padding: '7px 10px', borderRadius: 8, background: 'var(--card2,#f6f4ee)' }}>
                  {readOnly ? (
                    videolar[0]?.url && <EmbedVideo url={videolar[0].url} />
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>🎬</span>
                        <input
                          value={vUrl}
                          onChange={(e) => setVUrl(e.target.value)}
                          onBlur={() => { const u = vUrl.trim(); const eski = videolar[0]?.url || ''; if (u !== eski) onSave({ ...cfg, videolar: u ? [{ url: u }] : [] }); }}
                          placeholder="Video linki (ops.) — https://…"
                          style={{ flex: 1, fontSize: 13 }}
                        />
                        {videolar[0]?.url && <span className="chip" style={{ borderStyle: 'dashed' }} onClick={() => { setVUrl(''); onSave({ ...cfg, videolar: [] }); }}>Kaldır</span>}
                      </div>
                      {/* Link yapıştırılır yapıştırılmaz (Kaydet'e basmadan, onBlur'u beklemeden) doğrudan
                          embed olarak oynatılabilir hâle gelsin (kullanıcı isteği). */}
                      {vUrl.trim() && /^https?:\/\//i.test(vUrl.trim()) && <div style={{ margin: '8px 0 0' }}><EmbedVideo url={vUrl.trim()} /></div>}
                    </>
                  )}
                </div>
              ) : notTasarimi ? (
                // notTasarimi: video ve resim TEK bir "medya" şeridinde, aynı gri arkaplan/köşe içinde —
                // kullanıcı isteği: "resim özelliği tek kart sistemine eklenebilir". Görüntüleme modunda eski
                // chip + seç + oynat davranışı aynen sürüyor (bkz. aşağıdaki EmbedVideo); düzenleme modunda ise
                // oynatma yok, video linkleri düz bir LİSTE halinde — bir satıra dokununca hemen altında (modal
                // değil) düzenle formu açılıyor, ayrı bir ✕ ile de silinebiliyor (kullanıcı isteği: "video
                // linklerini liste halinde görüp, değiştirebilmeli ve silebilmeliyiz").
                <div style={{ margin: '0 0 12px', padding: '7px 10px', borderRadius: 8, background: 'var(--card2,#f6f4ee)' }}>
                  {readOnly ? (
                    videolar.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                        {videolar.map((v, i) => (
                          <span key={i} className={'chip' + (i === vidSec ? ' on' : '')} onClick={() => setVidSec(i)}>
                            {v.baslik || ('Video ' + (i + 1))}{(v.bas != null || v.bit != null) ? ` ⏱${saniyeStr(v.bas) || '0'}–${v.bit != null ? saniyeStr(v.bit) : '…'}` : ''}
                          </span>
                        ))}
                      </div>
                    )
                  ) : (
                    <div>
                      {videolar.map((v, i) => (
                        <div key={i}>
                          <div
                            onClick={() => (vidFormMode === 'edit' && vidSec === i ? formuKapat() : satirDuzenAc(i))}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}
                          >
                            <span style={{ flex: 1, fontSize: 13 }}>🎬 {v.baslik || ('Video ' + (i + 1))}{(v.bas != null || v.bit != null) ? ` ⏱${saniyeStr(v.bas) || '0'}–${v.bit != null ? saniyeStr(v.bit) : '…'}` : ''}</span>
                            <span style={{ fontSize: 11, color: 'var(--muted)', opacity: .6 }}>{(vidFormMode === 'edit' && vidSec === i) ? '▴' : '▾'}</span>
                            <span style={{ opacity: 0.55 }} onClick={(e) => { e.stopPropagation(); videoSil(i); }}>✕</span>
                          </div>
                          {vidFormMode === 'edit' && vidSec === i && (
                            <div style={{ padding: '7px 8px', borderRadius: 8, background: '#fff', border: '1px solid var(--line)', margin: '2px 0 8px' }}>
                              {vidFormAlanlarJsx}
                              <div className="rowbtns" style={{ marginTop: 6 }}>
                                <button className="btn sm" onClick={videoKaydet} disabled={!vUrl.trim()}>Kaydet</button>
                                <button className="btn ghost sm" onClick={() => videoSil(i)}>Sil</button>
                                <button className="btn ghost sm" onClick={formuKapat}>Vazgeç</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <div
                        onClick={() => (vidFormMode === 'add' ? formuKapat() : formuAc('add'))}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}
                      >
                        <span style={{ flex: 1, fontSize: 13, opacity: .7 }}>＋ Video ekle</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', opacity: .6 }}>{vidFormMode === 'add' ? '▴' : '▾'}</span>
                      </div>
                      {vidFormMode === 'add' && (
                        <div style={{ padding: '7px 8px', borderRadius: 8, background: '#fff', border: '1px solid var(--line)', margin: '2px 0 4px' }}>
                          {vidFormAlanlarJsx}
                          <div className="rowbtns" style={{ marginTop: 6 }}>
                            <button className="btn sm" onClick={videoKaydet} disabled={!vUrl.trim()}>Ekle</button>
                            <button className="btn ghost sm" onClick={formuKapat}>Vazgeç</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Video şeridi Açıklama'nın ÜZERİNDE: videolar + (varsa seçili video için) ✎ düzenle + en sağda
                      ＋ ekle (kullanıcı isteği — düzenle, eklemenin solunda). Eski (Randevu dışı, howto) tasarım —
                      Havuz taslağında hâlâ bu haliyle kullanılıyor. */}
                  {videolar.length > 0 && (
                    <div style={{ margin: '0 0 10px', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                      {videolar.map((v, i) => (
                        <span key={i} className={'chip' + (i === vidSec ? ' on' : '')} onClick={() => { setVidSec(i); if (vidFormMode) formuKapat(); }}>
                          {v.baslik || ('Video ' + (i + 1))}{(v.bas != null || v.bit != null) ? ` ⏱${saniyeStr(v.bas) || '0'}–${v.bit != null ? saniyeStr(v.bit) : '…'}` : ''}
                          {!readOnly && <span style={{ marginLeft: 6, opacity: 0.55 }} onClick={(e) => { e.stopPropagation(); videoSil(i); }}>✕</span>}
                        </span>
                      ))}
                      {!readOnly && secili && <span className="chip" style={{ borderStyle: 'dashed' }} onClick={() => (vidFormMode === 'edit' ? formuKapat() : formuAc('edit'))} title="Seçili videoyu düzenle">✎</span>}
                      {!readOnly && <span className="chip" style={{ borderStyle: 'dashed' }} onClick={() => (vidFormMode === 'add' ? formuKapat() : formuAc('add'))} title="Video ekle">＋ Video</span>}
                    </div>
                  )}
                  {videolar.length === 0 && !readOnly && (
                    <div style={{ margin: '0 0 10px', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                      <span className="chip" style={{ borderStyle: 'dashed' }} onClick={() => (vidFormMode === 'add' ? formuKapat() : formuAc('add'))} title="Video ekle">＋ Video</span>
                    </div>
                  )}
                </>
              )}
              {/* Video ekle/düzenle formu (SADECE legacy/howto yol — Havuz taslağı): modal olarak açılıyor.
                  notTasarimi'de artık kendi satır-içi formu var (bkz. yukarısı), bu modal orada tekrar
                  açılmasın diye !notTasarimi ile sınırlanıyor. */}
              {!notTasarimi && !readOnly && vidFormMode && (
                <div className="modal top2" onMouseDown={formuKapat}>
                  <div className="sheet small" onMouseDown={(e) => e.stopPropagation()}>
                    <button className="x" onClick={formuKapat}>×</button>
                    <h3 style={{ marginBottom: 8 }}>🎬 {vidFormMode === 'edit' ? 'Videoyu düzenle' : 'Video ekle'}</h3>
                    <div className="daterow" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      <input value={vUrl} onChange={(e) => setVUrl(e.target.value)} placeholder="https://… (şart)" style={{ flex: 2, minWidth: 160 }} />
                      <input value={vAd} onChange={(e) => setVAd(e.target.value)} placeholder="Video adı (ops.)" style={{ flex: 1, minWidth: 110 }} />
                    </div>
                    <div className="daterow" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      <input value={vBas} onChange={(e) => setVBas(e.target.value.replace(/[^\d:]/g, ''))} placeholder="Başlangıç dk:sn (ops.)" style={{ flex: 1, minWidth: 120 }} />
                      <input value={vBit} onChange={(e) => setVBit(e.target.value.replace(/[^\d:]/g, ''))} placeholder="Bitiş dk:sn (ops.)" style={{ flex: 1, minWidth: 120 }} />
                    </div>
                    <textarea value={vAciklama} onChange={(e) => setVAciklama(e.target.value)} placeholder={'Bu videoya özel açıklama (ops.)'} style={{ width: '100%', minHeight: 70 }} />
                    <div className="rowbtns" style={{ marginTop: 6 }}>
                      <button className="btn sm" onClick={videoKaydet} disabled={!vUrl.trim()}>{vidFormMode === 'edit' ? 'Kaydet' : 'Ekle'}</button>
                      <button className="btn ghost sm" onClick={formuKapat}>Vazgeç</button>
                    </div>
                  </div>
                </div>
              )}
              {/* Video oynatma: notTasarimi'de sadece görüntüleme modunda (kullanıcı isteği: "düzenleme modunda
                  video oynatma gerekmiyor") — legacy (Havuz taslağı) yolda değişmedi, hep gösteriliyordu. */}
              {(!notTasarimi || readOnly) && secili && <div style={{ margin: '0 0 4px' }}><EmbedVideo url={secili.url} bas={secili.bas} bit={secili.bit} /></div>}
              {/* Videoya özel açıklama: genel açıklamadan SONRA, salt okunur — notTasarimi'in düzenleme modunda
                  bu zaten satır-içi formun kendi alanı (vAciklama), o yüzden burada tekrar gösterilmiyor. */}
              {(!notTasarimi || readOnly) && secili?.ozelNot && (
                <div style={{ margin: '10px 0 0' }}>
                  <div className="note" style={{ margin: '0 0 2px', fontWeight: 700 }}>🎬 Bu videoya özel</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{secili.ozelNot}</div>
                </div>
              )}
              {/* ekAyri (Not/Aktivite, isKisisel altında): kompakt foto eki burada artık gösterilmiyor — tek
                  dosyaya indirilip Bildirim'le aynı satıra, sayfa seviyesine taşındı (kullanıcı isteği:
                  "bildirimle aynı satırda olabilir mi"). Salt-okunur önizlemede (isKisisel olmayan, ekAyri
                  geçmeyen) kendi eski konumunda (video şeridinin altında) kalmaya devam ediyor. */}
              {notTasarimi && !ekAyri && resimAttachmentJsx}
            </div>
            )}
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
  const [screen, setScreen] = useState('home');
  // inboxOpen (eski üst header'daki 📥 modalının aç/kapa durumu) 2026-09 (Behnan kararı, WhatsApp-esinli
  // sadeleştirme) KALDIRILDI — Inbox artık ayrı bir modal değil, "Sohbet" sekmesinin (screen==='iletisim')
  // sayfa içi bir parçası, o yüzden ayrı bir aç/kapa state'ine gerek kalmadı.
  const [ibGrupSec, setIbGrupSec] = useState<string | null>(null); // havuza eklerken grup seçimi açık olan inbox öğesi
  const [ibGrupVal, setIbGrupVal] = useState('Genel');
  // Ay görünümü artık ayrı bir sayfa değil, takvim ikonuyla açılan bir overlay/popup (2026-09-17, Behnan kararı:
  // "sadece bir takvim ikonu bile yeterli, çıkan aylık seçim ve navigasyon popup'ın ... dışarıda bir şeye
  // dokunduğumuzda kapanır"). ayPopupOpen açık/kapalı durumu tutar; ayCursor ise popup içinde GEZİNİLEN ay —
  // `day`'den (Gün görünümünün asıl seçili günü) bilerek AYRI tutulur, çünkü ay içinde ileri/geri gezinmek
  // (henüz bir güne dokunmadan) Ajanda'nın asıl konumunu değiştirmemeli; sadece bir güne dokununca (ya da
  // "bugüne dön" gibi) gerçek seçim (setSelDate) yapılır ve popup kapanır.
  const [ayPopupOpen, setAyPopupOpen] = useState(false);
  const [ayCursor, setAyCursor] = useState<string | null>(null);
  const [selDate, setSelDate] = useState('');
  const [activities, setActivities] = useState<any[]>([]);
  // actGroup/actAltGroup artık bir "seçili sekme" değil, en son açtığın (dokunduğun) Grup/Alt grup — yeni bir
  // kart Ajanda'daki ＋'dan Havuz'a eklendiğinde otomatik olarak buraya düşer (bkz. Havuz akordeon ekranı).
  const [actGroup, setActGroup] = useState('Genel');
  const [actAltGroup, setActAltGroup] = useState<string | null>(null);
  // Havuz ekranında hangi Grup/Alt grup başlıklarının açık (genişletilmiş) olduğu — gerçek akordeon, birden
  // fazlası aynı anda açık kalabilir. Alt gruplar "Grup␟AltGrup" anahtarıyla tutuluyor (aynı adlı alt grup
  // farklı Gruplarda çakışmasın diye).
  const [acikGruplar, setAcikGruplar] = useState<Set<string>>(() => new Set(['Genel']));
  const [acikAltGruplar, setAcikAltGruplar] = useState<Set<string>>(() => new Set());
  // Havuz akordeonunda tepedeki "+ Grup" ve bir Grup başlığındaki "+" (alt grup) için satır-içi ekleme —
  // 🗂 Grupları yönet ekranındaki yeniden adlandır/sil/sırala hâlâ orada, bunlar sadece hızlı ekleme.
  const [anaGrupEkleAcik, setAnaGrupEkleAcik] = useState(false);
  const [altGrupEkleAcikFor, setAltGrupEkleAcikFor] = useState<string | null>(null); // Grup adı
  const [anaAltGrupYeniAd, setAnaAltGrupYeniAd] = useState('');
  // Havuz'u "kitaplık / araştırma planı" olarak kullanmak için kalıcı Grup + Alt grup listesi (bkz. dog_gruplar
  // tablosu, rite_gruplar_migration.sql). ust_id boş olanlar Grup (üst seviye), dolu olanlar o Grup'a bağlı Alt grup.
  const [grupListesi, setGrupListesi] = useState<any[]>([]);
  const [gruplarYonetOpen, setGruplarYonetOpen] = useState(false);
  const [grupYeniAd, setGrupYeniAd] = useState('');
  const [grupDuzenleId, setGrupDuzenleId] = useState<string | null>(null);
  const [grupDuzenleAd, setGrupDuzenleAd] = useState('');
  const [altGrupEkleFor, setAltGrupEkleFor] = useState<string | null>(null);
  const [altGrupYeniAd, setAltGrupYeniAd] = useState('');
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
  // Kişisel kartlarda (Not/Alışkanlık) görüntüleme/düzenleme modu ayrımı: yeni oluşturulan (taze) bir kart hep
  // düzenleme modunda açılır; kaydedilmiş bir kart sonradan açıldığında önce görüntüleme modunda gelir, alttaki
  // "Düzenle"ye basınca bu moda geçilir (kullanıcı isteği). Aynı kart açık kaldığı sürece (kaydetseler bile)
  // moddan çıkmasın diye, gerçekten YENİ bir kart açıldığında (ya da sheet kapanıp tekrar açıldığında) sıfırlanır
  // — bkz. aşağıdaki useEffect + lastDetayAnahtarRef.
  const [duzenleModu, setDuzenleModu] = useState(false);
  // Düzenleme moduna girerken kartın o anki hâlinin bir kopyası — "Vazgeç" basılınca alan değişiklikleri
  // (Ad, Zamanlama, Bildirim, video/resim) veritabanına hiç yazılmadan bu kopyayla geri yüklenir (bkz.
  // aşağıdaki Düzenle/Vazgeç/Kaydet butonları ve setRitAd/setBilgiCfg/ritTasi/setRitSure/setRitGunler/
  // setRitReminder'daki "duzenleModu ise sadece yerelde tut" dalları).
  const [duzenleOrijinal, setDuzenleOrijinal] = useState<any>(null);
  // Alışkanlık Zamanlama şeridi — Günler: varsayılan sade görünümde sadece "Her gün" chip'i var (zaten seçili
  // geliyor), haftanın günleri gizli; "Her gün"e basınca (kullanıcı isteği: "basarsak altta günler çıksa")
  // altında açılıp özel gün seçimine izin veriyor. Kart zaten özel günlerle geldiyse (gunler doluysa) baştan
  // açık başlıyor ki kullanıcı mevcut seçimini görsün — bkz. aşağıdaki useEffect.
  const [gunlerAcik, setGunlerAcik] = useState(false);
  // Süre satırının kompakt/düzenlenebilir hâli (2026-09-17, Behnan kararı — "Tekrarla'nın yeri" tartışması):
  // Süre artık her zaman görünen tek bir alan ("Süre 1 gün" ↔ "Süre 21 gün"), dokununca sayı kutusuna açılıyor
  // — ayrı bir "🔁 Tekrarla" anahtarına gerek kalmadı, gün sayısı 1'den büyüğe çıkınca kart kendiliğinden
  // tekrarlanan hâle geçiyor (bkz. aşağıdaki Süre şeridi ve title strip'ten kaldırılan 🔁 butonu).
  const [sureAcik, setSureAcik] = useState(false);
  // Başlangıç tarihi vurgusu (2026-09-17, Behnan kararı — "Tarih + süreli" fikri): Süre satırındaki tarih artık
  // SADECE mantık (setRitGunler'ın uyumluluk-kaydırması) kendiliğinden değiştirdiğinde kısa bir renk vurgusu
  // alıyor — kullanıcının kendi elle seçtiği bir tarihte (📅 input'undan ya da Süre değiştirirken) HİÇ yanmıyor,
  // sadece "sistem senin seçtiğin günlerle uyuşmadığı için tarihi kaydırdı" anını görünür kılmak için. Aşağıdaki
  // useEffect birkaç saniye sonra otomatik söndürüyor (bir "flash", kalıcı bir durum değil).
  const [basVurgu, setBasVurgu] = useState(false);
  useEffect(() => {
    if (!basVurgu) return;
    const t = setTimeout(() => setBasVurgu(false), 2600);
    return () => clearTimeout(t);
  }, [basVurgu]);
  // Kişisel kartların (Not/Alışkanlık/Yapılacak/Randevu) ortak "ek" (attachment) satırı — Bildirim'le aynı
  // şeritte, tek dosya (kullanıcı isteği: "resim yüklemeyi attachment ikonuyla... bildirimle aynı satırda...
  // birden çok dosya yüklemeyi gerekirse tek dosyaya düşürebiliriz"). Randevu'nun eski büyük foto ızgarası da
  // (resimGridJsx) bunun yerini alıyor — hepsi kart_config.resimler[0] (geriye dönük uyum için resim de) üstünde
  // aynı tek-dosya mantığını paylaşıyor; yükleme mantığı BilgiKartEdit'teki resimDosyaSecildi ile birebir aynı
  // (resimKucult + /api/upload), sadece burada sayfa seviyesinde (BilgiKartEdit'in dışında) tutuluyor ki
  // Bildirim satırıyla aynı flex satıra girebilsin.
  const [ekYukleniyor, setEkYukleniyor] = useState(false);
  const [ekHata, setEkHata] = useState('');
  const [ekBuyuk, setEkBuyuk] = useState(false);
  const ekInputRef = useRef<HTMLInputElement>(null);
  // Alışkanlık'ın "🎬 Video" tetikleyicisi — Bildirim/Ek şeridinde, Ek'in solunda (kullanıcı isteği, 2026-09-16:
  // "çoklu video" akışı). Sayfa seviyesinde tek atımlık (one-shot) bir bayrak: true olunca BilgiKartEdit kendi
  // video-ekle formunu açar ve hemen ardından onVideoEkleTetikKapat ile bu bayrağı false'a geri çeker — asıl
  // video listesi (videolar) hep kart_config'te, BilgiKartEdit'in kendi state'inde kalıyor, burada sadece "aç"
  // komutu taşınıyor.
  const [videoEkleAcik, setVideoEkleAcik] = useState(false);
  // notOdakAcik (2026-09-18, Behnan isteği — "Kaydet her zaman enable, boşsa tıklayınca uyar" tasarımı):
  // Not'un açıklaması boşken Kaydet'i disabled bırakmak yerine (eski notBos+disabled yaklaşımı) her zaman
  // tıklanabilir bırakıyoruz; kisiselDuzenleKaydet/taslakKaydet boş içerikte DB'ye hiç yazmadan burayı true
  // yapıp geri dönüyor, BilgiKartEdit de (videoEkleTetik'teki AYNI tek-atımlık tetikleyici deseni) içerik
  // kutusunu açıp imleci oraya odaklıyor — kullanıcı "neden kaydetmedi" diye şaşırmak yerine direkt yazmaya
  // yönlendiriliyor.
  const [notOdakAcik, setNotOdakAcik] = useState(false);
  const lastDetayAnahtarRef = useRef<string | null>(null);
  useEffect(() => {
    if (!detay) { lastDetayAnahtarRef.current = null; return; }
    const o2 = detay.obj || {};
    const anahtar = o2.id || ('taslak:' + (detay.tur || ''));
    if (lastDetayAnahtarRef.current !== anahtar) {
      lastDetayAnahtarRef.current = anahtar;
      const isDraft2 = !o2.id && !detay.preview;
      // Not/Aktivite(Bugün-Tekrarla)/Randevu artık her açıldığında doğrudan düzenleme modunda gelir — ayrı
      // bir "Düzenle"ye basma adımı yok (kullanıcı isteği: "artık hiçbir kartta... Kapat, Düzenle butonları
      // olmayacak, doğrudan düzenleme modunda açılacak"). Randevu da artık aynı Vazgeç/Kaydet mantığına
      // getirildi (kullanıcı isteği: "öncelikle randevuyu da Vazgeç,Kaydet mantığına getirelim") — diğer
      // (Meridyen/Havuz) tipler hâlâ eski davranışında, onlar sadece taslakken ya da yeni kaydedilmiş/taze
      // iken bu moddaydı, o mantık değişmedi.
      const zorunluDuzenle = detay.tur === 'ritual' && o2.kart_tipi === 'bilgi' && o2.kaynak === 'Kendi';
      setDuzenleModu(zorunluDuzenle || isDraft2 || (!!o2.id && taze === o2.id));
      setDuzenleOrijinal(null);
      setZamanOpen(false);
      setGunlerAcik(!!(o2.gunler && o2.gunler.length));
      setSureAcik(false);
      setBasVurgu(false);
      setEkYukleniyor(false);
      setEkHata('');
      setEkBuyuk(false);
      setVideoEkleAcik(false);
    }
  }, [detay, taze]);
  const [grupEditOpen, setGrupEditOpen] = useState(false);
  const [grupEditVal, setGrupEditVal] = useState('');
  const [grupEditAltVal, setGrupEditAltVal] = useState('');
  const [paylasOpen, setPaylasOpen] = useState(false);
  // "Mezun et" kavramı 2026-09-17'de (Behnan kararı) TAMAMEN kaldırıldı — mezunModal/mezunEt/Mezunlar ekranı
  // silindi (bkz. o değişikliklerin yanındaki notlar). puanModal/puanDeger: "Puanla" eylemi için (bkz.
  // ritPuanla) — puanModal o an puanlanan rt'yi tutuyor, puanDeger seçilen yıldızın yerel arabelleği.
  const [puanModal, setPuanModal] = useState<any>(null);
  const [puanDeger, setPuanDeger] = useState(0);
  const [remInput, setRemInput] = useState('');
  const [remTarihInput, setRemTarihInput] = useState('');
  // 🎓/🔔 ikonları artık Zamanlama formundaki checkbox/saat alanlarının yerini alıyor — dolu ikon zaten
  // açık olan bir şeyi (alışkanlık/bildirim) temsil ediyor, dokununca küçük bir seçenek menüsü açılıyor
  // (kapat vs. daha ağır bir işlem gibi mezun et); boş/soluk ikon dokununca direkt açıyor, çünkü o zararsız.
  const [habitMenuFor, setHabitMenuFor] = useState<any>(null);
  // Liste satırındaki ⋯ menüsü: tek başına duran ✕ (Kaldır) yerine geldi — şimdilik tek seçeneği Sil, ileride
  // Paylaş ve başkaları da buraya eklenebilir (kullanıcı isteği). RitItem her render'da yeniden tanımlanan iç
  // içe bir bileşen olduğu için kendi useState'i güvenli değil (React her seferinde farklı bir type görüp
  // remount eder) — bu yüzden hangi satırın menüsü açık diye dıştaki bu state'i kullanıyoruz (habitMenuFor'la
  // aynı desen).
  const [ritMenuFor, setRitMenuFor] = useState<any>(null);
  const [homeDetay, setHomeDetay] = useState<string | null>(null);
  // Home'un alanları artık ayrı bir tablo değil, Havuz/Kütüphane'nin kalıcı Grup listesinin (dog_gruplar) bir
  // parçası: kullanıcının değiştiremeyeceği kilitli "Meridyen" kökünün alt grupları (bkz. grupListesi,
  // meridyenRoot, homeAlanlar altta ve ensureMeridyenGrubu). 2026-09 (Behnan kararı — "Alanlar" mimarisi):
  // İÇERİK (ad/neden/checklist/örnekler) artık burada hiç düzenlenmiyor — tek kanonik kaynak Rite Studio'daki
  // (app-meridyen/atama) Alanlar, dog_meridyen_alanlar tablosunda tutuluyor (bkz. meridyenAlanlarLib altta).
  // Danışanın kendi dog_gruplar satırı sadece "hangi alan (anahtar) + görünür mü (home_gizli) + sırası ne
  // (sira)" taşıyan ince bir satır; eski zengin düzenleme formu (alanFormFor, homeAlanEkle/Guncelle/Sil/
  // Sifirla) bu yüzden tamamen kaldırıldı. Home'un KENDİ ekranı (homeYonetOpen) hâlâ sadece görünürlük+sıra.
  const [homeYonetOpen, setHomeYonetOpen] = useState(false);
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
  const [meridyenAlanlarLib, setMeridyenAlanlarLib] = useState<any[]>([]);
  const [kZamanlar, setKZamanlar] = useState<string[]>(['gün']);
  const [kEditId, setKEditId] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [kAd, setKAd] = useState('');
  const [kAcik, setKAcik] = useState('');
  const [kGrup, setKGrup] = useState('Genel');
  const [kVin, setKVin] = useState({ baslik: '', url: '' });
  const [kMsg, setKMsg] = useState('');
  // Kişisel aktiviteyi Home'un Meridyen alanlarıyla (anahtar bazlı) etiketlemek için — eski fayda→alan
  // taksonomisine dokunmadan ayrı, çoklu-seçim bir alan (2026-09, Behnan kararı: "direkt Home etiketi" —
  // dog_activities.home_alanlar). Home Detay'daki "Aktivitelerin" listesi buna göre filtreleniyor.
  const [kHomeAlanlar, setKHomeAlanlar] = useState<string[]>([]);
  const [paylasBusy, setPaylasBusy] = useState(false);
  const [kShareTo, setKShareTo] = useState('');
  const [kisiler, setKisiler] = useState<any[]>([]);
  const [profilAd, setProfilAd] = useState('');
  const [kiAd, setKiAd] = useState('');
  const [kiKod, setKiKod] = useState('');
  const [paylasSel, setPaylasSel] = useState<string[]>([]);
  const [ekstraGruplar, setEkstraGruplar] = useState<string[]>([]);
  const [ekleMenuOpen, setEkleMenuOpen] = useState(false);
  const [olcumEkleOpen, setOlcumEkleOpen] = useState(false);
  const [olcumSecAnahtar, setOlcumSecAnahtar] = useState<string | null>(null);
  const [olcumOzelAd, setOlcumOzelAd] = useState('');
  const [olcumDeger, setOlcumDeger] = useState('');
  const [olcumBirim, setOlcumBirim] = useState('');
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
  // Ay popup'ı içindeki ay gezinmesi — bilerek setSelDate DEĞİL, setAyCursor kullanıyor (bkz. ayCursor tanımı):
  // popup'ta ileri/geri aylara bakmak, bir güne dokunmadan Ajanda'nın asıl seçili gününü değiştirmemeli.
  function shiftAyCursor(delta: number) {
    const dt = parseD(ayCursor || day);
    dt.setDate(1); dt.setMonth(dt.getMonth() + delta);
    setAyCursor(iso(dt));
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
    // iOS'ta (özellikle ana ekrana eklenmiş/standalone PWA) sekmeler arası geçişte 'pageshow' bazen 'focus'tan
    // daha güvenilir tetikleniyor (bfcache'ten geri dönüş) — ikisini birlikte dinlemek zarar vermiyor.
    window.addEventListener('pageshow', tazele);
    return () => { window.removeEventListener('focus', tazele); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pageshow', tazele); };
  }, [client]);

  // Behnan geri bildirimi (2026-09): Meridyen'den yeni atanan bir alan telefonda hemen çıkmıyor, ancak uygulama
  // tamamen kapatılıp yeniden açılınca geliyor — yukarıdaki focus/visibilitychange, iOS'ta özellikle standalone
  // PWA'da arka plandan öne gelişte güvenilir tetiklenmeyebiliyor (bilinen bir platform kısıtı). Gerçek zamanlı
  // yayın (Supabase Realtime) kurmak yerine mevcut "tazele" felsefesiyle tutarlı, daha ucuz iki ek önlem: (a) Home
  // sekmesine her girişte gruplar hemen yenilenir, (b) Home'dayken 30 saniyede bir sessizce arka planda yenilenir.
  // En kötü ihtimalle yeni atanan bir alan 30 saniye içinde, ya da kullanıcı sekmeye her dokunduğunda görünür.
  useEffect(() => {
    if (!client || screen !== 'home') return;
    loadGruplar(client.id);
    const t = setInterval(() => loadGruplar(client.id), 30000);
    return () => clearInterval(t);
  }, [client, screen]);

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

  useEffect(() => { loadActivities(); loadFaydalar(); loadAreas(); loadMeridyenAlanlar(); }, []);
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
  // Home'un Meridyen alanlarının KANONİK içeriği — client'tan bağımsız, tek kaynak (Rite Studio'dan yazılıyor).
  // bkz. homeAlanlar altta: danışanın dog_gruplar satırı sadece anahtar/home_gizli/sira taşıyor, ad/neden/
  // checklist/ornekler burada anahtar üzerinden eşleniyor.
  async function loadMeridyenAlanlar() {
    const r = await supabase.from('dog_meridyen_alanlar').select('*').eq('aktif', true).order('sira');
    setMeridyenAlanlarLib(r.data || []);
  }
  async function loadActivities() {
    const r = await supabase.from('dog_activities').select('*').eq('aktif', true).order('grup').order('sira');
    setActivities(r.data || []);
  }

  async function loadData(clientId: string) {
    const r = await supabase.from('dog_rituals').select('id,ad,zaman,kategori,tip,kaynak,mezun,aktif,alan,rutin,rutin_ad,sira,baslangic,bitis,activity_id,hatirlatma_saat,blok_sira,faydalar,url,gunler,kart_tipi,kart_config,aliskanlik,aciklama,sablon_id,sablon_adim,kisisel_not,puan').eq('client_id', clientId).order('zaman');
    // 2026-09-16 eklendi: bu sorgu daha önce hatayı sessizce yutup Ajanda'yı boş gösteriyordu (bkz. Behnan'ın
    // "ajandada hiçbir şey görünmüyor" bildirimi — kök neden: select listesine yeni eklenen `puan` kolonu henüz
    // migration'la (rite_ritual_puan_migration.sql) oluşturulmamıştı, PostgREST tüm sorguyu reddetti). Artık
    // hata varsa görünür şekilde uyarıyoruz — sessizce boş Ajanda göstermek yerine.
    if (r.error) { console.error('dog_rituals select hatası:', r.error); alert('Ritüeller yüklenemedi: ' + r.error.message); }
    const lg = await supabase.from('dog_ritual_logs').select('id,ritual_id,tarih,yapildi').eq('client_id', clientId);
    let ritualRows: any[] = r.data || [];
    const logRows = lg.data || [];
    // Yapılacak VE Randevu: günü (bitis) geçmiş ama hiç "yapıldı" kaydı olmadan kalmış (yani tamamlanmadan/
    // katılınmadan kapanmamış) her kartın bitis'i null'a çekilir — süresiz hâle gelip siz işaretleyene/silene ya
    // da başlıktaki tarih seçiciyle yeni bir güne taşıyana kadar her gün görünmeye devam eder (kullanıcı isteği:
    // "bir sonraki güne taşınması", "randevu gecikmesini de aynı şekilde göstermek mantıklı olabilir").
    // baslangic'e BİLEREK dokunmuyoruz: orijinal vade/randevu tarihi böylece kalıcı olarak saklanıyor, RitItem'daki
    // "N gün gecikti" belirteci de bunu kullanıyor; tarih seçiciyle taşınınca (ritTasi) baslangic ileri gidip
    // gecikme kendiliğinden düzeliyor. bitis null olduğu andan itibaren activeOn zaten her gün eşleştiği için bu
    // satır bir daha çalışmıyor (rt.bitis artık falsy) — günlük tekrar yazma gerekmiyor.
    // Alışkanlık/Not bu mekanizmaya hiç girmiyor — sadece kart_config.gorev ya da kart_config.randevu ve
    // alışkanlık değil. kartYapildiToggle (Yapılacak) tamamlanınca zaten bir yapıldı kaydı bırakıp bitis'i o
    // güne sabitliyor; Randevu'nun kendi "yaptım" tiki de (toggleRit) aynı şekilde bir yapıldı kaydı bırakıyor —
    // bu yüzden gerçekten işaretlenmiş bir kart buradan yanlışlıkla ileri kaydırılmıyor.
    const gecikenler = ritualRows.filter((rt: any) => !rt.mezun && !rt.aliskanlik && (rt.kart_config?.gorev || rt.kart_config?.randevu) && rt.bitis && rt.bitis < today && !logRows.some((l: any) => l.ritual_id === rt.id && l.yapildi));
    if (gecikenler.length > 0) {
      await Promise.all(gecikenler.map((rt: any) => supabase.from('dog_rituals').update({ bitis: null }).eq('id', rt.id)));
      const gecikenIds = new Set(gecikenler.map((rt: any) => rt.id));
      ritualRows = ritualRows.map((rt: any) => gecikenIds.has(rt.id) ? { ...rt, bitis: null } : rt);
    }
    setRituals(ritualRows);
    setLogs(logRows);
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
    const rows = await loadGruplar(clientId);
    ensureMeridyenGrubu(clientId, rows);
  }
  // Havuz'daki kalıcı Grup/Alt grup listesi (bkz. dog_gruplar) — Gruplar yönet ekranındaki her ekle/yeniden
  // adlandır/sil/sırala işleminden sonra da tekrar çağrılıyor. Home'un alanları da (anahtar/neden/checklist/
  // ornekler/sabit/home_gizli) artık aynı tablodan geliyor, o yüzden select bunları da kapsıyor.
  async function loadGruplar(clientId: string) {
    const g = await supabase.from('dog_gruplar').select('id,ad,ust_id,sira,anahtar,neden,checklist,ornekler,sabit,home_gizli').eq('client_id', clientId).order('sira');
    if (g.error) { console.error('dog_gruplar select hatası:', g.error); alert('Gruplar yüklenemedi: ' + g.error.message); return []; }
    const rows = g.data || [];
    setGrupListesi(rows);
    return rows;
  }
  // Home'un alanlarının yaşadığı, kullanıcının yeniden adlandıramayacağı/silemeyeceği kilitli kök grup: "Meridyen".
  // Kullanıcı Havuz'da bunu zaten elle oluşturmuştu (kullanıcı isteği: "zaten Meridyen diye bir grup yaratmıştım,
  // ve oraya kullanıcının dokunmamasını istiyordum") — bulunca üstüne sabit:true basıyoruz, hiç yoksa oluşturuyoruz.
  // Client açılışında bir kere çağrılıyor.
  // 2026-09 (Behnan kararı — "Alanlar" mimarisi, "her alanı danışana yollamıyoruz"): bu fonksiyon artık SADECE
  // kilitli "Meridyen" kök grubunun var olduğunu garanti ediyor — otomatik olarak hiçbir alan tohumlamıyor.
  // Hangi alanların bu danışana ait olacağı Rite Studio'daki (app-meridyen/atama) "Ata" fonksiyonundan geliyor;
  // yeni bir danışanın Home'u, kendisine en az bir alan atanana kadar boş görünür (bkz. Home ekranındaki boş
  // durum notu). Eski toplu tohumlama (HOME_ALAN_VARSAYILAN, dog_home_alanlar migration fallback'i) kaldırıldı.
  async function ensureMeridyenGrubu(clientId: string, rows: any[]) {
    let root = rows.find((g) => !g.ust_id && (g.sabit || g.ad === 'Meridyen'));
    if (!root) {
      const ins = await supabase.from('dog_gruplar').insert({ client_id: clientId, ad: 'Meridyen', ust_id: null, sira: -1, sabit: true }).select().single();
      if (ins.error) { console.error('Meridyen grubu oluşturulamadı:', ins.error); alert('Meridyen grubu oluşturulamadı: ' + ins.error.message); return; }
    } else if (!root.sabit) {
      const upd = await supabase.from('dog_gruplar').update({ sabit: true }).eq('id', root.id);
      if (upd.error) { console.error('Meridyen sabit işaretlenemedi:', upd.error); alert('Meridyen grubu kilitlenemedi: ' + upd.error.message); return; }
    } else {
      return; // kök zaten var ve kilitli — yapacak bir şey yok, gereksiz loadGruplar tekrarını atla.
    }
    await loadGruplar(clientId);
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
  // Aktivite'nin "Bugün" hâli (kart_config.gorev, bitissiz, aliskanlik=false) için ayrı bir tamamlama:
  // Tekrarla açıkken (aliskanlik) olduğu gibi sadece o günün kaydı değil, kalıcı bir kapanış (kullanıcı isteği:
  // "yapıncaya kadar devam edebilir" — işaretlenince kart bir daha görünmemeli). toggleRit'in kendisine hiç
  // dokunmuyoruz (Not/Randevu aynen eski davranışında kalsın diye), bu tamamen ayrı bir fonksiyon —
  // sadece kisiselTur==='yapilacak' dalındaki "yaptım" tikinden çağrılıyor.
  async function kartYapildiToggle(rt: any) {
    if (!client) return;
    const oncekiYapildi = ritDone(rt.id);
    const ex = logs.filter((l) => l.ritual_id === rt.id && l.tarih === day)[0];
    if (ex) await supabase.from('dog_ritual_logs').update({ yapildi: !ex.yapildi }).eq('id', ex.id);
    else await supabase.from('dog_ritual_logs').insert({ client_id: client.id, ritual_id: rt.id, tarih: day, yapildi: true });
    if (!rt.aliskanlik && rt.kart_config?.gorev) {
      if (!oncekiYapildi) await supabase.from('dog_rituals').update({ bitis: day }).eq('id', rt.id);
      else if (rt.bitis === day) await supabase.from('dog_rituals').update({ bitis: null }).eq('id', rt.id);
    }
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
  function studioReset() { setKAd(''); setKAcik(''); setKGrup('Genel'); setKVin({ baslik: '', url: '' }); setKZamanlar(['gün']); setKEditId(null); setKMsg(''); setKHomeAlanlar([]); }
  function openStudioEdit(a: any) {
    studioReset();
    setKAd(a.ad || ''); setKAcik(a.aciklama || ''); setKGrup(a.grup && a.grup !== 'Kişisel' ? a.grup : 'Genel'); setKVin({ baslik: '', url: (a.videolar && a.videolar[0]?.url) || '' }); setKZamanlar(a.zamanlar && a.zamanlar.length ? [a.zamanlar[0]] : [a.zaman || 'gün']); setKEditId(a.id); setKHomeAlanlar(a.home_alanlar || []);
    setStudioOpen(true);
  }
  // (openStudioForHomeAlan KALDIRILDI — 2026-09-16, Behnan kararı: Home'un alan Detay'ındaki "+ Aktivite ekle"
  // danışanı eski/güncel olmayan bir kişisel-aktivite formuna açıyordu; şimdilik bu ekleme yolu tamamen
  // kapatıldı, danışan sadece var olan "Aktivitelerin" listesini ve Meridyen'den atanmış programları görüyor.)
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
    const row: any = { client_id: client.id, tur: 'aktivite', ad: kAd.trim(), grup: kGrup.trim() || 'Genel', faydalar: [], aciklama: kAcik || null, videolar: url ? [{ baslik: kAd.trim(), url }] : [], zaman: kZamanlar[0] || 'gün', zamanlar: kZamanlar, kaynak_etiket: 'Kendi', aktif: true, home_alanlar: kHomeAlanlar };
    const r = kEditId ? await supabase.from('dog_activities').update(row).eq('id', kEditId) : await supabase.from('dog_activities').insert(row);
    if (r.error) return setKMsg('Hata: ' + r.error.message);
    const savedGrup = row.grup;
    studioReset(); loadActivities(); setStudioOpen(false); setActGroup(savedGrup);
    setAcikGruplar((s) => new Set(s).add(savedGrup));
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
  // Ritüel / aktivite / programı bir ya da birden çok paylaşım koduna yolla (dog_inbox).
  async function paylas(o: any, isRit: boolean, kodlar: string[]) {
    if (paylasBusy) return; // çift dokunma/çift paylaşımı önle (kullanıcı geri bildirimi)
    const ks = Array.from(new Set(kodlar.map((x) => (x || '').trim().toUpperCase()).filter(Boolean)));
    if (!ks.length) return setKMsg('Kişi seç ya da kod gir');
    setPaylasBusy(true);
    // Payload tüm alıcılar için aynı — döngü dışında bir kere kuruluyor.
    let payload: any;
    if (!isRit && o.tur === 'program') payload = { tur: 'program', ad: o.ad, adimlar: o.adimlar || [], sure_gun: o.sure_gun || null };
    else if (!isRit) payload = { tur: 'aktivite', ad: o.ad, faydalar: o.faydalar || [], aciklama: o.aciklama || null, videolar: o.videolar || [], zaman: o.zaman || 'gün', zamanlar: o.zamanlar || null, gunler: o.gunler || null, sure_gun: o.sure_gun || null, kartTipi: o.kart_tipi || null, kartConfig: o.kart_config || null, aliskanlik: o.aliskanlik };
    else {
      payload = { tur: 'aktivite', ad: o.ad, faydalar: o.faydalar || [], url: o.url || null, zaman: o.zaman || 'gün', zamanlar: [o.zaman || 'gün'], gunler: o.gunler || null, sure_gun: null, kartTipi: o.kart_tipi || null, kartConfig: o.kart_config || null, aliskanlik: o.aliskanlik };
      // Süregelen olmayan kişisel bilgi kartları (Not/Randevu) tek bir güne ait — paylaşırken o tarih de gitsin,
      // yoksa alıcı tarafında "bugüne" düşer (randevu için özellikle yanlış olur). Alışkanlık/rutin paylaşımında
      // alıcı için "bugün başlasın" zaten doğru davranış, o yüzden bilerek dokunulmadı.
      if (o.kart_tipi === 'bilgi' && !o.aliskanlik) { payload.baslangic = o.baslangic || null; payload.bitis = o.bitis || null; }
    }
    const gonderen = profilAd.trim() || client?.ad || '';
    payload.from_ad = gonderen || null;
    const basarili: string[] = [];
    const basarisiz: string[] = [];
    for (const k of ks) {
      const rc = await supabase.from('dog_clients').select('id').eq('share_code', k).limit(1);
      if (rc.error || !rc.data || !rc.data.length) { basarisiz.push(k); continue; }
      const ins = await supabase.from('dog_inbox').insert({ client_id: rc.data[0].id, tur: 'aktivite', baslik: o.ad, payload, from_code: client?.share_code || null, durum: 'yeni' });
      if (ins.error) { basarisiz.push(k); continue; }
      try { await fetch('/api/push/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: rc.data[0].id, title: gonderen ? '📩 ' + gonderen : '📩 Yeni paylaşım', body: (gonderen ? gonderen + ' paylaştı: ' : '') + o.ad, url: '/' }) }); } catch (_) { /* sessiz */ }
      basarili.push(kisiAd(k) || k);
    }
    setKShareTo(''); setPaylasSel([]);
    if (basarili.length && !basarisiz.length) setKMsg('✓ Paylaşıldı → ' + basarili.join(', '));
    else if (basarili.length && basarisiz.length) setKMsg('✓ ' + basarili.join(', ') + ' · bulunamadı: ' + basarisiz.join(', '));
    else { setKMsg('Kod(lar) bulunamadı: ' + basarisiz.join(', ')); setPaylasBusy(false); return; }
    // Küçük bir onay yazısı gözden kaçabiliyordu (kullanıcı geri bildirimi) — artık paylaşım tamamlanana kadar
    // buton kilitli kalıyor, kısa bir gecikmeyle pencere kendiliğinden kapanıyor; "paylaştım mı" belirsizliğiyle
    // tekrar dokunulamıyor.
    setTimeout(() => { setPaylasOpen(false); setKMsg(''); setPaylasBusy(false); }, 900);
  }
  // Ajanda'da doğrudan yaratılmış bir kartı (isRit) kimseye göndermeden kendi Havuzuna al — Paylaş penceresindeki
  // ikinci bir seçenek (kullanıcı isteği). Alan eşlemesi paylas()'ın isRit dalıyla aynı mantık, sadece dog_inbox
  // yerine doğrudan dog_activities'e yazıyor (alıcı/kabul adımı yok). Randevu hariç — tek bir tarihe/saate bağlı
  // olduğu için Havuz'un tarihsiz şablon kavramına uymuyor (kullanıcının "Havuzuma ekle" için verdiği karar).
  async function ritHavuzaAl(o: any) {
    if (!client || paylasBusy) return;
    setPaylasBusy(true);
    const alan0 = o.faydalar?.length ? faydaMap[o.faydalar[0]]?.alan || null : null;
    const ins = await supabase.from('dog_activities').insert({
      client_id: client.id, tur: 'aktivite', ad: o.ad, grup: alan0 || 'Genel',
      faydalar: o.faydalar || [], aciklama: o.aciklama || null,
      videolar: o.url ? [{ baslik: o.ad, url: o.url }] : [],
      zaman: o.zaman || 'gün', zamanlar: null, gunler: o.gunler || null,
      sure_gun: o.bitis ? sureGun(o) : null,
      kart_tipi: o.kart_tipi || null, kart_config: o.kart_config || null,
      // puan: 2026-09-16 — ritüel Puanla ile zaten değerlendirilmişse (bkz. ritPuanla), Havuz'a kaydederken
      // bu puan da otomatik taşınıyor, ayrıca yeniden değerlendirmeye gerek kalmıyor.
      puan: o.puan || null,
      kaynak_etiket: 'Kendi', aktif: true,
    }).select().single();
    if (ins.error) { setKMsg('Havuza eklenemedi: ' + ins.error.message); setPaylasBusy(false); return; }
    setKMsg('✓ Havuzuna eklendi');
    loadActivities();
    setTimeout(() => { setPaylasOpen(false); setKMsg(''); setPaylasBusy(false); }, 900);
  }
  async function silAktivite(act: any) {
    if (!confirm('Bu kişisel aktivite havuzdan silinsin mi? (Ajandadaki ritüeller kalır)')) return;
    const r = await supabase.from('dog_activities').delete().eq('id', act.id);
    if (r.error) return alert('Hata: ' + r.error.message);
    closeDetay(); loadActivities();
  }
  // ---------- Havuz: kalıcı Grup / Alt grup listesi (dog_gruplar) ----------
  // ustId null → yeni bir üst seviye Grup; doluysa o Grup'a bağlı bir Alt grup.
  async function grupEkle(ad: string, ustId: string | null) {
    if (!client) return null;
    const isim = ad.trim();
    if (!isim) return null;
    const kardesler = grupListesi.filter((g) => (g.ust_id || null) === (ustId || null));
    const sira = kardesler.length ? Math.max(...kardesler.map((g) => g.sira)) + 1 : 0;
    const ins = await supabase.from('dog_gruplar').insert({ client_id: client.id, ad: isim, ust_id: ustId, sira }).select().single();
    if (ins.error) { alert('Eklenemedi: ' + ins.error.message); return null; }
    await loadGruplar(client.id);
    return ins.data as { id: string; ad: string; ust_id: string | null; sira: number };
  }
  // Havuz akordeonunda bir Grup başlığından doğrudan "+ Alt grup" denince: o Grup adı henüz gerçek bir
  // dog_gruplar satırı değilse (eski/örtük — HAVUZ_VARSAYILAN_GRUPLAR ya da sadece bir aktivite üzerinde
  // metin olarak var) önce onu kalıcı bir üst-seviye Grup'a "yükseltip" öyle alt grup ekliyoruz.
  async function grupUstIdGaranti(ad: string): Promise<string | null> {
    const mevcut = grupUst.find((g) => g.ad === ad);
    if (mevcut) return mevcut.id;
    const yeni = await grupEkle(ad, null);
    return yeni?.id || null;
  }
  async function grupYenidenAdlandir(id: string, ad: string) {
    if (!client || !ad.trim()) return;
    await supabase.from('dog_gruplar').update({ ad: ad.trim() }).eq('id', id);
    loadGruplar(client.id);
  }
  async function grupSil(g: any) {
    if (!client) return;
    const altSay = grupListesi.filter((x) => x.ust_id === g.id).length;
    const msg = altSay > 0
      ? '"' + g.ad + '" ve altındaki ' + altSay + ' alt grup silinsin mi? (Bu gruba etiketlenmiş kartlar Havuz\'da kalır, üzerlerindeki grup adı serbest metin olarak aynen durur.)'
      : '"' + g.ad + '" silinsin mi?';
    if (!confirm(msg)) return;
    await supabase.from('dog_gruplar').delete().eq('id', g.id); // ust_id cascade — alt gruplar da silinir
    loadGruplar(client.id);
  }
  // Kardeşler arasında sırayı değiştir (yon: -1 yukarı, 1 aşağı) — sira alanlarını komşusuyla takas eder.
  async function grupSiraDegistir(g: any, yon: -1 | 1) {
    if (!client) return;
    const kardesler = grupListesi.filter((x) => (x.ust_id || null) === (g.ust_id || null)).sort((a, b) => a.sira - b.sira);
    const i = kardesler.findIndex((x) => x.id === g.id);
    const j = i + yon;
    if (j < 0 || j >= kardesler.length) return;
    const diger = kardesler[j];
    await supabase.from('dog_gruplar').update({ sira: diger.sira }).eq('id', g.id);
    await supabase.from('dog_gruplar').update({ sira: g.sira }).eq('id', diger.id);
    loadGruplar(client.id);
  }
  // ---------- Home: alan listesi (dog_gruplar'ın "Meridyen" kökü altındaki ince/thin alt gruplar + kanonik içerik) ----------
  // meridyenRoot: kilitli kök grup satırı (bkz. ensureMeridyenGrubu — client açılışında garanti ediliyor).
  // homeAlanlar: o kökün alt grupları (client'a ÖZEL: sadece anahtar/home_gizli/sira), sira'ya göre sıralı,
  // ad/neden/checklist/ornekler ise meridyenAlanlarLib'den (kanonik, TEK kaynak) anahtar üzerinden eşleniyor —
  // 2026-09 Behnan kararı: "hep senkronize olacaklar", içerik artık burada hiç tutulmuyor. Eşleşme bulunamazsa
  // (kanonik satır sonradan pasifleştirilmiş/silinmiş olabilir) satırın kendi eski değerlerine düşülüyor, hiç
  // kırılmasın diye.
  const meridyenRoot = grupListesi.find((g) => !g.ust_id && (g.sabit || g.ad === 'Meridyen'));
  const homeAlanlar = meridyenRoot ? grupListesi.filter((g) => g.ust_id === meridyenRoot.id).sort((a, b) => a.sira - b.sira).map((g) => {
    const lib = meridyenAlanlarLib.find((x) => x.anahtar === g.anahtar);
    return lib ? { ...g, ad: lib.ad, neden: lib.neden, checklist: lib.checklist, ornekler: lib.ornekler } : g;
  }) : [];
  // Home ekranında (kart ızgarası + Detay'daki "Kendini değerlendir") SADECE gizlenmemiş alanlar görünür — bkz.
  // homeYonetOpen, homeAlanGizleDegistir. Home'un kendi yönetim ekranı ise (gizli olanı geri göstermek için)
  // tam listeyi (homeAlanlar) kullanıyor.
  const homeAlanlarGorunur = homeAlanlar.filter((a) => !a.home_gizli);
  // Home'da bir alanı ekrandan kaldırma/geri gösterme — içerik zaten burada hiç yok, sadece Home'un kart
  // listesinde görünüp görünmeyeceği. Sıra için ayrı bir alan yok, Kütüphane'yle paylaşılan `sira` kullanılıyor
  // (bkz. grupSiraDegistir — Home'un kendi ekranından da aynı fonksiyon çağrılıyor).
  async function homeAlanGizleDegistir(a: any) {
    if (!client) return;
    await supabase.from('dog_gruplar').update({ home_gizli: !a.home_gizli }).eq('id', a.id);
    loadGruplar(client.id);
  }
  function sureGun(rt: any): number { if (!rt.bitis) return 0; const b = parseD(rt.baslangic || today); const e = parseD(rt.bitis); return Math.round((e.getTime() - b.getTime()) / 86400000) + 1; }
  // Ajanda'da (tur='ritual') sadece detay.obj yamalanır — act ayrı bir kavram (bağlı Program şablonu) olabilir,
  // ona dokunmak yanlış olur. Havuz'da (tur!=='ritual') o ve act aynı nesneyi temsil ediyor (bkz. openDetay'in
  // else dalı) — bilgi kartı taslağı (kart_config, gunler…) düzenlenirken ikisi de senkron kalsın diye act da
  // yamalanıyor; yoksa kCfg (act.kart_config okuyor) ekranda hiç güncellenmez.
  const patchDetay = (patch: any) => setDetay((d: any) => {
    if (!d) return d;
    if (d.tur !== 'ritual') setDetayAct((a: any) => (a ? { ...a, ...patch } : a));
    return { ...d, obj: { ...d.obj, ...patch } };
  });
  // Tek detay kartı: hem ritüel (Ajanda) hem aktivite (Havuz) buradan açılır.
  async function openDetay(obj: any, tur: string, extra?: any) {
    setDetay({ obj, tur, ...(extra || {}) }); setGrupEditOpen(false); setGrupEditVal('');
    if (tur === 'ritual') {
      setAdInput(obj.ad || ''); setRemInput(obj.hatirlatma_saat || ''); setUrlInput(obj.url || ''); setAciklamaInput(obj.aciklama || ''); setKartUrlInput((obj.kart_config && obj.kart_config.url) || obj.url || ''); setKisiselNotInput(obj.kisisel_not || '');
      const n = sureGun(obj); setSureInput(n > 0 ? String(n) : '21');
      if (obj.activity_id) { const a = await supabase.from('dog_activities').select('*').eq('id', obj.activity_id).single(); setDetayAct(a.data || null); }
      else setDetayAct(null);
      if (obj.sablon_id) { const s = await supabase.from('dog_activities').select('id,adimlar').eq('id', obj.sablon_id).single(); setDetaySablon(s.data || null); }
      else setDetaySablon(null);
    } else {
      setDetayAct(obj); setDetaySablon(null);
      // adInput normalde sadece isRit dalında kullanılır (başlık input'u); Havuz taslağının (yeniHavuzTaslakAc)
      // başlığı da aynı input'u paylaşıyor, o yüzden burada da dolduruluyor — gerçek (kaydedilmiş) Havuz
      // kartlarında başlık zaten salt okunur <h2> olarak gösterildiği için bunun bir etkisi yok.
      setAdInput(obj.ad || '');
    }
  }
  // Inbox'a gelen (henüz kabul edilmemiş) bir paylaşımı, gerçek karta eklemeden Havuz görünümüyle önizle —
  // "Ajandama ekle" burada gösterilmiyor (kabul, Inbox listesindeki asıl butonlardan yapılır); preview:true
  // detay ekranındaki düzenleme/paylaşım/sil gibi kalıcı işlemleri devre dışı bırakıyor.
  function openInboxPreview(v: any) {
    const p = v.payload || {};
    const obj: any = {
      ad: p.ad || v.baslik || 'Paylaşım',
      tur: p.tur === 'program' ? 'program' : undefined,
      adimlar: p.adimlar || [],
      kart_tipi: p.kartTipi || null, kart_config: p.kartConfig || null,
      aliskanlik: p.aliskanlik || false, faydalar: p.faydalar || [],
      aciklama: p.aciklama || null, videolar: p.videolar || null,
      zaman: p.zaman || 'gün', zamanlar: p.zamanlar || null, gunler: p.gunler || null, sure_gun: p.sure_gun || null,
      baslangic: p.baslangic || null, bitis: p.bitis || null,
      grup: null,
    };
    openDetay(obj, 'aktivite', { preview: true });
  }
  function openRit(rt: any) { openDetay(rt, 'ritual'); }
  function closeDetay() { setDetay(null); setTaze(null); setDuzenleOrijinal(null); }
  // Havuzdaki (kişisel) bir aktivite/programın grubunu (ve varsa alt grubunu) değiştir — aktivite ve program için ortak.
  async function setAktGrup(id: string, grup: string, altGrup?: string) {
    if (!client) return;
    const g = grup.trim() || 'Genel';
    const ag = (altGrup || '').trim() || null;
    await supabase.from('dog_activities').update({ grup: g, alt_grup: ag }).eq('id', id);
    setDetay((d: any) => (d ? { ...d, obj: { ...d.obj, grup: g, alt_grup: ag } } : d));
    setDetayAct((a: any) => (a ? { ...a, grup: g, alt_grup: ag } : a));
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
    // taslakta (id yok) ya da kayıtlı bir kişisel kart düzenleme modundayken (duzenleModu) canlı/online yazma
    // yok — sadece yerel detay.obj güncellenir, asıl kayıt Kaydet butonuna (kisiselDuzenleKaydet) kalır.
    if (!id || duzenleModu) { patchDetay({ ad: ad.trim() }); return; }
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
    if (!id) { patchDetay({ kisisel_not: n }); return; } // taslak
    await supabase.from('dog_rituals').update({ kisisel_not: n }).eq('id', id);
    patchDetay({ kisisel_not: n });
    loadData(client.id);
  }
  // Kişisel bilgi kartı düzenlemesi (BilgiKartEdit'ten): video ekle/sil, içerik kaydet — hep 'bilgi' tipine sabitler.
  async function setBilgiCfg(id: string, cfg: any) {
    if (!client) return;
    const patch = { kart_config: cfg, kart_tipi: 'bilgi' };
    if (!id || duzenleModu) { patchDetay(patch); return; } // taslak ya da düzenleme modu — sadece yerelde tut
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
  // Not / Randevu / Alışkanlık: ＋ menüsünden tıklayınca artık DOĞRUDAN kart yaratmıyoruz. Aynı tam düzenleme
  // ekranı (openRit'in açtığı ekran) o.id'si olmayan yerel bir "taslak" nesnesiyle açılıyor — alan düzenleme
  // fonksiyonları (setRitAd, setBilgiCfg, setRitReminder, setRitKisiselNot) id yokken sadece bu ekranda yerel
  // tutuyor, veritabanına hiçbir şey yazmıyor (bkz. o fonksiyonlar ve isRit araç çubuğundaki isDraft/zamanlamaGoster).
  // Kart ancak alttaki "Kaydet" (taslakKaydet) ile gerçekten oluşuyor.
  // "Aktivite" (2026-09-16, Behnan kararı — eski ayrı Yapılacak/Alışkanlık ＋ menü girişleri birleşti):
  // ＋'dan hep 'yapilacak' hâliyle (varsayılan "Bugün", tek seferlik) açılır — kartın içindeki "🔁 Tekrarla"
  // anahtarı (bkz. setRitTekrarla) tur'u sonradan 'aliskanlik'e çevirir. Eski "Kart" (deneysel 4. tip,
  // kart_config.genel) tamamen kaldırıldı (bkz. eski isYeniKart/yeniKartTaslakAc, artık yok).
  // 2026-09-17 (Randevu birleşmesi, Behnan kararı): 'randevu' ayrı bir tür olarak ＋ menüsünden kalktı — bir
  // randevu artık sadece 'yapilacak' bir Aktivite, "Cuma saat 15 diş randevusu" gibi detaylar içeriğe serbest
  // metin olarak yazılıyor.
  function yeniTaslakAc(tur: 'not' | 'aliskanlik' | 'yapilacak') {
    // 2026-09-18 (Behnan isteği, önce Not'ta): açıklamaya hiç dokunmadan hemen Kaydet'e basınca kart "Yeni not"
    // adıyla içeriksiz oluşuyordu — "mantıklı ama sürpriz olmasın" diyerek çözüldü, sonra aynı gün Aktivite'ye de
    // genelleştirildi ("kullanıcılar Not'ta alışıyorsa Aktivite'de de yabancılık çekmeyebilir"). cfg.icerik
    // burada artık HİÇBİR tür için elle doldurulmuyor (null kalıyor) — "Yeni_not"/"Yeni_Aktivite" ön-doldurması
    // aşağıdaki `ad` değerinden, BilgiKartEdit'in `baslikKaynagi` prop'u üzerinden geliyor (bkz. oradaki not) —
    // tek bir gerçek editable metin, ayrı bir "sahte başlık" alanı YOK.
    // Varsayılan ad BİLEREK alt çizgili ("Yeni_not" — boşluksuz), "Yeni not" değil (Behnan isteği, aynı gün):
    // içerik kutusunda bu ilk satır üstüne çift tıklayınca (kelime seçimi) tek kelime olduğu için TAMAMI seçiliyor
    // ve rahatça üstüne yazılabiliyor — boşluklu olsaydı çift tık sadece "Yeni" ya da "not" kelimesini seçerdi,
    // tamamını silmek için ✕ Temizle'ye basmak gerekirdi (o da varsa altına yazılmış açıklamayı da götürürdü).
    const cfg: any = { icerik: null, videolar: [] };
    // Yapılacak (Aktivite'nin "Bugün" hâli): kart_config.gorev — bitissiz (yapıncaya kadar her gün görünür),
    // işaretlenince kalıcı kapanır (bkz. kartYapildiToggle).
    if (tur === 'yapilacak') cfg.gorev = true;
    openRit({
      id: null,
      ad: (tur === 'aliskanlik' || tur === 'yapilacak') ? 'Yeni_Aktivite' : 'Yeni_not',
      kaynak: 'Kendi', tip: 'aliskanlik', kart_tipi: 'bilgi', kart_config: cfg,
      aliskanlik: tur === 'aliskanlik', aktif: true, mezun: false,
      // Not artık tek günlük değil — bir yapışkan not gibi, silininceye kadar her gün duruyor (Ayraç'takiyle
      // aynı mantık: bitis=null, gunler boş → her gün). Kullanıcı isteği: "tarihi yok, silene kadar durur" —
      // teknik olarak baslangic hâlâ var (📅 rozetinden taşınabilir) ama bitiş asla set edilmiyor.
      // Aktivite "Tekrarla" açık geldiğinde (kisiselTur==='aliskanlik') varsayılan olarak Süreli, 21 gün
      // (kullanıcı isteği: "default olarak süreli gelip gün sayısı da yine default 21 gün olsa") — setRitSure'daki
      // "+gun-1" ile birebir aynı hesap; setRitTekrarla de aynı hesabı kullanıyor.
      // Aktivite varsayılan olarak "Bugün" (tek seferlik) geliyor (kullanıcı isteği: "başlangıç tarihi olan
      // süresiz bir task yerine default olarak 1 gün süreli gelmesi daha mantıklı"). Günü geçtiğinde
      // yapılmamışsa ne olacağı (otomatik ertesi güne taşınması vb.) ayrı bir konu — henüz karara bağlanmadı,
      // şimdilik o gün geçince bir daha görünmüyor. Kapanış hâlâ bitis=day'e geçişle oluyor (kartYapildiToggle),
      // o kısım değişmedi.
      baslangic: day, bitis: tur === 'yapilacak' ? day : tur === 'aliskanlik' ? (() => { const e = parseD(day); e.setDate(e.getDate() + 20); return iso(e); })() : null,
      hatirlatma_saat: null, kisisel_not: null, gunler: null, faydalar: [],
    });
  }
  // Havuz'da (dog_activities) + ile Not/Alışkanlık: aynı taslak mekanizması (openDetay + id:null), sadece
  // tur='aktivite'. `aliskanlik` burada gerçek bir dog_activities kolonu DEĞİL — sadece bu ekranda Günler
  // seçiciyi göstermek/gizlemek ve kaydederken sure_gun'u belirlemek için yerel bir bayrak (taslakKaydet'te
  // DB'ye hiç yazılmıyor). Ajanda'ya eklenince (aktiviteEkleSlotlar) sure_gun boşsa kart zaten süregelen —
  // yani "alışkanlık" — oluyor (bkz. ritEkle: aliskanlik = aliskanlikP===null ? !bitis : aliskanlikP).
  function yeniHavuzTaslakAc(tur: 'not' | 'aliskanlik') {
    // Ajanda'daki yeniTaslakAc ile aynı mantık — ön-doldurma artık burada değil, BilgiKartEdit'in
    // `baslikKaynagi` prop'u üzerinden `ad`'dan geliyor (şu an Havuz'a doğrudan ekleme girişi UI'da yok ama
    // fonksiyon ileride kullanılabilir diye tutuluyor, tutarlılık için burada da uygulandı). Ad burada da
    // BİLEREK alt çizgili ("Yeni_alışkanlık"/"Yeni_not") — bkz. yeniTaslakAc'taki aynı not (çift tık ile tek
    // kelime seçimi).
    const cfg: any = { icerik: null, videolar: [] };
    openDetay({
      id: null,
      ad: tur === 'aliskanlik' ? 'Yeni_alışkanlık' : 'Yeni_not',
      grup: actGroup || 'Genel', alt_grup: actAltGroup || null, kart_tipi: 'bilgi', kart_config: cfg,
      aliskanlik: tur === 'aliskanlik', faydalar: [], aciklama: null, videolar: [],
      zaman: 'gün', zamanlar: null, gunler: tur === 'aliskanlik' ? [] : null, sure_gun: null,
    }, 'aktivite');
  }
  async function taslakKaydet() {
    if (!client || !detay || detay.obj.id) return;
    const o = detay.obj;
    // 2026-09-18 (Behnan isteği — "her zaman enable, tıklayınca kontrol et"): eskiden Kaydet butonu boş Not'ta
    // disabled kalıyordu (notBos), artık her zaman tıklanabilir — burada (kisiselTur'ün JSX-scope'undaki
    // notBos'a eşdeğer, ama bu fonksiyon o scope'un DIŞINDA tanımlı olduğu için bağımsız türetilmiş) bir "boş"
    // taslaksa DB'ye hiç yazmadan dönüyor ve notOdakAcik'i tetikleyip BilgiKartEdit'in içerik kutusuna
    // odaklanmasını sağlıyoruz. AYNI GÜN, aynı kontrol Aktivite'ye de genelleştirildi ("Not'ta alışıyorlarsa
    // Aktivite'de de yabancılık çekmeyebilir" — Behnan kararı) — artık kisiselTur farkı gözetmeden, sadece
    // içerik (o.kart_config.icerik) boş mu diye bakıyor; Ritual ve Havuz dallarının ikisi için de geçerli.
    const taslakNotBos = !(o.kart_config?.icerik || '').trim();
    if (taslakNotBos) { setNotOdakAcik(true); return; }
    if (detay.tur === 'ritual') {
      // Kaydetmeden hemen önce son bir kez: gunler seçiliyse ve [baslangic,bitis] penceresi ona hiç denk
      // gelmiyorsa (bkz. pencereyiGunlereUydur), pencereyi (süresini koruyarak) uydur — ara adımlarda kaçan
      // herhangi bir uyumsuzluk burada, kalıcı satır oluşmadan hemen önce kesin olarak düzeltilir.
      const gunlerIlk = o.gunler ?? null;
      const basIlk = o.baslangic || day;
      const bitIlk = o.bitis === undefined ? day : o.bitis;
      const { baslangic: basSon, bitis: bitSon } = pencereyiGunlereUydur(basIlk, bitIlk, gunlerIlk);
      const ins = await supabase.from('dog_rituals').insert({
        client_id: client.id, ad: (o.ad || '').trim() || 'Yeni not', zaman: 'gün', kaynak: 'Kendi', tip: 'aliskanlik',
        kart_tipi: 'bilgi', kart_config: o.kart_config || { icerik: null, videolar: [] },
        aliskanlik: !!o.aliskanlik, aktif: true, mezun: false,
        // bitis: yeniTaslakAc taslağı zaten doğru değerle kuruyor (not/yapılacak: null — silinene kadar
        // kalıcı; alışkanlık: gün+20 — 21 günlük varsayılan süre; randevu/kart: gün). Burada onu tekrar
        // türetmeye çalışmak (eski `o.aliskanlik ? null : (o.bitis ?? day)`) hataliydı: `??` null'ı da
        // "eksik" sayıp gün'e çeviriyordu, bu yüzden not/yapılacak sadece oluşturulduğu gün görünüyordu ve
        // alışkanlığın 21 günlük varsayılanı sessizce siliniyordu. undefined dışında taslaktaki değeri aynen koru.
        baslangic: basSon, bitis: bitSon, gunler: gunlerIlk,
        hatirlatma_saat: o.hatirlatma_saat || null, kisisel_not: o.kisisel_not || null,
        blok_sira: Date.now(),
      }).select().single();
      if (ins.error) { alert('Kaydedilemedi: ' + ins.error.message); return; }
      loadData(client.id);
      closeDetay(); // her şeyi zaten bu ekranda yazdın — tekrar aynı ekranı açmaya gerek yok
      return;
    }
    // Havuz taslağı — dog_activities'e yazılır; bu tabloda baslangic/bitis/hatirlatma_saat hiç yok.
    const isAliskanlik = !!o.aliskanlik;
    const grup = (o.grup || 'Genel').trim() || 'Genel';
    const altGrup = (o.alt_grup || '').trim() || null;
    const ins = await supabase.from('dog_activities').insert({
      client_id: client.id, tur: 'aktivite', ad: (o.ad || '').trim() || (isAliskanlik ? 'Yeni alışkanlık' : 'Yeni not'),
      grup, alt_grup: altGrup, faydalar: [], aciklama: null, videolar: [],
      zaman: 'gün', zamanlar: null, gunler: isAliskanlik ? (o.gunler || null) : null,
      sure_gun: isAliskanlik ? null : 1,
      kart_tipi: 'bilgi', kart_config: o.kart_config || { icerik: null, videolar: [] },
      kaynak_etiket: 'Kendi', aktif: true,
    }).select().single();
    if (ins.error) { alert('Kaydedilemedi: ' + ins.error.message); return; }
    loadActivities();
    setActGroup(grup);
    setActAltGroup(altGrup);
    setAcikGruplar((s) => new Set(s).add(grup));
    if (altGrup) setAcikAltGruplar((s) => new Set(s).add(grup + '␟' + altGrup));
    closeDetay();
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
    // rt: taslak/düzenleme modundayken (duzenleModu) DB'ye henüz hiçbir şey yazılmadığı için, id dolu olsa bile
    // (kayıtlı bir kartı düzenlerken id her zaman dolu) 'rituals' dizisi bu oturumdaki yerel değişiklikleri
    // YANSITMAZ — donmuş, düzenleme oturumu başlamadan önceki hâlde kalır. O yüzden id'nin dolu/boş olmasına değil,
    // aşağıdaki DB-yazma dalıyla (if (!id || duzenleModu)) BİREBİR aynı koşula göre seçim yapıyoruz; aksi hâlde
    // örn. setRitSure/setRitGunler art arda çağrıldığında ikincisi birincinin henüz DB'ye yazılmamış sonucunu
    // görmeyip eski (bazen alakasız) veriye göre "uyumlu" sanabiliyordu — bkz. setRitSure/setRitGunler'daki not.
    const rt = (!id || duzenleModu) ? detay?.obj : rituals.find((r) => r.id === id);
    const oldBas = (rt && rt.baslangic) || today;
    const oldBit = rt && rt.bitis;
    let yeniBit: string | null = null;
    // Yapılacak/Randevu: gecikip süresiz (bitis:null) kalmış olsa bile elle taşınınca yine tek günlük olmalı —
    // yoksa hem "N gün gecikti" durumu bir anlam taşımaz olurdu hem de yeni tarih bugünden ileriyse activeOn'daki
    // "süresiz hâl sadece bugüne kadar" sınırı yüzünden kart hiç görünmez kalıyordu (kullanıcı bulgusu: "gecikmiş
    // bir randevunun tarihini ileri alırsam randevu kayboluyor"). Alışkanlık/Kart'ın süregelen hâli bundan
    // etkilenmiyor, sadece bu ikisi için delta korumanın yerini doğrudan tek günlük hedefe geçiş alıyor.
    const tekGunlukKart = !!(rt && !rt.aliskanlik && (rt.kart_config?.gorev || rt.kart_config?.randevu));
    if (tekGunlukKart) {
      yeniBit = hedefBas;
    } else if (oldBit) {
      const delta = Math.round((parseD(oldBit).getTime() - parseD(oldBas).getTime()) / 86400000);
      const e = parseD(hedefBas); e.setDate(e.getDate() + delta);
      yeniBit = iso(e);
    }
    // Tarihi elle değiştirmek her zaman kullanıcının bilinçli seçimi — mantığın kendi kaydırdığı bir öncekinden
    // farklı olduğu için basVurgu (varsa) burada söndürülüyor.
    setBasVurgu(false);
    if (!id || duzenleModu) { patchDetay({ baslangic: hedefBas, bitis: yeniBit }); return; } // taslak / düzenleme modu
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
  // Son-anda güvenlik ağı: setRitSure/setRitGunler'daki uyumluluk-kaydırma mantığıyla aynı hesabı, ama kartın
  // GERÇEKTEN kalıcı hâle geldiği anda (taslakKaydet / kisiselDuzenleKaydet) bir kez daha, bağımsız olarak
  // uyguluyor. Amaç: ara adımlardaki (tek tek Süre/Günler değişiklikleri) herhangi bir sıralama/zamanlama
  // sorunu bu son kontrolü atlatsa bile ("bir 3 günlük alışkanlığı bugün(Perşembe) yarattım, Pzt-Çar işaretledim,
  // hiç uyarı vermeden ulaşılamaz biçimde kaydetti" — Behnan'ın bulduğu bug), veritabanına ASLA haftanın
  // seçili günleriyle hiç kesişmeyen bir [baslangic,bitis] penceresi yazılamasın. Günler kısıtlaması yoksa ya da
  // bitiş yoksa (süregelen kart) dokunmadan aynen döner.
  function pencereyiGunlereUydur(baslangic: string, bitis: string | null, gunler: number[] | null): { baslangic: string; bitis: string | null } {
    if (!gunler || gunler.length === 0 || !bitis) return { baslangic, bitis };
    let uyumlu = false; const d = parseD(baslangic);
    while (iso(d) <= bitis) { if (gunler.includes(wday(iso(d)))) { uyumlu = true; break; } d.setDate(d.getDate() + 1); }
    if (uyumlu) return { baslangic, bitis };
    const uzunlukGun = Math.round((parseD(bitis).getTime() - parseD(baslangic).getTime()) / 86400000) + 1;
    const yeniBas = ilkUygunGun(baslangic >= today ? baslangic : today, gunler);
    const e = parseD(yeniBas); e.setDate(e.getDate() + uzunlukGun - 1);
    return { baslangic: yeniBas, bitis: iso(e) };
  }
  async function setRitSure(id: string, gun: number | null) {
    if (!client) return;
    // rt: bkz. ritTasi'deki not — duzenleModu'dayken 'rituals' değil, o oturumun yerel arabelleği (detay?.obj)
    // okunmalı; asıl bulunan bug tam olarak buydu (id dolu ama rituals hâlâ eski/uyumsuz gunler taşıyordu).
    const rt = (!id || duzenleModu) ? detay?.obj : rituals.find((r) => r.id === id);
    let patch: any;
    if (!gun) patch = { bitis: null };
    else {
      // "Tarih + süreli" tasarımı (2026-09-17, Behnan kararı — "Tarih + süreli fikrimi de uygulayalım"):
      // başlangıç artık Süre şeridindeki kendi 📅 alanından ayrıca, açıkça yönetiliyor (bkz. aşağıdaki JSX) —
      // Süre/gün sayısı SADECE bitişi hesaplayıp yazıyor, başlangıcı bir daha KAYDIRMIYOR (eskiden ilkUygunGun
      // ile örtük olarak kaydırıyordu, bu da kullanıcının kendi seçtiği tarihi onaylamadan değiştirebiliyordu).
      // Günlerle uyumluluk artık sadece iki yerde ele alınıyor: Günler bizzat değiştiğinde (setRitGunler, orada
      // da bir vurgu/flash ile görünür kılınıyor) ve kayıt anındaki son güvenlik ağında (pencereyiGunlereUydur).
      const bas = rt?.baslangic || today;
      const e = parseD(bas); e.setDate(e.getDate() + gun - 1); patch = { bitis: iso(e) };
    }
    if (!id || duzenleModu) { patchDetay(patch); return; } // taslak / düzenleme modu
    await supabase.from('dog_rituals').update(patch).eq('id', id);
    patchDetay(patch);
    loadData(client.id);
  }
  async function setRitGunler(id: string, g: number[]) {
    if (!client) return;
    const arr = g.length === 0 || g.length === 7 ? null : g;
    // 2026-09-17 (Behnan'ın bulduğu ikinci bug — "Pazartesiyi seçtiğimde hemen hesaplama yapıp tarihi
    // kaydırıyor, diğer günleri seçsem de artık oradan başlıyor"): burası eskiden HER tek tık'ta (ör. önce
    // sadece Pzt işaretlenince) uyumluluk kontrolü yapıp pencereyi hemen kaydırıyordu — ama kullanıcı genelde
    // birden fazla günü ARDIŞIK tıklayarak seçiyor (ör. Pzt, Çrş, Cuma), ve ilk tıktaki kısmi/eksik seçime göre
    // yapılan erken kaydırma, sonraki tıklardaki asıl tam seçimle alakasız kalıyordu (kartı istemeden 5 gün
    // ileri fırlatıyordu). Düzeltme: artık burası SADECE gunler'i yazıyor, baslangic/bitis'e hiç dokunmuyor —
    // uyumluluk denetimi kullanıcı seçimini bitirdiğinde (aşağıdaki gunlerTamamla, "✓ Tamam" çipi) VE her
    // hâlükârda kayıt anında (pencereyiGunlereUydur güvenlik ağı, taslakKaydet/kisiselDuzenleKaydet) çalışıyor.
    const patch: any = { gunler: arr };
    if (!id || duzenleModu) { patchDetay(patch); return; } // taslak / düzenleme modu
    await supabase.from('dog_rituals').update(patch).eq('id', id);
    patchDetay(patch);
    loadData(client.id);
  }
  // Günler seçimini "bitirdim" anı — kullanıcı birden fazla gün işaretledikten sonra bilinçli olarak tetikler
  // (✓ Tamam çipi), tek seferde (ara adımlardaki kısmi seçimlere göre değil, seçimin TAMAMINA göre) uyumluluk
  // kontrolü yapıp gerekirse pencereyi kaydırır — aynı hesap pencereyiGunlereUydur ile paylaşılıyor. Basılmazsa
  // bile kayıt anındaki güvenlik ağı zaten aynı düzeltmeyi yapacak; bu sadece erken/görünür geri bildirim.
  function gunlerTamamla(id: string) {
    // "✓ Tamam" sadece uyumluluk kontrolünü tetikliyor — Behnan'ın isteğiyle Günler paneli KAPANMIYOR artık,
    // seçimi görmeye/değiştirmeye devam edebiliyor (eskiden setGunlerAcik(false) da çağrılıyordu, kaldırıldı).
    const rt = (!id || duzenleModu) ? detay?.obj : rituals.find((r) => r.id === id);
    if (!rt || !rt.baslangic) return;
    const { baslangic: basSon, bitis: bitSon } = pencereyiGunlereUydur(rt.baslangic, rt.bitis ?? null, rt.gunler || null);
    if (basSon !== rt.baslangic || bitSon !== rt.bitis) {
      patchDetay({ baslangic: basSon, bitis: bitSon });
      setBasVurgu(true);
    }
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
  // "🔁 Tekrarla" anahtarı (2026-09-16, Behnan kararı — eski ayrı Yapılacak/Alışkanlık girişleri "Aktivite" adı
  // altında birleşti): Aktivite'nin tek-seferlik ("Bugün", kisiselTur='yapilacak') mi yoksa tekrarlanan
  // ("Tekrarla", kisiselTur='aliskanlik') mi olduğunu kartın kendi içinden değiştirir — notuTasi'yle (Not'u
  // türe çevirme) aynı alan setini yazıyor (aliskanlik + kart_config.gorev + bitis), ama SADECE bu ikisi
  // arasında geçiş yapıyor (randevu/not'a dokunmuyor) ve taslak-güvenli: id yokken ya da düzenleme modunda
  // diğer setter'larla aynı desenle yereldeki patchDetay'e düşüyor. Tekrarla AÇILINCA yeniTaslakAc'le aynı
  // 21 günlük varsayılan pencere kuruluyor (kart_config.gorev=false); KAPANINCA kart tek güne (baslangic)
  // iniyor (kart_config.gorev=true) — gunler kasıtlı olarak dokunulmuyor, kullanıcının önceki gün seçimi
  // Tekrarla'yı tekrar açınca geri geliyor.
  async function setRitTekrarla(id: string | null, val: boolean) {
    if (!client) return;
    // rt: bkz. ritTasi/setRitSure/setRitGunler'daki not — aynı sebepten duzenleModu'dayken yerel arabellek okunuyor.
    const rt = (!id || duzenleModu) ? detay?.obj : rituals.find((r) => r.id === id);
    const cfg = { ...(rt?.kart_config || {}) };
    const bas = rt?.baslangic || day;
    const patch: any = {
      aliskanlik: val,
      kart_config: { ...cfg, gorev: !val },
      bitis: val ? (() => { const e = parseD(bas); e.setDate(e.getDate() + 20); return iso(e); })() : bas,
    };
    // Süre input'unun kendi state'i (sureInput) SADECE kart açılırken (openDetay) senkronlanıyordu — Tekrarla
    // burada bitis'i (dolayısıyla gerçek süreyi) 1 günden 21 güne değiştirdiği hâlde sureInput'a hiç dokunmuyordu.
    // Sonuç (Behnan'ın bulduğu bug): Süre kutusu hâlâ eski "1"i gösteriyordu, kullanıcı ona dokunmadan Kaydet'e
    // basınca DB'ye gerçek (21 günlük) bitis yazılıyordu — görünen değerle kaydedilen değer UYUŞMUYORDU. Kutuya
    // yeni bir sayı yazılınca (ör. "2") sorun görünmüyordu çünkü o zaman onBlur zaten gerçek değeri güncelliyordu.
    // Burada da aynı hesabı (21/1 gün) sureInput'a yansıtarak kutunun her zaman gerçek süreyi göstermesi sağlandı.
    setSureInput(val ? '21' : '1');
    if (!id || duzenleModu) { patchDetay(patch); return; } // taslak / düzenleme modu
    await supabase.from('dog_rituals').update(patch).eq('id', id);
    patchDetay(patch);
    loadData(client.id);
  }
  async function setRitReminder(id: string, saat: string) {
    if (!client) return;
    if (!id || duzenleModu) { patchDetay({ hatirlatma_saat: saat || null, son_bildirim: null }); return; } // taslak / düzenleme modu
    // Saati değiştirince "bugün gönderildi" işaretini sıfırla → yeni saat aynı gün de tetiklenir
    await supabase.from('dog_rituals').update({ hatirlatma_saat: saat || null, son_bildirim: null }).eq('id', id);
    patchDetay({ hatirlatma_saat: saat || null, son_bildirim: null });
    loadData(client.id);
  }
  // Tek seferlik bildirim (Randevu, Yapılacak, ve Meridyen kaynaklı randevu tipi kartların kendi 🔔 menüsü):
  // kartın kendi tarihi/saatinden bağımsız olarak bildirim ayrı bir tarih+saatte gelebilir (ör. randevudan bir
  // gün önce, ya da Yapılacak'ı yapmanız gereken günün sabahı). Tarih kart_config.hatirlatma_tarih'te tutulur
  // (cron bunu, varsa, günlük tekrarlayan baslangic/bitis penceresi yerine kullanıp SADECE o gün gönderir —
  // bkz. app/api/cron/reminders/route.ts). Alışkanlık/Not bunu hiç kullanmıyor, onlarda bildirim günlük
  // tekrarlayan (sadece saat, setRitReminder).
  async function setRandevuBildirim(id: string, saat: string, tarih: string) {
    if (!client) return;
    const cfg = { ...(detay?.obj?.kart_config || {}), hatirlatma_tarih: tarih || null };
    const patch: any = { hatirlatma_saat: saat || null, son_bildirim: null, kart_config: cfg };
    // Randevu/Yapılacak artık düzenleme modunda her zaman kilitli (kilitliForm) — diğer setter'lar gibi burada
    // da duzenleModu'da sadece yerelde tutulmalı, yoksa Vazgeç bu değişikliği geri alamaz (kullanıcı isteği:
    // "randevuyu da Vazgeç,Kaydet mantığına getirelim" sonrası fark edilen bir tutarsızlık).
    if (!id || duzenleModu) { patchDetay(patch); return; } // taslak / düzenleme modu
    await supabase.from('dog_rituals').update(patch).eq('id', id);
    patchDetay(patch);
    loadData(client.id);
  }
  async function ritSil(id: string) {
    if (!client) return;
    const rt = rituals.find((r) => r.id === id);
    // "Geçmişi var mı" sorusunu rt.baslangic'e (mantıksal görünürlük tarihi) değil rt.blok_sira'ya (oluşturulma
    // anının Date.now() damgası — bkz. ritEkle/taslakKaydet/ayracEkle) bakarak cevaplıyoruz. baslangic, geçmiş
    // bir güne gidip oradan yeni bir kart eklendiğinde de geçmişte olabiliyor (kart o an oluşturulmuş olsa
    // bile) — o yüzden baslangic<today tek başına "gerçekten önceki günlerden beri var, korunacak bir geçmişi
    // var" anlamına gelmiyordu. Bu yüzden dün için yeni eklenip hemen silinen bir Yapılacak/Randevu bile "yarından
    // itibaren kaldır" (yumuşak silme) dalına düşüyor, bitis=bugün oluyor ve kart dün+bugün ikisinde de görünmeye
    // devam ediyordu (kullanıcı isteği: "düne yapılacak tanımlayıp silersem dün ve bugünde gözükmeye başlıyor").
    // Gerçekten yapıldı kaydı olan (logs) her zaman korunuyor; blok_sira yoksa (çok eski kayıt) eski davranışa düşülüyor.
    const hasHistory = logs.some((l) => l.ritual_id === id && l.yapildi) || !!(rt && rt.blok_sira != null ? rt.blok_sira < parseD(today).getTime() : (rt && rt.baslangic && rt.baslangic < today));
    if (hasHistory) {
      if (!confirm('Yarından itibaren kaldırılsın mı? Geçmiş kayıtların korunur.')) return;
      await supabase.from('dog_rituals').update({ bitis: today }).eq('id', id);
    } else {
      if (!confirm('Bu ritüel silinsin mi?')) return;
      await supabase.from('dog_rituals').delete().eq('id', id);
    }
    loadData(client.id);
  }
  // Not → Ajandaya koy (kullanıcı isteği, 2026-09-17, Randevu birleşmesi): Not artık günlere bağlı değil (bkz.
  // habits'in isNotKart hariç tutması ve aşağıdaki Notlar şeridi), o yüzden onu ajandaya "taşımak" sürükleyip
  // bırakmak yerine ⋯ menüsündeki tek "Ajandaya koy" ile — hedef gün her zaman o an Ajanda'da görüntülenen gün
  // (day). Süre/bitiş mantığı yeniTaslakAc ile birebir aynı (Yapılacak tek günlük, Alışkanlık 20 gün varsayılan)
  // ki farklı bir yerden oluşturulmuş gibi davransın. Eskiden ayrı bir 'randevu' türü de vardı, artık yok —
  // randevu detayı ("Cuma saat 15…") içeriğe serbest metin olarak yazılıyor.
  async function notuTasi(id: string, tur: 'yapilacak' | 'aliskanlik') {
    if (!client) return;
    const rt = rituals.find((r) => r.id === id);
    const cfg = { ...(rt?.kart_config || {}) };
    const patch: any = {
      baslangic: day,
      bitis: tur === 'yapilacak' ? day : (() => { const e = parseD(day); e.setDate(e.getDate() + 20); return iso(e); })(),
      gunler: null,
      aliskanlik: tur === 'aliskanlik',
      kart_config: { ...cfg, gorev: tur === 'yapilacak' },
    };
    await supabase.from('dog_rituals').update(patch).eq('id', id);
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
  // Puanla (YENİ, 2026-09-16): bir alışkanlığa ne zaman istersen (bitirirken, süre dolunca, ya da devam ederken)
  // 1-5 yıldız verebilmen için — mezun etmekten VE Havuz'a kaydetmekten tamamen bağımsız, doğrudan ritüelin
  // kendi `puan` kolonuna yazılıyor (dog_rituals.puan — bu migration'la eklendi). Havuz'a daha sonra kaydedersen
  // (ritHavuzaAl) puan oraya da otomatik taşınıyor.
  async function ritPuanla(id: string, puan: number) {
    if (!client) return;
    await supabase.from('dog_rituals').update({ puan: puan || null }).eq('id', id);
    setPuanModal(null);
    loadData(client.id);
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
  // Gelişim ekranındaki ＋ (hızlı Ölçüm ekle): olcumKaydet ile aynı gün-bazlı upsert, ama bağlı bir ritüel/kart
  // yok — "yaptım" işaretlenecek bir kart olmadığı için toggleRit çağrısı yok, sadece dog_measurements'a yazıp
  // Gelişim grafiğini tazeliyor.
  async function olcumEkleGenel(anahtar: string, deger: number, birim: string | null) {
    if (!client) return;
    await supabase.from('dog_measurements').delete().eq('client_id', client.id).eq('anahtar', anahtar).eq('tarih', today);
    await supabase.from('dog_measurements').insert({ client_id: client.id, anahtar, deger, birim, tarih: today });
    const m = await supabase.from('dog_measurements').select('tarih,anahtar,deger,birim').eq('client_id', client.id).order('tarih', { ascending: true }).limit(80);
    setMeas(m.data || []);
  }
  // Home ekranı (v1) öz-değerlendirmesi: olcumEkleGenel ile aynı gün-bazlı upsert deseni, ama anahtar sabit bir
  // ön ekle ('home_'+alan) ayrışıyor ki Gelişim'deki diğer ölçümlerle (kilo, ruh_hali...) karışmasın. Geçmiş
  // tarihli değerlendirme UI'dan kaldırıldı (kullanıcı isteği: "geçmiş geçmiştir, son yaptığı değerlendirme
  // üzerinden gitmeliyiz") — ama tarih parametresi ileride başka bir nedenle gerekebilir diye altyapıda
  // opsiyonel olarak bırakıldı, verilmezse bugünü kullanıyor.
  async function homeDegerlendir(alan: string, deger: number, tarih?: string) {
    if (!client) return;
    const anahtar = 'home_' + alan;
    const gun = tarih || today;
    await supabase.from('dog_measurements').delete().eq('client_id', client.id).eq('anahtar', anahtar).eq('tarih', gun);
    await supabase.from('dog_measurements').insert({ client_id: client.id, anahtar, deger, tarih: gun });
    const m = await supabase.from('dog_measurements').select('tarih,anahtar,deger,birim').eq('client_id', client.id).order('tarih', { ascending: true }).limit(80);
    setMeas(m.data || []);
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
      // Kişisel bilgi kartları (Not/Randevu/Alışkanlık) her zaman kaynak='Kendi' ile eklenmeli — yoksa detay
      // ekranı bunları düzenlenebilir BilgiKartEdit yerine eski/salt-okunur BilgiKart ile gösterir (kullanıcının
      // bulduğu hata). Süregelen olmayanlar (Not/Randevu) için gönderenin tarihi de korunuyor — paylaş()'ta
      // eklendiyse baslangic/bitis burada gün ofsetine/süreye çevriliyor; yoksa (rutin/alışkanlık paylaşımında
      // olduğu gibi) alıcı için "bugün başlasın" davranışı aynen kalıyor.
      const kisiselBilgi = p.kartTipi === 'bilgi';
      const basGun = p.baslangic ? Math.round((parseD(p.baslangic).getTime() - parseD(today).getTime()) / 86400000) : 0;
      const sureG = (p.baslangic && p.bitis) ? Math.round((parseD(p.bitis).getTime() - parseD(p.baslangic).getTime()) / 86400000) + 1 : (p.sure_gun || null);
      for (const s of slots) await ritEkle(p.ad || item.baslik, s, kisiselBilgi ? 'Kendi' : 'Paylaşılan', 'aliskanlik', alan0, null, p.faydalar || [], (p.videolar && p.videolar[0]?.url) || null, p.gunler || null, sureG, null, null, false, basGun, null, 0, p.kartTipi || null, p.kartConfig || null, typeof p.aliskanlik === 'boolean' ? p.aliskanlik : null);
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
  // Süresiz (bitis yok) bir kart normalde her gün — geçmiş/bugün/gelecek — geçerli sayılır (Not, süregelen
  // Alışkanlık). Ama gecikmiş bir Yapılacak/Randevu (kart_config.gorev ya da kart_config.randevu, alışkanlık
  // değil) süresiz hâle geldiğinde bunu aynen uygularsak, ajandada bugünden sonraki her güne de "süresiz" olarak
  // sızıyor — henüz gelmemiş günlerin listesini dolduruyor (kullanıcı isteği: "gecikmeye düşünce ileri doğru
  // süresiz ajandada yer alıyor"). Bu yüzden bu iki tipte süresiz hâl sadece bugüne kadar (today) geçerli
  // sayılıyor, ötesine sızmıyor — yarın olunca zaten "bugün" ilerleyip kart yine görünür olacak, ayrıca bir
  // işlem gerekmiyor.
  const activeOn = (r: any, d: string) => {
    if (!r.baslangic || r.baslangic > d) return false;
    if (r.gunler && r.gunler.length > 0 && !r.gunler.includes(wday(d))) return false;
    if (r.bitis) return d <= r.bitis;
    // ritTasi artık bu iki tipte elle taşırken bitis'i hep dolduruyor (yukarısı), o yüzden normalde bitis=null
    // VE baslangic gelecekte olan bir gorev/randevu oluşmaz — ama olursa (ör. veri elle değiştirilmişse) yine de
    // "henüz gelmemiş bir taşıma" olarak ele alıp normal süresiz gibi davranıyoruz, "bugüne kadar" sınırını
    // sadece baslangic zaten geçmiş/bugünse uyguluyoruz.
    if ((r.kart_config?.gorev || r.kart_config?.randevu) && !r.aliskanlik && r.baslangic <= today) return d <= today;
    return true;
  };
  // Not artık habits'e (günün listesine) hiç girmiyor (kullanıcı isteği: "notun işlevi o değil" — her gün
  // görünmesi bitis=null altyapısını Alışkanlık'la paylaşmanın yan etkisiydi). Not'un kendi, günlerden bağımsız
  // gösterimi aşağıdaki `notlar` listesi ve Ajanda'nın altındaki "Notlar" şeridi (bkz. rowbody JSX'i).
  const habits = rituals.filter((r) => !r.mezun && !isNotKart(r) && activeOn(r, day));
  // Notlar: güne bağlı değil, mezun olmamış tüm kişisel Not'lar — Ajanda'nın altında, hangi gün seçili olursa
  // olsun hep aynı şekilde görünen ayrı bir şerit (kullanıcı isteği). Notlar SortableRow/DndContext'e hiç
  // girmediği için elle sürükle-sıralama yok (Behnan: "sıralayamıyoruz, gerek de yok gibi, bir an önce karar
  // verip tasnif etsin") — bunun yerine otomatik olarak en yeni not en üstte (blok_sira, Aktivite listesindeki
  // blokSira ile aynı "oluşturulma anı" alanı — taslakKaydet'te Date.now() olarak yazılıyor), aksi hâlde DB
  // sorgusu sadece 'zaman'a göre sıralandığı için (tüm Not'larda zaman='gün' sabit) sıra keyfi kalıyordu.
  const notlar = rituals.filter((r) => !r.mezun && isNotKart(r)).sort((a, b) => (Number(b.blok_sira) || 0) - (Number(a.blok_sira) || 0));
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
  // Home ekranındaki bir alanın en son (herhangi bir tarihteki) öz-değerlendirmesi — günlük bir alan değil,
  // kişi değiştirene kadar geçerli bir "durum" (bkz. homeDegerlendir'in üstündeki not).
  const homeGuncelDeger = (alan: string): number | null => {
    const arr = measByKey['home_' + alan];
    return arr && arr.length ? Number(arr[arr.length - 1].deger) : null;
  };
  // Home'da gösterilecek "Son ölçümler": ruh_hali (ayrı yeri var) ve home_* (alan öz-değerlendirme seviyeleri,
  // zaten alan kartlarının kendisi) hariç her ölçüm anahtarının en son değeri — alan/dikey gruplaması YOK
  // (Behnan kararı: "son ölçümleri orada alırız", eski fayda-kaynaklı alan sözlüğünü Meridyen'in 13 alanına
  // eşlemeye gerek kalmadan). Gelişim'deki eski "Ölçümler" kartının yerini alıyor.
  const sonOlcumler = Object.keys(measByKey).filter((k) => k !== 'ruh_hali' && !k.startsWith('home_')).map((k) => {
    const arr = measByKey[k]; const l = arr[arr.length - 1];
    const etiket = OLCU_ETIKET[k] || (k.startsWith('ozel_') ? k.slice(5).replace(/_/g, ' ') : k);
    return { k, etiket, deger: l.deger, birim: l.birim || '' };
  }).sort((a, b) => a.etiket.localeCompare(b.etiket, 'tr'));
  const days7 = lastDays(7);
  const last30 = lastDays(30);
  const weekArr = weekDays(day);
  const ibBadge = inbox.filter((x) => x.durum === 'yeni').length;
  const personalActs = activities.filter((a) => a.client_id === client.id);
  const personalGroupOf = (a: any) => a.grup && a.grup !== 'Kişisel' ? a.grup : 'Genel';
  // Havuz gruplama: Genel her zaman seçenek olarak durur (boş bile olsa), üstüne kullanıcının kendi eklediği
  // gruplar eklenir — sabit tek sekme yerine büyüyebilen bir chip listesi.
  // (2026-09-16, Behnan kararı: kilitli "Meridyen" kökü — Home'un alan atamalarının depolandığı yer — artık
  // Kütüphanede HİÇ gösterilmiyor; atanmış alanlara ve onların programlarına erişim tamamen Home üzerinden.
  // Kütüphanede ayrıca göstermek, aynı veriye ikinci ve eski/tutarsız bir erişim yolu açmaktan başka işe
  // yaramıyordu. Alttaki dog_gruplar satırı ve ensureMeridyenGrubu hâlâ var — sadece UI'dan gizlendi.)
  const HAVUZ_VARSAYILAN_GRUPLAR = ['Genel'];
  // Kalıcı Grup listesi (bkz. dog_gruplar / Gruplar yönet ekranı) — ust_id boş olanlar üst seviye Grup;
  // kilitli "Meridyen" kökü (sabit:true) burada BİLEREK dışarıda — yukarıdaki not.
  const grupUst = grupListesi.filter((g) => !g.ust_id && !g.sabit);
  // ekstraGruplar: "+ yeni grup" ile önceden açılmış ama henüz hiç aktivitesi olmayan gruplar (bu oturumda) —
  // bir aktivite o gruba girince zaten personalActs üzerinden kalıcı olarak da gelir.
  const personalGroups = Array.from(new Set([...HAVUZ_VARSAYILAN_GRUPLAR, ...grupUst.map((g) => g.ad), ...personalActs.map(personalGroupOf), ...ekstraGruplar]));
  // Seçili Grup'un Alt grupları: dog_gruplar'daki kalıcı liste ∪ o gruptaki aktivitelerin fiilen kullandığı
  // alt_grup değerleri (Gruplar yönet'ten silinmiş/hiç eklenmemiş olsa bile mevcut etiket kaybolmasın diye).
  function altGruplarOf(grupAdi: string): string[] {
    const ust = grupUst.find((g) => g.ad === grupAdi);
    const kalici = ust ? grupListesi.filter((g) => g.ust_id === ust.id).sort((a, b) => a.sira - b.sira).map((g) => g.ad) : [];
    const kullanilan = personalActs.filter((a) => personalGroupOf(a) === grupAdi && a.alt_grup).map((a) => a.alt_grup);
    return Array.from(new Set([...kalici, ...kullanilan]));
  }

  function RitItem({ rt }: { rt: any }) {
    const done = ritDone(rt.id);
    const total = ritTotal(rt.id);
    const tip = rt.kart_tipi || 'standart';
    const cfg = rt.kart_config || {};
    const noDone = tip === 'anket' || tip === 'coktan' || tip === 'nefes' || tip === 'ruhhali' || tip === 'tarif' || tip === 'sukran' || tip === 'topraklama' || tip === 'pomodoro' || tip === 'beden' || tip === 'uykuoncesi' || tip === 'su' || tip === 'maruz' || tip === 'niyet' || tip === 'workout' || (tip === 'video' && cfg.done === false) || (tip === 'randevu' && cfg.done === false);
    const vurl = tip === 'video' ? (cfg.url || rt.url) : rt.url;
    // Kişisel bilgi kartları (Not/Randevu/Alışkanlık/Yapılacak) hepsi aynı kart_tipi='bilgi' altında — görsel
    // olarak birbirinden ayrışsınlar diye burada alt tipe göre farklı ipucu gösteriliyor (kullanıcı isteği).
    const bilgiIkon = tip === 'bilgi' ? (cfg.randevu ? '📅' : rt.aliskanlik ? '🎓' : cfg.gorev ? '☑️' : '📄') : null;
    const bilgiAltTip = bilgiIkon ? bilgiIkon + (cfg.randevu ? ' randevu' : rt.aliskanlik ? ' alışkanlık' : cfg.gorev ? ' yapılacak' : ' not') : null;
    const ipucu = tip === 'anket' ? '📋 doldur' : tip === 'coktan' ? '❓ yanıtla' : tip === 'diyet' ? '🍽 öğün' : tip === 'tarif' ? '🍳 tarif' : tip === 'video' ? '🎬 izle' : tip === 'nefes' ? '🫁 nefes' : tip === 'ruhhali' ? '🙂 check-in' : tip === 'workout' ? '🏋️ egzersiz' : bilgiAltTip ? bilgiAltTip : tip === 'sukran' ? '🙏 şükran' : tip === 'topraklama' ? '🖐 topraklan' : tip === 'pomodoro' ? '🍅 odaklan' : tip === 'beden' ? '🧘 taransın' : tip === 'uykuoncesi' ? '🌙 hazırlan' : tip === 'su' ? '💧 iç' : tip === 'maruz' ? '🎯 uygula' : tip === 'niyet' ? '🧭 niyet belirle' : tip === 'randevu' ? '📅 randevu' : '';
    // Yapılacak VE Randevu: günü geçmiş (baslangic bugünden önce) ve hâlâ işaretlenmemişse kaç gündür beklediğini
    // göster (kullanıcı isteği: "geciktiğine dair küçük bir belirteç", "randevu gecikmesini de aynı şekilde
    // göstermek mantıklı olabilir"). loadData'daki otomatik taşıma artık sadece bitis'i null'a çekiyor,
    // baslangic'e hiç dokunmuyor — bu yüzden ilk vade/randevu tarihi burada hâlâ duruyor ve gecikme gün sayısını
    // ondan hesaplayabiliyoruz. Tarih seçiciyle (ritTasi) taşınınca baslangic ileri gittiği için bu da kendiliğinden düzeliyor.
    const gecikti = ((cfg.gorev || cfg.randevu) && !rt.aliskanlik && !done && rt.baslangic && rt.baslangic < today) ? Math.round((parseD(today).getTime() - parseD(rt.baslangic).getTime()) / 86400000) : 0;
    const meridyen = rt.kaynak === 'Meridyen'; // sağlayıcı-kaynaklı kart — kişisel kartlardan çerçeveyle ayrıştır
    const stilP = cfg.stil ? STIL_LOOKUP[cfg.stil] : null;
    // Not (yapışkan not): asıl sarı/dikdörtgen kutu artık dıştaki .card'da (bkz. çağrı yeri) — burada .rit'in
    // kendi arka planına dokunmuyoruz. Bir yapışkan not gerçek hayatta nasıl kullanılırsa öyle: ikon/etiket
    // yok (şekil+renk zaten "not" olduğunu anlatıyor), "bitiş" yazısı yok, bildirim varsa sağ altta küçük bir
    // rozet, kaldırma zaten var (aşağıdaki ⋯ menüsünden) — yapıp kaldırmak (kullanıcı isteği) buradan oluyor.
    const notRow = isNotKart(rt);
    return (
      <div>
        <div className={'rit' + (meridyen && !stilP ? ' rit-mer' : '')} style={{ ...(stilP ? { borderLeft: '3px solid ' + stilP.ac, paddingLeft: 9 } : undefined), ...(notRow ? { position: 'relative', paddingBottom: rt.hatirlatma_saat ? 20 : undefined } : undefined) }}>
          {/* gorev (Yapılacak) satırda da kalıcı kapanış (kartYapildiToggle) ile işaretleniyor — Kart'ın
              Yapılacak hâliyle aynı davranış, artık listeden de (detaya girmeden) tamamlanabiliyor. */}
          {/* "yapılmadı" durumunda kutunun içi boş kalmalı — bilgiIkon (☑️ dahil) burada göstermek yanıltıcıydı,
              özellikle Yapılacak'ta ☑️ zaten işaretlenmiş gibi görünüyordu (kullanıcı isteği). noDone tipleri
              (checkbox değil, "Aç" düğmesi) kendi ikonunu göstermeye devam ediyor — o ayrı bir durum. */}
          {!notRow && <div className={'chk' + (done ? ' on' : '')} onClick={() => (noDone ? openRit(rt) : (cfg.gorev && !rt.aliskanlik ? kartYapildiToggle(rt) : toggleRit(rt.id)))} title={noDone ? 'Aç' : 'Yaptım'}>{done ? '✓' : (noDone ? kartIkon(tip) : '')}</div>}
          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openRit(rt)}>
            <div className="t">{rt.ad}
              {ritAreas(rt).map((a) => <span key={a} className="tagp p-alan">{a}</span>)}
              {cfg.dikey && DIKEY_LABEL[cfg.dikey] && <span className="tagp p-dikey">{DIKEY_LABEL[cfg.dikey]}</span>}
              {cfg.pilAlan && PIL_ALAN[cfg.pilAlan] && <span className="tagp p-dikey">🔋 {PIL_ALAN[cfg.pilAlan]}</span>}
              {/* Puan rozeti (YENİ, 2026-09-16) — Havuz'un kendi "puanp" stiliyle aynı, kişinin kendi ritüeline
                  verdiği yıldızı listede de görebilmesi için (bkz. ritPuanla). */}
              {rt.puan ? <span className="puanp"> {'★'.repeat(rt.puan)}</span> : null}
            </div>
            {/* Yapılacak'ta ve Randevu'da "bitiş DD.MM" ibaresine gerek yok (kullanıcı isteği) — ikisinde de bitiş
                zaten sadece başlangıçla aynı gün ya da (gecikince) null, ayrıca anlamlı bir bilgi taşımıyor;
                onun yerine gecikme varsa o gösteriliyor. */}
            {!notRow && <div className="m">{[cfg.randevu && cfg.saat && '🕑 ' + cfg.saat, rt.hatirlatma_saat && '🔔 ' + rt.hatirlatma_saat, gecikti > 0 && ('⏰ ' + gecikti + ' gün gecikti'), (!cfg.gorev && !cfg.randevu && rt.bitis) && 'bitiş ' + kisaTarih(rt.bitis), ipucu].filter(Boolean).join(' · ')}</div>}
          </div>
          {vurl && <a className="playbtn" href={vurl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Aç">▶</a>}
          {/* Tek başına ✕ (Kaldır) yerine ⋯ menüsü geldi (kullanıcı isteği) — şimdilik tek seçeneği Sil, ileride
              Paylaş ve başka eylemler de buraya eklenebilir. Hangi satırın menüsü açık dıştaki ritMenuFor
              state'inde tutuluyor (RitItem her render'da yeniden tanımlandığı için kendi state'i güvenmez). */}
          <button className="rmx" onClick={(e) => { e.stopPropagation(); setRitMenuFor(rt); }} title="Seçenekler" aria-label="Seçenekler">⋮</button>
          {notRow && rt.hatirlatma_saat && <span style={{ position: 'absolute', right: 2, bottom: 2, fontSize: 11, color: 'var(--muted)', opacity: .8 }}>🔔 {rt.hatirlatma_saat}</span>}
        </div>
        {/* Alışkanlık ilerlemesi kartın kendi üzerinde: süreli alışkanlıklarda (bitis var) üstte haftalık
            doluluk çubukları (başlangıçtan itibaren 7'şer günlük dilimler, o dilimdeki aktif günlerin ne kadarı
            yapıldıysa o oranda dolu), altta bu haftanın 7 günü — ayrı bir gelişim ekranına girmeden, listeyi
            hiç açmadan görülsün diye (kullanıcı isteği). Sadece liste/ajanda satırında — kart detayında yok. */}
        {rt.aliskanlik && !rt.mezun && (() => {
          // Seri (🔥) ve bu ayki uyum % — eskiden Gelişim'de ayrı kartlarda (Alışkanlık serileri, Aylık uyum)
          // listeleniyordu; Behnan'ın "taşımak yerine Ajanda'nın diliyle, satırın üzerinde dursun" kararıyla
          // buraya, zaten var olan haftalık çubuklar+gün noktalarının hemen altına taşındı (bkz. o kartların
          // kaldırılışı, Gelişim ekranında). ritStreak yukarıda tanımlı.
          const streak = ritStreak(rt);
          const ayAktif = last30.filter((d) => activeOn(rt, d));
          const ayPct = ayAktif.length ? Math.round((ayAktif.filter((d) => logs.some((l) => l.ritual_id === rt.id && l.tarih === d && l.yapildi)).length / ayAktif.length) * 100) : null;
          let bloklar: number[] | null = null;
          if (rt.bitis) {
            bloklar = [];
            const end = parseD(rt.bitis);
            const cur = parseD(rt.baslangic);
            while (cur <= end && bloklar.length < 60) {
              let toplam = 0, yapilan = 0;
              for (let i = 0; i < 7; i++) {
                const dt = new Date(cur); dt.setDate(dt.getDate() + i);
                if (dt > end) break;
                const ds = iso(dt);
                if (activeOn(rt, ds)) { toplam++; if (logs.some((l) => l.ritual_id === rt.id && l.tarih === ds && l.yapildi)) yapilan++; }
              }
              bloklar.push(toplam ? yapilan / toplam : 0);
              cur.setDate(cur.getDate() + 7);
            }
          }
          return (
            <div style={{ margin: '0 2px 10px' }}>
              {bloklar && bloklar.length > 0 && (
                <div style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
                  {bloklar.map((f, i) => (
                    <div key={i} style={{ flex: 1, height: 6, borderRadius: 4, background: '#efe8da', overflow: 'hidden' }} title={'Hafta ' + (i + 1)}>
                      <div style={{ width: Math.round(f * 100) + '%', height: '100%', background: 'var(--green)', borderRadius: 4 }} />
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 3 }}>
                {weekArr.map((d) => {
                  if (!activeOn(rt, d)) return <div key={d} style={{ flex: 1, height: 8, borderRadius: 3, border: '1px dashed #e3dbca' }} />;
                  const ok = logs.some((l) => l.ritual_id === rt.id && l.tarih === d && l.yapildi);
                  return <div key={d} style={{ flex: 1, height: 8, borderRadius: 3, background: ok ? 'var(--green)' : '#efe8da' }} title={WD[wday(d)]} />;
                })}
              </div>
              {(streak > 0 || ayPct !== null) && (
                <div className="note" style={{ margin: '3px 2px 0', fontSize: 10.5 }}>
                  {streak > 0 ? '🔥 ' + streak + ' gün' : ''}{streak > 0 && ayPct !== null ? ' · ' : ''}{ayPct !== null ? 'bu ay %' + ayPct : ''}
                </div>
              )}
            </div>
          );
        })()}
        {/* "🎉 ... Mezun et" kutucuğu (retirebox) 2026-09-17'de (Behnan kararı) KALDIRILDI — "mezun" kavramı
            artık anlamsız bulunuyor. Tekrarlanan bir Aktivite'yi bitirmek artık doğrudan kartın kendi Süre
            panelinden bitiş tarihini ayarlamakla oluyor (var olan mekanizma, activeOn()'daki `if (r.bitis)
            return d <= r.bitis` sayesinde süresi dolunca Ajanda'dan kendiliğinden düşüyor) — Puanla ve Havuza
            kaydet (ritPuanla/ritHavuzaAl) zaten bağımsız eylemler olarak kalıyor. Süre panelinde ayrıca bir
            "bitir" kısayolu eklemek Behnan'ın ayrı, ileride düşündüğü bir sadeleştirme çalışmasına bırakıldı. */}
      </div>
    );
  }

  return (
    <div className="app">
      {/* Üst header (app adı + Inbox butonu) 2026-09 (Behnan kararı, WhatsApp-esinli sadeleştirme) KALDIRILDI —
          Inbox artık "Sohbet" sekmesine taşındı (bkz. screen==='iletisim'), bir kart gibi sayfa içinde. */}
      <div className="main">
        {/* ---------- HOME (v1) ---------- */}
        {/* Uygulamayı ilk açtığında görülen ekran — Ajanda/Havuz gibi "teknik" ekranlara hiç girmeden de kişinin
            kendini birkaç yaşam alanında değerlendirebileceği yer (kullanıcı isteği). Tamamen öznel: hangi kart
            işaretlenmiş/etiketlenmiş olduğuyla ilgisi yok, kişi kendi hissine göre seçiyor (bkz. homeAlanlar,
            homeDegerlendir). Alışkanlıklarını oturtmuş/mezun etmiş biri için de arada bir uğrayıp "kilo aldım,
            beslenmeme dikkat edeyim" diyebileceği hafif bir kontrol noktası olması amaçlanıyor. Kartların
            üzerinde artık doğrudan seçenek çipleri YOK (kullanıcı isteği: "doğrudan bir anket formu görüntüsünde"
            olmasın) — kartlar SADECE SON değerlendirmeyi gösteriyor (kullanıcı isteği: "geçmiş tarihli
            değerlendirmeler görmemize gerek bile yok, son yaptığı değerlendirme üzerinden gitmeliyiz" — bu yüzden
            eski sparkline/geçmiş grafiği kaldırıldı). Değerlendirme girişi (2026-09, Behnan kararı) artık toplu bir
            formda değil — karta dokununca açılan Detay'ın (homeDetay) sonundaki "Kendini değerlendir" çiplerinden
            yapılıyor; alt bardaki ＋ artık Ölçüm ekle açıyor (bkz. olcumEkleOpen). Durumu HOME_SEVIYE_RENK renk skalasında
            dikey bir "termometre" gösteriyor — dört dilim (Zayıf→Mükemmel), geçerli seviyeye kadar kendi rengiyle
            dolu, üstü soluk — kullanıcı isteği: "mükemmel, iyi gibi ibareleri okumadan bir bakışta renk
            dilimlerinden durumunu görebilmeli". Alanların kendisi artık sabit bir JS listesi DEĞİL — Havuz/
            Kütüphane'nin kalıcı grup tablosundan (dog_gruplar, kilitli "Meridyen" kökünün alt grupları) geliyor,
            ama bu satırlar artık İNCE (thin): sadece "hangi alan (anahtar) + görünür mü + sırası ne" taşıyor.
            İÇERİK (ad/neden/checklist/örnekler) 2026-09'dan (Behnan kararı — "Alanlar" mimarisi) beri TEK
            kanonik kaynaktan, dog_meridyen_alanlar'dan (bkz. meridyenAlanlarLib) anahtar üzerinden okunuyor ve
            SADECE Rite Studio'da (app-meridyen/atama) düzenleniyor — Rite tarafında (Home dahil, Kütüphane'nin
            "Grupları yönet" ekranı dahil) hiçbir içerik düzenleme/yeni alan ekleme imkânı yok. Hangi alanların bu
            danışana ait olacağı da Studio'daki "Ata" fonksiyonundan geliyor — her danışana otomatik olarak tüm
            alanlar tohumlanmıyor (bkz. ensureMeridyenGrubu, Home'daki boş durum notu). Home'un kendi
            "⚙️ Alanları yönet" ekranı (homeYonetOpen) SADECE hangi (kendisine atanmış) alanların Home'da
            görüneceğini (home_gizli) ve sırasını (paylaşılan `sira`, bkz. grupSiraDegistir) ayarlıyor. Kart
            ızgarası ve Detay'daki "Kendini değerlendir" bu yüzden homeAlanlar değil, gizlenmemiş olanları
            (homeAlanlarGorunur) kullanıyor. Detay'daki "Aktivitelerin" listesi (bkz. Home Detay modalı) ise
            danışanın kendi kişisel aktivitelerini (dog_activities.home_alanlar) gösteriyor — bu ayrı, canlı bir
            mekanizma, alan içeriğiyle karıştırılmasın. */}
        {screen === 'home' && (
          <div>
            {/* Sayfaya genel bir isim (2026-09-17, Behnan kararı: "dashboard benzeri olabilir") — Ajanda/Havuz
                gibi diğer ekranlarla aynı üst başlık standardı. Eski "Kendini bu alanlarda nasıl görüyorsun?"
                ipucu kaldırıldı (Behnan: "ibaresine gerek yok") — kartların kendisi zaten yeterince açık. */}
            <h2 style={{ marginTop: 0, marginBottom: 12 }}>Panel</h2>
            {/* Koç notu (2026-09, Behnan kararı — Gelişim sekmesinin kaldırılması): eskiden Gelişim'in en
                altında, artık Home'da doğrudan görünen bir kart — koç bir şey yazdıysa aranmadan görülsün diye
                (Ruh hali/Kapsama'nın aksine bu bir "analiz" değil, doğrudan iletişim). Kod/koşul (cNot varsa
                göster) aynen taşındı, sadece yeri değişti. */}
            {cNot && <div className="card" style={{ marginBottom: 12 }}><h3>Koç notu</h3><p style={{ fontSize: 12, color: '#4a565c', lineHeight: 1.55 }}>{cNot}</p></div>}
            {/* Alanlar artık kendi başlıklı "penceresi" içinde (2026-09-17, Behnan kararı: "Alanları da bir
                pencereye alalım") — Ölçümler/Havuz grup başlıklarıyla aynı şerit standardı, sağ uçta metinsiz
                sadece ayar ikonu (eski "⚙️ Alanları yönet" metni kaldırıldı, ikon aynı işlevi görüyor). */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#efe8da', borderRadius: 10, padding: '10px 10px 10px 12px' }}
            >
              <span style={{ flex: 1, fontWeight: 700 }}>Odak Alanları</span>
              <button
                type="button"
                title="Alanları yönet"
                onClick={() => setHomeYonetOpen(true)}
                style={{ background: 'none', border: 'none', padding: '0 2px', fontSize: 16, fontWeight: 700, color: '#8a8169', cursor: 'pointer', lineHeight: 1 }}
              >⚙️</button>
            </div>
            {/* 2026-09 (Behnan kararı — "Alanlar" mimarisi): artık her danışana otomatik tüm alanlar
                tohumlanmıyor, Rite Studio'dan atanana kadar Home boş görünebilir — bu iki durumu ayrı ayrı
                açıklıyoruz (hiç atanmamış vs hepsi gizlenmiş). */}
            {homeAlanlar.length === 0 ? (
              <div className="note" style={{ marginTop: 8 }}>Henüz sana atanmış bir alan yok — Meridyen tarafından atandığında burada görünecek.</div>
            ) : homeAlanlarGorunur.length === 0 ? (
              <div className="note" style={{ marginTop: 8 }}>Tüm alanları gizledin — sağ üstteki ⚙️'den geri gösterebilirsin.</div>
            ) : (
            /* 2 sütunlu ızgara (kullanıcı isteği: "her satırda 2 kart olsun"). Gösterge artık 4 ayrı dilim değil,
                dolan TEK bir pil (kullanıcı isteği) — dolu kısmın tamamı seviyeye göre tek bir renk: %25 koyu
                kırmızı, %50 turuncu, %75 zeytin yeşili, %100 açık yeşil (bkz. HOME_SEVIYE_RENK, örnek renkler
                kullanıcıdan). */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              {homeAlanlarGorunur.map((a) => {
                const guncel = homeGuncelDeger(a.anahtar);
                return (
                  <div key={a.id} className="card" style={{ margin: 0, cursor: 'pointer' }} onClick={() => setHomeDetay(a.anahtar)}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{ margin: 0 }}>{a.ad}</h3>
                        <div className="note" style={{ marginTop: 4 }}>{guncel ? HOME_SEVIYE[guncel - 1] : 'Henüz değerlendirilmedi'}</div>
                      </div>
                      <div style={{ width: 18, height: 50, borderRadius: 6, border: '1px solid var(--line)', background: '#efe8da', display: 'flex', alignItems: 'flex-end', overflow: 'hidden', flex: '0 0 auto' }} title={guncel ? HOME_SEVIYE[guncel - 1] : 'Henüz değerlendirilmedi'}>
                        {guncel && <div style={{ width: '100%', height: (guncel / HOME_SEVIYE.length) * 100 + '%', background: HOME_SEVIYE_RENK[guncel - 1], transition: 'height .3s' }} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
            {/* Son ölçümler (2026-09, Behnan kararı): Gelişim'in eski "Ölçümler" kartının yerini alıyor —
                "home'a yerleştirsek güzel olur, son ölçümleri orada alırız". Alan/dikey gruplaması yok, sadece
                her ölçümün en son değeri (bkz. sonOlcumler) — Meridyen'in 13 alanıyla eski fayda-kaynaklı alan
                sözlüğü arasında bir eşleme gerektirmiyor.
                2026-09 (Behnan kararı, WhatsApp-esinli sadeleştirme): Home'da ölçüm eklemek artık bottom_nav'ın
                genel ＋'sından değil, buradaki başlık şeridinden — Havuz'daki Grup şeridiyle aynı görsel
                standart (bkz. aktKart üstündeki grup başlığı). Boşken de bu şerit tek başına görünüyor.
                2026-09 (aynı gün, Gelişim'in kaldırılması — Behnan kararı: "bağlam bazında başka ekranlar
                açabiliriz"): şeridin kendisi (etiket) artık EKLEME değil, Ruh hali'nin (eskiden Gelişim'de)
                taşındığı bağlamsal "Ölçümler" detay/analiz ekranını açıyor — ekleme sadece sağdaki ＋'da kaldı
                (stopPropagation ile şeridin tıklamasını tetiklemiyor). */}
            <div style={{ marginTop: 10 }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: '#efe8da', borderRadius: 10, padding: '10px 10px 10px 12px' }}
                onClick={() => setScreen('olcumler')}
              >
                <span style={{ flex: 1, fontWeight: 700 }}>Ölçümler</span>
                <button
                  type="button"
                  title="Ölçüm ekle"
                  onClick={(e) => { e.stopPropagation(); setOlcumSecAnahtar(null); setOlcumOzelAd(''); setOlcumDeger(''); setOlcumBirim(''); setOlcumEkleOpen(true); }}
                  style={{ background: 'none', border: 'none', padding: '0 2px', fontSize: 16, fontWeight: 700, color: '#8a8169', cursor: 'pointer', lineHeight: 1 }}
                >＋</button>
              </div>
              {sonOlcumler.length > 0 && (
                <div className="card" style={{ marginTop: 8 }}>
                  {sonOlcumler.map((o) => (
                    <div key={o.k} className="mrow"><span>{o.etiket}</span><b>{o.deger} {o.birim}</b></div>
                  ))}
                </div>
              )}
            </div>
            {/* Kapsama (eski Gelişim'in ana kartı — haftalık alan-dokunma analizi) 2026-09'da (Behnan kararı)
                bottom_nav'dan çıkarılıp Home'dan erişilen, bağlama girmeyen genel bir "Analiz" ekranına taşındı
                — Behnan'ın deyişiyle "bottom nav'da görünmeyen ama home'dan ulaşabiliriz". İçerik/mantık hiç
                değişmedi, sadece giriş noktası bu küçük linke indi; gerekliliğini kullanırken tartışacağız
                (Behnan notu). */}
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <span className="minlink" onClick={() => setScreen('analiz')}>🔬 Gelişmiş analiz</span>
            </div>
          </div>
        )}

        {/* ---------- AJANDA ---------- */}
        {screen === 'ajanda' && (
          <div>
            {/* Başlık + tarih satırı sabitlendi (2026-09-17, Behnan kararı: "çok aktivite/not olunca aşağı
                kaydırınca + için tekrar yukarı kaydırmam gerekiyor") — ekranın kendi kaydırma alanı yok, sayfa
                (viewport) kaydığı için sticky burada doğrudan viewport'un üstüne yapışıyor; .main'in kendi
                padding'ini (14px) negatif margin ile iptal edip kendi padding'iyle geri veriyoruz ki yapışınca
                kenarlardan boşluk kaybolmasın/alttaki içerik arkadan görünmesin (opak --bg arka planı var). */}
            <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg)', margin: '-14px -14px 0', padding: '14px 14px 0' }}>
            <div className="ajhead">
              <h2>Ajanda</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Gün/Ay vswitch kaldırıldı (2026-09-17, Behnan kararı: "Gün, Ay butonları yerine sadece bir
                    takvim ikonu bile yeterli") — Ay artık ayrı bir sayfa değil, bu ikonla açılan bir overlay/popup
                    (bkz. aşağısı, ayPopupOpen). Ajanda'nın asıl gövdesi artık hep "Gün" görünümü. */}
                <button
                  type="button"
                  title="Takvim"
                  onClick={() => { setAyCursor(day); setAyPopupOpen(true); }}
                  style={{ background: 'none', border: '1px solid var(--line)', borderRadius: '50%', width: 30, height: 30, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', padding: 0 }}
                >📅</button>
                {/* Ajanda'nın kendi ekleme girişi (2026-09, Behnan kararı — bottom_nav'ın genel ＋'sı kaldırıldı,
                    bkz. nav'daki not) — "en üst sağa bir + koyup, oradan ekleyelim şimdilik", genel bir ekran
                    tasarımı düzeltme oturumunda yeri/görünümü değişebilir. Aynı ekleMenuOpen modalini açıyor,
                    davranış hiç değişmedi — sadece giriş noktası taşındı. */}
                <button
                  type="button"
                  title="Ekle"
                  onClick={() => setEkleMenuOpen(true)}
                  style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: '50%', width: 30, height: 30, fontSize: 17, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', padding: 0 }}
                >＋</button>
              </div>
            </div>
            <div className="datenav">
              <button className="arrow" onClick={() => shiftDay(-1)}>‹</button>
              <div className="dlabel" onClick={() => setSelDate(today)}>
                {dayLabel(day)}
                {day !== today && <div className="totoday">↺ bugüne dön</div>}
              </div>
              <button className="arrow" onClick={() => shiftDay(1)}>›</button>
            </div>
            </div>

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

            {(linkMode ? (
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
                    // Not (yapışkan not): sarı zemin ve tam dikdörtgen köşeler asıl görünür kutu olan bu dıştaki
                    // .card'a uygulanıyor (kullanıcı isteği — "tamamen sarı olur, köşeler yuvarlak olmaz");
                    // .rit'in kendi arka planı/köşe/boşluk ayarları kaldırıldı, artık sadece bu dış kutu boyuyor.
                    const notCard = isNotKart(r.members[0]);
                    return <div className="card" style={notCard ? { padding: '12px 14px', background: '#fdf6d3', border: 'none', borderRadius: 3 } : { padding: '4px 10px' }}><RitItem rt={r.members[0]} /></div>;
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

            {/* Notlar şeridi: günlerden bağımsız, hangi gün seçili olursa olsun hep aynı — Not artık habits'te
                yer almıyor (kullanıcı isteği). ⋯ menüsünden bir tür seçilip "taşınınca" (bkz. notuTasi) o an
                Ajanda'da görüntülenen güne (day) Yapılacak/Alışkanlık/Randevu olarak düşüyor ve doğal olarak bu
                listeden kalkıp yukarıdaki normal gün listesine katılıyor. */}
            {!linkMode && notlar.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <div className="timediv"><span className="tl">Notlar</span><span className="ln" /></div>
                {notlar.map((rt) => (
                  <div key={rt.id} className="card" style={{ padding: '12px 14px', background: '#fdf6d3', border: 'none', borderRadius: 3, marginBottom: 8 }}>
                    <RitItem rt={rt} />
                  </div>
                ))}
              </div>
            )}

            {/* Ay takvimi + Yaklaşan aktiviteler artık ayrı bir "Ay" sayfası değil, takvim ikonuyla açılan bir
                popup/overlay (2026-09-17, Behnan kararı — bkz. ayPopupOpen/ayCursor tanımı, yukarısı). Popup
                kendi ay gezinmesini (ayCursor) kullanır, bir güne dokununca gerçek seçim (setSelDate) yapılıp
                kapanır; dışarı dokununca da (hiçbir seçim yapmadan) kapanır. */}
            {ayPopupOpen && (() => {
              const cursor = ayCursor || day;
              const base = parseD(cursor); const y = base.getFullYear(), mo = base.getMonth();
              const startDow = (new Date(y, mo, 1).getDay() + 6) % 7; // Pzt=0
              const gunSay = new Date(y, mo + 1, 0).getDate();
              const cells: (string | null)[] = [];
              for (let i = 0; i < startDow; i++) cells.push(null);
              for (let d = 1; d <= gunSay; d++) cells.push(iso(new Date(y, mo, d)));
              while (cells.length % 7) cells.push(null);
              // "Yaklaşan randevular" → "Yaklaşan aktiviteler" (2026-09-17, Randevu birleşmesi, Behnan kararı:
              // "neyin önemli olduğu bilgisi artık yok o yüzden her aktiviteyi listeleyecektir") — eskiden sadece
              // kart_tipi==='randevu' (Meridyen görüşmesi) ya da kart_config.randevu (eski kişisel Randevu
              // bayrağı) taşıyanlar listeleniyordu; artık tek-günlük (baslangic===bitis), gelecekteki, Not
              // olmayan HER ritüel (Aktivite dahil) burada — ayrım kalmadığı için filtre yok.
              const yaklasanlar = rituals.filter((r) => !r.mezun && !isNotKart(r) && r.baslangic && r.baslangic === r.bitis && r.baslangic >= today).sort((a, b) => (a.baslangic < b.baslangic ? -1 : 1));
              return (
                <div className="modal" onMouseDown={() => setAyPopupOpen(false)}>
                  <div className="sheet small" onMouseDown={(e) => e.stopPropagation()}>
                    <div className="datenav" style={{ margin: '0 0 8px' }}>
                      <button className="arrow" onClick={() => shiftAyCursor(-1)}>‹</button>
                      <div className="dlabel">{ayLabel(cursor)}</div>
                      <button className="arrow" onClick={() => shiftAyCursor(1)}>›</button>
                    </div>
                    <div className="card">
                      <div className="calhead">{['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((w) => <span key={w}>{w}</span>)}</div>
                      <div className="calgrid">
                        {cells.map((ds, i) => {
                          if (!ds) return <div key={i} className="calcell empty" />;
                          // Sayıma yalnız "yapılabilir" (done'lanabilir) ritüeller: mesaj tipi video (done:false), ayraçlar ve
                          // Not (sticky note — checkbox'ı/tamamlanma kavramı yok, Ayraç gibi bir görev değil) hariç.
                          const gunRit = rituals.filter((r) => !r.mezun && activeOn(r, ds) && r.kart_tipi !== 'ayrac' && !isNotKart(r) && !(r.kart_tipi === 'video' && r.kart_config && r.kart_config.done === false));
                          const n = gunRit.length;
                          const done = gunRit.filter((r) => logs.some((l) => l.ritual_id === r.id && l.tarih === ds && l.yapildi)).length;
                          return (
                            <button key={i} className={'calcell' + (ds === today ? ' today' : '') + (ds === day ? ' sel' : '')} onClick={() => { setSelDate(ds); setAyPopupOpen(false); }}>
                              <span className="calnum">{parseD(ds).getDate()}</span>
                              {n > 0 && <span className={'calcount' + (done >= n ? ' full' : '')}>{done}/{n}</span>}
                            </button>
                          );
                        })}
                      </div>
                      <div className="note" style={{ marginTop: 6 }}>Her günde yapılan/planlanan task. Bir güne dokun → o güne git.</div>
                    </div>
                    {yaklasanlar.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div className="tod">📅 Yaklaşan aktiviteler</div>
                        {yaklasanlar.map((r) => (
                          <div key={r.id} className="actcard" onClick={() => { setAyPopupOpen(false); openRit(r); }}>
                            <div style={{ flex: 1 }}>
                              <div className="n">{kartIkon(r.kart_tipi) || '📅'} {r.ad}</div>
                              <div className="o">{dayLabel(r.baslangic)}{r.hatirlatma_saat ? ' · 🔔 ' + r.hatirlatma_saat : ''}</div>
                            </div>
                            <span className="go">›</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          </div>
        )}

        {/* ---------- HAVUZ ---------- */}
        {screen === 'havuz' && (() => {
          // Gerçek akordeon: her Grup kendi kartı, başlığına dokununca açılır/kapanır — birden fazlası aynı
          // anda açık kalabilir. Alt gruplar o kartın içinde, kendi başlıklarıyla iç içe aynı şekilde çalışır.
          // Bir başlığı AÇARKEN actGroup/actAltGroup da güncellenir — Ajanda'daki ＋ ile yeni kart eklendiğinde
          // (bkz. yeniHavuzTaslakAc/taslakKaydet) kart en son açtığın buraya düşer; kapatmak hedefi değiştirmez.
          const grupAc = (g: string) => {
            setAcikGruplar((s) => {
              const n = new Set(s);
              if (n.has(g)) n.delete(g); else { n.add(g); setActGroup(g); setActAltGroup(null); }
              return n;
            });
          };
          const altGrupAc = (g: string, ag: string) => {
            const key = g + '␟' + ag;
            setAcikAltGruplar((s) => {
              const n = new Set(s);
              if (n.has(key)) n.delete(key); else { n.add(key); setActGroup(g); setActAltGroup(ag); }
              return n;
            });
          };
          const aktKart = (a: any) => (
            <div key={a.id} className="actcard" onClick={() => openDetay(a, 'aktivite')}>
              <div style={{ flex: 1 }}><div className="n">{a.tur === 'program' ? '🧩 ' : ''}{a.ad}{a.puan ? <span className="puanp"> {'★'.repeat(a.puan)}</span> : ''}</div><div className="o">{a.tur === 'program' ? (a.adimlar || []).length + ' adım' + (a.sure_gun ? ' · ' + a.sure_gun + ' gün' : '') : (a.kaynak_etiket === 'Mezun' ? 'Mezun · ' : '') + Array.from(new Set((a.faydalar || []).map((k: string) => faydaMap[k]?.alan).filter(Boolean))).join(' · ')}</div></div>
              <span className="go">›</span>
            </div>
          );
          return (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <h2 style={{ margin: 0 }}>Aktivite Havuzu</h2>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="minlink" onClick={() => { setAnaGrupEkleAcik((o) => !o); setGrupYeniAd(''); }}>＋ Grup</button>
                <button className="minlink" onClick={() => setGruplarYonetOpen(true)}>🗂 Grupları yönet</button>
              </div>
            </div>
            <p className="sub">Her Grup kendi araştırma başlığın — başlığa dokunup aç/kapat. Yeni bir kişisel kart Ajanda&apos;daki <b>+</b> ile oluşturulur, en son açtığın Grup/Alt gruba eklenir.</p>
            {anaGrupEkleAcik && (
              <div style={{ display: 'flex', gap: 6, margin: '0 0 10px' }}>
                <input value={grupYeniAd} onChange={(e) => setGrupYeniAd(e.target.value)} placeholder="Yeni Grup adı (ör. Duruş)" style={{ flex: 1 }} autoFocus />
                <button className="btn sm" onClick={async () => { const isim = grupYeniAd.trim(); if (!isim) return; await grupEkle(isim, null); setActGroup(isim); setActAltGroup(null); setAcikGruplar((s) => new Set(s).add(isim)); setGrupYeniAd(''); setAnaGrupEkleAcik(false); }}>Ekle</button>
                <button className="btn ghost sm" onClick={() => setAnaGrupEkleAcik(false)}>Vazgeç</button>
              </div>
            )}
            {personalGroups.length === 0 ? (
              <div className="note">Henüz grup yok — yukarıdaki ＋ Grup&apos;tan ekleyebilirsin.</div>
            ) : personalGroups.map((g, gi) => {
              const altlar = altGruplarOf(g);
              const acik = acikGruplar.has(g);
              const dogrudanAkt = personalActs.filter((a) => personalGroupOf(a) === g && !a.alt_grup);
              const toplamSay = personalActs.filter((a) => personalGroupOf(a) === g).length;
              return (
                <div key={g} style={{ marginTop: gi === 0 ? 4 : 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: '#efe8da', borderRadius: 10, padding: '10px 10px 10px 12px' }} onClick={() => grupAc(g)}>
                    <span style={{ width: 14, textAlign: 'center', color: '#8a8169' }}>{acik ? '▾' : '▸'}</span>
                    <span style={{ flex: 1, fontWeight: 700 }}>{g}</span>
                    {toplamSay > 0 && <span className="note" style={{ margin: 0 }}>{toplamSay}</span>}
                    <button
                      type="button"
                      title="Alt grup ekle"
                      onClick={(e) => { e.stopPropagation(); setAcikGruplar((s) => new Set(s).add(g)); setAltGrupEkleAcikFor(g); setAnaAltGrupYeniAd(''); }}
                      style={{ background: 'none', border: 'none', padding: '0 2px', fontSize: 16, fontWeight: 700, color: '#8a8169', cursor: 'pointer', lineHeight: 1 }}
                    >＋</button>
                  </div>
                  {acik && (
                    <div style={{ padding: '4px 2px 2px' }}>
                      {altGrupEkleAcikFor === g && (
                        <div style={{ display: 'flex', gap: 6, margin: '4px 0 8px' }}>
                          <input value={anaAltGrupYeniAd} onChange={(e) => setAnaAltGrupYeniAd(e.target.value)} placeholder="Yeni Alt grup adı" style={{ flex: 1 }} autoFocus />
                          <button className="btn sm" onClick={async () => {
                            const isim = anaAltGrupYeniAd.trim();
                            if (!isim) return;
                            const ustId = await grupUstIdGaranti(g);
                            if (!ustId) return;
                            await grupEkle(isim, ustId);
                            setActGroup(g); setActAltGroup(isim);
                            setAcikAltGruplar((s) => new Set(s).add(g + '␟' + isim));
                            setAnaAltGrupYeniAd(''); setAltGrupEkleAcikFor(null);
                          }}>Ekle</button>
                          <button className="btn ghost sm" onClick={() => setAltGrupEkleAcikFor(null)}>Vazgeç</button>
                        </div>
                      )}
                      {dogrudanAkt.length === 0 && altlar.length === 0 && altGrupEkleAcikFor !== g && <div className="note">Bu grupta henüz aktivite yok.</div>}
                      {dogrudanAkt.map(aktKart)}
                      {altlar.map((ag) => {
                        const key = g + '␟' + ag;
                        const altAcik = acikAltGruplar.has(key);
                        const altAkt = personalActs.filter((a) => personalGroupOf(a) === g && a.alt_grup === ag);
                        return (
                          <div key={ag} style={{ margin: '2px 0 0', borderTop: '1px solid var(--line)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', cursor: 'pointer' }} onClick={() => altGrupAc(g, ag)}>
                              <span style={{ width: 12, textAlign: 'center', color: '#9a9280', fontSize: 11 }}>{altAcik ? '▾' : '▸'}</span>
                              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>{ag}</span>
                              {altAkt.length > 0 && <span className="note" style={{ margin: 0 }}>{altAkt.length}</span>}
                            </div>
                            {altAcik && (
                              <div style={{ margin: '0 0 4px 20px' }}>
                                {altAkt.length === 0 ? <div className="note">Bu alt grupta aktivite yok.</div> : altAkt.map(aktKart)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          );
        })()}

        {/* ---------- ANALİZ (eski Gelişim'in Kapsama'sı, 2026-09 Behnan kararı) ---------- */}
        {/* Gelişim sekmesi bottom_nav'dan kaldırıldı — bu ekran artık sadece Home'daki "🔬 Gelişmiş analiz"
            linkinden açılıyor, bağlama girmeyen (Behnan: "advanced analysis gibi bir buton, bottom nav'da
            görünmeyen") genel bir analiz sayfası. Kapsama'nın kodu/mantığı AYNEN taşındı — eski fayda/alan
            sözlüğüne dayandığını, Meridyen'in yeni 13-alan mimarisiyle henüz örtüşmediğini biliyoruz, bu turda
            buna dokunulmadı (Behnan: "kullanım sırasında gerekliliğini tartışırız"). */}
        {screen === 'analiz' && (
          <div>
            <button className="linkbtn" onClick={() => setScreen('home')}>‹ Home</button>
            <h2 style={{ marginTop: 6 }}>🔬 Gelişmiş analiz</h2>
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
          </div>
        )}

        {/* ---------- ÖLÇÜMLER (detay/analiz, eski Gelişim'in Ruh hali'si, 2026-09 Behnan kararı) ---------- */}
        {/* Home'daki "Ölçümler" başlık şeridine dokununca açılan bağlamsal ekran (Behnan: "onun grafiğine ve
            analizine yine ölçümler kısmının header şeridinden ulaşabiliriz"). Ruh hali'nin kodu/mantığı AYNEN
            taşındı (measByKey['ruh_hali'] yoksa hiç görünmez) — henüz yeni bir grafik/trend eklenmedi, bu ilk
            turda sadece yer değiştirdi. */}
        {screen === 'olcumler' && (
          <div>
            <button className="linkbtn" onClick={() => setScreen('home')}>‹ Home</button>
            <h2 style={{ marginTop: 6 }}>Ölçümler</h2>
            {measByKey['ruh_hali'] ? (
              <div className="card"><h3>Ruh hali (son 7 gün)</h3>
                <div style={{ fontSize: 24, letterSpacing: 6 }}>{measByKey['ruh_hali'].slice(-7).map((m: any, i: number) => <span key={i} title={m.tarih}>{MOOD[Math.round(Number(m.deger)) - 1] || '·'}</span>)}</div>
                {(() => { const arr = measByKey['ruh_hali'].slice(-7).map((m: any) => Number(m.deger)); const ort = arr.reduce((a: number, b: number) => a + b, 0) / arr.length; return <div className="note" style={{ marginTop: 4 }}>Ortalama: {MOOD[Math.round(ort) - 1]} ({ort.toFixed(1)}/5)</div>; })()}
              </div>
            ) : (
              <div className="note">Henüz ölçüm analizi için yeterli veri yok.</div>
            )}
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

        {/* Mezunlar arşiv ekranı 2026-09-17'de (Behnan kararı, "mezun et tamamen kalksın") TAMAMEN kaldırıldı —
            zaten UI'da ona giden aktif bir link kalmamıştı (bkz. bir önceki turun notu). */}

        {/* ---------- İLETİŞİM / SOHBET (2026-09 Behnan kararı) ---------- */}
        {/* Koçluk chat + görüntülü görüşme için ayrılmış sekme — henüz sadece yer tutucu, hiçbir backend/chat
            mantığı yok (gerçek entegrasyon, ör. stream.io, ayrı bir iş). Inbox (bkz. eskiden üst header'daki
            📥 butonu/modalı) buraya, sayfa içi bir kart olarak taşındı — "inbox'ı sohbet içinde aynen bir kart
            gibi taşıyabilirsin" (Behnan kararı) — üst header de bununla birlikte tamamen kaldırıldı. */}
        {screen === 'iletisim' && (
          <div>
            <h2>💬 Sohbet</h2>
            <div className="empty" style={{ marginTop: 10 }}>Yakında — koçunla sohbet ve görüntülü görüşme burada olacak.</div>

            <div className="card" style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <h3 style={{ margin: 0 }}>📥 Inbox</h3>
                <button className="btn ghost sm" onClick={() => client && loadInbox(client.id)}>🔄 Yenile</button>
              </div>
              <div className="note" style={{ marginTop: 4 }}>Başkalarının seninle paylaştığı kartlar burada birikir.</div>
            </div>
            {inbox.length === 0 && <div className="note" style={{ textAlign: 'center', marginTop: 10 }}>Inbox boş. Sana bir şey paylaşıldığında burada göreceksin. Kendi notunu/randevunu eklemek için Ajanda'daki ＋ butonunu kullan.</div>}
            {inbox.map((v) => v.tur !== 'aktivite' ? (
              <InboxNot key={v.id} v={v} onOpen={() => openIbDetay(v)} />
            ) : (
              <div key={v.id} className="card">
                {(
                  <>
                    {/* Kişisel bilgi kartları (Not/Randevu/Alışkanlık) için tıklayınca gerçek detay ekranını
                        (aynen Ajanda/Havuz'daki gibi, salt okunur) açar — kabul etmeden önce ne geldiğini görüp
                        gerekirse hemen silebilsin diye (kullanıcı isteği: "gereksiz paylaşım"lar). Sadece
                        başlık/özet alanı tıklanabilir; alttaki Ajandama ekle/Havuzuma ekle/Sil ayrı, tetiklenmez. */}
                    <div
                      onClick={v.payload?.kartTipi === 'bilgi' ? () => openInboxPreview(v) : undefined}
                      style={v.payload?.kartTipi === 'bilgi' ? { cursor: 'pointer' } : undefined}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700 }}>🎁 {v.baslik || v.payload?.ad}</div>
                      <div className="note" style={{ margin: '2px 0' }}>{v.payload?.from_ad ? 'Kimden: ' + v.payload.from_ad : 'Paylaşım'}{v.from_code ? ' · ' + v.from_code : ''}</div>
                      {(v.payload?.faydalar || []).length > 0 && <div>{Array.from(new Set((v.payload.faydalar || []).map((k: string) => faydaMap[k]?.alan).filter(Boolean))).map((a: any) => <span key={a} className="tagp p-alan">{a}</span>)}</div>}
                      {v.payload?.aciklama && <div className="note" style={{ marginTop: 4 }}>{v.payload.aciklama}</div>}
                      {v.payload?.kartTipi === 'bilgi' && (
                        <div className="note" style={{ margin: '4px 0 0', fontWeight: 700 }}>
                          👁 Kartı aç{v.payload?.kartConfig?.randevu && v.payload.baslangic ? ' · 📅 ' + kisaTarih(v.payload.baslangic) : ''}
                        </div>
                      )}
                    </div>
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
                            {/* Randevu tek bir tarihe/saate bağlı — havuz (tekrarlanan/tarihsiz aktivite şablonu) kavramına uymuyor,
                                o yüzden randevu paylaşımlarında bu seçenek hiç gösterilmiyor (kullanıcı isteği). */}
                            {!v.payload?.kartConfig?.randevu && <button className="btn ghost sm" onClick={() => { setIbGrupSec(v.id); setIbGrupVal('Genel'); }}>Havuzuma ekle</button>}
                          </>}
                      <button className="btn ghost sm" style={{ color: 'var(--red)', borderColor: '#e6c4bd' }} onClick={() => inboxSil(v.id)}>Sil</button>
                    </div>
                  </>
                )}
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
        {/* Home: Ajanda/Havuz gibi teknik ekranlara hiç girmeyebilecek yeni kullanıcılar için ilk açılan ekran
            (kullanıcı isteği) — sekmede bilerek sadece ikon var, metin etiketi yok (isim şimdilik "Home",
            görünürde hiç yazmıyor). Diğer sekmelerin aksine tek kelimelik bir etiketi olmadığı için dizi
            girdisindeki üçüncü eleman (etiket) boş string. */}
        {[['home', '🏠', ''], ['ajanda', '🗓', 'Ajanda'], ['havuz', '⊕', 'Havuz']].map(([k, ic, l]) => (
          <button key={k} className={screen === k ? 'on' : ''} onClick={() => setScreen(k)}><span className="ic">{ic}</span>{l}</button>
        ))}
        {/* bottom_nav'ın genel ＋ tuşu 2026-09'da (aynı gün, Behnan kararı — WhatsApp-esinli sadeleştirmenin
            son adımı) TAMAMEN KALDIRILDI. Kademeli planın son durağıydı: Home kendi Ölçümler şeridinden
            ekliyordu; Ajanda artık kendi başlık şeridindeki ＋'dan ekliyor (bkz. ajhead, aşağısı — Behnan:
            "en üst sağa bir + koyup, oradan ekleyelim şimdilik"); Havuz'un eski Not/Alışkanlık girişi ise
            KALDIRILDI (Behnan: "eski bir tarz, bizim aktivite kartımızı bilmiyor... bence kaldıralım ve
            havuza bir şey eklemek için başka bir yöntem geliştiririz" — Havuz'a eklemenin yeni yöntemi henüz
            YOK, bilinçli bir boşluk, ekleMenuOpen'daki screen==='havuz' dalları da bu yüzden temizlendi, bkz.
            aşağısı); Gelişim/Analiz/Ölçümler/Sohbet/Ayarlar zaten hiç eklemiyordu. Global ＋ artık hiçbir
            ekranda bir işlev görmediği için (her ekran kendi yerini buldu ya da bilinçli olarak boş bırakıldı)
            eleman TAMAMEN kaldırıldı — sürekli gri/devre dışı bir buton bırakmak yerine (Behnan'ın önceki
            turdaki sorusuna cevap: "+ bottom nav'dan kaldırılabilir"). ekleMenuOpen state'i ve modalı hâlâ var
            (bkz. aşağısı), artık SADECE Ajanda'nın yeni yerel ＋'sından açılıyor. */}
        {/* İletişim/Sohbet (2026-09, Behnan kararı — WhatsApp-esinli 3. madde): koçluk sohbet/görüntülü görüşme
            sekmesi için şimdilik yer tutucu — chat/video altyapısı (stream.io vb.) ayrı, daha büyük bir iş,
            henüz ele alınmadı. Inbox de (eski üst header'daki 📥 butonu/modalı) artık burada, sayfa içi bir kart
            olarak (bkz. İLETİŞİM ekranı) — rozet (ibBadge) de header'daki ibtn'den buraya taşındı. Sohbet/Ayarlar
            sırası (2026-09, Behnan kararı) yer değiştirildi — Sohbet artık Ayarlar'dan önce. Rozet span'i eskiden
            "bdg" class'ına güveniyordu ama o CSS kuralı (.ibtn .bdg) sadece .ibtn atası içinde geçerliydi; burada
            öyle bir ata yok, o yüzden position:absolute hiç uygulanmıyordu ve rakam "Sohbet1" gibi satır içine
            akıyordu — konumlandırma artık doğrudan inline style ile veriliyor. */}
        <button key="iletisim" className={screen === 'iletisim' ? 'on' : ''} style={{ position: 'relative' }} onClick={() => { setScreen('iletisim'); if (client) loadInbox(client.id); }}>
          <span className="ic">💬</span>Sohbet
          {ibBadge > 0 && <span style={{ position: 'absolute', top: 3, right: '22%', background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 20, padding: '1px 5px' }}>{ibBadge}</span>}
        </button>
        <button className={screen === 'bilgi' ? 'on' : ''} onClick={() => setScreen('bilgi')}><span className="ic">⚙</span>Ayarlar</button>
      </div>

      {detay && (() => {
        const isRit = detay.tur === 'ritual';
        // Inbox'ta "kartı aç"tan gelen bir önizleme mi (bkz. openInboxPreview) — henüz kaydedilmemiş, gerçek
        // bir satır değil; düzenleme/kaydetme/paylaşım/silme gibi kalıcı hiçbir işlem burada yapılamaz, salt görüntü.
        const preview = !!(detay as any).preview;
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
        // Kişisel kartların (Not/Aktivite/Randevu) ortak, tek dosyalık "ek" — Bildirim satırıyla aynı yerde
        // (kullanıcı isteği). BilgiKartEdit'in kendi resimAttachmentJsx/resimGridJsx'iyle AYNI yükleme akışı
        // (resimKucult + /api/upload), ama burada sayfa seviyesinde tutuluyor ki Bildirim'le aynı flex satıra
        // girebilsin.
        const ekUrl: string | null = (Array.isArray(kCfg?.resimler) && kCfg.resimler[0]) || kCfg?.resim || null;
        async function ekYukle(e: React.ChangeEvent<HTMLInputElement>) {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setEkHata('');
          setEkYukleniyor(true);
          try {
            const kucuk = await resimKucult(f);
            const fd = new FormData();
            fd.append('file', kucuk, 'resim.jpg');
            const r = await fetch('/api/upload', { method: 'POST', body: fd });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || 'Yükleme başarısız');
            bilgiKaydet({ ...kCfg, resimler: [data.url], resim: data.url });
          } catch (err: any) {
            setEkHata(err?.message || 'Yükleme başarısız');
          } finally {
            setEkYukleniyor(false);
          }
        }
        function ekSil() {
          bilgiKaydet({ ...kCfg, resimler: [], resim: null });
          setEkBuyuk(false);
        }
        const noDone = kTip === 'anket' || kTip === 'coktan' || kTip === 'nefes' || kTip === 'ruhhali' || kTip === 'tarif' || kTip === 'sukran' || kTip === 'topraklama' || kTip === 'pomodoro' || kTip === 'beden' || kTip === 'uykuoncesi' || kTip === 'su' || kTip === 'maruz' || kTip === 'niyet' || kTip === 'workout' || (kTip === 'video' && kCfg.done === false) || (kTip === 'randevu' && kCfg.done === false);
        // kCfg?.gorev SADECE Aktivite'nin "Bugün" hâlinde set edilir (bkz. yeniTaslakAc/setRitTekrarla) —
        // Not/Randevu bu alanı hiç yazmıyor, o yüzden onların "süregelen" etiketi burada değişmiyor.
        const gunOzet = !o.baslangic ? "📥 Inbox'ta bekliyor" : (o.baslangic === o.bitis ? '📅 ' + kisaTarih(o.baslangic) : (o.bitis ? kisaTarih(o.baslangic) + ' → ' + kisaTarih(o.bitis) : (kCfg?.gorev ? 'yapılacak · ' + kisaTarih(o.baslangic) + "'den" : 'süregelen · ' + kisaTarih(o.baslangic) + "'den")));
        const yarin = (() => { const d = parseD(today); d.setDate(d.getDate() + 1); return iso(d); })();
        // Meridyen'den (koçtan) gelen kart/program — doğrudan atanmış ya da şablona bağlı (sablon_id) — danışan
        // tarafından başka birine paylaşılamaz. Kendi yazdığı ya da bir arkadaşından aldığı kişisel kartlar serbest.
        const paylasilamaz = isRit ? (o.kaynak === 'Meridyen' || o.kaynak === 'Program' || !!o.sablon_id) : !!o.sablon_id;
        const stilP = kCfg.stil ? STIL_LOOKUP[kCfg.stil] : null;
        // Taslak: ＋ menüsünden yeni bir Not/Randevu/Alışkanlık (Ajanda'da) ya da Not/Alışkanlık (Havuz'da)
        // açıldı ama henüz Kaydet'e basılmadı — ortada gerçek bir veritabanı satırı (o.id) yok. Alan düzenleme
        // fonksiyonları (setRitAd, setBilgiCfg, vb.) id yokken sadece bu ekrandaki yerel taslağı güncelliyor,
        // hiçbir şeyi kaydetmiyor (bkz. o fonksiyonlar). preview (Inbox önizlemesi) de id'siz ama taslak DEĞİL —
        // orada Kaydet/Paylaş/Sil gibi kalıcı hiçbir işlem yok, o yüzden ayrıca dışlanıyor.
        const isDraft = !o.id && !preview;
        // "Not" (Ajanda'da, salt kart_tipi='bilgi', randevu/alışkanlık değil) için deneme aşamasındaki yeni
        // tasarım: title bar artık düzenlenebilir bir alan değil, sabit bir etiket ("Yeni not"/"Not düzenleme");
        // asıl Ad girişi içeriğe iniyor. Randevu/Aktivite/Rutin/Havuz taslağı şimdilik eski haliyle kalıyor.
        // Kişisel kart (Not/Randevu/Aktivite) — üçü de kart_tipi='bilgi', kaynak='Kendi'; Not'ta denenen
        // yeni tasarım (sabit başlık etiketi + içerikte Ad alanı + düz/çerçeveli Açıklama + video için hazır
        // alan) beğenilince kullanıcı isteğiyle üçüne de uygulandı.
        const isKisisel = isRit && kTip === 'bilgi' && o.kaynak === 'Kendi';
        // "Aktivite" (2026-09-16, Behnan kararı): eski ayrı Yapılacak/Alışkanlık kavramları tek kullanıcı-görünür
        // isim altında birleşti — kisiselTur içeride hâlâ 'yapilacak' (Bugün/tek seferlik) ile 'aliskanlik'
        // (Tekrarla açık) diye ayrışıyor (davranış/veri hâlâ farklı: kartYapildiToggle vs toggleRit, Süre/Günler
        // paneli vs yok), ama ikisi de aynı "Aktivite" etiketi ve aynı ＋ menü girişinden (yeniTaslakAc('yapilacak'))
        // geliyor — geçiş kartın içindeki "🔁 Tekrarla" anahtarından (bkz. setRitTekrarla). Eski deneysel "Kart"
        // tipi (kart_config.genel, isYeniKart) tamamen kaldırıldı — isKisisel artık onu da (varsa eski kayıtlar)
        // kapsıyor, kart_config.genel bayrağının kendisi kullanılmıyor.
        // "Randevu" ayrı bir tür olmaktan çıktı (2026-09-17, Behnan kararı — Randevu/Aktivite/Not tartışması):
        // artık bir randevu da sadece bir Aktivite — "Cuma 15:00 diş randevusu" gibi bilgiler serbest metin
        // (içerik) olarak yazılıyor, kartın günü (baslangic) yine yapılandırılmış kalıyor ama saat ayrı bir alan
        // değil. Eski kart_config.randevu bayrağı geriye dönük uyumluluk için 'yapilacak' ile birlikte okunuyor
        // (bkz. aşağısı) — eski randevu kayıtları otomatik olarak birer Aktivite gibi davranıyor, veri
        // migration'ı gerekmedi.
        const kisiselTur: 'not' | 'aliskanlik' | 'yapilacak' = o.aliskanlik ? 'aliskanlik' : ((kCfg?.gorev || kCfg?.randevu) ? 'yapilacak' : 'not');
        const kisiselEtiket = (kisiselTur === 'aliskanlik' || kisiselTur === 'yapilacak') ? 'Aktivite' : 'Not';
        const kisiselYeni = (kisiselTur === 'aliskanlik' || kisiselTur === 'yapilacak') ? 'Yeni aktivite' : 'Yeni not';
        // 2026-09-18 (Behnan isteği): önce sadece Not'ta — tüm kimlik içerikten (başlığı da oradan türüyor)
        // geldiği için, açıklama tamamen boşken Kaydet'e basılırsa (kisiselDuzenleKaydet içinde) DB'ye hiç
        // yazılmıyor, kullanıcı odaklanıyor. Aynı gün Aktivite'ye de genelleştirildi ("Not'ta alışıyorlarsa
        // Aktivite'de de yabancılık çekmeyebilir" — Behnan kararı, artık Aktivite'de de ayrı bir Ad alanı yok,
        // kart adı içeriğin ilk satırından türüyor) — o yüzden artık kisiselTur farkı gözetilmiyor, sadece
        // içerik boş mu diye bakılıyor.
        const notBos = !(kCfg?.icerik || '').trim();
        // Kart daha bu an ＋ menüsünden oluşturulduysa (taze) ya da hâlâ taslaksa, "zaten var olan bir kart"
        // için anlamlı mezun et / paylaş seçenekleri gizli kalır (kullanıcı isteği) — hem aşağıdaki genel
        // zamanlama şeridinde hem de kişisel kartın kendi ince başlık şeridinde kullanılıyor.
        const isTaze = isDraft || (!!o.id && taze === o.id);
        // Görüntüleme modu KALKTI (kullanıcı isteği — "artık hiçbir kartta... Kapat, Düzenle butonları
        // olmayacak, doğrudan düzenleme modunda açılacak"): Not/Aktivite artık her zaman düzenlenebilir
        // açılıyor, bu değişken hep false — geri kalan onlarca yerdeki "kisiselGorunumModu ? görüntüle :
        // düzenle" ifadeleri tek satırlık bu değişiklikle otomatik olarak hep "düzenle" dalına düşüyor,
        // tek tek dokunmaya gerek kalmadı. Randevu zaten hiç bu ayrımı kullanmıyordu, değişmedi.
        const kisiselGorunumModu = false;
        // "Vazgeç"/"Kaydet" artık kartı kapatıyor da (eskiden sadece görüntüleme moduna dönüyordu — o mod
        // kalmadığı için artık anlamı yok). Değişiklikler zaten hep yerelde tutuluyor (duzenleModu useEffect'te
        // bu tipler için hep zorunlu true — bkz. yukarısı), o yüzden Vazgeç'in ayrıca bir şey geri yazmasına
        // gerek yok, veritabanına hiç yazılmamıştı zaten.
        const kisiselDuzenleVazgec = () => { setZamanOpen(false); closeDetay(); };
        const kisiselDuzenleKaydet = async () => {
          if (!client || !o.id) { setZamanOpen(false); closeDetay(); return; }
          // 2026-09-18 (Behnan isteği): Kaydet artık her zaman enabled — eskiden notBos ile disabled kalıyordu,
          // artık burada kontrol edip boşsa yazmadan dönüyoruz ve içerik kutusuna odaklanmasını istiyoruz.
          if (notBos) { setNotOdakAcik(true); return; }
          // Kaydetmeden hemen önce son bir kez uyumluluk kontrolü — bkz. taslakKaydet'teki aynı satır ve
          // pencereyiGunlereUydur'ün başındaki not. o.baslangic yoksa (teorik olarak olmamalı) dokunmadan geçiyoruz.
          const gunlerSon = o.gunler || null;
          const { baslangic: basSon, bitis: bitSon } = o.baslangic
            ? pencereyiGunlereUydur(o.baslangic, o.bitis ?? null, gunlerSon)
            : { baslangic: o.baslangic || null, bitis: o.bitis ?? null };
          await supabase.from('dog_rituals').update({
            ad: (o.ad || '').trim() || kisiselYeni,
            kart_config: o.kart_config || {},
            baslangic: basSon,
            bitis: bitSon,
            gunler: gunlerSon,
            hatirlatma_saat: o.hatirlatma_saat || null,
            son_bildirim: o.son_bildirim ?? null,
            aliskanlik: !!o.aliskanlik,
          }).eq('id', o.id);
          loadData(client.id);
          setZamanOpen(false);
          closeDetay();
        };
        // Taslak (yeni oluşturma, henüz kaydedilmemiş) formu zaten dışarı/× ile kapanmıyordu (bkz. aşağısı) —
        // kayıtlı bir kartı düzenlerken de aynı sebepten (yanlışlıkla dışarı dokunup değişiklikleri kaybetme
        // riski) aynı kilit uygulanıyor; artık görüntüleme modu kalmadığı için bu kilit Not/Aktivite'de
        // her zaman geçerli (yalnızca × yerine Vazgeç/Kaydet ile kapanır).
        const kilitliForm = isDraft || isKisisel;
        return (
        // Taslak (henüz kaydedilmemiş, ＋'dan yeni açılmış "İlk ekle") YA DA kayıtlı bir kişisel kartı düzenleme
        // modundayken (kilitliForm) form gerçek bir modal gibi davranıyor: dışarı dokununca ya da üstteki
        // tutamaç/× ile kapanmıyor — kullanıcı isteği: yanlışlıkla dışarı dokunup girilen/değişen bilgiyi
        // kaybetmesin. Kapanış sadece en alttaki buton çiftinden oluyor (Vazgeç/Kaydet taslakta, kayıtlı bir
        // kartı düzenlerken de Vazgeç/Kaydet — bkz. aşağısı). Görüntüleme modunda ve kişisel olmayan/Randevu
        // kartlarında eski davranış (dışarı/×/tutamaç ile kapanma) aynen sürüyor.
        <div className="modal full" onMouseDown={() => { if (!kilitliForm) closeDetay(); }}>
          {/* Not: yapışkan not hissi versin diye tek, sabit bir sarı zemin (kullanıcı isteği — "sarı zeminli
              bir kart... birkaç rengi olabilir" dedik ama şimdilik tek renkle başlıyoruz). */}
          <div className="sheet fullsheet" onMouseDown={(e) => e.stopPropagation()} style={{ ...(stilP ? { borderTop: '4px solid ' + stilP.ac } : undefined), ...(isKisisel && kisiselTur === 'not' ? { background: '#fdf6d3' } : undefined) }}>
            {!kilitliForm && <div className="sheetgrip" onClick={() => closeDetay()} />}
            {!kilitliForm && <button className="x" onClick={() => closeDetay()}>×</button>}
            {isRit ? (
              isKisisel ? (
                // İnce başlık şeridi: sabit etiket (gerçek "başlık" artık aşağıdaki Ad alanı) + sağda ↪️
                // (Alışkanlık'ta ayrıca 🎓) — Zamanlama (🗓️) ve Bildirim (🔔) artık burada değil, gövdede kendi
                // şeritleri var (kullanıcı isteği: Ad, Açıklama, Video, Zamanlama, Bildirim aynı sırada, tek
                // tasarım). Randevu şimdilik eski haliyle (🔔 burada) kalıyor — henüz ele alınmadı.
                // Sağda 34px boşluk (paddingRight) bırakılıyor ki ikonlar köşedeki ✕ (mutlak konumlu) ile çakışmasın.
                // Alışkanlık'ta şerit ayrıca biraz daha yüksek ve koyu bir zeminle (var(--line)) öne çıkıyor,
                // sheet'in üst köşe yuvarlaklığıyla aynı hizada kenardan kenara uzanıyor (kullanıcı isteği:
                // "biraz daha yüksek bir şerit ve biraz koyu bir arkaplan rengi ile daha hoş olabilir mi").
                // Randevu artık da Vazgeç/Kaydet mantığında (kullanıcı isteği: "öncelikle randevuyu da
                // Vazgeç,Kaydet mantığına getirelim") — kilitliForm burada da true olduğu için grip/✕ hiç
                // render edilmiyor, o yüzden Alışkanlık/Yapılacak'la aynı kenardan kenara şeridi kullanabiliyor
                // (eski "sıkışık, ✕'i ezmesin" kısıtlaması artık geçerli değil).
                // Not'ta da aynı şerit var ama zemin griye çalan bir sarı (kullanıcı isteği) — sheet'in kendi
                // parlak sarısından (#fdf6d3) ayrışsın diye biraz daha koyu/mat bir ton.
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 34, marginTop: -8, ...(kisiselTur === 'not' ? { background: '#e3dba9', margin: '-16px -16px 12px', padding: '14px 34px 14px 16px', borderRadius: '18px 18px 0 0' } : { background: 'var(--line)', margin: '-16px -16px 12px', padding: '14px 34px 14px 16px', borderRadius: '18px 18px 0 0' }) }}>
                  {/* Not'ta "yaptım" tiki yok (kullanıcı isteği — tablo: "Tamamlanma: Yok, checkbox bile yok"),
                      bir yapışkan not tamamlanacak bir şey değil, sadece silininceye kadar duran bir bilgi.
                      Alışkanlık'ta da detay formundan kalktı (kullanıcı isteği: "en azından alışkanlık için
                      olmasın") — listedeki günlük "yaptım" tiki (RitItem, haftalık ilerleme çubuklarıyla
                      birlikte) hâlâ duruyor, bu sadece detay ekranından kalkıyor. */}
                  {/* Yapılacak'ta tik kalıcı bir kapanış (kartYapildiToggle — bkz. Kart'ın aynı gorev mantığı),
                      alışkanlıktaki gibi günlük bir kayıt değil (kullanıcı isteği: "done kutucuklu olan"). */}
                  {!isDraft && kisiselTur !== 'not' && kisiselTur !== 'aliskanlik' && <div className={'chk' + (ritDone(o.id) ? ' on' : '')} onClick={() => (kisiselTur === 'yapilacak' ? kartYapildiToggle(o) : toggleRit(o.id))} title="Yaptım">{ritDone(o.id) ? '✓' : ''}</div>}
                  <div style={{ flex: 1, fontSize: 11.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{isDraft ? kisiselYeni : (duzenleModu ? kisiselEtiket + ' Düzenle' : kisiselEtiket)}</div>
                  {/* Kişisel Aktivite'deki "🎓 Alışkanlık seçenekleri" başlık ikonu (2026-09-17, Behnan kararı)
                      TAMAMEN KALDIRILDI — hem gereksizdi hem hatalıydı. Gereksiz: menüdeki "⭐ Puanla" zaten
                      kart listesindeki "⋯" (ritMenuFor) menüsünde her kişisel kart için var; "🔁 Tekrarla"nın
                      kendisi zaten tekrarı kapatmanın doğru yolu. Hatalı: menüdeki "↩️ Alışkanlıktan çıkar"
                      (setRitAliskanlik(id,false)) sadece aliskanlik:false yazıyor, kart_config.gorev/bitis'e HİÇ
                      dokunmuyordu — Tekrarla'nın kapatma yolunun aksine (setRitTekrarla: gorev:true+bitis=
                      baslangic) — sonuç: kisiselTur türetmesinde (aliskanlik? 'aliskanlik' : (gorev? 'yapilacak'
                      : 'not')) hem aliskanlik hem gorev false kalınca kart SESSİZCE 'not'a dönüşüyordu. habitMenuFor
                      modalinin kendisi VE bu ikonun kişisel-OLMAYAN (Meridyen/program kaynaklı ritüel, isKisisel
                      false) eşleniği (bkz. aşağısı, isRit && !isKisisel bloğu) BİLEREK dokunulmadı — o ayrı bir
                      bağlam, orada Tekrarla kavramı hiç yok, 🎓 hâlâ tek alışkanlık-aç/kapa + Puanla erişimi. */}
                  {/* "🔁 Tekrarla" başlık ikonu KALDIRILDI (2026-09-17, Behnan kararı — "Tekrarla'nın yeri"):
                      aynı işlev artık aşağıdaki Süre şeridine taşındı — Süre "1 gün" iken kart Bugün/tek seferlik
                      (kisiselTur='yapilacak'), sayı 1'den büyüğe çıkınca kart kendiliğinden tekrarlanan hâle geçiyor
                      (kisiselTur='aliskanlik') — bkz. aşağısı, "🗓️ Süre" satırı, setRitTekrarla hâlâ aynı iki
                      alanı (aliskanlik + kart_config.gorev + bitis) tutarlı şekilde ayarlamak için kullanılıyor,
                      sadece artık tek bir buton yerine Süre alanının kendisinden tetikleniyor. */}
                  {/* Alışkanlık/Aktivite'nin tarihi eskiden burada (başlık şeridinde) küçük bir native tarih
                      seçiciydi — "Tarih + süreli" tasarımı sonrası (2026-09-17, Behnan kararı: "biz süre 1 gün
                      satırı yerine, başlıktaki tarihi koysak") AŞAĞIDAKİ Süre şeridine taşındı (aynı ritTasi
                      çağrısı, sadece Süre/gün sayısının hemen yanında — ikisi artık aynı satırda birlikte
                      düzenleniyor). Burada ayrıca göstermek çift/ikinci bir tarih seçici olurdu, kaldırıldı. */}
                  {/* Not'ta tarih seçimi/rozeti YOK (bu bir yanlış anlamaydı — Not zaten tarihsiz, "silininceye
                      kadar duran" bir yapışkan not; kullanıcı isteği "tarih seçimi öyle mi konuşmuştuk"
                      sonrası kaldırıldı). baslangic hâlâ dahili olarak var (Ayraç mantığıyla "hangi günden
                      itibaren görünsün" için) ama kullanıcıya hiç gösterilmiyor/değiştirilmiyor. */}
                  {/* Bu şeritteki ayrı ↪️ Paylaş ikonu kaldırıldı (2026-09-17, Randevu birleşmesi) — eskiden
                      sadece Randevu'da vardı, Randevu tür olarak kalkınca gereksizleşti; Paylaş zaten liste
                      satırının "⋯" menüsünde (ritMenuFor) tüm kişisel kartlarda duruyor. */}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {kTip === 'bilgi' && !isDraft && <div className={'chk' + (ritDone(o.id) ? ' on' : '')} onClick={() => toggleRit(o.id)} title="Yaptım">{ritDone(o.id) ? '✓' : ''}</div>}
                  <input className="detbaslik" value={adInput} autoFocus={isDraft} onFocus={(e) => e.target.select()} onChange={(e) => setAdInput(e.target.value)} onBlur={() => { if (adInput.trim() && adInput.trim() !== (o.ad || '')) setRitAd(o.id, adInput); }} style={{ flex: 1 }} />
                </div>
              )
            ) : isDraft ? (
              // Havuz taslağı: başlık de Ajanda taslağı gibi düzenlenebilir, ama kaydı yok (id yok) — sadece
              // yerel taslağı (patchDetay) güncelliyor, taslakKaydet basılınca gerçek satıra yazılıyor.
              <input className="detbaslik" value={adInput} autoFocus onFocus={(e) => e.target.select()} onChange={(e) => setAdInput(e.target.value)} onBlur={() => { if (adInput.trim() && adInput.trim() !== (o.ad || '')) patchDetay({ ad: adInput.trim() }); }} style={{ width: '100%' }} />
            ) : <h2 style={{ paddingRight: 34 }}>{o.ad}</h2>}
            {/* Not'ta zaten ayrı bir Ad alanı yoktu (kullanıcı isteği, 2026-09-17: "başlık ve açıklamanın teke
                düşmesi"). 2026-09-18 (Behnan kararı — "deneyip görelim, kullanıcılar Not'ta alıştıysa
                Aktivite'de de yabancılık çekmeyebilir"): Aktivite/Yapılacak için de kaldırıldı — artık HİÇBİR
                kişisel kart türünde ayrı bir Ad girişi yok, kart adı hep aşağıdaki içerik kutusunun ilk
                satırından türüyor (bkz. BilgiKartEdit'teki icerikBaslikTuret + baslikKaynagi). `ad` kolonu
                tabloda aynen duruyor — kaldırılan sadece bu formdaki AYRI giriş alanı; bu değişiklikten önce
                oluşturulmuş, içeriği hiç olmayan eski kartların gerçek adı da BilgiKartEdit açılışında
                otomatik olarak içerik kutusunun ilk satırına taşınıyor (baslikKaynagi), yani hiçbir isim
                kaybolmuyor, sadece artık başka bir alanda görünüyor. `adInput`/`setRitAd` altyapısı kişisel-
                OLMAYAN ritüellerin (Meridyen/program kaynaklı) kendi başlık şeridinde hâlâ kullanılıyor. */}
            <div className="m">
              {isRit ? null : (
                personal ? (
                  <span style={{ cursor: 'pointer' }} onClick={() => { setGrupEditVal(personalGroupOf(o)); setGrupEditAltVal(o.alt_grup || ''); setGrupEditOpen(true); }}>{personalGroupOf(o)}{o.alt_grup ? ' › ' + o.alt_grup : ''} · değiştir ✎</span>
                ) : (o.grup || '')
              )}
              {act?.kanit_duzeyi && <span className="evi">kanıt: {act.kanit_duzeyi}</span>}
            </div>
            {!isRit && personal && grupEditOpen && (
              <div style={{ margin: '2px 0 10px' }}>
                {personalGroups.length > 0 && <div style={{ margin: '0 0 6px' }}>{personalGroups.map((g) => <span key={g} className={'chip' + (grupEditVal === g ? ' on' : '')} onClick={() => { setGrupEditVal(g); setGrupEditAltVal(''); }}>{g}</span>)}</div>}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={grupEditVal} onChange={(e) => setGrupEditVal(e.target.value)} placeholder="yeni grup için yaz" style={{ flex: 1 }} />
                </div>
                {/* Alt grup — sadece seçili Grup'un kayıtlı alt grupları varsa gösteriliyor; serbest metin de yazılabilir. */}
                {altGruplarOf(grupEditVal).length > 0 && (
                  <div style={{ margin: '6px 0' }}>
                    <div className="note" style={{ margin: '0 0 4px' }}>Alt grup (ops.)</div>
                    <span className={'chip' + (!grupEditAltVal ? ' on' : '')} onClick={() => setGrupEditAltVal('')}>Yok</span>
                    {altGruplarOf(grupEditVal).map((ag) => <span key={ag} className={'chip' + (grupEditAltVal === ag ? ' on' : '')} onClick={() => setGrupEditAltVal(ag)}>{ag}</span>)}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button className="btn sm" onClick={() => setAktGrup(o.id, grupEditVal, grupEditAltVal)}>Kaydet</button>
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

            {isRit && !isKisisel && (() => {
              // Bu genel zamanlama/mezun/bildirim/paylaş şeridi artık yalnızca kişisel OLMAYAN ritüellerde
              // (Meridyen/program kaynaklı vb.) gösteriliyor — kişisel kartların (Not/Randevu/Aktivite) hepsi
              // kendi ince başlık şeridini kullanıyor (Aktivite'de 🗓️/🔁, Tekrarla açıkken ayrıca 🎓 dahil,
              // bkz. yukarısı).
              return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, margin: '2px 0 10px' }}>
                <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
                  <button className="btn ghost sm" onClick={() => setZamanOpen(true)} title={gunOzet} aria-label="Zamanlama">🗓️</button>
                  {!isTaze && !o.mezun && (o.aliskanlik ? (
                    <button className="btn ghost sm" onClick={() => setHabitMenuFor(o)} title="Alışkanlık seçenekleri" aria-label="Alışkanlık seçenekleri">🎓</button>
                  ) : (
                    <button className="btn ghost sm" style={{ opacity: .4 }} onClick={() => setRitAliskanlik(o.id, true)} title="Alışkanlık yap" aria-label="Alışkanlık yap">🎓</button>
                  ))}
                  {o.hatirlatma_saat ? (
                    <button className="btn ghost sm" onClick={() => { setRemInput(o.hatirlatma_saat || ''); setRemTarihInput(kCfg?.hatirlatma_tarih || o.baslangic || ''); setRemMenuFor({ ...o, _randevu: kTip === 'randevu' || !!kCfg?.randevu }); }} title="Bildirim seçenekleri" aria-label="Bildirim seçenekleri">🔔 {o.hatirlatma_saat}</button>
                  ) : (
                    <button className="btn ghost sm" style={{ opacity: .4 }} onClick={() => { setRemInput(kCfg?.saat || ''); setRemTarihInput(kCfg?.hatirlatma_tarih || o.baslangic || ''); setRemMenuFor({ ...o, _randevu: kTip === 'randevu' || !!kCfg?.randevu }); }} title="Bildirim ekle" aria-label="Bildirim ekle">🔔</button>
                  )}
                  {!paylasilamaz && !isTaze && <button className="btn ghost sm" onClick={() => { setPaylasOpen(true); setKMsg(''); }} title="Paylaş" aria-label="Paylaş">↪️</button>}
                </div>
              </div>
              );
            })()}
            {/* Ayrı "Randevu ne zaman" (tarih+saat) bloğu kaldırıldı (2026-09-17, Randevu birleşmesi, Behnan
                kararı: "randevu diye bir şey yok, o da aktivite... saat 15 diş randevu diye açıklama yazdım,
                bildirimimi de ayrı bir saate ayarladım"). Kartın günü (baslangic) hâlâ yapılandırılmış — yukarıdaki
                ince başlık şeridindeki tarih seçiciyle (Aktivite'de zaten var) yönetiliyor; saat artık ayrı bir
                alan değil, içeriğe serbest metin olarak yazılıyor ("Cuma saat 15…"). Bildirim (ne zaman haber
                verileceği) tamamen ayrı ve bağımsız — aşağıdaki standart Bildirim şeridinden (🔔) ayarlanıyor,
                tarihi de saati de kartın kendi gününden bağımsız seçilebiliyor (bkz. aşağısı, kisiselTur==='yapilacak'
                dalı) — tam da bu ihtiyacı zaten karşılıyordu, ek bir şey gerekmedi. */}
            {/* Inbox önizlemesinde randevu tarihi/saati salt okunur gösterilir — kayıt henüz yok, düzenlenemez.
                Havuz'da bu alan yok (Havuz aktivitelerinde baslangic/bitis kavramı hiç yok), o yüzden preview'a özel. */}
            {preview && kTip === 'bilgi' && !!kCfg?.randevu && (o.baslangic || kCfg?.saat) && (
              <div className="kv" style={{ margin: '4px 0 10px' }}>
                <div className="k">📅 Randevu ne zaman</div>
                <div className="note" style={{ marginTop: 0 }}>{o.baslangic ? kisaTarih(o.baslangic) : ''}{kCfg?.saat ? ' · 🕑 ' + kCfg.saat : ''}</div>
              </div>
            )}
            {isRit && kTip === 'standart' && kCfg?.resim && <img src={kCfg.resim} alt="" style={{ maxWidth: '100%', borderRadius: 8, margin: '4px 0 8px', display: 'block' }} />}
            {/* Havuz'da Alışkanlık taslağı için "hangi günler" burada, doğrudan taslak ekranında seçiliyor —
                Ajanda'daki gibi ayrı bir Zamanlama panosu yok, çünkü Havuz'un baslangic/bitis/Süre kavramı hiç
                yok (dog_activities'te bu kolonlar mevcut değil), tek geçerli alan Günler. setRitGunler zaten
                id yokken sadece yerel taslağı yamalıyor (bkz. o fonksiyon) — tablo farkı önemli değil. */}
            {!isRit && isDraft && kTip === 'bilgi' && !!o.aliskanlik && (
              <div className="kv" style={{ margin: '4px 0 10px' }}>
                <div className="k">Hangi günler?</div>
                <div>
                  <span className={'chip' + ((!o.gunler || o.gunler.length === 0) ? ' on' : '')} onClick={() => setRitGunler(o.id, [])}>Her gün</span>
                  {GUNLER.map(([n, l]) => {
                    const sel = !!(o.gunler && o.gunler.includes(n));
                    return <span key={n} className={'chip' + (sel ? ' on' : '')} onClick={() => { const cur: number[] = o.gunler ? [...o.gunler] : []; const nx = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]; setRitGunler(o.id, nx); }}>{l}</span>;
                  })}
                </div>
              </div>
            )}
            {/* Kişisel bilgi kartları (Not/Randevu/Alışkanlık) Ajanda'da (kaynak='Kendi') ve Havuz taslağında
                (henüz kaydedilmemiş, ＋'dan yeni açılmış) tam düzenlenebilir açılıyor; kaydedilmiş Havuz
                kartlarında ve Inbox önizlemesinde henüz düzenleme akışı yok, salt okunur gösteriliyor —
                böylece Ajandama eklemeden kart orada da (Havuz'da olduğu gibi) açılabiliyor. */}
            {kTip === 'bilgi' && (() => {
              const editable = !preview && (isRit ? o.kaynak === 'Kendi' : isDraft);
              // cokluVideo artık Not'ta da Aktivite'nin her iki hâlinde de (Bugün/Tekrarla, yani
              // 'yapilacak'/'aliskanlik') açık — Not'un kendi ayrı tekli video mekanizması kaldırıldı, hepsi
              // aynı çoklu-video şeridini + sayfa seviyesindeki "🎬 Video" tetikleyicisini paylaşıyor
              // (kullanıcı isteği, 2026-09-17: "önce not'u aktivite de olduğu şekilde video eklenecek hale getirelim").
              // randevu prop'u artık hiç geçilmiyor (Randevu birleşmesi) — eski randevu-bayraklı kayıtlar da dahil
              // hepsi standart içerik/video tasarımından geçiyor, ayrı "yer" alanı yok.
              if (editable) return <BilgiKartEdit cfg={kCfg} onSave={bilgiKaydet} notTasarimi={isKisisel} readOnly={kisiselGorunumModu} cokluVideo={isKisisel && (kisiselTur === 'aliskanlik' || kisiselTur === 'yapilacak' || kisiselTur === 'not')} videoEkleTetik={videoEkleAcik} onVideoEkleTetikKapat={() => setVideoEkleAcik(false)} videoYok={false} ekAyri={isKisisel} icerikBaslikTuret={isKisisel} onIcerikBaslikTuret={(ilkSatir) => setRitAd(o.id, ilkSatir)} baslikKaynagi={isKisisel ? o.ad : undefined} icerikOdakTetik={notOdakAcik} onIcerikOdakTetikKapat={() => setNotOdakAcik(false)} />;
              if (!preview && isRit) return <BilgiKart cfg={kCfg} onSave={bilgiKaydet} />;
              return <BilgiKartEdit cfg={kCfg} onSave={() => {}} readOnly />;
            })()}
            {/* "🔋 Alan" etiketleme çipi KALDIRILDI (2026-09-16, Behnan kararı) — bu, sabit 4 değerli eski
                "kişisel pil" sözlüğüydü (PIL_ALAN: hareket/beslenme/meşgale/sosyal), asıl amacı Ajanda'nın gün
                görünümünde bir "alan pilleri" şeridi beslemekti; o şerit zaten daha önce kaldırılmıştı (bkz.
                Gelişim sadeleştirme notu) — yani bu çip artık HİÇBİR aktif göstergeyi beslemiyordu, sadece liste
                satırında kozmetik bir "🔋 etiket" rozetine (bkz. RitItem) dönüşüyordu. Ayrıca yeni Meridyen
                "Alanlar" mimarisiyle (13+ büyüyebilen alan) karışmasın diye de ayrı tutulması gerekiyordu, ama
                sabit 4 chip'lik bir seçici zaten o büyüklükte bir listeye uygun değildi. Veri tarafına
                DOKUNULMADI: PIL_ALAN/PIL_ALAN_SIRA sabitleri ve RitItem'daki salt-okunur "🔋 etiket" rozeti
                duruyor — daha önce etiketlenmiş kartlar rozetini kaybetmiyor, sadece yeni/değiştirme
                girişi kalktı. İleride gerçekten gerekirse, chip yerine Meridyen'in kendi alan listesinden
                beslenen bir seçici (arama/otomatik-tamamlama gibi) düşünülebilir. */}
            {/* Zamanlama + Bildirim şeritleri — Ad/Açıklama/Video'nun altında, tek düzenleme iskeletinin son iki
                parçası (kullanıcı isteği: "altında zamanlama şeridi, onun altında bildirim şeridi olsun").
                Randevu'nun kendi tarih/saati hâlâ yukarıdaki ayrı "Randevu ne zaman" bloğunda (henüz ele
                alınmadı) ama bildirimi artık burada, diğer kartlarla aynı standart şeritte (kullanıcı isteği:
                "bildirimin yerini standart yapacağız, randevuda da aynen gövdede olacak"). Not'ta şerit
                doğrudan bir tarih alanı (taşıma buradan olur); Alışkanlık'ta ise Süre/Günler de barındıran
                Zamanlama panosunu açan bir özet satırı — bkz. yukarısı "Hangi güne taşı" notu. */}
            {isRit && isKisisel && (
              <div style={{ margin: '0 0 8px' }}>
                {/* Not'ta Süre/Günler yok (tarihsiz, silininceye kadar duran bir yapışkan not). Yapılacak/
                    Alışkanlık'ta artık İKİSİ DE Süre'yi gösteriyor (2026-09-17, Behnan kararı — "Tekrarla'nın
                    yeri"): Süre TEK BAŞINA hem gün sayısını hem tekrarlanıp tekrarlanmadığını belirliyor, ayrı
                    bir "🔁 Tekrarla" anahtarına gerek kalmadı (title strip'ten kaldırıldı, bkz. yukarısı). Süre
                    kompakt bir çip olarak duruyor ("Süre 1 gün"), dokununca sayı kutusuna açılıyor (sureAcik);
                    kutudan çıkınca (onBlur) sayı 1'e düşürülürse setRitTekrarla(false) ile Bugün/tek-seferlik
                    hâline (gorev:true, bitis=baslangic), 1'in üzerine çıkarılırsa setRitTekrarla(true) (varsayılan
                    21 günlük pencereyi kurup aliskanlik:true/gorev:false yapıyor) ARDINDAN setRitSure ile o anki
                    (girilenin kendisi) gün sayısına inceltiliyor. Günler/"Her gün" çipi SADECE fiilen tekrarlıyken
                    (kisiselTur==='aliskanlik') anlamlı, o yüzden Süre satırının sağında sadece o zaman görünüyor;
                    basılırsa altında haftanın günleri açılıyor (gunlerAcik) — "2 satırda" tasarım budur. */}
                {kisiselTur !== 'not' && (
                  <div style={{ padding: '7px 8px', borderRadius: 8, background: '#fff', border: '1px solid var(--line)', margin: '0 0 8px' }}>
                    <div className="kv" style={{ marginTop: 0 }}><div className="k">🗓️ Tarih</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {/* "Tarih + süreli" tasarımı (2026-09-17, Behnan kararı): başlangıç artık eski başlık
                            şeridindeki küçük tarih seçicisi yerine doğrudan burada, Süre'nin hemen yanında —
                            ikisi birlikte "ne zaman, ne kadar" sorusunu tek satırda cevaplıyor. Bu tarih SADECE
                            kullanıcı elle değiştirince (ritTasi) yazılıyor; Süre/gün sayısı artık başlangıcı hiç
                            kaydırmıyor, sadece bitişi hesaplıyor (bkz. setRitSure'daki not). Mantık kendiliğinden
                            (Günler'le uyumsuzluk yüzünden) kaydırdığında ise basVurgu ile kısa süreliğine renk
                            değiştiriyor — böylece "sistem senin yerine tarihi değiştirdi" anı gözden kaçmıyor. */}
                        <input
                          type="date" value={o.baslangic || ''}
                          onChange={(e) => e.target.value && ritTasi(o.id, e.target.value)}
                          title="Başlangıç tarihi"
                          style={{
                            width: 'auto', padding: '6px 7px', borderRadius: 6, fontWeight: 400,
                            border: basVurgu ? '1px solid #d98c00' : '1px solid var(--line)',
                            background: basVurgu ? '#fdecc8' : 'transparent',
                            color: basVurgu ? '#8a5300' : 'var(--ink)',
                            transition: 'background .5s ease, border-color .5s ease, color .5s ease',
                          }}
                        />
                        {sureAcik ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="number" min={1} autoFocus value={sureInput}
                              onChange={(e) => setSureInput(e.target.value)}
                              onBlur={() => {
                                const n = Math.max(1, parseInt(sureInput) || 1);
                                // setRitTekrarla kendi içinde sureInput'u ('21'/'1') SENKRONLUYOR (bkz. o
                                // fonksiyondaki not — eskiden ayrı 🔁 butonuna basılınca görüntüyü güncel
                                // tutmak içindi). Burada onu bir yardımcı olarak çağırdığımız için, girilen
                                // gerçek sayı (n) yerine o senkron '21' kalabiliyordu (Behnan'ın bulduğu bug:
                                // "4 dedim, 21 gösterdi") — setSureInput(n) bu yüzden setRitTekrarla/setRitSure
                                // çağrılarından SONRA, en son adım olarak yapılıyor ki her zaman son söz gerçek
                                // girilen sayıda kalsın.
                                if (n <= 1) { if (kisiselTur === 'aliskanlik') setRitTekrarla(o.id, false); }
                                else { if (kisiselTur === 'yapilacak') setRitTekrarla(o.id, true); setRitSure(o.id, n); }
                                setSureInput(String(n));
                                setSureAcik(false);
                              }}
                              style={{ width: 58, padding: '7px 8px' }}
                            /> gün
                          </span>
                        ) : (
                          <span className="chip" onClick={() => setSureAcik(true)}>{sureInput || '1'} gün</span>
                        )}
                        {/* Tek günlük kartta (bitis===baslangic) ayrı bir "bitiş" notu göstermek gereksiz —
                            tarih zaten solda tek başına görünüyor (Behnan isteği: "tek günse bitişi yazmasın"). */}
                        {o.bitis && o.bitis !== o.baslangic && <span className="note" style={{ marginTop: 0 }}>bitiş {kisaTarih(o.bitis)}</span>}
                        {kisiselTur === 'aliskanlik' && (
                          <span className={'chip' + ((!o.gunler || o.gunler.length === 0) ? ' on' : '')} style={{ marginLeft: 'auto' }} onClick={() => { setRitGunler(o.id, []); setGunlerAcik((v) => !v); }}>Her gün</span>
                        )}
                      </div>
                    </div>
                    {kisiselTur === 'aliskanlik' && gunlerAcik && (
                      <div className="kv"><div className="k">Günler</div>
                        <div>
                          {GUNLER.map(([n, l]) => {
                            const sel = !!(o.gunler && o.gunler.includes(n));
                            return <span key={n} className={'chip' + (sel ? ' on' : '')} onClick={() => { const cur: number[] = o.gunler ? [...o.gunler] : []; const nx = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]; setRitGunler(o.id, nx); }}>{l}</span>;
                          })}
                          {/* Birden fazla günü ardışık işaretlerken her tık'ta erken/kısmi bir kaydırma
                              olmasın diye (bkz. setRitGunler'daki not) uyumluluk kontrolü artık burada, seçimi
                              bitirince bilinçli olarak tetikleniyor. Basılmazsa da Kaydet anındaki güvenlik ağı
                              zaten aynı düzeltmeyi tek seferde yapıyor — bu sadece erken/görünür geri bildirim. */}
                          <span className="chip" style={{ fontWeight: 700 }} onClick={() => gunlerTamamla(o.id)}>✓ Tamam</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* Bildirim şeridi: düzenleme modunda artık ayrı bir modal AÇMIYOR, hatta ayrı bir "aç/kapa"
                    adımı bile yok — saat alanı doğrudan şeridin üzerinde (kullanıcı isteği: "fazladan bir modal
                    çıkmasına gerek yok", "belki şerit üzerinde de halledebiliriz"). setRitReminder zaten
                    duzenleModu'da sadece yerelde tutuyor, o yüzden ayrı bir Kaydet/Vazgeç gerekmiyor — asıl
                    kaydetme kartın kendi Kaydet'inde. */}
                {(!kisiselGorunumModu || o.hatirlatma_saat || ekUrl) && (
                  <div style={{ padding: '7px 10px', borderRadius: 8, background: 'var(--card2,#f6f4ee)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>🔔</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      {/* Alışkanlık/Not: bildirim günlük tekrarlayan — sadece saat, tarih kavramı yok (kullanıcı
                          isteği: "Alışkanlık için bu hatırlatma şekli doğru", "Not için ... yine alışkanlıkta
                          olduğu gibi"). Yapılacak (eski Randevu dahil): bildirim o tarih+saatte BİR KERE gelmeli
                          (kullanıcı isteği: "bir tarih alanı koymak ve o tarih ve saatte bir kere bildirim
                          göndermesini sağlamalıyız") — bunun için kart_config.hatirlatma_tarih zaten vardı (cron
                          bunu görünce günlük pencere yerine sadece o günü kullanıyor, bkz.
                          app/api/cron/reminders/route.ts). Tarih alanı varsayılan olarak kartın kendi tarihini
                          (o.baslangic) alıyor, isterseniz değiştirebilirsiniz — Randevu birleşmesiyle (2026-09-17)
                          bu zaten "içeriğe 'Cuma 15:00' yaz, bildirimi ayrı bir saate/güne kur" ihtiyacını tam
                          karşılıyor, ek bir şey gerekmedi. */}
                      {kisiselGorunumModu ? (
                        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{o.hatirlatma_saat}</span>
                      ) : kisiselTur === 'yapilacak' ? (
                        <>
                          <input type="time" value={o.hatirlatma_saat || ''} onChange={(e) => setRandevuBildirim(o.id, e.target.value, o.kart_config?.hatirlatma_tarih || o.baslangic || '')} style={{ width: 'auto', fontSize: 13 }} />
                          {o.hatirlatma_saat && <input type="date" min={today} value={o.kart_config?.hatirlatma_tarih || o.baslangic || ''} onChange={(e) => setRandevuBildirim(o.id, o.hatirlatma_saat, e.target.value)} title="Bildirim tarihi" style={{ width: 'auto', fontSize: 13 }} />}
                          {o.hatirlatma_saat && <span className="chip" style={{ borderStyle: 'dashed' }} onClick={() => setRandevuBildirim(o.id, '', '')}>Kaldır</span>}
                        </>
                      ) : (
                        <>
                          <input type="time" value={o.hatirlatma_saat || ''} onChange={(e) => setRitReminder(o.id, e.target.value)} style={{ width: 'auto', fontSize: 13 }} />
                          {o.hatirlatma_saat && <span className="chip" style={{ borderStyle: 'dashed' }} onClick={() => setRitReminder(o.id, '')}>Kaldır</span>}
                        </>
                      )}
                    </div>
                    {/* "🎬 Video" — Aktivite'nin her iki hâlinde de (Bugün/Tekrarla) VE Not'ta, Ek'in hemen
                        solunda (kullanıcı isteği, 2026-09-16: video ekleme artık açıklamanın altındaki tek
                        satırlık link kutusundan değil, buradan — tıklayınca BilgiKartEdit'in kendi ekleme
                        modalini açan tek atımlık videoEkleAcik bayrağı; 2026-09-17: Not da aynı mekanizmaya
                        katıldı). İlk video da, ikinci/üçüncü video da hep bu düğmeden eklenir; videonun üstündeki
                        şerit (bkz. BilgiKartEdit içindeki cokluVideo dalı) artık sadece video seçimi + ⚙️ Ayarla
                        taşıyor. */}
                    {!kisiselGorunumModu && (kisiselTur === 'aliskanlik' || kisiselTur === 'yapilacak' || kisiselTur === 'not') && (
                      <span className="chip" style={{ borderStyle: 'dashed', flex: '0 0 auto' }} onClick={() => setVideoEkleAcik(true)} title="Video ekle">🎬 Video</span>
                    )}
                    {/* Ek (attachment) — Bildirim'le aynı satırda, tek dosya (kullanıcı isteği). Şimdilik yine
                        fotoğrafla sınırlı ("her türlü dosya"ya genişletmek ayrı bir backend adımı olarak
                        bırakıldı). Randevu'nun eski büyük foto ızgarasının (resimGridJsx) yerini de bu tek
                        satır alıyor. Sadece ikon pek belli olmuyordu (kullanıcı geri bildirimi) — yanına kısa
                        bir "Ek" etiketi eklendi. */}
                    {ekUrl ? (
                      <>
                        <div style={{ position: 'relative', width: 28, height: 28, borderRadius: 6, overflow: 'hidden', flex: '0 0 auto', border: '1px solid var(--line)', cursor: 'zoom-in' }} onClick={() => setEkBuyuk(true)} title="Büyütmek için tıkla">
                          <img src={ekUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        </div>
                        {!kisiselGorunumModu && <button type="button" onClick={ekSil} title="Kaldır" style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, color: 'var(--muted)', cursor: 'pointer', opacity: .6, flex: '0 0 auto' }}>✕</button>}
                      </>
                    ) : !kisiselGorunumModu ? (
                      <span className="chip" style={{ borderStyle: 'dashed', flex: '0 0 auto' }} onClick={() => { if (!ekYukleniyor) ekInputRef.current?.click(); }} title="Ek ekle">
                        {ekYukleniyor ? '…' : '📎 Ek'}
                      </span>
                    ) : null}
                    {!kisiselGorunumModu && <input ref={ekInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={ekYukle} />}
                  </div>
                )}
                {ekHata && <div className="note" style={{ color: 'var(--red)', marginTop: 2 }}>{ekHata}</div>}
                {ekBuyuk && ekUrl && (
                  <div className="modal" style={{ alignItems: 'center' }} onMouseDown={() => setEkBuyuk(false)}>
                    <img src={ekUrl} alt="" style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 10, display: 'block' }} />
                  </div>
                )}
              </div>
            )}
            {/* Kayıtlı kişisel kartlarda (Not/Aktivite/Randevu) artık tek hâl: doğrudan düzenleme modunda
                açılıyor, bu yüzden buton çifti hep Vazgeç/Kaydet — ayrı bir Kapat/Düzenle görüntüleme adımı
                kalmadı (kullanıcı isteği: "artık hiçbir kartta... doğrudan düzenleme modunda açılacak", ve
                Randevu için de sonradan: "öncelikle randevuyu da Vazgeç,Kaydet mantığına getirelim"). */}
            {isRit && isKisisel && !isTaze && (
              <div style={{ display: 'flex', gap: 8, margin: '2px 0 8px' }}>
                <button className="btn ghost" style={{ flex: 1 }} onClick={kisiselDuzenleVazgec}>Vazgeç</button>
                <button className="btn" style={{ flex: 1 }} onClick={kisiselDuzenleKaydet}>Kaydet</button>
              </div>
            )}
            {isDraft && (
              <div style={{ display: 'flex', gap: 8, margin: '2px 0 8px' }}>
                <button className="btn ghost" style={{ flex: 1 }} onClick={closeDetay}>Vazgeç</button>
                <button className="btn" style={{ flex: 1 }} onClick={taslakKaydet}>Kaydet</button>
              </div>
            )}
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

            {isRit && o.kaynak !== 'Kendi' && (
              <div style={{ margin: '4px 0 8px' }}>
                <textarea value={kisiselNotInput} onChange={(e) => setKisiselNotInput(e.target.value)} onBlur={() => { if (kisiselNotInput.trim() !== (o.kisisel_not || '')) setRitKisiselNot(o.id, kisiselNotInput); }} placeholder="✎ Kendi notun (isteğe bağlı — şablon güncellense de bu değişmez)" style={{ width: '100%', minHeight: 36 }} />
              </div>
            )}

            {isRit && !noDone && kTip !== 'bilgi' && (
              <button className={'btn' + (ritDone(o.id) ? ' ghost' : '')} style={{ width: '100%', margin: '2px 0 8px' }} onClick={() => toggleRit(o.id)}>{ritDone(o.id) ? '✓ Yaptım — geri al' : '✓ Yaptım'}</button>
            )}

            {/* Bu modal artık SADECE kişisel olmayan ritüellerde (Meridyen/program vb.) açılıyor — Not kendi
                gövdesinde doğrudan bir tarih alanı kullanıyor, Aktivite de artık kendi Zamanlama şeridinin
                altında aynı içeriği (Taşı/Süre/Günler) modal açmadan gösteriyor (bkz. yukarısı, kullanıcı
                isteği: "zamanlama için de benzer şekilde düzenleyelim"). */}
            {isRit && !isKisisel && zamanOpen && (
              <div className="modal top2" onMouseDown={() => setZamanOpen(false)}>
              <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
                <button className="x" onClick={() => setZamanOpen(false)}>×</button>
                <h3 style={{ marginBottom: 6 }}>🗓️ Zamanlama</h3>
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
              <div className="modal top2" onMouseDown={() => { setPaylasOpen(false); setPaylasBusy(false); }}>
              <div className="sheet small" onMouseDown={(e) => e.stopPropagation()}>
                <button className="x" onClick={() => { setPaylasOpen(false); setPaylasBusy(false); }}>×</button>
                <h3 style={{ marginBottom: 4 }}>📤 Paylaş</h3>
                <p className="note" style={{ marginTop: 0 }}><b>{o.ad}</b></p>
                {kisiler.length > 0 ? (<>
                  <label className="fldlbl">Kişi (birden fazla seçebilirsin)</label>
                  <div>{kisiler.map((ki, i) => <button key={i} className={'chip' + (paylasSel.includes(ki.kod) ? ' on' : '')} onClick={() => setPaylasSel((s) => s.includes(ki.kod) ? s.filter((x) => x !== ki.kod) : [...s, ki.kod])}>{ki.ad}</button>)}</div>
                </>) : <div className="note">Henüz kişi yok — Ayarlar → Paylaşım'dan ekle. Ya da kod gir:</div>}
                <label className="fldlbl">Kod (ops., ek bir kişi için)</label>
                <input value={kShareTo} onChange={(e) => setKShareTo(e.target.value)} placeholder="RT-XXXXX" autoCapitalize="characters" />
                <div style={{ marginTop: 10 }}><button className="btn" disabled={paylasBusy} onClick={() => paylas(o, isRit, [...paylasSel, kShareTo])}>{paylasBusy ? 'Paylaşılıyor…' : 'Paylaş' + (paylasSel.length > 1 ? ' (' + paylasSel.length + ' kişi)' : '')}</button></div>
                {/* Kimseye göndermeden, doğrudan kendi Havuzuna al — Ajanda'da direkt yaratılmış bir kart (ör.
                    alışkanlık) için paylaşım/kabul turuna hiç gerek kalmadan Havuz'a şablon olarak eklenir.
                    Randevu hariç — Havuz'un tarihsiz şablon kavramına uymuyor. Zaten Havuz'daki bir karta
                    (isRit=false) bu seçenek anlamsız, orada gösterilmiyor. */}
                {isRit && !kCfg?.randevu && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                    <button className="btn ghost" style={{ width: '100%' }} disabled={paylasBusy} onClick={() => ritHavuzaAl(o)}>📥 Kendi Havuzuma al</button>
                    <div className="note" style={{ marginTop: 4, marginBottom: 0 }}>Kimseye göndermeden, bu kartı doğrudan kendi Havuz'una (şablon olarak) ekler.</div>
                  </div>
                )}
                {kMsg && <div className="msg">{kMsg}</div>}
              </div>
              </div>
            )}

            {/* Önizlemede (Inbox'tan açılan, henüz kaydedilmemiş paylaşım) kalıcı hiçbir eylem gösterilmiyor —
                kabul/ret zaten Inbox listesindeki "Ajandama ekle"/"Havuzuma ekle"/"Sil" ile yapılıyor. */}
            {preview && <div className="note" style={{ textAlign: 'center', margin: '14px 0 0' }}>📥 Bu bir Inbox önizlemesi — eklemek ya da silmek için Inbox listesine dön.</div>}
            {!preview && !isDraft && isProg && <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => { programBaslat(o); closeDetay(); setScreen('ajanda'); }}>Ajandama başlat{o.sure_gun ? ' (' + o.sure_gun + ' gün)' : ''}</button>}
            {/* Havuz taslağı (henüz Kaydet'e basılmadı, isDraft) için "Ajandama ekle" anlamsız — ortada henüz
                gerçek bir Havuz satırı yok; önce Kaydet, sonra normal Havuz kartı gibi Ajandama ekle görünür. */}
            {!preview && !isDraft && !isRit && !isProg && <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => { aktiviteEkleSlotlar(o); closeDetay(); setScreen('ajanda'); }}>Ajandama ekle</button>}

            {!preview && !isDraft && (!isRit || (personal && !isProg)) && (
              <div className="dettoolbar">
                {!isRit && !paylasilamaz && <button className="tbtn" onClick={() => { setPaylasOpen(true); setKMsg(''); }}><span className="tbic">↪️</span>Paylaş</button>}
                {/* Eski "Düzenle" formu (openStudioEdit) kart_tipi='bilgi' yapısını (kart_config: videolar/icerik/randevu…)
                    hiç bilmiyor — üstüne yazarsa veri kaybına yol açar. Bilgi kartları için düzenleme henüz yok,
                    o yüzden bu buton bilgi kartlarında hiç gösterilmiyor (kullanıcı bildirdi: eski formda geliyordu). */}
                {personal && !isProg && kTip !== 'bilgi' && <button className="tbtn" onClick={() => { closeDetay(); openStudioEdit(act); }}><span className="tbic">✎</span>Düzenle</button>}
                {!isRit && personal && <button className="tbtn danger" onClick={() => silAktivite(o)}><span className="tbic">🗑</span>Sil</button>}
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* Liste satırındaki ⋯ menüsü — habitMenuFor ile aynı bottom-sheet deseni. 2026-09-16 (Behnan kararı,
          mimari tartışmanın 4. maddesi — "havuza kaydet, Puanla içinde ... menüsü uygun"): Puanla ve Paylaş/
          Havuza-kaydet buraya eklendi, kişisel kartların (Not/Aktivite/Randevu) hepsinde. Puanla kendi başına
          yeten bir modal (puanModal) olduğu için detayı hiç açmadan direkt çalışıyor; Paylaş/Havuza-kaydet ise
          var olan Paylaş modalini (detay ekranının içinde, "📥 Kendi Havuzuma al" da dahil) kullandığı için
          önce openRit ile detayı açıp üstüne paylasOpen'ı tetikliyor. */}
      {ritMenuFor && (() => {
        const rmKisisel = ritMenuFor.kart_tipi === 'bilgi' && ritMenuFor.kaynak === 'Kendi';
        return (
        <div className="modal top2" onMouseDown={() => setRitMenuFor(null)}>
          <div className="sheet small" onMouseDown={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setRitMenuFor(null)}>×</button>
            <h3 style={{ marginBottom: 8 }}>{ritMenuFor.ad}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Not'u ajandaya taşı (kullanıcı isteği: sürüklemek yerine tür seçerek) — hedef gün her zaman o an
                  Ajanda'da görüntülenen gün (day, ör. takvimden önceden bir gün seçildiyse o gün). Sadece
                  Not'larda görünür. Tek "Ajandaya koy" seçeneği (2026-09-17, Randevu birleşmesi — Behnan kararı:
                  eski ayrı "Aktivite yap"/"Randevu yap" butonları Randevu tür olmaktan çıkınca tek butona indi;
                  hedefin türü hep 'yapilacak' — varsayılan "Bugün", kartın içindeki 🔁 Tekrarla ile sonradan
                  tekrarlanan yapılabilir, randevu detayı içeriğe serbest metin olarak yazılır). */}
              {isNotKart(ritMenuFor) && (
                <button className="btn ghost sm" onClick={() => { const id = ritMenuFor.id; setRitMenuFor(null); notuTasi(id, 'yapilacak'); }}>🗓️ Ajandaya koy ({kisaTarih(day)})</button>
              )}
              {rmKisisel && (
                <button className="btn ghost sm" onClick={() => { setPuanDeger(ritMenuFor.puan || 0); setPuanModal(ritMenuFor); setRitMenuFor(null); }}>⭐ Puanla{ritMenuFor.puan ? ' (' + ritMenuFor.puan + '★)' : ''}</button>
              )}
              {rmKisisel && !ritMenuFor.sablon_id && (
                <button className="btn ghost sm" onClick={() => { const r = ritMenuFor; setRitMenuFor(null); openRit(r); setPaylasOpen(true); setKMsg(''); }}>↪️ Paylaş / Havuza kaydet</button>
              )}
              <button className="btn ghost sm" onClick={() => { const id = ritMenuFor.id; setRitMenuFor(null); ritSil(id); }}>🗑️ Sil</button>
              <button className="btn ghost sm" onClick={() => setRitMenuFor(null)}>Vazgeç</button>
            </div>
          </div>
        </div>
        );
      })()}

      {homeDetay && (() => {
        const a = homeAlanlar.find((x) => x.anahtar === homeDetay);
        if (!a) return null;
        return (
          <div className="modal top2" onMouseDown={() => setHomeDetay(null)}>
            <div className="sheet small" onMouseDown={(e) => e.stopPropagation()}>
              <button className="x" onClick={() => setHomeDetay(null)}>×</button>
              <h3 style={{ marginBottom: 4 }}>{a.ad}</h3>
              <div className="note" style={{ marginTop: 0 }}>{a.neden}</div>
              {/* Checklist (kullanıcı isteği): "Mükemmel" demek, bu listenin neredeyse tamamını uyguluyor olmak
                  demek — kalibrasyon amaçlı, kişinin kendi ölçütü. Prose yerine gerçek bir kontrol listesi. */}
              {(a.checklist || []).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div className="k" style={{ marginBottom: 5 }}>Kontrol listesi — "Mükemmel" demek bunların hemen tamamını yapıyor olmak demektir</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {a.checklist.map((x: string, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ color: 'var(--green)' }}>✓</span>
                        <span className="note" style={{ marginTop: 0 }}>{x}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Örnek aktiviteler: Kütüphane'nin "Grupları yönet" formunda kürator/kullanıcının kendi yazdığı
                  sabit/temsili metin — gerçek bir aktiviteye bağlı değil, sadece fikir vermek için. */}
              {(a.ornekler || []).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div className="k" style={{ marginBottom: 5 }}>Örnek aktiviteler</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {a.ornekler.map((x: string) => <span key={x} className="chip" style={{ cursor: 'default' }}>{x}</span>)}
                  </div>
                </div>
              )}
              {/* Aktivitelerin (2026-09, Behnan kararı — "aktiviteleri canlı yapmak"): bu alanla Studio'dan
                  etiketlenmiş GERÇEK kişisel Havuz aktiviteleri (bkz. kHomeAlanlar/home_alanlar). Tıklayınca
                  aktivitenin kendi Detay'ı (openDetay) Home'un üstünde açılıyor.
                  "+ Aktivite ekle" KALDIRILDI (2026-09-16, Behnan kararı) — eski/güncel olmayan bir kişisel-
                  aktivite formuna açıyordu, şimdilik danışan buradan yeni aktivite eklemiyor, sadece var olanları
                  ve Meridyen'den atanmış programları görüyor (altta). */}
              <div style={{ marginTop: 10 }}>
                <div className="k" style={{ marginBottom: 5 }}>Aktivitelerin</div>
                {(() => {
                  const iliskili = personalActs.filter((p: any) => (p.home_alanlar || []).includes(a.anahtar));
                  return iliskili.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
                      {iliskili.map((p: any) => (
                        <div key={p.id} className="chip" style={{ cursor: 'pointer', textAlign: 'left', display: 'block' }} onClick={() => { setHomeDetay(null); openDetay(p, 'aktivite'); }}>{p.ad}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="note" style={{ margin: '0 0 6px' }}>Bu alanla ilişkili bir aktiviten henüz yok.</div>
                  );
                })()}
              </div>
              {/* Meridyen'den programlar (2026-09-16, Behnan sorusu üzerine): Rite Studio'da (app-meridyen/atama)
                  bir Program/Kart bu alana etiketlenmişse (dog_activities.alan_anahtarlari, client_id null —
                  kanonik kütüphane, "activities" state'i zaten TÜM aktif satırları taşıyor, ekstra sorgu yok)
                  burada listelenir. Tıklayınca aynı openDetay akışı açılır — program tipi olduğu için Detay'da
                  zaten var olan "Ajandama başlat" butonu (bkz. isProg/programBaslat) kendiliğinden çıkar, ayrı
                  bir "ekle" mekanizması kurmaya gerek yok. Bu, alan atandığında programların "gitmesi" ihtiyacını
                  push değil self-servis biçimde çözüyor — içerik hep kanonikten okunduğu için ayrıca senkron
                  gerektirmiyor (bkz. proje belleği "Alanlar" mimarisi notu).*/}
              <div style={{ marginTop: 10 }}>
                <div className="k" style={{ marginBottom: 5 }}>Meridyen'den programlar</div>
                {(() => {
                  // Sadece tur='program' — 'kart' (master card) Rite Studio'da doğrudan atanmayan, programların
                  // adımlarında kopyalanarak kullanılan bir yapı taşı; danışana tek başına "başlat"acak bir şey
                  // sunmadığı için burada bilerek gösterilmiyor.
                  const progKart = activities.filter((p: any) => !p.client_id && p.tur === 'program' && (p.alan_anahtarlari || []).includes(a.anahtar));
                  return progKart.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
                      {progKart.map((p: any) => (
                        <div key={p.id} className="chip" style={{ cursor: 'pointer', textAlign: 'left', display: 'block' }} onClick={() => { setHomeDetay(null); openDetay(p, 'aktivite'); }}>🎯 {p.ad}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="note" style={{ margin: '0 0 6px' }}>Bu alanla ilişkili bir program henüz yok.</div>
                  );
                })()}
              </div>
              {/* Değerlendirme (2026-09, Behnan kararı — geri döndü): toplu "Kendini değerlendir" formu (eski
                  homeEkleOpen, ＋'dan açılıyordu) kaldırıldı, değerlendirme yine kartın kendi Detay'ının sonunda
                  ("senin önceden yaptığın gibi kartların detayının sonunda daha mantıklıydı"). ＋ artık Home'da
                  Ölçüm ekle açıyor (bkz. nav'daki ＋ handler). Tarih seçimi hâlâ yok — her seçim bugüne yazılıyor. */}
              <div style={{ marginTop: 12 }}>
                <div className="k" style={{ marginBottom: 5 }}>Kendini değerlendir</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {HOME_SEVIYE.map((s, i) => (
                    <span key={s} className={'chip' + (homeGuncelDeger(a.anahtar) === i + 1 ? ' on' : '')} onClick={() => homeDegerlendir(a.anahtar, i + 1)}>{s}</span>
                  ))}
                </div>
              </div>
              <div className="note" style={{ marginTop: 12 }}>Bu alanın içeriği (ad, checklist, örnekler) Meridyen tarafından yönetiliyor.</div>
            </div>
          </div>
        );
      })()}

      {/* Home'un KENDİ yönetim ekranı: içerik değişikliği yok (o hep Kütüphane'den) — sadece hangi Meridyen
          alanının Home'da görüneceği (home_gizli) ve sırası (paylaşılan `sira`, grupSiraDegistir ile). Kullanıcı
          isteği: "Home da sadece o ekranda bulunması, sırasının ayarlanması ve ekrandan kaldırılması için kendi
          formu olmalı... değişiklikler sadece kütüphaneden yapılmalı". */}
      {homeYonetOpen && (
        <div className="modal" onMouseDown={() => setHomeYonetOpen(false)}>
          <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
            <div className="sheetgrip" onClick={() => setHomeYonetOpen(false)} />
            <h2>⚙️ Alanları yönet</h2>
            <div className="note" style={{ marginTop: 0, marginBottom: 12 }}>Hangi alanların Home'da görüneceğini ve sırasını buradan ayarla. Adını, kontrol listesini ya da örneklerini değiştirmek için Kütüphane'deki "Grupları yönet" ekranını kullan.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {homeAlanlar.length === 0 && <div className="note">Henüz alan yok.</div>}
              {homeAlanlar.map((a, i) => (
                <div key={a.id} className="card" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, opacity: a.home_gizli ? 0.55 : 1 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <button className="minlink" style={{ padding: 0, fontSize: 10 }} onClick={() => grupSiraDegistir(a, -1)} disabled={i === 0}>▲</button>
                    <button className="minlink" style={{ padding: 0, fontSize: 10 }} onClick={() => grupSiraDegistir(a, 1)} disabled={i === homeAlanlar.length - 1}>▼</button>
                  </div>
                  <span style={{ flex: 1 }}>{a.ad}</span>
                  <span className="minlink" onClick={() => homeAlanGizleDegistir(a)}>{a.home_gizli ? '🙈 Göster' : '👁 Gizle'}</span>
                </div>
              ))}
            </div>
            <button className="btn ghost sm" style={{ width: '100%', marginTop: 14 }} onClick={() => setHomeYonetOpen(false)}>Kapat</button>
          </div>
        </div>
      )}

      {habitMenuFor && (
        <div className="modal top2" onMouseDown={() => setHabitMenuFor(null)}>
          <div className="sheet small" onMouseDown={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setHabitMenuFor(null)}>×</button>
            <h3 style={{ marginBottom: 2 }}>🎓 {habitMenuFor.ad}</h3>
            <p className="note" style={{ marginTop: 0 }}>Bu bir alışkanlık — ne yapmak istersin?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {/* Puanla — bkz. ritPuanla. "🎓 Mezun et" 2026-09-17'de (Behnan kararı) buradan da kaldırıldı;
                  tekrarlanan bir Aktivite'yi bitirmek artık Süre panelindeki bitiş tarihini ayarlamakla oluyor. */}
              <button className="btn ghost sm" onClick={() => { setPuanDeger(habitMenuFor.puan || 0); setPuanModal(habitMenuFor); setHabitMenuFor(null); }}>⭐ Puanla{habitMenuFor.puan ? ' (' + habitMenuFor.puan + '★)' : ''}</button>
              <button className="btn ghost sm" onClick={() => { setRitAliskanlik(habitMenuFor.id, false); setHabitMenuFor(null); }}>↩️ Alışkanlıktan çıkar</button>
              <button className="btn ghost sm" onClick={() => setHabitMenuFor(null)}>Vazgeç</button>
            </div>
            <div className="note" style={{ marginTop: 8 }}>Puanlamak bağımsız bir not, ajandadan hiçbir şeyi etkilemez. Alışkanlıktan çıkarmak zararsız — istersen tekrar işaretlersin.</div>
          </div>
        </div>
      )}

      {remMenuFor && (
        <div className="modal top2" onMouseDown={() => setRemMenuFor(null)}>
          <div className="sheet small" onMouseDown={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setRemMenuFor(null)}>×</button>
            <h3 style={{ marginBottom: 2 }}>🔔 {remMenuFor.ad}</h3>
            <p className="note" style={{ marginTop: 0 }}>{remMenuFor._randevu ? 'Bildirim ne zaman gelsin — randevunun kendi tarih/saatinden bağımsız' : 'Günlük hatırlatma saati'}</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0', flexWrap: 'wrap' }}>
              {remMenuFor._randevu && <input type="date" style={{ width: 'auto' }} value={remTarihInput} onChange={(e) => setRemTarihInput(e.target.value)} />}
              <input type="time" style={{ width: 'auto' }} value={remInput} onChange={(e) => setRemInput(e.target.value)} />
            </div>
            <div className="note" style={{ marginBottom: 10 }}>Uygulama kapalıyken de bildirim gelir (push açıksa). Saat: Türkiye saati.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="btn"
                disabled={!remInput || (remMenuFor._randevu ? (remInput === (remMenuFor.hatirlatma_saat || '') && remTarihInput === (remMenuFor.kart_config?.hatirlatma_tarih || remMenuFor.baslangic || '')) : remInput === (remMenuFor.hatirlatma_saat || ''))}
                onClick={() => { if (remMenuFor._randevu) setRandevuBildirim(remMenuFor.id, remInput, remTarihInput); else setRitReminder(remMenuFor.id, remInput); setRemMenuFor(null); }}
              >Kaydet</button>
              {remMenuFor.hatirlatma_saat && <button className="btn ghost sm" onClick={() => { setRitReminder(remMenuFor.id, ''); setRemMenuFor(null); }}>Bildirimi kapat</button>}
              <button className="btn ghost sm" onClick={() => setRemMenuFor(null)}>Vazgeç</button>
            </div>
          </div>
        </div>
      )}

      {/* Puanla modali (YENİ, 2026-09-16 — Behnan kararı: puanlama mezun etmekten ve Havuz'a kaydetmekten
          bağımsız). bkz. ritPuanla. */}
      {puanModal && (
        <div className="modal top2" onMouseDown={() => setPuanModal(null)}>
          <div className="sheet small" onMouseDown={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setPuanModal(null)}>×</button>
            <h3 style={{ marginBottom: 2 }}>⭐ Puanla</h3>
            <p className="note" style={{ marginTop: 0 }}><b>{puanModal.ad}</b> — bu alışkanlık ne kadar yararlı/tatmin ediciydi? Sonra tekrar yapmaya karar verirken işine yarar.</p>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', margin: '8px 0' }}>
              {[1, 2, 3, 4, 5].map((n) => <button key={n} className="starbtn" onClick={() => setPuanDeger(n)}>{n <= puanDeger ? '★' : '☆'}</button>)}
            </div>
            <div className="rowbtns" style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => ritPuanla(puanModal.id, puanDeger)}>Kaydet</button>
              {puanModal.puan ? <button className="btn ghost sm" onClick={() => ritPuanla(puanModal.id, 0)}>Puanı kaldır</button> : null}
              <button className="btn ghost sm" onClick={() => setPuanModal(null)}>Vazgeç</button>
            </div>
            <div className="note" style={{ marginTop: 4 }}>Ajandadan hiçbir şeyi etkilemez, sadece kendi notun.</div>
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
            {/* Home'un Meridyen alanlarıyla etiketleme (ops., çoklu) — Home'un alan Detay'ındaki "Aktivitelerin"
                listesi bu etiketlere göre filtreleniyor (bkz. kHomeAlanlar, home_alanlar). */}
            {homeAlanlar.length > 0 && (
              <>
                <label className="fldlbl">Home alanları (ops. — hangi alan(lar)la ilgili?)</label>
                <div>{homeAlanlar.map((ha) => (
                  <span key={ha.anahtar} className={'chip' + (kHomeAlanlar.includes(ha.anahtar) ? ' on' : '')} onClick={() => setKHomeAlanlar((s) => s.includes(ha.anahtar) ? s.filter((x) => x !== ha.anahtar) : [...s, ha.anahtar])}>{ha.ad}</span>
                ))}</div>
              </>
            )}
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
            {/* 2026-09 (Behnan kararı): bu menü artık SADECE Ajanda'nın kendi yerel ＋'sından açılıyor (bkz.
                ajhead) — Havuz'un eski, ayrı Not/Alışkanlık girişi kaldırıldı (bkz. aşağısı), o yüzden burası
                artık hep Ajanda bağlamında, dallanmaya gerek yok. */}
            <div className="ekleGrid">
              {/* Not: emoji yerine kartın kendi rengine (sarı yapışkan not) uyan küçük bir kare — kullanıcı
                  isteği "sarı sticker olursa güzel olur". Emoji fontlarında gerçek bir "sarı sticky note" glifi
                  olmadığı için (📝 sadece "not" anlamına geliyor, renk taşımıyor) rengi doğrudan CSS'le veriyoruz. */}
              <button className="ekleOpt" onClick={() => { setEkleMenuOpen(false); yeniTaslakAc('not'); }}><span className="ekic" style={{ display: 'inline-block', width: 22, height: 22, borderRadius: 4, background: '#f5d76e', border: '1px solid #d9b84a', boxShadow: '1px 1px 2px rgba(0,0,0,.15)' }} />Not</button>
              {/* Sıralama Not-Aktivite (kullanıcı isteği, 2026-09-16: eski ayrı Yapılacak/Alışkanlık ＋
                  girişleri "Aktivite" adı altında birleşti — varsayılan "Bugün"/tek seferlik, kartın içindeki
                  "🔁 Tekrarla" anahtarı sonradan Süre/Günler'i açar, bkz. setRitTekrarla).
                  2026-09 (aynı gün, Behnan kararı): bu menü artık SADECE Ajanda'dan açılıyor (bkz. yukarısı,
                  ajhead'deki yerel ＋) — Havuz'un eski "Alışkanlık" girişi (yeniHavuzTaslakAc ile, screen==='havuz'
                  dalı) ve `screen !== 'havuz'` koruma koşulları buradan KALDIRILDI, çünkü artık hep doğruydular.
                  yeniHavuzTaslakAc fonksiyonu SİLİNMEDİ — Havuz'a eklemenin "başka bir yöntemi" (Behnan) ileride
                  onu yeniden kullanabilir, sadece bu menüden erişimi kaldırıldı.
                  2026-09-17 (Randevu birleşmesi): ayrı "📅 Randevu" girişi kalktı — bir randevu artık sadece bir
                  Aktivite, detayı içeriğe yazılıyor. */}
              <button className="ekleOpt" onClick={() => { setEkleMenuOpen(false); yeniTaslakAc('yapilacak'); }}><span className="ekic">☑️</span>Aktivite</button>
              <button className="ekleOpt" onClick={() => { setEkleMenuOpen(false); setAyracAdVal(''); setAyracYeniOpen(true); }}><span className="ekic">➖</span>Ayraç</button>
              <button className="ekleOpt" onClick={() => { setEkleMenuOpen(false); setScreen('ajanda'); startLink(); }}><span className="ekic">🔗</span>Rutin</button>
            </div>
          </div>
        </div>
      )}

      {/* Home'un Ölçümler şeridindeki ＋ ile hızlı ölçüm/değerlendirme girişi (eskiden Gelişim ekranınındaydı) —
          Ölçüm kartı gibi ayrı bir ritüele bağlı değil, doğrudan bugüne (dog_measurements) yazılıyor (bkz.
          olcumEkleGenel). Ruh hali/Odak/Su hariç — onların kendi kartları var; burada yalnız fiziksel ölçümler
          + serbest "Diğer" (özel etiket) var. */}
      {olcumEkleOpen && (
        <div className="modal" onMouseDown={() => setOlcumEkleOpen(false)}>
          <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
            <div className="sheetgrip" onClick={() => setOlcumEkleOpen(false)} />
            <h2>📏 Ölçüm ekle</h2>
            <label className="fldlbl" style={{ marginTop: 0 }}>Ne ölçtün / değerlendirdin?</label>
            <div style={{ margin: '2px 0 8px' }}>
              {OLCU_HIZLI_ANAHTAR.map((k) => (
                <span key={k} className={'chip' + (olcumSecAnahtar === k ? ' on' : '')} onClick={() => { setOlcumSecAnahtar(k); setOlcumBirim(OLCU_BIRIM[k] ?? ''); }}>{OLCU_ETIKET[k]}</span>
              ))}
              <span className={'chip' + (olcumSecAnahtar === 'ozel' ? ' on' : '')} onClick={() => { setOlcumSecAnahtar('ozel'); setOlcumBirim(''); }}>Diğer…</span>
            </div>
            {olcumSecAnahtar === 'ozel' && <input value={olcumOzelAd} onChange={(e) => setOlcumOzelAd(e.target.value)} placeholder="ör. Tansiyon, Nabız…" style={{ marginBottom: 8 }} autoFocus />}
            {olcumSecAnahtar && (
              <div className="daterow" style={{ marginTop: 0 }}>
                <input type="number" inputMode="decimal" step="any" value={olcumDeger} onChange={(e) => setOlcumDeger(e.target.value)} placeholder="Değer" style={{ flex: 1 }} autoFocus={olcumSecAnahtar !== 'ozel'} />
                <input value={olcumBirim} onChange={(e) => setOlcumBirim(e.target.value)} placeholder="Birim (ops.)" style={{ width: 90 }} />
              </div>
            )}
            <button
              className="btn" style={{ width: '100%', marginTop: 12 }}
              disabled={!olcumSecAnahtar || !olcumDeger.trim() || isNaN(Number(olcumDeger)) || (olcumSecAnahtar === 'ozel' && !olcumOzelAd.trim())}
              onClick={() => {
                const anahtar = olcumSecAnahtar === 'ozel'
                  ? 'ozel_' + olcumOzelAd.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_çğıöşü]/g, '')
                  : (olcumSecAnahtar as string);
                olcumEkleGenel(anahtar, Number(olcumDeger), olcumBirim.trim() || null);
                setOlcumEkleOpen(false);
              }}
            >Kaydet</button>
          </div>
        </div>
      )}

      {/* Havuz'u bir "kitaplık / araştırma planı" olarak kullanmak için Grup + Alt grup'ların kalıcı,
          düzenlenebilir listesi (bkz. dog_gruplar). Havuz'daki sekmeler artık burada tutulan bu listeden
          besleniyor — serbestçe yazılan, kalıcı olmayan bir isimden çok, "Duruş" / "Bel çukurluğu" gibi
          gerçek bir araştırma başlığı listesi. */}
      {gruplarYonetOpen && (
        <div className="modal" onMouseDown={() => { setGruplarYonetOpen(false); setGrupDuzenleId(null); setAltGrupEkleFor(null); }}>
          <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => { setGruplarYonetOpen(false); setGrupDuzenleId(null); setAltGrupEkleFor(null); }}>×</button>
            <h2>🗂 Grupları yönet</h2>
            <div className="note" style={{ marginTop: 0 }}>Her Grup bir araştırma başlığı, Alt gruplar onun altındaki daha ince konular.</div>
            {grupUst.length === 0 && <div className="note">Henüz Grup yok — aşağıdan ekle.</div>}
            {grupUst.sort((a, b) => a.sira - b.sira).map((g, i) => {
              const altlar = grupListesi.filter((x) => x.ust_id === g.id).sort((a, b) => a.sira - b.sira);
              return (
                <div key={g.id} style={{ margin: '8px 0', padding: '8px 0', borderTop: i === 0 ? undefined : '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <button className="minlink" style={{ padding: 0 }} onClick={() => grupSiraDegistir(g, -1)} disabled={i === 0}>▲</button>
                      <button className="minlink" style={{ padding: 0 }} onClick={() => grupSiraDegistir(g, 1)} disabled={i === grupUst.length - 1}>▼</button>
                    </div>
                    {g.sabit ? (
                      <>
                        <b style={{ flex: 1 }}>{g.ad} <span className="note" style={{ fontWeight: 400 }}>🔒 sabit</span></b>
                      </>
                    ) : grupDuzenleId === g.id ? (
                      <>
                        <input value={grupDuzenleAd} onChange={(e) => setGrupDuzenleAd(e.target.value)} style={{ flex: 1 }} autoFocus />
                        <button className="btn sm" onClick={() => { grupYenidenAdlandir(g.id, grupDuzenleAd); setGrupDuzenleId(null); }}>Kaydet</button>
                        <button className="btn ghost sm" onClick={() => setGrupDuzenleId(null)}>Vazgeç</button>
                      </>
                    ) : (
                      <>
                        <b style={{ flex: 1 }}>{g.ad}</b>
                        <button className="minlink" onClick={() => { setGrupDuzenleId(g.id); setGrupDuzenleAd(g.ad); }}>✎</button>
                        <button className="minlink" style={{ color: 'var(--red)' }} onClick={() => grupSil(g)}>🗑</button>
                      </>
                    )}
                  </div>
                  <div style={{ margin: '4px 0 0 24px' }}>
                    {/* "Meridyen" kökünün alt grupları (= Home'un alanları) artık salt-okunur burada — içerik
                        (ad/neden/checklist/örnekler) ve hangi alanların bu danışana ait olacağı (2026-09, Behnan
                        kararı — "Alanlar" mimarisi) TEK kaynak olarak Rite Studio'dan (app-meridyen/atama)
                        yönetiliyor. Sıra/görünürlük hâlâ Home'un kendi "Alanları yönet" ekranında. Sıradan
                        Grup/Alt gruplar eskisi gibi (rename/sil, düz ad) kalıyor. */}
                    {g.sabit ? (
                      homeAlanlar.length > 0 ? homeAlanlar.map((ag) => (
                        <div key={ag.id} style={{ margin: '3px 0' }}>
                          <span className="note" style={{ margin: 0 }}>{ag.ad}</span>
                        </div>
                      )) : <div className="note">Henüz Meridyen'den atanmış bir alan yok.</div>
                    ) : altlar.map((ag, j) => (
                      <div key={ag.id} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <button className="minlink" style={{ padding: 0, fontSize: 10 }} onClick={() => grupSiraDegistir(ag, -1)} disabled={j === 0}>▲</button>
                          <button className="minlink" style={{ padding: 0, fontSize: 10 }} onClick={() => grupSiraDegistir(ag, 1)} disabled={j === altlar.length - 1}>▼</button>
                        </div>
                        {grupDuzenleId === ag.id ? (
                          <>
                            <input value={grupDuzenleAd} onChange={(e) => setGrupDuzenleAd(e.target.value)} style={{ flex: 1 }} autoFocus />
                            <button className="btn sm" onClick={() => { grupYenidenAdlandir(ag.id, grupDuzenleAd); setGrupDuzenleId(null); }}>Kaydet</button>
                            <button className="btn ghost sm" onClick={() => setGrupDuzenleId(null)}>Vazgeç</button>
                          </>
                        ) : (
                          <>
                            <span className="note" style={{ margin: 0, flex: 1 }}>{ag.ad}</span>
                            <button className="minlink" onClick={() => { setGrupDuzenleId(ag.id); setGrupDuzenleAd(ag.ad); }}>✎</button>
                            <button className="minlink" style={{ color: 'var(--red)' }} onClick={() => grupSil(ag)}>🗑</button>
                          </>
                        )}
                      </div>
                    ))}
                    {g.sabit ? (
                      <div className="note" style={{ margin: '6px 0 0' }}>Alanların içeriğini ve atamasını Meridyen'deki Rite Studio'dan yönet — sıra ve görünürlük için "⚙️ Alanları yönet" (Home) ekranını kullan.</div>
                    ) : altGrupEkleFor === g.id ? (
                      <div style={{ display: 'flex', gap: 6, margin: '4px 0' }}>
                        <input value={altGrupYeniAd} onChange={(e) => setAltGrupYeniAd(e.target.value)} placeholder="Alt grup adı" style={{ flex: 1 }} autoFocus />
                        <button className="btn sm" onClick={() => { grupEkle(altGrupYeniAd, g.id); setAltGrupYeniAd(''); setAltGrupEkleFor(null); }}>Ekle</button>
                        <button className="btn ghost sm" onClick={() => setAltGrupEkleFor(null)}>Vazgeç</button>
                      </div>
                    ) : (
                      <button className="minlink" style={{ margin: '4px 0 0' }} onClick={() => { setAltGrupEkleFor(g.id); setAltGrupYeniAd(''); }}>+ Alt grup</button>
                    )}
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <input value={grupYeniAd} onChange={(e) => setGrupYeniAd(e.target.value)} placeholder="Yeni Grup adı (ör. Duruş, Mental Health…)" style={{ flex: 1 }} />
              <button className="btn sm" onClick={() => { grupEkle(grupYeniAd, null); setGrupYeniAd(''); }}>Grup ekle</button>
            </div>
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

    </div>
  );
}
