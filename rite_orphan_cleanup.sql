-- Rite: dog_clients'tan sildiğin eski kullanıcılara ait, diğer tablolarda
-- kalan "sahipsiz" satırları temizler. Supabase SQL Editor'de çalıştır.
-- GERİ ALINAMAZ — önce aşağıdaki SAYIM bölümünü çalıştırıp ne kadar satır
-- silineceğini gör, sonra TEMİZLİK bölümünü çalıştır.

-- ============ 1) SAYIM (önce bunu çalıştır, sadece gösterir, hiçbir şeyi silmez) ============
select
  (select count(*) from dog_ritual_logs where client_id not in (select id from dog_clients)) as ritual_logs,
  (select count(*) from dog_rituals where client_id not in (select id from dog_clients)) as rituals,
  (select count(*) from dog_anchors where episode_id in (select id from dog_episodes where client_id not in (select id from dog_clients))) as anchors,
  (select count(*) from dog_sessions where episode_id in (select id from dog_episodes where client_id not in (select id from dog_clients))) as sessions,
  (select count(*) from dog_episodes where client_id not in (select id from dog_clients)) as episodes,
  (select count(*) from dog_measurements where client_id not in (select id from dog_clients)) as measurements,
  (select count(*) from dog_inbox where client_id not in (select id from dog_clients)) as inbox,
  (select count(*) from dog_push_subs where client_id not in (select id from dog_clients)) as push_subs,
  (select count(*) from dog_activities where client_id is not null and client_id not in (select id from dog_clients)) as activities,
  (select count(*) from dog_meridyen_uyelik where client_id not in (select id from dog_clients)) as meridyen_uyelik;

-- ============ 2) TEMİZLİK (sayıma göz gezdirdikten sonra çalıştır) ============
-- Sıra önemli: önce alt tablolar (loglar, program adımları vb.), en son ana kayıtlar.

delete from dog_ritual_logs where client_id not in (select id from dog_clients);
delete from dog_rituals where client_id not in (select id from dog_clients);

delete from dog_anchors where episode_id in (select id from dog_episodes where client_id not in (select id from dog_clients));
delete from dog_sessions where episode_id in (select id from dog_episodes where client_id not in (select id from dog_clients));
delete from dog_episodes where client_id not in (select id from dog_clients);

delete from dog_measurements where client_id not in (select id from dog_clients);
delete from dog_inbox where client_id not in (select id from dog_clients);
delete from dog_push_subs where client_id not in (select id from dog_clients);

-- client_id NULL olanlar Meridyen'in genel kart havuzu — onlara dokunmuyoruz,
-- yalnızca silinen kullanıcılara ait KİŞİSEL kartlar (client_id dolu ama sahipsiz) siliniyor.
delete from dog_activities where client_id is not null and client_id not in (select id from dog_clients);

delete from dog_meridyen_uyelik where client_id not in (select id from dog_clients);
