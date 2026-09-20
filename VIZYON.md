# Rite — Vizyon ve Teknik Mimari

*Bu belge, Home ekranına eklenecek araç/widget'ları ve kart tiplerini düşünürken referans alınacak, yaşayan bir belge olarak tutulur. Her büyük mimari kararın ardından güncellenmesi beklenir; adım adım karar geçmişi (kim ne zaman ne istedi, hangi alternatif neden elendi) burada değil, projenin Claude tarafındaki hafızasında tutulur — burada sadece GÜNCEL DURUM ve onu şekillendiren gerekçeler var. Kurulum/deploy bilgisi için `README.md`'ye bakın, bu belge onun yerine geçmez.*

---

## 1. Ne, kimin için, neden

Rite, Meridyen'in danışan yüzeyi olarak doğdu: bir koçun (Meridyen) danışanlarına program/içerik ilettiği bir PWA. Ama projeyi asıl "etkin" kılacak yolun bu olmadığı zamanla netleşti — Behnan uzman koç değil, gerçek programları nadiren kendisi kuruyor, ve YouTube'da zaten doktorlar/fizyoterapistler/psikologlar tarafından üretilmiş bol miktarda güvenilir içerik var. Bu gözlem, projenin ağırlık merkezini kaydırdı: **önce kişisel, kendi kendine kürasyon yapılan bir kullanım modeliyle gerçekten kullanılan bir uygulama olmak**, "esenlik merkezi" (profesyonel koçluk) modelini ise orta/uzun vadeli bir hedef olarak saklı tutmak.

Bu pivota ilham veren somut gözlem: Datça'da (emeklilerin yoğun olduğu bir yer) tatildeyken, iyi bir yaşam tarzı potansiyeli olan bir ortamda insanların günün büyük bölümünü televizyon izleyerek geçirdiğini fark etmek. Rite'ın hedef kitlesinin çekirdeğinde bu profil var: hayatını yeniden "raya oturtmak" isteyen, teknik olmayan, sürekli öz-değerlendirmeye ihtiyaç duyan insanlar.

**Çekirdek döngü**: Ajanda (günlük akış) + Havuz (aktivite/şablon kütüphanesi), kişinin kendi hayatını farklı alanlarda (hareket, beslenme, meşgale, sosyal ilişkiler…) sürekli gözden geçirmesini ve eksik gördüğü yere Havuz'dan bir alışkanlık/aktivite eklemesini kolaylaştırmak üzere tasarlanıyor. Meridyen (koç-destekli, daha detaylı) yolu ayrı ve daha sonraki bir katman olarak duruyor; ikisinin karışmaması (aynı ekranlarda, aynı dilde iki farklı zihniyeti zorlamamak) bilinçli bir tasarım kaygısı.

---

## 2. Temel veri modeli

| Tablo | Ne tutar |
|---|---|
| `dog_clients` | Kullanıcı/danışan (e-posta yok, `share_code` = RITE-XXXXX ile eşleşme) |
| `dog_rituals` | **Ajanda**'daki somut örnekler — bir aktivitenin belirli bir güne/zamana bağlı hali |
| `dog_activities` | **Havuz**'daki şablonlar — hem kütüphane (Meridyen, `client_id` boş) hem kişisel (`client_id` dolu) |
| `dog_inbox` | Kişiden kişiye paylaşım kutusu (Gelenler) |
| `dog_meridyen_alanlar` | 13 alanın KANONİK içeriği (ad/neden/checklist/örnekler) — sadece Rite Studio'dan yazılır |
| `dog_gruplar` | Danışana özel, ince satırlar: bir alanı/grubu Home'da gösterip göstermediği + sırası |
| `dog_faydalar` | Fayda katmanı sözlüğü (kod/ad/alan eşlemesi) |

**Fayda katmanı**: bir aktivite tek bir alana değil, bir FAYDA demetine etiketlenir (`faydalar text[]`), fayda→alan eşlemesi ayrıca tutulur. Bu, "köpeği parka götürmek" gibi tek bir aktivitenin aynı anda hareket + sabah ışığı + sosyal bağ gibi birden fazla alana hizmet etmesini modellemek için var — tek-alanlı kategorileme bu gerçekliği yakalayamıyordu.

**"Aktivite" birleşmesi**: Yapılacak/Alışkanlık/Randevu ayrı kart tipleri olmaktan çıktı, hepsi tek bir "Aktivite" kavramına birleşti; tekrar/başlangıç/bitiş bir "Süre" şeridiyle yönetiliyor. `randevu` kart tipi kodda hâlâ duruyor ama fiilen kullanılmıyor (eski veri/standart incelemesi için Kart Laboratuvarı'nda tutuluyor).

**`kaynak`** alanı bir kartın nereden geldiğini işaretler: `'Kendi'` (kullanıcı kendi yarattı), `'Meridyen'` (koç şablonundan), `'Inbox'` (paylaşımdan kabul edilmiş). **`tur`** ise `'aktivite'` ya da `'program'` (adım adım, sıralı bir aktivite dizisi).

**PostgREST gotcha'sı**: `dog_activities`/`dog_inbox`/`dog_rituals` sorguları bilerek `select('*')` kullanıyor, açık kolon listesi DEĞİL — bir migration'dan önce eklenen bir kolon açık listede geçerse PostgREST tüm sorguyu reddediyor, `select('*')` bu sınıf hatayı yapısal olarak ortadan kaldırıyor. Yeni bir sorgu eklerken bu deseni koru.

---

## 3. Kart sistemi

Rite'ın en temel birimi **kart** — bir aktivite/not/alışkanlık her zaman bir `kart_tipi` + `kart_config` (JSONB, tipe özel ayarlar) çiftiyle temsil ediliyor. Mimari ilke: **`kart_tipi` mobilde kapalı, kod-tanımlı bir küme olacak** — kullanıcı kendi kart tipini yaratamıyor (CardContainer/Widget gibi düzen bileşenlerinin aksine). Bu, App Store'a geçişte "her şey mümkün" esnekliğinin getireceği onay/bakım yükünü baştan sınırlamak için bilinçli bir tercih.

Her kart tipinin kendi React bileşeni var (`AnketKart`, `ChoktanKart`, vb. — dosyada satır ~914-1360 arası) ve `KART_LAB` sabiti (Geliştirici modu → Kart Laboratuvarı) her tip için örnek bir `ornekConfig` tutuyor; yeni bir tip eklerken bu ikisi + `KARTLAR` listesindeki ikon/etiket birlikte güncellenir — **standartlaşma** kuralı bu.

### 3.1 Mevcut envanter (20 kod-tanımlı tip + 1 özel tip)

| Tip | İkon | Config şekli (özet) | Not |
|---|---|---|---|
| `standart` | • | — (opsiyonel resim + ortak `aciklama`) | Varsayılan, boş kart |
| `bilgi` | 📄 | `{ videolar: {baslik?,url,bas?,bit?,ozelNot?}[] }` | **Kişisel Not/Aktivite'nin asıl motoru** — çoklu video, `BilgiKartEdit` ile düzenlenir. `KART_LAB`'da yok (kendi zengin editörü var) |
| `video` | 🎬 | `{ url }` | **LEGACY** — tek link, eski mekanizma. `bilgi`'nin `videolar[]`'ı onu fiilen geçersiz kıldı, "bir ara tamamen iptal" bekliyor (bkz. §8) |
| `anket` | 📋 | `{ sorular: string[] }` | Açık uçlu, çoklu soru; yanıtlar kaydedilmiyor, sadece "gönderildi" durumu |
| `coktan` | ❓ | `{ soru, secenekler[], dogru }` | Doğru/yanlış geri bildirimli, yanıt tabloya yazılmaz (ephemeral) |
| `diyet` | 🍽 | `{ ogunler: {ad,miktar,kalori,alternatifler?,hazirlanis?}[], makro? }` | |
| `tarif` | 🍳 | `{ malzemeler[], yapilis, sure, porsiyon }` | |
| `olcum` | 📏 | `{ alanlar: {anahtar,label,birim}[] }` | `dog_measurements`'a yazar |
| `nefes` | 🫁 | `{ desen, tekrar }` | |
| `ruhhali` | 🙂 | `{ soru }` | `dog_measurements`'a yazar |
| `workout` | 🏋️ | `{ hareketler: {ad,set,tekrar}[] }` | |
| `sukran` | 🙏 | `{ soru }` | |
| `topraklama` | 🖐 | `{}` (5-4-3-2-1 sabit akış) | |
| `pomodoro` | 🍅 | `{ dakika }` | `dog_measurements`'a yazar (biriktirmeli) |
| `beden` | 🧘 | `{ adimlar: {etiket,saniye}[] }` | |
| `uykuoncesi` | 🌙 | `{ maddeler[] }` | |
| `su` | 💧 | `{ hedef }` | `dog_measurements`'a yazar (biriktirmeli) |
| `maruz` | 🎯 | `{ gorev }` | |
| `niyet` | 🧭 | `{ soru, degerler[] }` | |
| `randevu` | 📅 | `{ saat, format, yer }` | **LEGACY** — Aktivite birleşmesinden sonra ayrı akışı yok, sadece Lab'da duruyor |
| `proje` | — | (İnceleniyor) | "Proje Kartı" — bir Odak Alanı'nı özetleyen üst kart; bkz. §4.3, henüz tam netleşmedi |

`olcum`/`ruhhali`/`pomodoro`/`su` gibi ölçüm yazan tipler için Ajanda zaten tek bir ortak "son değerler/bugün/bugünkü dakika" okuma mantığı kullanıyor — `kaynak:'Kendi'` olması bu akışı değiştirmiyor, yeni bir tip eklerken ayrı bir entegrasyon gerekmiyor.

### 3.2 Kart paylaşım formatı (JSON)

Bir kartın kişiden kişiye (ya da Sohbet'te) paylaşılan hali, `paylas()` fonksiyonunun ürettiği payload ile tanımlı — bu şekil artık fiilen **Rite'ın kartlar-arası taşıma formatı**:

```json
{
  "tur": "aktivite",
  "ad": "...",
  "faydalar": ["..."],
  "aciklama": "...",
  "kartTipi": "anket",
  "kartConfig": { "sorular": ["..."] },
  "from_ad": "Gönderenin adı",
  "baslangic": "...",
  "bitis": "..."
}
```

Sohbet mockup'ının `kart` mesaj tipi bilerek bu şemayı aynen kullanıyor (bkz. §6) — ileride gerçek bir chat altyapısına geçildiğinde format sürprizi yaşanmasın diye.

---

## 4. Home mimarisi

Home, "herkes için farklı ve özelleştirilebilir" olması gereken kişisel bir pano olarak konumlanıyor — bu uzun vadeli bir hedef, henüz tam kapsamda değil. Bugünkü Home üç katmandan oluşuyor, yukarıdan aşağıya:

### 4.1 Odak Alanları (sabit, en üstte)

`CardContainer` içinde, Home'un TEK sabit/sürüklenemez elemanı. İçeriği (ad/checklist/örnek aktiviteler) **kanonik** — sadece Rite Studio'dan, `dog_meridyen_alanlar` üzerinden düzenleniyor. Kullanıcının kendi Home'undaki kontrolü sadece: hangi alanların görünür olduğu (`home_gizli`) ve sırası (`dog_gruplar.sira`, kartı basılı tutup sürükleyerek).

> **Evrim notu**: Bu, projenin daha önceki bir aşamasında (bkz. `momentum` proje hafızası) çok farklıydı — kullanıcının kendi 6 alanını (Beslenme/Egzersiz/Uyku/…) kendi içerikleriyle (checklist, örnekler) tanımlayıp bir "pil" görselinde kendini puanladığı, tamamen kişiye özel bir sistemdi (`dog_home_alanlar`). O model artık **geçerli değil** — bugünkü sistem kanonik içerik + kişisel görünürlük/sıra şeklinde. Bu belgeyi okuyup eski notlara bakan biri (ben dahil) bu farkı gözden kaçırmamalı.

Odak Alanları kendi İÇİNDE zaten bir `SiraliListe` barındırdığı için (alan kartlarının sürüklenmesi), Home'un genel widget sürükle-bırak sıralamasının DIŞINDA tutuluyor — iki iç içe sürükleme altyapısının aynı anda aktive olma riski bilinçli olarak ertelendi.

### 4.2 Widget'lar (sürüklenebilir, kataloglu)

`Widget` — `CardContainer`'dan farklı, ikinci bir birincil UI tipi: aç/kapa yok, children yok, tek davranışı `onClick` ile ilgili tam sayfayı açmak; görsel dili CardContainer header'ıyla aynı. `SiraliListe` ile Home'da sürükle-bırak sıralanabiliyor (cihaza özel, `LS_WIDGET_SIRA`).

**`WIDGET_KATALOG`** — kod-seviyesinde sabit bir kayıt (kullanıcı kendi widget'ını yaratamaz, "fikirler kaybolmasın" diye burada tutuluyor), Ayarlar → "🧩 Widget kataloğu" ekranından görülüyor:

| Anahtar | Ad | Durum |
|---|---|---|
| `olcumler` | Ölçümler | ✅ Uygulandı |
| `yaklasan_aktiviteler` | Yaklaşan aktiviteler | ✅ Uygulandı |
| `gelenler` | Gelenler (Inbox) | ✅ Uygulandı |
| `notlar_widget` | Notlar | ✅ Uygulandı |
| `gun_ozeti` | Bugünün özeti | 💡 Fikir |
| `seri` | Alışkanlık serisi | 💡 Fikir |
| `biriktirme` | Su / Pomodoro toplamı | 💡 Fikir |
| `ozlu_soz` | Günün sözü | 💡 Fikir |
| `ilac_hatirlatici` | İlaç hatırlatıcı | 💡 Fikir |
| `dil_kartlari` | Dil öğrenme kartları (AI) | 💡 Fikir |
| `home_assistant` | Home Assistant / Raspberry Pi | 💡 Fikir |
| `harici_db` | Harici veritabanı (ör. Hostinger) | 💡 Fikir, mimari tartışmalı (§6) |
| `greentask_mevzuat` | Greentask — Resmi Gazete taraması | 💡 Fikir, mimari tartışmalı (§6) |

**Widget felsefesi** ("geniş düşünme ilkesi"): Rite bir ajanda/organizer/habit-planner/reminder olduğu için görünüşte alakasız fikirler (özlü söz, ilaç hatırlatma, dil kartları, Home Assistant) bile aslında alakalı — altta yatan ihtiyaç (hatırlat/takip et/göster) zaten Rite'ın çekirdeği. Yaklaşım: şimdilik geniş düşün, zaman buldukça ekle, bazıları elenecek ama "sadece o özellik için" kullanacak insanlar olacağından değerli. Widget'lar birbirinden ve çekirdek yapıdan İZOLE, "ayrı birer program gibi" durmalı — mobile geçince App Store onay zorluğu riski var, ama bu bilinçli olarak SONRAYA (kırpma/ayıklama aşamasına) bırakıldı.

### 4.3 Home kısayolları (kişisel pinleme)

Herhangi bir kişisel kart (`kaynak='Kendi', kart_tipi='bilgi'`) ⋯ menüsünden "📌 Home kısayolu" ile pinlenebiliyor (`kart_config.home_kisayol`, DB'de, cihazlar arası senkron). Home'da widget listesinin hemen altında, Widget'la AYNI görünümde ama kendi (henüz sürüklenemeyen) sırasında listeleniyor. WIDGET_KATALOG'a BİLİNÇLİ olarak dahil değil — kataloğun sözleşmesi "tek, global göster/gizle anahtarlı bir widget tipi", pinleme ise kullanıcının kendi seçtiği, sayısı değişken bir liste; farklı bir mekanizma.

Bu, ilk somut kullanım örneğiyle (Rusça video serisi, 4-5 gün süren izleme) motive edildi: kullanıcı Home'dan doğrudan o kartın detayına atlayıp kaldığı yerden devam edebiliyor.

**"Proje Kartı" / Odak Alanı ilişkisi** (henüz tam netleşmedi, §8'de açık soru): bir Odak Alanı = aynı adı taşıyan bir Kişisel Arşiv klasörü; klasörün kendisini özetleyen bir "Proje Kartı" (güvenilen video/yazılı özet) + karmaşık konularda alt-konu başına ayrı bilgi kartları düşünülüyor. Fikir olgunlaştı ama henüz uygulanmadı.

### 4.4 Yapı taşları (API özeti)

- **`CardContainer`** — `{ baslik, acik, onToggle, aksiyon?, tikla?, gorunum?, onGorunumToggle?, kapaliOnizleme?, renk?, onRenkSec?, headerToggle?, eylemler?, baslikGizli?, children }`. Aç/kapa durumu cihaza özel (`localStorage`). Kullanım yerleri: Odak Alanları, Ölçümler (artık Widget), Ajanda'nın gün listesi, Notlar (gömülü + tam sayfa).
- **`SiraliListe`** — sürükle-bırak iskeleti CardContainer'dan ayrı bir yardımcı: `{ ogeler, idAlani?, strateji?, onSirala?, onDragEnd?, devreDisi?, children }`. Dış düzeni belirlemiyor, sadece sıralama mantığını veriyor. Notlar/Home Alanları/Ajanda gün listesi/Home widget'ları bunu kullanıyor.
- **`Widget`** — `{ ikon?, baslik, bilgi?, onClick }`. Aç/kapa/children yok.
- **`HavuzKlasor`** — CardContainer'a görsel olarak benzer ama BİLİNÇLİ ayrı bir bileşen (Havuz'un Kişisel Arşiv'inde kullanılıyor, §5) — liste/kart toggle'ı yok, kendi ⋯ menüsü var (📁/📝/📋/✂️/✎/🗑). CardContainer ile birleştirilmesi Behnan tarafından bilinçli olarak reddedildi ("zorlamayalım") — iki bileşenin farklı davranış sözleşmeleri var, zorla birleştirmenin getirisi net değil.

---

## 5. Havuz mimarisi

Outlook'un mail/klasör mantığından esinlenilmiş, 3 kökü var:

- **📥 Gelenler** (`dog_inbox`) — düz, kronolojik bir inbox. Kabul edilen bir paylaşım `durum:'alindi'` ile işaretlenip buton devre dışı kalıyor (idempotent — bkz. aşağıda Havuz'daki eşdeğer düzeltme).
- **🗄️ Kişisel Arşiv** (`dog_activities`, `client_id` dolu) — Windows tarzı 2 seviyeli klasör gezgini (`HavuzKlasor`), kes-yapıştır destekli. "Kaydedilenler" adlı özel bir klasör, Ajanda'dan doğrudan kaydedilen kartların düştüğü yer.
- **🗑️ Çöp Kutusu** — birleşik soft-delete (`silindi_tarih`), 30 gün lazy-purge, geri alınabilir.

**Paylaşım** (`paylas()`) bir kartı `dog_inbox`'a, bir ya da birden çok kişiye (share_code ile) yolluyor — payload şekli §3.2'de.

**Kendi Havuzuna al** (`ritHavuzaAl`) — Ajanda'da yaratılmış bir kartı kimseye göndermeden doğrudan Kişisel Arşiv'e (Kaydedilenler klasörüne) ekliyor. **2026-09-20'de idempotent hale getirildi**: daha önce her tıklamada yeni bir kopya oluşturuyordu; artık kaynak kartın id'si `kart_config._kaynak_rit_id` olarak (mevcut config bozulmadan) saklanıyor, zaten eklenmiş bir kart için buton "✓ Havuzunda" diye devre dışı kalıyor — Gelenler'in `durum:'alindi'` desenine paralel. Bu düzeltmeden ÖNCE oluşmuş kopyalar otomatik birleştirilmedi, elle temizlenmesi gerekiyor.

---

## 6. Sohbet & dış entegrasyon yönü

Sohbet sekmesi bugün **cihaz-yerel bir mockup** — gerçek bir chat/görüntülü-görüşme altyapısına henüz bağlı değil, hiçbir mesaj bir backend'e yazılmıyor. Amaç, gerçek altyapıya karar vermeden önce "neyi nasıl paylaşacağız" formatını elle denemek. Üç mesaj tipi var: `metin`, `kart` (§3.2'deki paylaşım şemasıyla aynı), `anket` (gerçek `AnketKart` bileşeni balonun içine gömülü — bir anketin sohbette dolarak Rite'a aktarılması senaryosunun denemesi).

**Gerçek altyapı kararı henüz verilmedi.** İki uç:
- **Stream.io** (hazır SaaS) — hız/kolaylık, ama veri onların altyapısında durur, özel mesaj tiplerini (kart/anket) kendi veri modeline sıkıştırmak gerekir.
- **Kendi VPS'i** — tam kontrol, mesaj = doğrudan Rite'ın kendi şeması olabilir (ekstra eşleme katmanı yok), ama gerçek-zamanlı altyapı/görüntülü-görüşme (WebRTC/TURN) yükü kendine kalır.

Önerilen orta yol: hangi altyapı seçilirse seçilsin, "mesaj içine Rite kartı gömme" ihtiyacını en baştan bir soyutlama olarak tasarlamak (mesaj tipi = metin | kart-referansı | anket, referans tipleri her zaman Rite'ın kendi tablosundaki bir satıra işaret eder) — bu, Stream.io'dan kendi altyapısına geçişi nispeten ağrısız kılar.

**Dış widget entegrasyon modelleri** (henüz sadece tasarım, kod yok) — iki örnekten (Hostinger veritabanı, Greentask'ın Resmi Gazete taraması) çıkan iki farklı desen:
- **"Çek" (pull) modeli**: Rite kullanıcının 3. parti kimlik bilgisini TUTUP kendisi çekiyor. Ağır güven yükü — paylaşılan tek bir "kimlik kasası + zamanlanmış çekici" alt sistemi gerekiyor (şifreli saklama, sunucu tarafı sorgu, sadece SONUÇ bir önbellek tablosuna yazılır, ham kimlik client'a hiç gitmez). Kullanıcının kendi AI API key'ini girme sorunuyla AYNI sınıf.
- **"İt" (push) modeli**: dış otomasyon kendi kimlik bilgilerini kendisi tutar, sadece küçük bir özet payload'ı bir webhook/token ile Rite'a "iter". Rite hiç 3. parti kimlik bilgisi tutmaz — çok daha hafif, genellenebilir bir yol.

---

## 7. Teknik konvansiyonlar

- **Migration'sız işaret deseni**: yeni bir boolean/meta bilgi gerektiğinde (ör. `home_gizli`, `home_kisayol`, `_kaynak_rit_id`) önce var olan bir JSONB alana (`kart_config`) mevcut içerik SPREAD ile korunarak eklenir — şema migration'ı gerektirmez, hızlı iterasyona uygun. Kalıcı/çapraz-cihaz bir bayrak gerektiğinde tercih edilen yol bu.
- **`localStorage` vs DB**: cihaza özel, "bu ekranı açık mı tutuyorum" gibi tercihler (`containerAcik`, `widgetGorunur`, `widgetSira`) `localStorage`'da; kullanıcının kimliğiyle taşınması gereken, cihazlar arası senkron olması gereken şeyler (`home_gizli`, `home_kisayol`) DB'de (JSONB içinde).
- **Doğrulama pipeline'ı** (her teslimde): `esbuild` (sözdizimi) → `tsc --strict false` (TS2304/2552/2339 sıfır olmalı — gerçek hatalar) → `tsc --strict` taraması (TS7006/2367 sayısı BASELINE'ı aşmamalı, güncel: 242) → md5 doğrulamalı dosya teslimi → git komutu Behnan'a metin olarak bırakılır (asla otomatik çalıştırılmaz).
- **Kart tipi eklerken standartlaşma**: `KARTLAR` (ikon/etiket) + `KART_LAB` (örnek config) + kendi `XKart` bileşeni — üçü birlikte güncellenir.

---

## 8. Açık sorular / ertelenmiş kararlar

- Eski tek-link `kart_tipi==='video'` mekanizmasının tamamen kaldırılması (yerini `bilgi`'nin `videolar[]`'ı zaten aldı) — acil değil, kaldırılırken Inbox hızlı-link-ekleme ve Rutin video-attach kullanım yerlerinin gözden geçirilmesi gerekiyor.
- Home kısayollarının (pinlenen kişisel kartlar) kendi aralarında sürüklenerek sıralanması — v1'de yok.
- "Proje Kartı" kart tipinin/Odak Alanı ilişkisinin netleşmesi ve uygulanması.
- Sohbet/görüntülü görüşme altyapısı kararı (Stream.io vs kendi VPS'i).
- Dış widget entegrasyon modellerinin (pull/push) gerçek kodla ilk örneği.
- İlaç hatırlatıcı widget'ı, AI API'ye bağlı widget örnekleri (dil kartları vb.) — "uygun bir zamanda" yapılacak.
- Kart sisteminde (xtiles/Notion tarzı) formatlama zenginleştirmesi — Behnan şu an araştırma aşamasında, henüz somut bir öneri yok.
- Widget'ların mobile geçişte App Store onayı açısından hangilerinin kullanıcıya sunulacağı — bilinçli olarak sona bırakıldı.
