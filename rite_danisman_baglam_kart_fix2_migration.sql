-- Rite: "Ajanda danışan-seçici" — Behnan'ın haklı uyarısı üzerine düzeltme.
-- Supabase SQL Editor'de, rite_danisman_baglam_kart_migration.sql'DEN SONRA çalıştır.
--
-- 2026-09-22: Behnan sordu — "danışanın ajandasına düşmesi gerekmiyor mu?" Önceki sürümde atanan kartlar
-- sadece Ayarlar > Danışmanlık modalında salt-okunur bir listede gösteriliyordu, danışanın GERÇEK Ajanda'sına
-- (haftalık ızgara) hiç girmiyordu — bu düzeltiliyor (app/page.tsx tarafında loadData artık bu kartları da
-- çekip aynı diziye ekliyor). Bunun çalışması için danışanın "yaptım" tikiyle kartı tamamladığında
-- (kartYapildiToggle) dog_rituals.bitis'i güncelleyebilmesi lazım — önceki migration'da danışana sadece
-- SELECT verilmişti (bilinçliydi: "silme=her zaman koç-only"), şimdi tamamlama için UPDATE de ekleniyor.
-- Silme (DELETE) policy'si YOK — danışan hâlâ bir atanan kartı silemez, sadece tamamlayabilir/düzenleyebilir.

drop policy if exists dog_rituals_danisan_update on dog_rituals;
create policy dog_rituals_danisan_update on dog_rituals
  for update
  using (
    iliski_id in (
      select id from dog_iliskiler
      where danisan_id = public.rite_client_id() and durum = 'aktif'
    )
  )
  with check (
    iliski_id in (
      select id from dog_iliskiler
      where danisan_id = public.rite_client_id() and durum = 'aktif'
    )
  );
