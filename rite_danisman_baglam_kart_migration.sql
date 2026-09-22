-- Rite: "Ajanda danışan-seçici" (daraltılmış kapsam — Behnan onayıyla) için gereken şema + RLS ekleri.
-- Supabase SQL Editor'de, önceki rite_danisman_* migration'larından SONRA çalıştır.
--
-- 2026-09-22: Danışmanın bir danışanına atadığı kartlar artık `client_id` yerine sadece `iliski_id` taşıyacak
-- (kişisel Ajanda'ya hiç karışmasınlar diye — loadData zaten client_id'ye göre filtreliyor, iliski_id'si olan
-- ama client_id'si NULL olan satırlar oraya hiç girmez). Bunun için client_id'nin NULL olabilmesi gerekiyor.
-- DROP NOT NULL, kolon zaten nullable ise de güvenle çalışır (no-op) — durumu bilmeden çalıştırmak zararsız.
alter table dog_rituals alter column client_id drop not null;
alter table dog_activities alter column client_id drop not null;

-- Danışan, kendisine atanmış (iliski_id üzerinden, AKTİF ilişkide) kartları kendi Ajandasında görebilsin —
-- şimdilik SADECE okuma (silme/düzenleme her zaman danışmanın işi, vizyon dokümanındaki "izin modeli" ilkesiyle
-- tutarlı: "silme=her zaman koç-only"). dog_rituals_danisman_all zaten danışmana tam yetki veriyordu, bu sadece
-- karşı tarafa (danışana) okuma ekliyor.
drop policy if exists dog_rituals_danisan_select on dog_rituals;
create policy dog_rituals_danisan_select on dog_rituals
  for select
  using (
    iliski_id in (
      select id from dog_iliskiler
      where danisan_id = public.rite_client_id() and durum = 'aktif'
    )
  );

drop policy if exists dog_activities_danisan_select on dog_activities;
create policy dog_activities_danisan_select on dog_activities
  for select
  using (
    iliski_id in (
      select id from dog_iliskiler
      where danisan_id = public.rite_client_id() and durum = 'aktif'
    )
  );
