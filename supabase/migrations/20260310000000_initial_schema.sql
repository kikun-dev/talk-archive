-- Enable pg_trgm extension for Japanese text search
create extension if not exists pg_trgm;

-- Record type enum
create type record_type as enum ('text', 'image', 'video', 'audio');

-- Sources: where talks originated (e.g. "LINE", "Slack")
create table sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Conversations: groups of records
create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references sources(id) on delete set null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Records: individual talk entries
create table records (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  record_type record_type not null,
  title text,
  content text,
  has_audio boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint records_text_content_check check (
    record_type <> 'text' or content is not null
  )
);

-- Attachments: media file metadata
create table attachments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references records(id) on delete cascade,
  file_path text not null,
  mime_type text not null,
  file_size bigint not null,
  created_at timestamptz not null default now()
);

-- Indexes
create index sources_user_id_idx on sources(user_id);
create index conversations_user_id_idx on conversations(user_id);
create index conversations_source_id_idx on conversations(source_id);
create index records_conversation_id_idx on records(conversation_id);
create index records_position_idx on records(conversation_id, position);
create index attachments_record_id_idx on attachments(record_id);

-- pg_trgm GIN index for Japanese partial match search
create index records_content_trgm_idx on records using gin (content gin_trgm_ops);

-- Row Level Security
alter table sources enable row level security;
alter table conversations enable row level security;
alter table records enable row level security;
alter table attachments enable row level security;

-- RLS policies: users can only access their own data
create policy "Users can manage their own sources"
  on sources for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own conversations"
  on conversations for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      source_id is null
      or exists (
        select 1 from sources
        where sources.id = conversations.source_id
          and sources.user_id = auth.uid()
      )
    )
  );

create policy "Users can manage records in their conversations"
  on records for all
  using (
    exists (
      select 1 from conversations
      where conversations.id = records.conversation_id
        and conversations.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from conversations
      where conversations.id = records.conversation_id
        and conversations.user_id = auth.uid()
    )
  );

create policy "Users can manage attachments in their records"
  on attachments for all
  using (
    exists (
      select 1 from records
      join conversations on conversations.id = records.conversation_id
      where records.id = attachments.record_id
        and conversations.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from records
      join conversations on conversations.id = records.conversation_id
      where records.id = attachments.record_id
        and conversations.user_id = auth.uid()
    )
  );

-- updated_at auto-update trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger sources_updated_at
  before update on sources
  for each row execute function update_updated_at();

create trigger conversations_updated_at
  before update on conversations
  for each row execute function update_updated_at();

create trigger records_updated_at
  before update on records
  for each row execute function update_updated_at();
