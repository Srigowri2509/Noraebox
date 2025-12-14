-- devices table for mapping tablets/devices to rooms
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  device_uuid text not null unique,
  name text, -- optional friendly name e.g. "Tablet-A01"
  room_id uuid references public.rooms(id) on delete set null,
  meta jsonb, -- optional extra info (os, app_version)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_devices_device_uuid on public.devices(device_uuid);

-- Trigger to update updated_at timestamp
create or replace function public.update_timestamp() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_devices_updated_at
before update on public.devices
for each row execute procedure public.update_timestamp();

