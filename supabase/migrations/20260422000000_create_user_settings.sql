-- User settings: stores per-user configuration (e.g. display name for placeholder substitution)
create table user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_display_name_format_check check (
    display_name = btrim(display_name)
    and char_length(display_name) <= 50
  ),
  constraint user_settings_user_id_unique unique (user_id)
);

create index user_settings_user_id_idx on user_settings(user_id);

alter table user_settings enable row level security;

create policy "Users can manage their own settings"
  on user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger user_settings_updated_at
  before update on user_settings
  for each row execute function update_updated_at();
