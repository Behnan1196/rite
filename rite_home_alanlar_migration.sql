-- Rite: Home sekmesindeki öz-değerlendirme alanlarını (Beslenme, Uyku, ...) client'a özel ve
-- düzenlenebilir hale getirmek için.
-- Supabase SQL Editor'de çalıştır.

-- Her satır bir Home alanı: anahtar dog_measurements'taki 'home_'+anahtar kaydına karşılık gelir,
-- checklist/ornekler metin dizisi (Postgres text[]) olarak tutulur. Bir client'ın hiç satırı yoksa
-- uygulama ilk açılışta bunu altı standart alanla (Beslenme, Egzersiz, Uyku, Stres Yönetimi, Meşgale,
-- Sosyal İlişkiler) tohumluyor — bkz. app'teki HOME_ALAN_VARSAYILAN ve loadHomeAlanlar. Kullanıcı
-- bunların üzerine kendi alanını da ekleyebiliyor.
create table if not exists dog_home_alanlar (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references dog_clients(id) on delete cascade,
  anahtar text not null,
  ad text not null,
  neden text not null default '',
  checklist text[] not null default '{}',
  ornekler text[] not null default '{}',
  sira int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists dog_home_alanlar_client_idx on dog_home_alanlar(client_id);
-- Uygulama diğer tüm tablolarda (dog_activities, dog_rituals, dog_gruplar, ...) olduğu gibi anon
-- anahtarla + kendi client_id filtresiyle çalışıyor, Postgres RLS ile değil — RLS açık kalırsa
-- "new row violates row-level security policy" hatası veriyor. Diğer tablolarla tutarlı olsun diye
-- burada da kapatılıyor.
alter table dog_home_alanlar disable row level security;
