-- Rite: günün kendi kart sırası (her kart artık günden güne farklı bir yerde durabilir)
-- Supabase SQL Editor'de çalıştır.

create table if not exists dog_gun_duzeni (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references dog_clients(id) on delete cascade,
  tarih date not null,
  sira jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (client_id, tarih)
);
create index if not exists dog_gun_duzeni_client_idx on dog_gun_duzeni(client_id);
