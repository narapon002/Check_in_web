-- โครงสร้างฐานข้อมูลของเว็บเช็คชื่อพนักงาน (Supabase / Postgres)
-- ใช้สร้างโปรเจกต์ใหม่: วางใน Supabase > SQL Editor แล้วกด Run

-- ผู้มีสิทธิ์ใช้งานระบบ (เพิ่มอีเมลได้ด้วยคำสั่ง insert)
create table public.allowed_users (
  email text primary key,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);
insert into public.allowed_users (email) values ('narapon002@gmail.com');

create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.allowed_users a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;

-- พนักงาน
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  dept text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- การเข้างาน (หนึ่งแถวต่อพนักงานต่อวัน)
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  check_in timestamptz,
  check_out timestamptz,
  confirmed boolean not null default false,
  confirmed_by text,
  confirmed_at timestamptz,
  signature text check (signature is null or length(signature) <= 200000),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (work_date, employee_id)
);
create index attendance_work_date_idx on public.attendance (work_date);
create index attendance_employee_idx on public.attendance (employee_id);

-- เวลาทำงาน
create table public.settings (
  id int primary key default 1 check (id = 1),
  start_time time not null default '08:00',
  end_time time not null default '17:00',
  updated_at timestamptz not null default now()
);
insert into public.settings default values;

-- Row Level Security: เฉพาะอีเมลใน allowed_users เท่านั้นที่อ่าน/เขียนได้
alter table public.allowed_users enable row level security;
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.settings enable row level security;

create policy "allowed read self" on public.allowed_users
  for select to authenticated using ((select public.is_allowed()));
create policy "allowed all employees" on public.employees
  for all to authenticated using ((select public.is_allowed())) with check ((select public.is_allowed()));
create policy "allowed all attendance" on public.attendance
  for all to authenticated using ((select public.is_allowed())) with check ((select public.is_allowed()));
create policy "allowed read settings" on public.settings
  for select to authenticated using ((select public.is_allowed()));
create policy "allowed update settings" on public.settings
  for update to authenticated using ((select public.is_allowed())) with check ((select public.is_allowed()));
