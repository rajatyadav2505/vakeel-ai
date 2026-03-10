alter table if exists public.whatsapp_messages
  drop column if exists delivery_status,
  drop column if exists direction,
  drop column if exists contact_phone,
  drop column if exists owner_user_id;

drop table if exists public.user_settings;
