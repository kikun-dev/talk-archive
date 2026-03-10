create schema if not exists extensions;

alter extension pg_trgm set schema extensions;

create or replace function public.update_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
