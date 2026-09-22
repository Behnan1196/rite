-- Rite: dog_iliskiler'de eksik olan tek yön — danışan kendi ilişki satırını güncelleyebilsin.
-- Supabase SQL Editor'de, rite_danisman_rls_fix_migration.sql'DEN SONRA çalıştır.
--
-- 2026-09-22: rite_danisman_rls_fix_migration.sql'de yalnızca dog_iliskiler_danisman_update vardı
-- (danışman onaylar/reddeder/sonlandırır). Uygulama tarafında (app/page.tsx, "Danışmanlık" ekranı)
-- danışanın da kendi tarafından yapabildiği iki şey var: (a) bağlı olduğu bir danışmanla ilişkiyi
-- kendi isteğiyle sonlandırması, (b) daha önce sonlandırılmış bir ilişkiyi tekrar 'beklemede'ye
-- alıp yeniden istek göndermesi (unique(danisman_id,danisan_id,tur) kısıtı nedeniyle bu INSERT değil
-- UPDATE olmak zorunda). Bilerek 'aktif'/'askida' hedefine İZİN VERİLMİYOR — danışan kendi kendini
-- onaylayamaz, bunu sadece danışman yapabilir (dog_iliskiler_danisman_update zaten öyle).

drop policy if exists dog_iliskiler_danisan_update on dog_iliskiler;
create policy dog_iliskiler_danisan_update on dog_iliskiler
  for update
  using (danisan_id = public.rite_client_id())
  with check (
    danisan_id = public.rite_client_id()
    and durum in ('sonlandi', 'beklemede')
  );
