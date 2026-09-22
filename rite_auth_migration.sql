-- Rite: e-posta ile kendi hesabını açabilme (Supabase Auth) + Danışman modu ilişki tablosu
-- Supabase SQL Editor'de tek seferlik çalıştır.
-- NOT: auth.users tablosuna bir trigger ekliyor — çalıştırmadan önce gözden geçir.
--
-- 2026-09-22 GÜNCELLEMESİ: bu dosya hiç çalıştırılmamıştı, ilk taslağın (tek-sağlayıcı
-- "Meridyen üyeliği" varsayımlı `dog_meridyen_uyelik` tablosu) yerini alıyor. Danışman modu
-- artık ÇOKLU danışman/sağlayıcıyı desteklemesi gerektiğinden (bir danışanın aynı anda hem
-- sınav koçu hem diyetisyeni olabilmesi gibi), tek-ilişkili üyelik tablosu yerine genel bir
-- `dog_iliskiler` ilişki tablosu tasarlandı. Detay/gerekçe: VIZYON.md §7 (Danışman modu
-- mimarisi), URUN-VIZYONU.md §6 (BÜYÜK KOŞULLU KARAR).
--
-- BİLİNÇLİ OLARAK BU DOSYADA YOK: satır-seviyesi güvenlik (RLS) politikaları. Bugüne kadar
-- Rite'ta gerçek RLS yoktu (kişisel kullanım eşleştirme koduyla, uygulama seviyesinde
-- korunuyordu — auth.uid() hiç kullanılmıyordu). Danışman modu ile bir danışmanın başka bir
-- danışanın satırlarına yazabilmesi gerekeceğinden RLS artık gerçek bir güvenlik konusu, ama
-- bugünkü canlı RLS durumunu (hangi tablolarda ne var, anon-key erişimi nasıl kısıtlı)
-- bilmeden körlemesine bir policy yazıp mevcut kişisel/anonim kullanımı kilitleme riskini
-- almak istemedim — ayrı bir adım olarak, mevcut durum teyit edildikten sonra ele alınacak.

-- gen_random_uuid() için (çoğu Supabase projesinde zaten açık, güvenlik amaçlı tekrar ekleniyor)
create extension if not exists pgcrypto;

-- 1) dog_clients: hangi auth hesabına ait olduğu
alter table dog_clients
  add column if not exists auth_id uuid unique references auth.users(id);

-- code artık zorunlu değil (kendi hesabını e-posta ile açan kullanıcılarda boş kalabilir,
-- eşleştirme koduyla çalışan bugünkü akışta dolu kalmaya devam edecek)
alter table dog_clients alter column code drop not null;

-- 2) Danışman-danışan İLİŞKİ tablosu — çoklu danışman/sağlayıcı destekli (VIZYON.md §7.2).
-- Bir danışanın birden fazla danışmanı (sınav koçu + diyetisyen vb.), bir danışmanın da
-- birden fazla danışanı olabilir. `tur` alanı bilerek serbest text — sınav/diyet/fitness
-- kesinleşti ama liste büyüyebilir (bkz. VIZYON.md §7.7); uygulama tarafında kart_tipi'yle
-- aynı ilkeyle (kod-tanımlı, kapalı bir liste) doğrulanacak, DB seviyesinde CHECK ile
-- kilitlenmedi ki yeni bir domain eklerken migration gerekmesin.
create table if not exists dog_iliskiler (
  id uuid primary key default gen_random_uuid(),
  danisman_id uuid not null references dog_clients(id) on delete cascade,
  danisan_id uuid not null references dog_clients(id) on delete cascade,
  tur text not null default 'genel',
  durum text not null default 'beklemede' check (durum in ('beklemede', 'aktif', 'askida', 'sonlandi')),
  baslangic timestamptz not null default now(),
  bitis timestamptz,
  created_at timestamptz not null default now(),
  constraint dog_iliskiler_farkli_taraf check (danisman_id <> danisan_id),
  unique (danisman_id, danisan_id, tur)
);
create index if not exists dog_iliskiler_danisman_idx on dog_iliskiler(danisman_id);
create index if not exists dog_iliskiler_danisan_idx on dog_iliskiler(danisan_id);

-- Davet/eşleştirme akışı YENİ bir kod alanı gerektirmiyor — bugünkü dog_clients.code
-- (RITE-XXXXX) zaten bu iş için var: danışan, danışmanın kodunu girer → 'beklemede'
-- durumunda bir dog_iliskiler satırı açılır → danışman "Danışanlarım"da onaylar → 'aktif'
-- olur. Bu akışın kendisi (kod girme ekranı, onay ekranı) ayrı bir uygulama-katmanı işi.

-- 3) Kart sahipliği — hangi kartın hangi ilişkiye ait olduğu. Flat `kaynak` alanı
-- ('Kendi'/'Meridyen'/'Inbox') HANGİ danışmandan geldiğini ayırt etmiyordu; iliski_id bunu
-- çözüyor, çoklu-danışman filtrelemesinin (Ajanda dropdown, Danışanlarım Widget) temeli
-- (bkz. VIZYON.md §7.2/§7.8).
alter table dog_rituals
  add column if not exists iliski_id uuid references dog_iliskiler(id) on delete set null;
alter table dog_activities
  add column if not exists iliski_id uuid references dog_iliskiler(id) on delete set null;
create index if not exists dog_rituals_iliski_idx on dog_rituals(iliski_id) where iliski_id is not null;
create index if not exists dog_activities_iliski_idx on dog_activities(iliski_id) where iliski_id is not null;

-- 4) Yeni bir e-posta hesabı açıldığında otomatik olarak dog_clients içinde bu hesaba
--    bağlı bir satır oluştur. İLK TASLAKTAN ÖNEMLİ FARK: burada otomatik bir üyelik/ilişki
--    YARATILMIYOR — yeni kaydolan kullanıcı varsayılan olarak sadece kişisel kullanıcı,
--    bir danışmana bağlanmak ayrı ve bilinçli bir adım (davet kodu girme + danışmanın onayı,
--    yukarıya bkz.).
create or replace function public.rite_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into dog_clients (ad, auth_id)
  values (coalesce(nullif(split_part(new.email, '@', 1), ''), 'Yeni kullanıcı'), new.id);
  return new;
end;
$$;

drop trigger if exists rite_on_auth_user_created on auth.users;
create trigger rite_on_auth_user_created
  after insert on auth.users
  for each row execute function public.rite_handle_new_user();
