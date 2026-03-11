-- Create media storage bucket
insert into storage.buckets (id, name, public)
values ('media', 'media', false);

-- RLS policies for media bucket
-- Users can upload files under their own user ID path
create policy "Users can upload their own media"
  on storage.objects for insert
  with check (
    bucket_id = 'media'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- Users can read their own files
create policy "Users can read their own media"
  on storage.objects for select
  using (
    bucket_id = 'media'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- Users can delete their own files
create policy "Users can delete their own media"
  on storage.objects for delete
  using (
    bucket_id = 'media'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
