# Rite — danışan PWA (Next.js)

Meridyen'in **danışan yüzeyi**. Bağımsız Next.js uygulaması; telefon **ana ekranına eklenebilir** (PWA) ve **uygulama kapalıyken push bildirimi** alır. İleride mobil uygulamaya dönüştürülebilir. Aynı Supabase havuzuna **eşleştirme koduyla** (RITE-XXXXX) bağlanır — hesap/e-posta yok, anonim.

## Kurulum
```bash
cd rite-app
cp .env.local.example .env.local
# VAPID anahtarları üret (push için):
npx web-push generate-vapid-keys
#   → çıkan Public Key'i NEXT_PUBLIC_VAPID_PUBLIC_KEY'e,
#   → Private Key'i VAPID_PRIVATE_KEY'e yaz (.env.local). PRIVATE KEY GİZLİDİR — repoya/sohbete koyma.
npm install
npm run dev        # http://localhost:3001
```
Supabase için `pilot/schema-07-push.sql`'i bir kez çalıştır (dog_push_subs).

## Kullanım
1. Merkez (Meridyen → Sekreter) danışanı kaydeder → **RITE-XXXXX** kodu üretilir.
2. Danışan Rite'ı açar, kodu girer → ajandası (Bugün/Plan/Gelişim) gelir.
3. **🔔 Bildirim** → izin ver → abonelik Supabase'e yazılır. **Test bildirimi gönder** ile dener.
4. Telefonda tarayıcı menüsü → **Ana ekrana ekle** → tam ekran uygulama gibi açılır.

## Bildirim gönderme (sunucu)
`POST /api/push/send` → `{ clientId, title, body, url }`. Sunucu VAPID private key ile o danışanın tüm aboneliklerine push atar; service worker (`public/sw.js`) uygulama kapalıyken bildirimi gösterir. İleride: koç/otomasyon olayları veya zamanlanmış görevler bu ucu çağırır.

## Notlar / sınırlar
- **HTTPS gerekir** (localhost hariç). Yayında Vercel vb. HTTPS sağlar.
- **iOS**: Web Push yalnız **ana ekrana eklenmiş** PWA'da ve iOS 16.4+ ile çalışır. Android/masaüstü Chrome sorunsuz.
- Dogfood: RLS `anon`'a açık — gerçek/hassas veri koyma; gerçekte Auth + rol-bazlı RLS.

## Güvenlik
anon key ve VAPID **public** key istemcide olur. **VAPID private key + service_role ASLA** repoya/istemciye/sohbete girmez — yalnız sunucu `.env.local`.
