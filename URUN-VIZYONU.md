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
| **İkinci katman** | Home (Odak Alanları, Widget'lar, kısayollar), Sohbet + paylaşım, aile grubu, kart tipi çeşitliliği, kart kaynağı ayrımı (yerel/online, bkz. §5) |
| **Faz-sonrası** | Koçluk platform modeli (çoklu platform, admin-tanımlı koç-öğrenci), Rite Studio'nun resmi ürün bileşeni haline gelmesi, kanal/grup bazlı Sohbet mimarisi, peer-to-peer geri besleme, field-type palette / kullanıcı esnekliği, akıllı/context-aware kartlar, mobil geçiş, widget kataloğunun deneysel kısmı |

Bu sınıflandırma sabit değil — ürün olgunlaştıkça bir madde katmanlar arasında yer değiştirebilir.

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

**Platform kavramı.** Rite'ın "teslim noktası" fikri, aslında genel bir örüntünün özel bir örneği: bir **platform** (dersler/konular tanımlanır, koçlar tanımlanır, koç-danışan eşleştirilir, koç haftalık kart hazırlar) ve bir **teslimat noktası** (danışan bu kartları ajandasında görür, işaretler/veri girer). Bu örüntü tek bir kuruma (Meridyen) bağlı değil — aynı altyapı, farklı alanlarda (akademik koçluk, fitness koçluğu, beslenme danışmanlığı gibi) farklı platformlara bağlanabilir. Bir kullanıcı aynı anda birden fazla platforma bağlı olabilmeli (ör. hem fitness hem beslenme danışmanlığı) — ajanda ve gelişim ekranı ortak kalır, sadece kart kaynağı değişir.

**Kurumsal koçluk ile emsal (peer) koçluk arasındaki fark.** Kurumsal modelde roller sabit ve tek yönlüdür: koç kart yaratır ve (platform üzerinden) sonucu görür, danışan sadece uygular. Ama Rite'ın kullanım alanlarından biri de **iki Rite kullanıcısı arasındaki simetrik ilişki** — biri diğerine görev/aktivite atayabiliyor ve takip edebiliyor, roller platform tarafından atanmış değil, ilişkiye göre değişken (bir aile üyesi diğerini destekler, bir arkadaş bir arkadaşa önerir). Bugünkü paylaşım akışı (Havuz → "Kendi Havuzuma al") tek yönlü bir teslimat; alıcının ilerlemesini kaynak kullanıcıya geri gösteren bir kanal yok. **Açık madde:** bu geri besleme, Sohbet üzerinden bir sistem mesajı ile mi, yoksa kaynak-kopya bağlantısı (kartın `_kaynak_rit_id` izini kullanan bir gözlem mekanizması) ile mi çözülecek, henüz karar verilmedi.

**Rite Studio.** Meridyen markasından bağımsız, kart tasarlayıp platform-bağlantılı kullanıcılara gönderebileceğimiz bir yazma/deney ortamı. **Şu anki fazda**, tek-operatörlü (gayrı-resmi) bir test platformu olarak kullanılıyor — kullanıcının kendi oluşturmadığı, Rite'a farklılık katan kartların tasarlanıp gönderildiği ve geri bildirimin toplandığı yer. Rite Studio'nun kendisinin — çok-platformlu, admin arayüzlü, diğer koçluk sistemlerine örnek olacak resmi bir ürün bileşeni haline gelmesi — **ayrı bir faz**; şimdiden inşa edilecek bir şey değil.

**Sohbet'in kanal/grup mimarisine evrilmesi (faz-sonrası).** Bir kullanıcının birden fazla platforma/ilişkiye bağlı olabilmesi, Sohbet'in tek bir akış yerine kanal/grup bazlı (stream.io veya genel chat uygulamalarındaki kanal mantığına benzer) çalışmasını gerektirecek — her platform/ilişki kendi kanalı. Bugünkü Sohbet mockup'ı (her konuşma kendi mesaj listesiyle) bu yöne doğal olarak genişleyebilir.

---

## 7. Kullanıcı çeşitliliği ve tasarım girdileri

Rite'ın kullanıcı kitlesi ve kullanım amaçları, kişisel kullanım ve geçmiş projelerden gelen deneyimle çeşitlendi. Aşağıdaki gözlemler, farklı kaynaklardan (kişisel alışkanlık denemeleri, danışmanlık/koçluk yazılımı deneyimi, kişisel organizasyon araçları kullanımı) süzülmüş, genelleştirilmiş tasarım girdileridir:

- **Çok-girişli araç kutusu hipotezi.** Farklı kullanıcılar Rite'a farklı tek bir giriş noktasından bağlanabilir — biri ajandayı çok kullanır, biri alışkanlık yapısını, biri sadece hatırlatma/bildirim için açar. Ortak payda: hatırlatma/takip altyapısı. Ürün bunu destekleyecek şekilde geniş düşünülmeli, ama her kullanıcıya her şeyi göstermek zorunda değil.
- **Hatırlatma-öncelikli giriş noktası.** Bazı kullanıcılara (özellikle dijital araçlara uzak duran ya da normal yollarla ulaşmanın zor olduğu bireylere) ulaşmanın neredeyse tek yolu basit bir telefon uygulaması olabiliyor. Bu kullanıcılar için düşük bilişsel yük gerektiren, sade bir giriş noktası (hatırlatma + basit ödül/ilerleme görselleştirmesi, ör. bir hedefe biriken ilerleme çubuğu) önemli — bu zaten Gelişim sekmesinin bir örneği.
- **Alışkanlık oluşturma öğrenimleri.** Basit, az sayıda görevle başlayıp kademeli zorlaştırmak; maddi/motivasyonel bir ödül mekanizmasına bağlamak işe yarayabiliyor ama tek başına yeterli değil — hatırlatma/yönlendirme sürmesi gerekebiliyor, ve motivasyon kaynağı (ödül ya da ilgi) azaldığında sürdürülebilirlik zayıflayabiliyor. "21 gün alışkanlık" gibi basit kuralların tam doğru olmadığı gözlemlendi.
- **Audience segmentation — esneklik herkese göre değil.** Aynı anda birçok ilgi/proje alanı olan kullanıcılar için esnek, çok-amaçlı organizasyon araçları (tile/pencere tarzı) gerçekten değerli. Ama az sayıda, basit ihtiyacı olan bir kullanıcı için aynı esneklik gereksiz karmaşıklık, hatta "zihni çalıştırmak" yerine yük olarak algılanabiliyor — bazı kullanıcılar bilinçli olarak "aklımda tutmayı tercih ederim" diyebiliyor. Bu, hedef kitleyi tek tip "esneklik isteyen" olarak varsaymamak gerektiğini gösteriyor; sadelik de bir tasarım değeri olarak eşit ağırlıkta kalmalı.
- **Fayda katmanının kökeni.** Tek bir yaşam alanına (ör. beslenme) odaklanmanın yetmediği, hareket ve stres yönetimi gibi alanların da birlikte düşünülmesi gerektiği gözlemlendi — fayda katmanı kavramı buradan doğdu.
- **"Kendi kendine danışmanlık."** Adlandırması henüz netleşmemiş ama özü net: ikinci bir kişi (koç/aile/arkadaş) olmadan, kullanıcının kendi kendine yararlı alışkanlıkları belirleyip uygulaması ve sonucu mümkün olduğunca ölçmesi. Bugün "bireysel koçluk" şemsiyesi altında, koçluk-eşlikli kullanımla karışık duruyor — ikisi ayrı terimlerle ayrışmalı: kendi başına yürüyen kullanım vs. bir başkasının eşlik ettiği kullanım.

---

## 8. Pazarlama stratejisi

**Hedef kitle (birincil)**: geniş bir "bilinçli yaşam" kitlesi — sadelik, reklamsızlık ve gizlilik değeri gören, alışkanlık/ajanda arayan insanlar. Ancak §7'deki segmentasyon gözlemi burada da geçerli: dil ve arayüz, hem çok-alanlı/esneklik isteyen kullanıcıya hem de sade/basit ihtiyacı olan kullanıcıya (ör. emekli/60+ kitle) açık kalmalı.

**Aşamalı, halka-halka büyüme** (reklam YOK):
1. **1. halka** — çok yakın çevre. PWA üzerinden, ücretsiz, doğrudan davet.
2. **2. halka** — onların çevresi. Organik, kişisel tavsiyeyle yayılma.
3. **Sonrası** — ürün PWA aşamasında olgunlaştıkça, mobil/ücretli sürüme geçiş ve daha geniş bir kitleye açılma — zamanlaması şimdiden sabitlenmiyor.

**Gelir modeli**: PWA kalıcı olarak ücretsiz kalır. Mobil uygulama, App Store üzerinden küçük, sabit bir abonelik (yön, henüz kesinleşmedi). **Ek model adayı (yön):** koçluk/platform bağlamında, ücretin kullanıcı yerine platform/kurum tarafından karşılanması — geçmiş bir koçluk yazılımı deneyiminde mobil uygulama kullanıcıya tamamen ücretsizdi, çünkü bedel platform tarafında (dershane) karşılanıyordu. Rite Studio üzerinden yürüyecek platform ilişkilerinde benzer bir B2B2C model değerlendirilebilir.

**Mobilin "neden parayla" hikayesi — gizlilik**: mobili değerli kılacak şey "daha fazla özellik" değil, **veri modelinin kendisi**: veri cihazda yaşar, yedek kullanıcının kendi bulut hesabından şifreli alınır, Rite'ın sunucusu kişisel içeriği hiç görmez.

**Kanal/efor**: Ücretli reklam yok. İlk enerji kişisel çevre üzerinden beta kullanıcı toplamaya gidiyor.

**Koçluk çerçevesi**: "Meridyen" markası ve merkezi kütüphanesi marketed sürümde yer almıyor, ama sohbet+paylaşım altyapısı kalıyor.

---

## 9. Fazlama mantığı ve tetikleyiciler

Faz geçişleri takvime değil, somut olgunluk/tetikleyici noktalarına bağlanıyor:

- **PWA → Mobil geçiş**: gerçek kullanıcı geri bildirimiyle "mobile taşınmaya değer" noktasına ulaşmak — şimdiden tarih verilmiyor.
- **Rite Studio'nun kurumsallaşması (çoklu platform, admin arayüzü)**: somut bir tetikleyici var — mevcut bir koçluk ortaklığının bu yıl sona ermesi, bu yapının yeniden ele alınmasını gerektirebilir. Bu, Rite Studio'nun "hazır" olmasının zaman baskısı taşıyan tek maddesi.
- **Kart_tipi/field-type palette kararı**: §5'teki gözlemler netleştikçe (gerçek kullanıcı çeşitliliği görüldükçe) karara bağlanacak.
- **Peer-to-peer geri besleme mekanizması**: aile grubu paylaşımı gerçek kullanımda darboğaz yaratırsa önceliklenecek.

---

## Açık/ileri maddeler

- Mobile geçişin tam tetikleyicisi — PWA geri bildirimiyle netleşecek.
- Mobil abonelik fiyatlandırması.
- Aile grubu paylaşım sunucusunun tam kapsamı (kimlik doğrulama, grup yönetimi) — henüz tasarlanmadı.
- Hangi widget/kart fikirlerinin gerçek kullanıcıya sunulacağı, App Store onay riski gözetilerek zamanla ayıklanacak.
- Kart kaynağı (yerel/online) görsel ayrımının somut tasarımı (renk paleti, VIZYON.md'ye işlenecek).
- Peer-to-peer geri besleme: Sohbet-mesajı mı, kaynak-kopya bağlantısı mı — karar verilmedi.
- Field-type palette / kullanıcı esnekliği — §5'te tarif edilen orta yol, henüz onaylanmadı.
- Rite Studio'nun resmi ürün bileşeni haline gelmesinin kapsamı — ayrı bir faz, henüz tasarlanmadı.
