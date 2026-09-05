-- Rite: Havuz'u "kitaplık / araştırma planı" olarak kullanmak için Grup + Alt grup
-- Supabase SQL Editor'de çalıştır.

-- Grup ve alt grup adlarının kalıcı, düzenlenebilir listesi (Havuz > Grupları yönet ekranı).
-- ust_id boşsa bu bir Grup (üst seviye); doluysa bir Alt grup'tur (o Grup'a bağlı).
create table if not exists dog_gruplar (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references dog_clients(id) on delete cascade,
  ad text not null,
  ust_id uuid references dog_gruplar(id) on delete cascade,
  sira int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists dog_gruplar_client_idx on dog_gruplar(client_id);
create index if not exists dog_gruplar_ust_idx on dog_gruplar(ust_id);

-- dog_activities'teki mevcut "grup" (metin) alanı Grup adını taşımaya devam ediyor; alt_grup ise
-- yeni, opsiyonel ikinci seviye. Kasıtlı olarak dog_gruplar'a yabancı anahtarla bağlı DEĞİL — tıpkı
-- "grup" gibi düz metin: bir Grup/Alt grup daha sonra yeniden adlandırılır ya da silinirse, ona daha
-- önce etiketlenmiş aktivitelerin üzerindeki metin aynı kalır (geriye dönük kırılma olmaz).
alter table dog_activities add column if not exists alt_grup text;
