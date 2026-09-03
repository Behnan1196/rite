-- Rite: e-posta ile kendi hesabını açabilme (Supabase Auth) + Meridyen üyelik/bağlantı ayrımı
-- Supabase SQL Editor'de tek seferlik çalıştır.
-- NOT: auth.users tablosuna bir trigger ekliyor — çalıştırmadan önce gözden geçir.

-- gen_random_uuid() için (çoğu Supabase projesinde zaten açık, güvenlik amaçlı tekrar ekleniyor)
create extension if not exists pgcrypto;

-- 1) dog_clients: hangi auth hesabına ait olduğu + Meridyen'e bağlı mı bayrağı
alter table dog_clients
  add column if not exists auth_id uuid unique references auth.users(id),
  add column if not exists meridyen_bagli boolean not null default false;

-- code artık zorunlu değil (kendi hesabını e-posta ile açan kullanıcılarda boş kalacak,
-- Meridyen'in oluşturduğu eşleştirme kodlu müşterilerde eskisi gibi dolu kalmaya devam edecek)
alter table dog_clients alter column code drop not null;

-- 2) Meridyen üyelik tablosu — bitis boşsa (null) süresiz üyelik demek
create table if not exists dog_meridyen_uyelik (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references dog_clients(id) on delete cascade,
  baslangic timestamptz not null default now(),
  bitis timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists dog_meridyen_uyelik_client_idx on dog_meridyen_uyelik(client_id);

-- 3) Yeni bir e-posta hesabı açıldığında otomatik olarak:
--    a) dog_clients içinde bu hesaba bağlı bir satır,
--    b) o satır için süresiz bir Meridyen üyeliği (şimdilik herkes otomatik üye — admin onayı sonraya bırakıldı)
create or replace function public.rite_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  yeni_client_id uuid;
begin
  insert into dog_clients (ad, auth_id)
  values (coalesce(nullif(split_part(new.email, '@', 1), ''), 'Yeni kullanıcı'), new.id)
  returning id into yeni_client_id;

  insert into dog_meridyen_uyelik (client_id, bitis)
  values (yeni_client_id, null); -- null = süresiz

  return new;
end;
$$;

drop trigger if exists rite_on_auth_user_created on auth.users;
create trigger rite_on_auth_user_created
  after insert on auth.users
  for each row execute function public.rite_handle_new_user();
