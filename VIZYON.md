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

**Danışman modu için genişleme gerekiyor (2026-09-22 R&D, henüz kodlanmadı)**: bireysel danışmanlık feasibility turu, bugünkü tek-kaynak veri modelinin bir danışman-danışan İLİŞKİ tablosuna ihtiyaç duyduğunu gösterdi — `kaynak` alanındaki düz `'Meridyen'` string'i HANGİ danışmandan geldiğini ayırt etmiyor, bir danışanın birden fazla danışmanı (ör. sınav koçu + diyetisyen) olabildiği senaryoda yetersiz kalıyor. Tasarlanan yön: `iliski_id`-benzeri bir referans, bir kartın hangi danışman-danışan ilişkisine ait olduğunu tutar (çoklu-danışman filtrelemesi için gerekli). **Reconciliation notu**: repo'da önceden yazılmış ama henüz ÇALIŞTIRILMAMIŞ bir `rite_auth_migration.sql` var — `dog_clients.auth_id`/`meridyen_bagli` + TEK bir `dog_meridyen_uyelik` (client_id/baslangic/bitis) tablosu ekliyor. Bu, Meridyen'e ÖZEL ve TEK-ilişkili bir model; bugün tasarlanan çoklu-danışman `iliski_id` modeli daha geneldir, bu migration'ın genelleştirilmesi (ya da yerine yeni bir ilişki tablosu tasarlanması) gerekecek — kodlama aşamasında ele alınacak, henüz karar verilmedi. Detaylar için §7.

---

## 3. Kart sistemi

Rite'ın en temel birimi **kart** — bir aktivite/not/alışkanlık her zaman bir `kart_tipi` + `kart_config` (JSONB, tipe özel ayarlar) çiftiyle temsil ediliyor. Mimari ilke: **`kart_tipi` mobilde kapalı, kod-tanımlı bir küme olacak** — kullanıcı kendi kart tipini yaratamıyor (CardContainer/Widget gibi düzen bileşenlerinin aksine). Bu, App Store'a geçişte "her şey mümkün" esnekliğinin getireceği onay/bakım yükünü baştan sınırlamak için bilinçli bir tercih.

Her kart tipinin kendi React bileşeni var (`AnketKart`, `ChoktanKart`, vb. — dosyada satır ~914-1360 arası) ve `KART_LAB` sabiti (Geliştirici modu → Kart Laboratuvarı) her tip için örnek bir `ornekConfig` tutuyor; yeni bir tip eklerken bu ikisi + `KARTLAR` listesindeki ikon/etiket birlikte güncellenir — **standartlaşma** kuralı bu.

### 3.1 Mevcut envanter (20 kod-tanımlı tip + 1 özel tip)

| Tip | İkon | Config şekli (özet) | Not |
|---|---|---|---|
| `standart` | • | — (opsiyonel resim + ortak `aciklama`) | Varsayılan, boş kart |
| `bilgi` | 📄 | `{ videolar: {baslik?,url,bas?,bit?,ozelNot?}[] }` | **Kişisel Not/Aktivite'nin asıl motoru** — çoklu video, `BilgiKartEdit` ile düzenlenir. `KART_LAB`'da yok (kendi zengin editörü var) |
| `video` | 🎬 | `{ url }` | **LEGACY** — tek link, eski mekanizma. `bilgi`'nin `videolar[]`'ı onu fiilen geçersiz kıldı, "bir ara tamamen iptal" bekliyor (bkz. §9) |
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

**"Proje Kartı" / Odak Alanı ilişkisi** (henüz tam netleşmedi, §9'da açık soru): bir Odak Alanı = aynı adı taşıyan bir Kişisel Arşiv klasörü; klasörün kendisini özetleyen bir "Proje Kartı" (güvenilen video/yazılı özet) + karmaşık konularda alt-konu başına ayrı bilgi kartları düşünülüyor. Fikir olgunlaştı ama henüz uygulanmadı.

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

## 6. Sohbet, video & dış entegrasyon yönü

Sohbet sekmesi bugün **cihaz-yerel bir mockup** — gerçek bir chat/görüntülü-görüşme altyapısına henüz bağlı değil, hiçbir mesaj bir backend'e yazılmıyor. Amaç, gerçek altyapıya karar vermeden önce "neyi nasıl paylaşacağız" formatını elle denemek. Üç mesaj tipi var: `metin`, `kart` (§3.2'deki paylaşım şemasıyla aynı), `anket` (gerçek `AnketKart` bileşeni balonun içine gömülü — bir anketin sohbette dolarak Rite'a aktarılması senaryosunun denemesi).

**Altyapı kararı verildi (2026-09-22 R&D)**:
- **Sohbet/mesajlaşma → Supabase Realtime + Rite'ın kendi mesaj tablosu** (Stream.io DEĞİL). Gerekçe: sohbet balonlarında Rite'ın kendi kart render sistemini (`kart_tipi`/`kart_config`, `KartSatiri` vb.) göstermek gerekiyor — üçüncü-parti bir SDK'nın (Stream) kendi mesaj/attachment modeline sıkıştırmak yerine, mesaj tamamen Rite'ın kendi şemasında tutulup kendi bileşenleriyle render edilirse bu sorun hiç oluşmuyor. Henüz "kurup görmeliyiz" aşamasında, prototip yapılacak.
- **Görüntülü görüşme → yönetilen bir SaaS (Stream Video / Daily.co / LiveKit Cloud / Twilio gibi), sağlayıcı henüz SEÇİLMEDİ.** Chat'i Stream'den uzaklaştıran gerekçe (kart render'ı) video görüşmeye taşınmıyor — orada kamera/mikrofon/ekran paylaşımı var, özel içerik render derdi yok. DIY WebRTC (kendi sinyalizasyon + TURN sunucusu) chat'ten çok daha ağır/riskli görüldü (NAT traversal, güvenilirlik, iOS PWA'da WebRTC'nin bilinen tuhaflıkları) — bu yüzden elenmedi, tam tersine yönetilen SaaS tercihini güçlendirdi. Karar inşa zamanına bırakıldı.
- Her iki karar da aynı önkoşula dayanıyor: **Supabase Auth zaten paylaşım/danışmanlık için zorunlu olacağından** (bkz. §7), sohbet/video için ayrı bir üçüncü-parti kimlik/token katmanı (Stream'in kendi mekanizması gibi) ek bir mimari maliyet DEĞİL, gereksiz bir tekrar — bu da Stream Chat'i eleme kararını destekledi.

Önerilen soyutlama (korunuyor, artık seçilen Supabase Realtime yaklaşımıyla daha da doğal): mesaj tipi = metin | kart-referansı | anket, referans tipleri her zaman Rite'ın kendi tablosundaki bir satıra işaret eder.

**Paylaş (`dog_inbox`) ile Sohbet'in bir arada durması — açık, ertelendi**: bugünkü tek-yönlü Paylaş akışı çalışır durumda; Sohbet paralel inşa edilirken hangisinin öne çıkacağı / ikisinin nasıl bir arada duracağı o sırada netleşecek, şimdi karar verilmiyor.

**Dış widget entegrasyon modelleri** (henüz sadece tasarım, kod yok) — iki örnekten (Hostinger veritabanı, Greentask'ın Resmi Gazete taraması) çıkan iki farklı desen:
- **"Çek" (pull) modeli**: Rite kullanıcının 3. parti kimlik bilgisini TUTUP kendisi çekiyor. Ağır güven yükü — paylaşılan tek bir "kimlik kasası + zamanlanmış çekici" alt sistemi gerekiyor (şifreli saklama, sunucu tarafı sorgu, sadece SONUÇ bir önbellek tablosuna yazılır, ham kimlik client'a hiç gitmez). Kullanıcının kendi AI API key'ini girme sorunuyla AYNI sınıf.
- **"İt" (push) modeli**: dış otomasyon kendi kimlik bilgilerini kendisi tutar, sadece küçük bir özet payload'ı bir webhook/token ile Rite'a "iter". Rite hiç 3. parti kimlik bilgisi tutmaz — çok daha hafif, genellenebilir bir yol.

---

## 7. Danışman modu (bireysel danışmanlık) mimarisi — R&D, henüz kodlanmadı

**Durum**: 2026-09-22'de yürütülen kapsamlı bir feasibility turu, "Meridyen/Rite Studio olmadan sadece Rite ile bireysel danışmanlık yapılabilir mi" sorusuna OLUMLU yanıt verdi — sınav koçluğu, diyetisyenlik, fitness/PT ve kısaca dil/müzik/yaşam koçluğu domainleri tarandı, hiçbiri bugünkü mimariyi kırmadı. Aşağıdaki tasarım bu turun SONUCU — henüz kod yok, üst-karar KOŞULLU (bkz. §9 ve `URUN-VIZYONU.md` §6).

### 7.1 Auth gating sınırı

Supabase Auth (e-posta ile kayıt) şu roller/eylemler için ZORUNLU: paylaşım yapmak, sohbet/video görüşmesi yapmak, ya da bir danışan/danışman ilişkisinde taraf olmak — danışan tarafı da dahil (önceden "danışan daha hafif kalabilir mi" belirsizdi, artık netleşti: HAYIR, ikisi de gerekiyor). Tamamen kişisel/anonim kullanım (paylaşımsız, sohbetsiz, danışmanlıksız) hesapsız kalmaya devam ediyor. Repo'daki `rite_auth_migration.sql` bu ihtiyacın bir kısmını (auth_id + tek-ilişkili `dog_meridyen_uyelik`) zaten karşılıyor ama tek-sağlayıcı varsayımıyla yazılmış — §2'de not edilen genelleştirme gerekiyor.

### 7.2 İlişki ve kart sahipliği modeli

- Flat `kaynak='Meridyen'` yerine bir **danışman-danışan ilişki referansı** (`iliski_id`-benzeri) — bir kartın hangi ilişkiye ait olduğunu tutar.
- **Çoklu danışman desteklenir**, yakın vadeli bir ihtiyaç olarak doğrulandı (ör. bir danışanın hem sınav koçu hem diyetisyeni olması) — tasarım baştan bunu gözetiyor, ertelenmedi.
- **Danışman görünürlüğü per-ilişki filtrelenir**: bir danışman sadece KENDİ ilişkisine ait kartları görür; danışanın kişisel kartlarını ya da başka bir danışmanın kartlarını görmez. (İstisna, kapsam dışı: danışan bazı kişisel kartlarını bilerek bir danışmana açabilir — düşünüldü, şimdi yapılmıyor.)
- **Kart tipleri koçluk türüne göre SCOPE'lanır**: "＋" ile kart eklerken danışman kendi alanına özgü kart tiplerini (sınav koçu için Çalışma/Soru Çözüm, diyetisyen için öğün/Akıllı Tabak, vb.) görür — genel/kapalı tek bir liste değil, ilişkinin/danışmanlık türünün belirlediği bir alt-küme.

### 7.3 Şablon-sonra-ata (hafif)

Rite Studio'nun bugünkü `program` gruplaması (`dog_rituals.program` ortak kimlikle senkron kalan +7/-7 gün mantığı) SIKI BAĞLI bir instance modeli. Danışmanlık akışı için istenen daha HAFİF: bir haftayı bir danışan için hazırladıktan sonra ŞABLON olarak kaydedip başka bir danışana ATAmak; atandıktan hemen sonra kopyalar birbirinden TAMAMEN BAĞIMSIZLAŞIR (danışan/danışman ayrı ayrı yer değiştirip özelleştirebilir, senkron kalmaz).

### 7.4 İzin modeli (kısmen açık)

| Eylem | Kural |
|---|---|
| Gün-içi sıralama | Serbest (danışan) |
| Gün değiştirme | Koçluk türüne göre AYARLANABİLİR bir izin — henüz kesinleşmedi. İzin verilirse kartın güncel tarihi koça geri beslenmeli |
| Silme | Her zaman SADECE koç — danışan silemez; yapılmamış iş, gelişim kaydında "tamamlanmadı" olarak durur |

Koç danışanın GERÇEK/canlı ajandasını gördüğü için (simülasyon değil), gün değiştirme izni verilirse ayrı bir "geri besleme" mekanizması gerekmeyebilir — koç aynı satırı zaten canlı okuyor; asıl açık soru izin sorusu, teknik değil.

### 7.5 UI navigasyonu — hibrit çözüm

- **Home → "Danışanlarım" Widget'ı** (mevcut Widget mimarisine uyuyor, `{ikon?, baslik, bilgi?, onClick}`): YÖNETİM/genel bakış — danışan listesi (başlama tarihi, süre gibi meta), ekleme/çıkarma/askıya alma. Canlı gösterge: "N danışan" ya da "M'sinde bu hafta program eksik" gibi bir özet.
- **Ajanda sekmesi → danışan seçici (context-switcher dropdown)**: AKTİF ÇALIŞMA — bir danışan seçilince haftalık ızgara açılır, görev/kart hazırlama burada yapılır.
- **"Kimin ajandasındayım" göstergesi**: sadece bir banner değil, danışan seçiliyken TÜM Ajanda ekranının arka plan rengi/teması değişir — kişisel/danışan-modu karışma riski önemli görüldüğü için bilinçli bir tercih.
- **Gelişim (danışan için)**: Ajanda'nın context-switch'ine BAĞLANMAZ — Danışanlarım Widget'ının kendi iç akışında ayrı bir sayfa (danışan satırından doğrudan gelişim/sınav-sonuçları sayfasına gidilir). Widget bu yüzden diğer sade widget'lardan (Ölçümler/Gelenler/Notlar) biraz daha zengin/kendi iç navigasyonu olan bir widget — beklenen bir fark, sorun değil.

### 7.6 Haftalık görünüm — yeni altyapı, henüz yok

Bugün Rite'ta kart-dolu bir haftalık ızgara YOK (Ajanda'nın "Hafta" görünümü sadece 7-günlük ✓ tracker çubuğu, kart içeriğiyle dolu bir ızgara değil). Danışman modu için gereken, sıfırdan kurulacak yeni bir ekran/bileşen:
- Dar ekran (telefon): günler ALT ALTA (dikey stack).
- Geniş ekran (iPad / web = aynı PWA): YAN YANA / responsive grid (ör. 4 üstte + 3 altta).
- Zaman-dilimi (Sabah/Gün içi/Akşam) gruplaması GEREKMEZ — bu kişisel bir kurgu, koç görünümü günlere göre düz bir liste.
- Danışan tarafı da (geniş ekranda) haftalık görünüme ihtiyaç duyar; dar ekranda muhtemelen saklı/gün-navigasyonuyla gezilir — kesin değil.
- "iPad kullanımının UI tasarımlarını nasıl etkileyeceği" sorusu BİLİNÇLİ olarak ayrı/sonraki bir iş — bu turda ele alınmadı.

### 7.7 Domain doğrulaması (2026-09-22 taraması)

| Domain | Sonuç |
|---|---|
| Sınav koçluğu | Basit — Çalışma/Soru Çözüm kart tipleri + ders/konu/kaynak (PDF/video-link) referans tabloları, TYT/AYT ağırlıkları gibi zaten doğrulanmış bir DB-içerik deseniyle |
| Diyetisyenlik | Öğün kartı basit; **Akıllı Tabak** (canlı kalori/makro hesaplama, kalan öğünleri yeniden dağıtma, alternatif öneri) tek gerçek çıkıntı — statik içerik değil, kendi iş mantığı olan bir mini-araç; [[nutricore]]'un `equivalenceEngine.ts` motorundan büyük ölçüde yararlanılacak. Diyet domaininin TAMAMI (beslenme+hareket+uyku birlikte, alışveriş listesi vb.) ayrı bir araştırma turuna ERTELENDİ — şimdilik sadece klasik öğün kartıyla devam |
| Fitness / Bireysel Antrenörlük | En düşük risk — mevcut `workout` kart tipine (§3.1) ve mevcut çoklu-video desteğine (`kart_config.videolar[]`, `bilgi` tipinde zaten var) doğrudan oturuyor |
| Dil / müzik / yaşam-executive koçluğu | Kısa tarama — mimariyi kıracak bir şey görülmedi; yaşam/executive koçluk, mevcut Home/Odak Alanları öz-değerlendirme yapısına neredeyse birebir oturan bir aday |

### 7.8 Ayrı/çözülmemiş konular (danışman moduyla karıştırılmamalı)

- **Online/local (senkron-tazelik) görsel ayrımı** — bugünkü `kaynak==='Meridyen'` mavi çerçevenin GERÇEK amacı buydu (hangi kartın güncelliğinden internetsizken emin olunabileceği), "hangi danışmandan geldiği" sorusuyla karıştırılmamalı. Hâlâ çözülmemiş, ayrı bir teknik konu.
- **"Hangi danışmandan geldi" görsel ayrımı** — SAF bir kart TASARIMI meselesi (renk kodlaması değil, her domainin kendi kart anatomisiyle ayrışması) — kart görünüm taksonomisi turunda çözülecek.
- **RLS (row-level security) genişletmesi** — bir koçun başka bir danışanın satırlarına yazabilmesi için veritabanı güvenlik kurallarının (sadece UI değil) genişletilmesi gerekecek — henüz tasarlanmadı, kodlama öncesi ele alınmalı.

---

## 8. Teknik konvansiyonlar

- **Migration'sız işaret deseni**: yeni bir boolean/meta bilgi gerektiğinde (ör. `home_gizli`, `home_kisayol`, `_kaynak_rit_id`) önce var olan bir JSONB alana (`kart_config`) mevcut içerik SPREAD ile korunarak eklenir — şema migration'ı gerektirmez, hızlı iterasyona uygun. Kalıcı/çapraz-cihaz bir bayrak gerektiğinde tercih edilen yol bu.
- **`localStorage` vs DB**: cihaza özel, "bu ekranı açık mı tutuyorum" gibi tercihler (`containerAcik`, `widgetGorunur`, `widgetSira`) `localStorage`'da; kullanıcının kimliğiyle taşınması gereken, cihazlar arası senkron olması gereken şeyler (`home_gizli`, `home_kisayol`) DB'de (JSONB içinde).
- **Doğrulama pipeline'ı** (her teslimde): `esbuild` (sözdizimi) → `tsc --strict false` (TS2304/2552/2339 sıfır olmalı — gerçek hatalar) → `tsc --strict` taraması (TS7006/2367 sayısı BASELINE'ı aşmamalı, güncel: 242) → md5 doğrulamalı dosya teslimi → git komutu Behnan'a metin olarak bırakılır (asla otomatik çalıştırılmaz).
- **Kart tipi eklerken standartlaşma**: `KARTLAR` (ikon/etiket) + `KART_LAB` (örnek config) + kendi `XKart` bileşeni — üçü birlikte güncellenir.

---

## 9. Açık sorular / ertelenmiş kararlar

- Eski tek-link `kart_tipi==='video'` mekanizmasının tamamen kaldırılması (yerini `bilgi`'nin `videolar[]`'ı zaten aldı) — acil değil, kaldırılırken Inbox hızlı-link-ekleme ve Rutin video-attach kullanım yerlerinin gözden geçirilmesi gerekiyor.
- Home kısayollarının (pinlenen kişisel kartlar) kendi aralarında sürüklenerek sıralanması — v1'de yok.
- "Proje Kartı" kart tipinin/Odak Alanı ilişkisinin netleşmesi ve uygulanması.
- Dış widget entegrasyon modellerinin (pull/push) gerçek kodla ilk örneği.
- İlaç hatırlatıcı widget'ı, AI API'ye bağlı widget örnekleri (dil kartları vb.) — "uygun bir zamanda" yapılacak.
- Kart sisteminde (xtiles/Notion tarzı) formatlama zenginleştirmesi — Behnan şu an araştırma aşamasında, henüz somut bir öneri yok.
- Widget'ların mobile geçişte App Store onayı açısından hangilerinin kullanıcıya sunulacağı — bilinçli olarak sona bırakıldı.
- **(2026-09-22, danışman modu R&D'sinden)** `rite_auth_migration.sql`'in çoklu-danışman `iliski_id` modeline göre genelleştirilmesi — kodlama öncesi ele alınacak (§2, §7.1).
- **(2026-09-22)** İzin modelinin kesinleştirilmesi — gün değiştirme, koçluk türüne göre (§7.4).
- **(2026-09-22)** Video görüşme sağlayıcısının seçimi (Stream Video / Daily.co / LiveKit Cloud / Twilio) — inşa zamanına bırakıldı (§6).
- **(2026-09-22)** Kart taksonomisine sınav koçluğu (Çalışma/Soru Çözüm)/diyetisyenlik (öğün/Akıllı Tabak)/fitness alanlarına özgü kart tiplerinin eklenmesi — kart görünüm taksonomisi turunda (§7.7).
- **(2026-09-22)** Diyet domaininin GENİŞLETİLMİŞ hâli (beslenme+hareket+uyku birlikte, alışveriş listesi vb.) — ayrı bir araştırma turuna ertelendi (§7.7).
- **(2026-09-22)** Wellbeing kartlarının (şükran/anket/su vb., bugün zaten var olan kişisel tipler) danışman moduyla kime açılacağı — küçük, henüz çözülmemiş bir detay.
- **(2026-09-22)** RLS (row-level security) genişletmesi — bir danışmanın danışan satırlarına yazabilmesi için (§7.8).
- **(2026-09-22)** Online/local görsel ayrım mekanizması — "hangi danışmandan geldi" sorusundan AYRI, hâlâ çözülmemiş (§7.8).
- **BÜYÜK KOŞULLU KARAR'ın teyidi** — Meridyen/Rite Studio'nun kurumsal katmanının tamamen kaldırılıp kaldırılmayacağı, Behnan'ın ayrı bir kararına bağlı (parça parça koda mı aktarılacak, yoksa yeni bir isimle bağımsız bir yapıdan mı başlanacak) — bkz. `URUN-VIZYONU.md` §6.
