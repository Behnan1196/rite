-- Rite: Ayarlar'daki profil kartı için avatar alanı
-- Supabase SQL Editor'de çalıştır.

alter table dog_clients add column if not exists avatar text;

-- (opsiyonel) Artık eşleştirme koduyla giriş kalktığı için, hâlâ yalnız kodla
-- oluşturulmuş ve hiç e-posta hesabına bağlanmamış eski müşteri satırlarını
-- silmek istersen (GERİ ALINAMAZ, önce göz gezdir):
-- select id, ad, code from dog_clients where auth_id is null;
-- emin olduğunda:
-- delete from dog_clients where auth_id is null;
