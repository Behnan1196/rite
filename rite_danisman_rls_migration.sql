-- Rite: Danışman modu için RLS (satır seviyesi güvenlik) politikaları.
-- Supabase SQL Editor'de, rite_auth_migration.sql'den SONRA çalıştır (dog_iliskiler ve
-- iliski_id kolonlarına ihtiyaç duyuyor).
--
-- 2026-09-22: Behnan'ın teyidiyle yazıldı — tablolarda genelde "Enable RLS" ile RLS açık
-- tutuluyor. Buradaki TÜM politikalar PERMISSIVE (varsayılan tip) ve sadece EKLENİYOR —
-- hiçbir mevcut policy DROP edilmiyor/daraltılmıyor, sadece auth.uid() üzerinden yeni bir
-- erişim yolu açılıyor. Postgres'te permissive politikalar OR'lanır: anonim/kişisel kullanım
-- bugün hangi policy ile çalışıyorsa (share_code tabanlı, auth.uid() kullanmayan) aynen
-- çalışmaya devam eder — bu dosya ona dokunmuyor, sadece auth'lu danışman erişimini ekliyor.

-- 1) dog_iliskiler — ilişkinin iki tarafı da kendi ilişki satırlarını görebilir
alter table dog_iliskiler enable row level security;

drop policy if exists dog_iliskiler_taraf_select on dog_iliskiler;
create policy dog_iliskiler_taraf_select on dog_iliskiler
  for select
  using (
    danisman_id in (select id from dog_clients where auth_id = auth.uid())
    or danisan_id in (select id from dog_clients where auth_id = auth.uid())
  );

-- Danışan, davet kodunu girdiğinde kendini danisan_id olarak vererek 'beklemede' bir
-- istek açabilir (danisman_id, uygulama tarafında share_code'dan çözülüp buraya yazılır)
drop policy if exists dog_iliskiler_danisan_insert on dog_iliskiler;
create policy dog_iliskiler_danisan_insert on dog_iliskiler
  for insert
  with check (
    danisan_id in (select id from dog_clients where auth_id = auth.uid())
    and durum = 'beklemede'
  );

-- Danışman kendi ilişkisinin durumunu değiştirebilir (onay/askıya alma/sonlandırma)
drop policy if exists dog_iliskiler_danisman_update on dog_iliskiler;
create policy dog_iliskiler_danisman_update on dog_iliskiler
  for update
  using (danisman_id in (select id from dog_clients where auth_id = auth.uid()))
  with check (danisman_id in (select id from dog_clients where auth_id = auth.uid()));

-- 2) dog_clients — kendi satırını gör/düzenle + danışmanın, kendi danışanlarının (istek
-- durumundakiler dahil) temel bilgisini (ad vb.) görebilmesi, Danışanlarım listesi için
alter table dog_clients enable row level security;

drop policy if exists dog_clients_self_all on dog_clients;
create policy dog_clients_self_all on dog_clients
  for all
  using (auth_id = auth.uid())
  with check (auth_id = auth.uid());

drop policy if exists dog_clients_danisman_select on dog_clients;
create policy dog_clients_danisman_select on dog_clients
  for select
  using (
    id in (
      select i.danisan_id from dog_iliskiler i
      join dog_clients c on c.id = i.danisman_id
      where c.auth_id = auth.uid() and i.durum in ('beklemede', 'aktif')
    )
  );

-- 3) dog_rituals — danışman, AKTİF ilişkisine ait kartları görüp yazabilir/silebilir
-- (NOT: kolon adının `client_id` olduğunu VIZYON.md'deki mevcut şemadan varsayıyorum —
-- gerçek kolon adı farklıysa Postgres hatada adını verir, ona göre düzeltiriz)
alter table dog_rituals enable row level security;

drop policy if exists dog_rituals_owner_all on dog_rituals;
create policy dog_rituals_owner_all on dog_rituals
  for all
  using (client_id in (select id from dog_clients where auth_id = auth.uid()))
  with check (client_id in (select id from dog_clients where auth_id = auth.uid()));

drop policy if exists dog_rituals_danisman_all on dog_rituals;
create policy dog_rituals_danisman_all on dog_rituals
  for all
  using (
    iliski_id in (
      select i.id from dog_iliskiler i
      join dog_clients c on c.id = i.danisman_id
      where c.auth_id = auth.uid() and i.durum = 'aktif'
    )
  )
  with check (
    iliski_id in (
      select i.id from dog_iliskiler i
      join dog_clients c on c.id = i.danisman_id
      where c.auth_id = auth.uid() and i.durum = 'aktif'
    )
  );

-- 4) dog_activities — aynı desen, ama kütüphane satırları (client_id NULL) HERKESE
-- okunur kalmalı (bugünkü Havuz/kütüphane davranışı)
alter table dog_activities enable row level security;

drop policy if exists dog_activities_owner_all on dog_activities;
create policy dog_activities_owner_all on dog_activities
  for all
  using (
    client_id is null
    or client_id in (select id from dog_clients where auth_id = auth.uid())
  )
  with check (
    client_id in (select id from dog_clients where auth_id = auth.uid())
  );

drop policy if exists dog_activities_danisman_all on dog_activities;
create policy dog_activities_danisman_all on dog_activities
  for all
  using (
    iliski_id in (
      select i.id from dog_iliskiler i
      join dog_clients c on c.id = i.danisman_id
      where c.auth_id = auth.uid() and i.durum = 'aktif'
    )
  )
  with check (
    iliski_id in (
      select i.id from dog_iliskiler i
      join dog_clients c on c.id = i.danisman_id
      where c.auth_id = auth.uid() and i.durum = 'aktif'
    )
  );
