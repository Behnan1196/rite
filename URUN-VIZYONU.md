# Rite — Ürün Vizyonu

*Bu belge Rite'ın **esas ürün vizyonu** belgesidir; `PAZARLAMA.md`'nin yerini alır ve onu genişletir (pazarlama stratejisi burada ayrı bir bölüm olarak duruyor). Teknik mimari detayı için `VIZYON.md`'ye bakın. "(yön, henüz kesinleşmedi)" diye işaretlenen maddeler kesin karar değil, üzerinde anlaştığımız istikamettir. Bu belgedeki maddeler, Rite'ın geçmiş projelerden (üniversite sınav koçluğu yazılımı, kişisel alışkanlık denemeleri, beslenme/esenlik araştırmaları) süzülmüş **gereksinim ve tasarım girdileridir** — anlatı değil, sonuçtur.*

---

## 1. Rite nedir, nasıl bir üründür

Rite, başlangıçta Meridyen'in **teslim noktası** olarak tasarlandı — bir koçluk/danışmanlık merkezinin danışanlarına programını ilettiği bir yüzey. Meridyen projesi gecikince, Rite'ı **kendi başına anlamlı, nitelikli bir yazılım** haline getirmeye yöneldik. Bugün AI desteği ve sunucu gibi sürekli giderleri olan bir proje olduğu için doğal olarak ticari bir yöne gidiyor — ama büyük bir gelir hedefi ya da hızlı büyüyen bir girişim stratejisi yok. Amaç, **giderini çıkaran, niş, sürdürülebilir** bir ürün.

**Konumlandırma**: sakin, reklamsız, gizlilik öncelikli bir "bilinçli yaşam" aracı — dikkat ekonomisiyle yarışan, bildirim/rozet/oyunlaştırma dolu alışkanlık uygulamalarının karşısında bir alternatif.

**İki katmanlı ürün/dağıtım modeli:**
- **Bugün — Web (PWA), ücretsiz.** Eşleştirme koduyla (RITE-XXXXX) erişiliyor, hesap/e-posta gerektirmiyor. Ürünün gerçek kullanıcı geri bildirimiyle olgunlaştığı aşama.
- **İleride — Mobil uygulama (App Store), ücretli, gizlilik öncelikli.** Veri cihazda yaşar, yedek kullanıcının kendi bulut hesabından şifreli alınır — Rite'ın sunucusu kişisel veriyi hiç görmez. Abonelik App Store IAP üzerinden; Google Play şimdilik gündemde değil.

Mobile geçiş noktası **bilinçli olarak şimdiden sabitlenmiyor** — PWA'yı gerçek kullanıcılarla olgunlaştırıp, o zaman karar verilecek.

---

## 2. Çekirdek tanım

> Rite, bir kişinin günlük aktivite ve alışkanlıklarını tek bir ajanda ve ölçülebilir gelişim çevresinde topladığı, istenirse bir koç/aile/arkadaşla paylaşılabilen, gizlilik öncelikli kişisel bir yaşam aracıdır.

Bu tanımın vurguladığı iki şey: (1) ürün **paylaşım olmadan da tek başına tam ve anlamlı** olmalı — koçluk/paylaşım bir eklenti, ön koşul değil; (2) ölçme/gelişim, ajandanın ayrılmaz parçası — sadece "yap/yapma" değil, sonucun görülebilmesi.

---

## 3. Ürün katmanları

Rite'ı tek bir ürün olarak tutan, ama içinde birkaç farklı kullanım biçimini barındıran bir yapı olarak görüyoruz. Aşağıdaki üç katman, neyin **çekirdek** (hep var olmalı), neyin **ikinci katman** (ürünü farklılaştırır ama olmasa da çekirdek ayakta kalır) ve neyin **faz-sonrası** (bilinçli ertelenen, henüz inşa kararı verilmemiş) olduğunu ayırıyor.

| Katman | İçerik |
|---|---|
| **Çekirdek** | Ajanda (Aktivite/Süre modeli), Gelişim (ölçüm/istatistik takibi), Havuz/Kişisel Arşiv, fayda katmanı (görünmez temel mantık) |
| **İkinci katman** | Home (Odak Alanları, Widget'lar, kısayollar), Sohbet + paylaşım, aile grubu, kart tipi çeşitliliği, kart kaynağı ayrımı (yerel/online, bkz. §5), **danışman modu** (bireysel danışmanlık — sınav koçluğu/diyetisyenlik/fitness/vb., çoklu-danışman destekli; bkz. §6) |
| **Faz-sonrası** | field-type palette / kullanıcı esnekliği, akıllı/context-aware kartlar, mobil geçiş, widget kataloğunun deneysel kısmı |

Bu sınıflandırma sabit değil — ürün olgunlaştıkça bir madde katmanlar arasında yer değiştirebilir. **2026-09-22 güncellemesi**: "Koçluk platform modeli" faz-sonrasından ikinci katmana yükseltildi — bir feasibility turu, Meridyen/Rite Studio olmadan Rite'ın kendisinin danışman-danışan ilişkilerini ("danışman modu") taşıyabileceğini gösterdi. Bu, Rite Studio'yu "resmi ürün bileşeni" yapma fikrinin yerini alan KOŞULLU bir yön — Behnan'ın ayrı bir kararına bağlı, henüz TEYİT edilmedi (bkz. §6).

---

## 4. Ana fonksiyonlar

- **Ajanda** — günlük akış. Yapılacak/Alışkanlık/Randevu tek bir "Aktivite" olarak birleşti; tekrar ve zamanlama tek bir "Süre" mantığıyla yönetiliyor.
- **Havuz** — aktivite/alışkanlık kütüphanesi ve kişisel arşiv. Gelenler, Kişisel Arşiv ve Çöp Kutusu olmak üzere üç bölüm.
- **Home** — kişiye özel bir pano. Odak Alanları, Widget'lar ve kişisel kısayollar buradan yönetiliyor.
- **Sohbet** — bireysel destek/koçluk iletişimi. "Meridyen" markasına bağlı olmak zorunda değil: bir aile üyesinin diğerini desteklemesi de, profesyonel bir koçun danışanıyla konuşması da aynı altyapıyı kullanabilir.
- **Fayda katmanı** (görünmez ama temel) — bir aktivite tek bir yaşam alanına değil, birden fazla faydaya (hareket, sosyal bağ, beslenme…) aynı anda etiketlenir. Bu, "tek bir alan yetmiyor, bütüncül bakmak gerekiyor" gözleminden doğdu (bkz. §7).
- **Aile grubu paylaşımı** — gizlilik ilkesinin bilinçli tek istisnası: paylaşmayı seçtiğinde gizlilik zaten azalır ve kullanıcı bunu kabul eder.

---

## 5. Kart ve widget modeli

Rite'ın en küçük yapı taşı **kart**. Kullanıcı kendi kart TÜRÜNÜ yaratamaz (bilinçli bir sınır — basitlik ve App Store güvenilirliği için), ama her kartın içeriğini kendi hayatına göre doldurur. Bugün 20'yi aşkın kart türü var, beş grupta toplanabilir:

| Grup | Örnekler | Ne işe yarar |
|---|---|---|
| İçerik/bilgi | Bilgi kartı (çoklu video + not) | Kendi kürasyonunu yaptığın konuları takip etmek |
| Etkileşimli | Anket, Çoktan seçmeli | Kendine ya da paylaştığın birine soru sormak |
| Sağlık/ölçüm | Ölçüm, Ruh hali, Su, Pomodoro | Basit, tekrarlanan takip |
| Egzersiz/rahatlama | Nefes, Workout, Beden taraması, Topraklama, Uyku öncesi | Kısa, rehberli pratikler — video linki + checklist birleşimi, rehberli pratikleri takip etmek için işe yarayan bir kalıp olarak gözlemlendi |
| Planlama/yansıma | Niyet, Şükran, Maruz bırakma, Tarif, Diyet | Günlük niyet belirleme, kademeli alışkanlık değişimi |

**Widget'lar**, Home ekranına konan hızlı araçlar. Bugün dördü var: Ölçümler, Yaklaşan aktiviteler, Gelenler, Notlar. Bunun ötesinde geniş tutulan bir fikir kataloğu var (günün sözü, ilaç hatırlatıcı, AI destekli dil öğrenme, ev otomasyonu bağlantısı gibi) — hangilerinin gerçek kullanıcıya sunulacağı zamanla netleşecek. Bu genişlik bilinçli: Rite Studio ve kişisel kullanım, önce kendi ihtiyacına göre widget üretmeyi doğal kılıyor; işe yaramazsa hiç kullanıcıya açılmayabilir, başkasından gelen fikir de tarafsızca denenir.

**Yeni tasarım girdileri:**
- **Kart kaynağı ayrımı (yerel/online).** Bir kart kullanıcının kendi oluşturduğu/kullandığı (yerel) bir kart mı, yoksa bir platformdan (Rite Studio, ileride başka platformlar) gelen (online) bir kart mı — bu ilk bakışta görsel olarak (kart rengi) ayrışmalı.
- **Akıllı/context-aware kart** (faz-sonrası). Basit görünen bir kartın, arka planda diğer verilerle (o günkü aktivite, ölçümler) konuşup öneri üretmesi — ör. bir öğün kartının aktiviteye göre alternatif önermesi. Kart modelinin "statik içerik" ötesine geçebileceğinin bir örneği; VIZYON.md'deki "AI-API-connected widget" açık maddesiyle örtüşüyor.
- **Field-type palette (açık madde, karar verilmedi).** Kullanıcının kendi kart TÜRÜNÜ yaratamaması ile daha esnek, kullanıcı-tanımlı yapılar (Notion/xTiles benzeri) arasındaki gerilim henüz çözülmedi. Orta yol adayı: küçük, kapalı bir FIELD tipi paleti (metin/sayı/tarih/onay/seçenek-listesi/video-link) kodda sabit kalır, kullanıcı bundan kendi kartını/şablonunu **kompoze eder** — yeni etkileşimli kart türü değil. Bu fikri destekleyen gözlem: esnek, "tile" tarzı bir araç (video/tablo/resize içeren, paylaşılabilir pencereler) çok-alanlı/çok-projeli kullanıcılar için gerçekten değerli bulundu; ama az sayıda ilgi alanı olan bir kullanıcı için aynı esneklik gereksiz karmaşıklık olarak algılanabiliyor (bkz. §7). Yani esneklik ihtiyacı kullanıcı profiline göre değişebilir — kararı bu ayrımı gözeterek vermek gerekiyor.

---

## 6. Koçluk, paylaşım ve platform modeli

**Platform kavramı.** Rite'ın "teslim noktası" fikri, aslında genel bir örüntünün özel bir örneği: bir **platform** (dersler/konular tanımlanır, koçlar tanımlanır, koç-danışan eşleştirilir, koç haftalık kart hazırlar) ve bir **teslimat noktası** (danışan bu kartları ajandasında görür, işaretler/veri girer). Bu örüntü tek bir kuruma (Meridyen) bağlı değil — aynı altyapı, farklı alanlarda (akademik koçluk, fitness koçluğu, beslenme danışmanlığı gibi) farklı platformlara bağlanabilir. Bir kullanıcı aynı anda birden fazla platforma bağlı olabilmeli (ör. hem fitness hem beslenme danışmanlığı) — bu artık uzak bir ihtimal değil, **2026-09-22 feasibility turunda yakın vadeli bir ihtiyaç olarak doğrulandı**; ajanda ve gelişim ekranı ortak kalır, sadece kart kaynağı değişir.

**BÜYÜK, KOŞULLU STRATEJİK KARAR (2026-09-22, henüz TEYİT EDİLMEDİ).** "Meridyen/Rite Studio olmadan, SADECE Rite kullanılarak bireysel danışmanlık yapılabilir mi" sorusuna kapsamlı bir feasibility turuyla (auth modeli, ilişki/kart-sahipliği modeli, izin modeli, şablon-ata akışı, UI navigasyonu, Sohbet/video altyapısı, 4+ koçluk domaini çapraz kontrolü — bkz. `VIZYON.md` §7) OLUMLU yanıt verildi: hiçbir domain bugünkü mimariyi kırmadı. Bunun üzerine gündeme gelen bir yön: **Meridyen'in KURUMSAL katmanını — çok-rollü Rite Studio kabuğu (Sekreter/Hekim/Koordinatör/vb.), admin arayüzü — bir yedek aldıktan sonra TAMAMEN KALDIRIP, TEK bir uygulamada (Rite) hem bireysel kullanımı hem "danışman modu" ile solo koçları/danışmanları karşılamak.** Bu henüz KESİN KARAR değil — koşullu ("eğer ... gelirse") ve ayrıca ayrı bir uygulama kararına (parça parça mevcut koda mı aktarılacak, yoksa yeni bir isimle bağımsız bir yapıdan mı başlanacak) bağlı, bu belgenin güncellendiği tarihte henüz verilmemiş.

**Danışman modu — özet mimari** (detay: `VIZYON.md` §7):
- Supabase Auth: paylaşım/sohbet/video/danışman-danışan rolü olan HERKES için zorunlu (danışan tarafı da dahil); salt-kişisel kullanım hesapsız kalmaya devam eder.
- Flat `kaynak` yerine bir danışman-danışan **ilişki referansı** — çoklu-danışman filtrelemesi ve per-ilişki görünürlük (bir danışman sadece kendi ilişkisine ait kartları görür) sağlar.
- **Hafif şablon-sonra-ata**: Rite Studio'nun bugünkü sıkı-bağlı `program` senkron mantığından bağımsız — bir haftayı hazırlayıp şablon kaydet, başka danışana ata; atandıktan sonra kopyalar tamamen bağımsızlaşır.
- **İzin modeli**: silme her zaman koç-only, gün-içi sıralama serbest, gün değiştirme koçluk türüne göre ayarlanabilir bir izin (henüz kesinleşmedi).
- **UI**: Home'da "Danışanlarım" Widget'ı (yönetim) + Ajanda sekmesinde danışan-seçici dropdown (aktif çalışma, haftalık ızgara) — hibrit. Danışan seçiliyken Ajanda'nın teması/arka planı değişir ("kimin ajandasındayım" göstergesi). Danışan gelişimi Widget'ın kendi alt-akışında, Ajanda context-switch'ine bağlı değil.
- **Haftalık görünüm**: yeni bir altyapı — bugün Rite'ta kart-dolu bir haftalık ızgara yok, kurulacak (dar ekranda dikey stack, geniş ekranda responsive grid).
- **Domain doğrulaması**: sınav koçluğu (basit), diyetisyenlik (öğün basit, Akıllı Tabak Nutricore motorundan yararlanacak tek çıkıntı; diyetin GENİŞLETİLMİŞ hâli ayrı bir araştırma turuna ertelendi), fitness/PT (en düşük risk, mevcut `workout` kart tipine oturuyor), dil/müzik/yaşam koçluğu (kısa tarama, engel görülmedi).

**Kurumsal koçluk ile emsal (peer) koçluk arasındaki fark.** Kurumsal modelde roller sabit ve tek yönlüdür: koç kart yaratır ve (platform üzerinden) sonucu görür, danışan sadece uygular. Ama Rite'ın kullanım alanlarından biri de **iki Rite kullanıcısı arasındaki simetrik ilişki** — biri diğerine görev/aktivite atayabiliyor ve takip edebiliyor, roller platform tarafından atanmış değil, ilişkiye göre değişken (bir aile üyesi diğerini destekler, bir arkadaş bir arkadaşa önerir). Bugünkü paylaşım akışı (Havuz → "Kendi Havuzuma al") tek yönlü bir teslimat; alıcının ilerlemesini kaynak kullanıcıya geri gösteren bir kanal yok. **Yön netleşti (henüz kesin tasarım yok, 2026-09-22):** gerçek Sohbet altyapısı (Supabase Realtime, bkz. `VIZYON.md` §6) geldiğinde, bu geri besleme muhtemelen bir sistem mesajı olarak Sohbet üzerinden akacak — kaynak-kopya bağlantısı (kartın `_kaynak_rit_id` izini kullanan bir gözlem mekanizması) alternatifi elenmedi ama Sohbet daha doğal görünüyor; kesin tasarım henüz yapılmadı.

**Rite Studio.** Meridyen markasından bağımsız, kart tasarlayıp platform-bağlantılı kullanıcılara gönderebileceğimiz bir yazma/deney ortamı. **Şu anki fazda**, tek-operatörlü (gayrı-resmi) bir test platformu olarak kullanılıyor — kullanıcının kendi oluşturmadığı, Rite'a farklılık katan kartların tasarlanıp gönderildiği ve geri bildirimin toplandığı yer. Rite Studio'nun kendisinin çok-platformlu/admin-arayüzlü, diğer koçluk sistemlerine örnek olacak resmi bir ürün bileşeni haline gelmesi fikri **artık gündemde değil** — yukarıdaki KOŞULLU KARAR onaylanırsa Rite Studio'nun kurumsal katmanı tamamen kaldırılacak, onaylanmazsa mevcut haliyle (tek-operatörlü test ortamı) kalmaya devam edecek. Her iki durumda da "çok-platformlu, admin arayüzlü, resmi ürün bileşeni" hedefi terk edildi.

**Sohbet'in kanal/grup mimarisine evrilmesi (faz-sonrası, gerekliliği zayıfladı).** Bir kullanıcının birden fazla platforma/ilişkiye bağlı olabilmesi ihtiyacı, artık danışman modu tasarımında **ilişki referansı (`iliski_id`) ile Ajanda/kart düzeyinde per-ilişki filtreleme** şeklinde çözülüyor (yukarı bkz.) — Sohbet'in kendisinin kanal/grup mimarisine evrilmesi (her platform/ilişki kendi kanalı, stream.io tarzı) hâlâ makul bir gelecek adım olabilir, ama artık kart-görünürlüğü sorununu çözmek için ZORUNLU değil.

---

## 7. Kullanıcı çeşitliliği ve tasarım girdileri

Rite'ın kullanıcı kitlesi ve kullanım amaçları, kişisel kullanım ve geçmiş projelerden gelen deneyimle çeşitlendi. Aşağıdaki gözlemler, farklı kaynaklardan (kişisel alışkanlık denemeleri, danışmanlık/koçluk yazılımı deneyimi, kişisel organizasyon araçları kullanımı) süzülmüş, genelleştirilmiş tasarım girdileridir:

- **Çok-girişli araç kutusu hipotezi.** Farklı kullanıcılar Rite'a farklı tek bir giriş noktasından bağlanabilir — biri ajandayı çok kullanır, biri alışkanlık yapısını, biri sadece hatırlatma/bildirim için açar. Ortak payda: hatırlatma/takip altyapısı. Ürün bunu destekleyecek şekilde geniş düşünülmeli, ama her kullanıcıya her şeyi göstermek zorunda değil.
- **Hatırlatma-öncelikli giriş noktası.** Bazı kullanıcılara (özellikle dijital araçlara uzak duran ya da normal yollarla ulaşmanın zor olduğu bireylere) ulaşmanın neredeyse tek yolu basit bir telefon uygulaması olabiliyor. Bu kullanıcılar için düşük bilişsel yük gerektiren, sade bir giriş noktası (hatırlatma + basit ödül/ilerleme görselleştirmesi, ör. bir hedefe biriken ilerleme çubuğu) önemli — bu zaten Gelişim sekmesinin bir örneği.
- **Alışkanlık oluşturma öğrenimleri.** Basit, az sayıda görevle başlayıp kademeli zorlaştırmak; maddi/motivasyonel bir ödül mekanizmasına bağlamak işe yarayabiliyor ama tek başına yeterli değil — hatırlatma/yönlendirme sürmesi gerekebiliyor, ve motivasyon kaynağı (ödül ya da ilgi) azaldığında sürdürülebilirlik zayıflayabiliyor. "21 gün alışkanlık" gibi basit kuralların tam doğru olmadığı gözlemlendi.
- **Audience segmentation — esneklik herkese göre değil.** Aynı anda birçok ilgi/proje alanı olan kullanıcılar için esnek, çok-amaçlı organizasyon araçları (tile/pencere tarzı) gerçekten değerli. Ama az sayıda, basit ihtiyacı olan bir kullanıcı için aynı esneklik gereksiz karmaşıklık, hatta "zihni çalıştırmak" yerine yük olarak algılanabiliyor — bazı kullanıcılar bilinçli olarak "aklımda tutmayı tercih ederim" diyebiliyor. Bu, hedef kitleyi tek tip "esneklik isteyen" olarak varsaymamak gerektiğini gösteriyor; sadelik de bir tasarım değeri olarak eşit ağırlıkta kalmalı.
- **Fayda katmanının kökeni.** Tek bir yaşam alanına (ör. beslenme) odaklanmanın yetmediği, hareket ve stres yönetimi gibi alanların da birlikte düşünülmesi gerektiği gözlemlendi — fayda katmanı kavramı buradan doğdu.
- **"Kendi kendine danışmanlık."** Adlandırması henüz netleşmemiş ama özü net: ikinci bir kişi (koç/aile/arkadaş) olmadan, kullanıcının kendi kendine yararlı alışkanlıkları belirleyip uygulaması ve sonucu mümkün olduğunca ölçmesi. Bugün "bireysel koçluk" şemsiyesi altında, koçluk-eşlikli kullanımla karışık duruyor — ikisi ayrı terimlerle ayrışmalı: kendi başına yürüyen kullanım vs. bir başkasının eşlik ettiği kullanım. **(2026-09-22)**: bu ayrım artık "danışman modu" (bir başkası eşlik ediyor, bkz. §6) kavramıyla somutlaştı — adlandırma hâlâ kesin değil ama iki kullanım biçimi artık mimari düzeyde ayrışıyor.

---

## 8. Pazarlama stratejisi

**Hedef kitle (birincil)**: geniş bir "bilinçli yaşam" kitlesi — sadelik, reklamsızlık ve gizlilik değeri gören, alışkanlık/ajanda arayan insanlar. Ancak §7'deki segmentasyon gözlemi burada da geçerli: dil ve arayüz, hem çok-alanlı/esneklik isteyen kullanıcıya hem de sade/basit ihtiyacı olan kullanıcıya (ör. emekli/60+ kitle) açık kalmalı.

**Aşamalı, halka-halka büyüme** (reklam YOK):
1. **1. halka** — çok yakın çevre. PWA üzerinden, ücretsiz, doğrudan davet.
2. **2. halka** — onların çevresi. Organik, kişisel tavsiyeyle yayılma.
3. **Sonrası** — ürün PWA aşamasında olgunlaştıkça, mobil/ücretli sürüme geçiş ve daha geniş bir kitleye açılma — zamanlaması şimdiden sabitlenmiyor.

**Gelir modeli**: PWA kalıcı olarak ücretsiz kalır. Mobil uygulama, App Store üzerinden küçük, sabit bir abonelik (yön, henüz kesinleşmedi). **Ek model adayı (yön):** koçluk/platform bağlamında, ücretin kullanıcı yerine platform/kurum tarafından karşılanması — geçmiş bir koçluk yazılımı deneyiminde mobil uygulama kullanıcıya tamamen ücretsizdi, çünkü bedel platform tarafında (dershane) karşılanıyordu. Rite Studio üzerinden yürüyecek platform ilişkilerinde benzer bir B2B2C model değerlendirilebilir.

**Yeni fikir (2026-09-22, B-plan/ikincil, birincil tercih DEĞİL)**: Rite'ın teslimat (tüketim/takip) kısmı ücretsiz kalır, koçluk ve bazı bölümler uygulama-içi satın alma ile aktive edilir — bu, danışman modu feasibility turunun tetikleyicisi olan bir yan-fikirdi. Henüz karar değil; birincil B2B2C/mobil-abonelik modeliyle çelişmiyor, tamamlayıcı bir olasılık olarak not ediliyor.

**Mobilin "neden parayla" hikayesi — gizlilik**: mobili değerli kılacak şey "daha fazla özellik" değil, **veri modelinin kendisi**: veri cihazda yaşar, yedek kullanıcının kendi bulut hesabından şifreli alınır, Rite'ın sunucusu kişisel içeriği hiç görmez.

**Kanal/efor**: Ücretli reklam yok. İlk enerji kişisel çevre üzerinden beta kullanıcı toplamaya gidiyor.

**Koçluk çerçevesi**: "Meridyen" markası ve merkezi kütüphanesi marketed sürümde yer almıyor, ama sohbet+paylaşım altyapısı kalıyor.

---

## 9. Fazlama mantığı ve tetikleyiciler

Faz geçişleri takvime değil, somut olgunluk/tetikleyici noktalarına bağlanıyor:

- **PWA → Mobil geçiş**: gerçek kullanıcı geri bildirimiyle "mobile taşınmaya değer" noktasına ulaşmak — şimdiden tarih verilmiyor.
- **Rite Studio'nun kurumsallaşması (çoklu platform, admin arayüzü)**: somut bir tetikleyici var — mevcut bir koçluk ortaklığının bu yıl sona ermesi, bu yapının yeniden ele alınmasını gerektirebilir. Bu, Rite Studio'nun "hazır" olmasının zaman baskısı taşıyan tek maddesiydi. **2026-09-22 güncellemesi**: bu yönün TAM TERSİ bir alternatif de artık masada — Rite Studio'yu kurumsallaştırmak yerine TAMAMEN KALDIRIP Rite'a konsolide etmek (bkz. §6, BÜYÜK KOŞULLU KARAR). Hangi yönün izleneceği aynı tetikleyiciyle (ortaklığın sona ermesi) netleşecek — iki alternatif de bu tetikleyiciye bağlı, henüz karar yok.
- **Kart_tipi/field-type palette kararı**: §5'teki gözlemler netleştikçe (gerçek kullanıcı çeşitliliği görüldükçe) karara bağlanacak.
- **Peer-to-peer geri besleme mekanizması**: aile grubu paylaşımı gerçek kullanımda darboğaz yaratırsa önceliklenecek.

---

## Açık/ileri maddeler

- Mobile geçişin tam tetikleyicisi — PWA geri bildirimiyle netleşecek.
- Mobil abonelik fiyatlandırması.
- Aile grubu paylaşım sunucusunun tam kapsamı (kimlik doğrulama, grup yönetimi) — henüz tasarlanmadı.
- Hangi widget/kart fikirlerinin gerçek kullanıcıya sunulacağı, App Store onay riski gözetilerek zamanla ayıklanacak.
- Kart kaynağı (yerel/online) görsel ayrımının somut tasarımı — **2026-09-22'de netleşti ki bu, "hangi danışmandan geldiği" sorusundan AYRI bir konu** (online/local = senkron-tazelik; danışman-kimliği = saf kart tasarımı meselesi) — ikisi de ayrı ayrı hâlâ çözülmedi, bkz. `VIZYON.md` §7.8.
- Peer-to-peer geri besleme: yön netleşti (Sohbet üzerinden, bkz. §6), kesin tasarım henüz yok.
- Field-type palette / kullanıcı esnekliği — §5'te tarif edilen orta yol, henüz onaylanmadı.
- Rite Studio'nun resmi ürün bileşeni haline gelmesi — **artık gündemde değil**; yerine BÜYÜK KOŞULLU KARAR (Meridyen'i tamamen kaldırma) geldi, bkz. §6 — henüz teyit edilmedi.
- **(2026-09-22, danışman modu R&D'si)** Danışman modu izin modelinin kesinleştirilmesi (gün değiştirme, koçluk türüne göre) — bkz. `VIZYON.md` §7.4.
- **(2026-09-22)** `rite_auth_migration.sql`'in çoklu-danışman ilişki modeline göre genelleştirilmesi — kodlama öncesi ele alınacak, bkz. `VIZYON.md` §2/§7.1.
- **(2026-09-22)** Kart taksonomisine sınav koçluğu (Çalışma/Soru Çözüm)/diyetisyenlik (öğün/Akıllı Tabak)/fitness alanlarına özgü kart tiplerinin eklenmesi.
- **(2026-09-22)** Diyet domaininin GENİŞLETİLMİŞ hâli (beslenme+hareket+uyku birlikte, alışveriş listesi vb.) — ayrı bir araştırma turuna ertelendi.
- **(2026-09-22)** Video görüşme sağlayıcısı seçimi (Stream Video / Daily.co / LiveKit Cloud / Twilio) — inşa zamanına bırakıldı.
- **(2026-09-22)** Wellbeing kartlarının (şükran/anket/su vb.) danışman moduyla kime açılacağı.
- **(2026-09-22)** RLS (row-level security) genişletmesi — bir danışmanın danışan satırlarına yazabilmesi için.
- **(2026-09-22)** Sohbet (yeni gerçek altyapı) ile mevcut Paylaş (`dog_inbox`) mekanizmasının bir arada nasıl duracağı.
