> **Not:** Bu belge `URUN-VIZYONU.md` ile genişletilip esas alındı. Güncel ürün vizyonu ve pazarlama stratejisi için `URUN-VIZYONU.md`'ye bakın — bu dosya, geçmişe referans olarak kalıyor.

# Rite — Ürün ve Pazarlama Özeti

*Bu belge `VIZYON.md`'nin (teknik mimari referansı) yanında, daha sade ve ürün/pazarlama odaklı bir belge olarak tutulur. Teknik detay için `VIZYON.md`'ye bakın. Burada "(yön, henüz kesinleşmedi)" diye işaretlenen maddeler kesin karar değil, üzerinde anlaştığımız istikamettir — ilerledikçe netleşecek.*

---

## 1. Rite nedir, nasıl bir üründür

Rite, başlangıçta Meridyen'in **teslim noktası** olarak tasarlandı — bir koçluk/danışmanlık merkezinin danışanlarına programını ilettiği bir yüzey. Hatta ücretsiz verilmesi bile düşünülmüştü, çünkü asıl ücretlendirme Meridyen merkezinde olacaktı; Rite sadece o ilişkinin aracıydı.

Meridyen projesi gecikince, Rite'ı **kendi başına anlamlı, nitelikli bir yazılım** haline getirmeye yöneldik. Bugün AI desteği ve sunucu (VPS) gibi sürekli giderleri olan bir proje olduğu için doğal olarak ticari bir yöne gidiyor — ama bu büyük bir gelir hedefi ya da hızlı büyüyen bir girişim stratejisi değil. Reklamla büyük satış rakamlarına ulaşmak hiç hedeflenmiyor. Amaç, **giderini çıkaran, niş, sürdürülebilir** bir ürün.

**Konumlandırma**: sakin, reklamsız, gizlilik öncelikli bir "bilinçli yaşam" aracı — dikkat ekonomisiyle yarışan, bildirim/rozet/oyunlaştırma dolu alışkanlık uygulamalarının karşısında bir alternatif. Kullanıcı verisiyle ilgilenmeyen, satmayan, göstermeyen bir yazılım olmak, hem etik hem pazarlama açısından ayırt edici bir konum.

**İki katmanlı ürün/dağıtım modeli:**
- **Bugün — Web (PWA), ücretsiz.** Mevcut, çalışan sürüm; eşleştirme koduyla (RITE-XXXXX) erişiliyor, hesap/e-posta gerektirmiyor. Bu katman, ürünün gerçek kullanıcı geri bildirimiyle olgunlaşmasını sağlayan aşama.
- **İleride — Mobil uygulama (App Store), ücretli, gizlilik öncelikli.** Veri cihazda yaşar (yerel depolama), yedek kullanıcının kendi bulut hesabından (ör. iCloud) şifreli alınır — Rite'ın sunucusu kişisel veriyi hiç görmez. Abonelik Apple'ın kendi altyapısı üzerinden (App Store IAP); Google Play şimdilik gündemde değil.

Mobile geçiş noktası **bilinçli olarak şimdiden sabitlenmiyor** — PWA'yı gerçek kullanıcılarla (önce yakın çevre, sonra onların çevresi) olgunlaştırıp, hangi noktada "mobile taşınmaya değer" olduğuna o zaman karar vereceğiz. Bu süreçte alınan mimari kararların ileride gelecek yerel depolamayı zorlaştırmaması ilke olarak benimsendi.

---

## 2. Ana fonksiyonlar

- **Ajanda** — günlük akış. Yapılacak/Alışkanlık/Randevu ayrı kavramlar değil, tek bir "Aktivite" olarak birleşti; tekrar ve zamanlama tek bir "Süre" mantığıyla yönetiliyor.
- **Havuz** — aktivite/alışkanlık kütüphanesi ve kişisel arşiv. Gelenler (paylaşılanlar), Kişisel Arşiv (kendi klasörlerin) ve Çöp Kutusu olmak üzere üç bölüm; Outlook'un klasör mantığından esinlenildi.
- **Home** — kişiye özel bir pano. Odak Alanları (üzerinde çalıştığın konular), Widget'lar (hızlı araçlar) ve kişisel kısayollar (istediğin herhangi bir kartı ana ekrana sabitleme) buradan yönetiliyor.
- **Sohbet** — bireysel destek/koçluk iletişimi. "Meridyen" markasına bağlı olmak zorunda değil: bir aile üyesinin diğerini desteklemesi de, ileride profesyonel bir koçun danışanıyla konuşması da aynı altyapıyı (mesajlaşma + kart paylaşımı + görüntülü görüşme) kullanabilir.
- **Fayda katmanı** (görünmez ama temel) — bir aktivite tek bir yaşam alanına değil, birden fazla faydaya (hareket, sosyal bağ, beslenme…) aynı anda etiketlenir. "Köpeği parka götürmek" hem hareket hem sosyal bağ sayılır — kullanıcı bunu görmez ama öneri/organizasyon mantığının temelini oluşturur.
- **Aile grubu paylaşımı** — kullanıcılar bir grup (ör. aile) oluşturup kart/aktivite paylaşabiliyor. Bu, gizlilik ilkesinin bilinçli tek istisnası: bir şeyi paylaşmayı seçtiğinde, o paylaşım için gizlilik zaten azalır ve kullanıcı bunu kabul eder — bu yüzden paylaşım basit bir sunucu üzerinden organize edilebilir, karmaşık bir şifreleme gerekmez.

---

## 3. Kart tipleri ve widget'lar

Rite'ın en küçük yapı taşı **kart**. Kullanıcı kendi kart TÜRÜNÜ yaratamaz (bu bilinçli bir sınır — basitlik ve App Store güvenilirliği için), ama her kartın içeriğini kendi hayatına göre doldurur. Bugün 20'yi aşkın kart türü var, kabaca beş grupta toplanabilir:

| Grup | Örnekler | Ne işe yarar |
|---|---|---|
| İçerik/bilgi | Bilgi kartı (çoklu video + not) | Kendi kürasyonunu yaptığın konuları (ör. bir YouTube eğitim serisi) takip etmek |
| Etkileşimli | Anket, Çoktan seçmeli | Kendine ya da paylaştığın birine soru sormak, yanıt toplamak |
| Sağlık/ölçüm | Ölçüm, Ruh hali, Su, Pomodoro | Basit, tekrarlanan takip — kilo, nem, su, odaklanma süresi |
| Egzersiz/rahatlama | Nefes, Workout, Beden taraması, Topraklama, Uyku öncesi | Kısa, rehberli pratikler |
| Planlama/yansıma | Niyet, Şükran, Maruz bırakma, Tarif, Diyet | Günlük niyet belirleme, minnet pratiği, kademeli alışkanlık değişimi |

**Widget'lar** ise Home ekranına konan hızlı araçlar — bir kartın aksine açılıp kapanmaz, dokununca ilgili ekranı doğrudan açar. Bugün dördü var: Ölçümler (en son ne zaman ölçüm girdiğini gösterir), Yaklaşan aktiviteler, Gelenler (okunmamış paylaşım sayısı) ve Notlar. Bunların ötesinde bir fikir kataloğu tutuluyor — günün sözü, ilaç hatırlatıcı, AI destekli dil öğrenme kartları, hatta kullanıcının kendi ev otomasyonuna (Home Assistant) bağlanan bir widget gibi — Rite'ın bir ajandanın ötesine geçip kişiye özel küçük bir araç kutusu haline gelebileceğinin göstergesi. Bu liste bilinçli olarak geniş tutuluyor; hangilerinin gerçek kullanıcıya sunulacağı zamanla, kullanım geri bildirimiyle netleşecek.

---

## 4. Pazarlama stratejisi

**Hedef kitle (birincil)**: geniş bir "bilinçli yaşam" kitlesi — sadelik, reklamsızlık ve gizlilik değeri gören, alışkanlık/ajanda arayan insanlar. İlham veren bir alt-profil: Datça'da gözlemlenen, iyi bir yaşam tarzı potansiyeli olan ama günün çoğunu pasif geçiren emekli/60+ kitle — dil ve arayüzün bu kitleye de açık kalması (sade, teknik olmayan) bilinçli bir tercih.

**Aşamalı, halka-halka büyüme** (reklam YOK):
1. **1. halka** — çok yakın çevre. PWA üzerinden, ücretsiz, doğrudan davet.
2. **2. halka** — onların çevresi. Organik, kişisel tavsiyeyle yayılma.
3. **Sonrası** — ürün PWA aşamasında olgunlaştıkça, mobil/ücretli sürüme geçiş ve daha geniş bir kitleye açılma — zamanlaması şimdiden sabitlenmiyor.

**Gelir modeli**: PWA kalıcı olarak ücretsiz kalır (büyüme/deneme katmanı). Mobil uygulama, App Store üzerinden küçük, sabit bir abonelik (yön, henüz kesinleşmedi: fiyat, deneme süresi gibi detaylar).

**Mobilin "neden parayla" hikayesi — gizlilik**: PWA zaten oldukça yetenekli (ana ekrana eklenebiliyor, bildirim alabiliyor), o yüzden mobili değerli kılacak şey "daha fazla özellik" değil, **veri modelinin kendisi**: mobilde veri cihazda yaşar, yedek kullanıcının kendi bulut hesabından şifreli alınır, Rite'ın sunucusu kişisel içeriği hiç görmez. Bu, özellikle ruh hali/ölçüm gibi hassas sayılabilecek verileri olan bir uygulamada güçlü, dürüst bir mesaj. (Ek platform avantajları — ana ekran widget'ı, daha güvenilir bildirim gibi — yön olarak değerli ama henüz netleşmedi.)

**Kanal/efor**: Ücretli reklam yok. İlk enerji kişisel çevre üzerinden beta kullanıcı toplamaya gidiyor — organik, düşük maliyetli, güvene dayalı büyüme. İçerik/topluluk gibi ek kanallar, PWA aşaması olgunlaştıkça değerlendirilebilir.

**Koçluk çerçevesi**: "Meridyen" markası ve merkezi kütüphanesi marketed sürümde yer almıyor, ama sohbet+paylaşım altyapısı kalıyor — çünkü "bireysel koçluk" kavramı (bir aile üyesinin diğerini desteklemesi ya da ileride profesyonel bir ilişki) Rite'ın doğal bir kullanım senaryosu. Uygulamayla birlikte birkaç örnek Odak Alanı statik/bundled içerik olarak geliyor, canlı bir merkezden çekilmiyor.

---

## Açık/ileri maddeler
- Mobile geçişin tam tetikleyicisi (hangi olgunluk noktası) — PWA geri bildirimiyle netleşecek.
- Mobil abonelik fiyatlandırması.
- Aile grubu paylaşım sunucusunun tam kapsamı (kimlik doğrulama, grup yönetimi) — henüz tasarlanmadı.
- Hangi widget/kart fikirlerinin gerçek kullanıcıya sunulacağı, App Store onay riski gözetilerek zamanla ayıklanacak.
