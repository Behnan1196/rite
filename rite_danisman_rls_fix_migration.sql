-- Rite: rite_danisman_rls_migration.sql'de bulunan "infinite recursion detected in policy
-- for relation dog_clients" hatasının düzeltmesi.
-- Supabase SQL Editor'de, rite_danisman_rls_migration.sql'DEN SONRA çalıştır.
--
-- 2026-09-22: Kök neden — birkaç policy, "bu auth kullanıcısının dog_clients.id'si ne"
-- sorusunu doğrudan `... in (select id from dog_clients where auth_id = auth.uid())` şeklinde
-- soruyordu. dog_clients'ın kendi RLS'i açık olduğundan, bu alt-sorgu dog_clients'ın
-- policy'lerini TEKRAR tetikliyor — o da aynı alt-sorguyu tekrar çalıştırıyor, sonsuz döngü.
-- (Not: bugüne kadar `p_dogfood` (qual: true) policy'si dog_clients/dog_rituals/
-- dog_activities'te zaten duruyordu, anonim/kişisel kullanım hâlâ ondan geçiyor — bu fix
-- ona dokunmuyor, sadece benim eklediğim policy'lerin yapısını düzeltiyor.)
--
-- Çözüm: lookup'ı SECURITY DEFINER bir fonksiyona sarmak. Bu fonksiyon tablo SAHİBİ olarak
-- çalıştığından (SQL Editor'de bağlı olduğun rol dog_clients'ın da sahibi), dog_clients'ı
-- RLS'i BYPASS ederek okur — döngü orada kırılıyor. Standart Supabase RLS-recursion çözümü.

create or replace function public.rite_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from dog_clients where auth_id = auth.uid()
$$;

-- dog_iliskiler — artık dog_clients'a JOIN yok, fonksiyon üzerinden
drop policy if exists dog_iliskiler_taraf_select on dog_iliskiler;
create policy dog_iliskiler_taraf_select on dog_iliskiler
  for select
  using (
    danisman_id = public.rite_client_id()
    or danisan_id = public.rite_client_id()
  );

drop policy if exists dog_iliskiler_danisan_insert on dog_iliskiler;
create policy dog_iliskiler_danisan_insert on dog_iliskiler
  for insert
  with check (
    danisan_id = public.rite_client_id()
    and durum = 'beklemede'
  );

drop policy if exists dog_iliskiler_danisman_update on dog_iliskiler;
create policy dog_iliskiler_danisman_update on dog_iliskiler
  for update
  using (danisman_id = public.rite_client_id())
  with check (danisman_id = public.rite_client_id());

-- dog_clients — asıl döngünün kırıldığı yer: dog_clients_danisman_select artık dog_clients'a
-- değil, sadece dog_iliskiler'e bakıyor (o da artık dog_clients'a JOIN yapmıyor)
drop policy if exists dog_clients_danisman_select on dog_clients;
create policy dog_clients_danisman_select on dog_clients
  for select
  using (
    id in (
      select danisan_id from dog_iliskiler
      where danisman_id = public.rite_client_id()
        and durum in ('beklemede', 'aktif')
    )
  );
-- dog_clients_self_all değişmedi (zaten dog_clients'a geri JOIN yapmıyordu, döngüye girmiyordu)

-- dog_rituals — fonksiyon üzerinden
drop policy if exists dog_rituals_owner_all on dog_rituals;
create policy dog_rituals_owner_all on dog_rituals
  for all
  using (client_id = public.rite_client_id())
  with check (client_id = public.rite_client_id());

drop policy if exists dog_rituals_danisman_all on dog_rituals;
create policy dog_rituals_danisman_all on dog_rituals
  for all
  using (
    iliski_id in (
      select id from dog_iliskiler
      where danisman_id = public.rite_client_id() and durum = 'aktif'
    )
  )
  with check (
    iliski_id in (
      select id from dog_iliskiler
      where danisman_id = public.rite_client_id() and durum = 'aktif'
    )
  );

-- dog_activities — aynı düzeltme
drop policy if exists dog_activities_owner_all on dog_activities;
create policy dog_activities_owner_all on dog_activities
  for all
  using (
    client_id is null
    or client_id = public.rite_client_id()
  )
  with check (
    client_id = public.rite_client_id()
  );

drop policy if exists dog_activities_danisman_all on dog_activities;
create policy dog_activities_danisman_all on dog_activities
  for all
  using (
    iliski_id in (
      select id from dog_iliskiler
      where danisman_id = public.rite_client_id() and durum = 'aktif'
    )
  )
  with check (
    iliski_id in (
      select id from dog_iliskiler
      where danisman_id = public.rite_client_id() and durum = 'aktif'
    )
  );
