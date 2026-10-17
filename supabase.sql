-- InkHaus schema: run once in Supabase > SQL Editor
create table products(
  id bigint generated always as identity primary key,
  name text not null, brand text, category text, price numeric(10,2) not null,
  stock int default 0, description text, compatible text, image_url text,
  created_at timestamptz default now());
create table profiles(id uuid primary key references auth.users on delete cascade, username text, role text default 'customer');
create table orders(
  id bigint generated always as identity primary key,
  user_id uuid references auth.users, items jsonb, total numeric(10,2),
  address text, status text default 'Pending', created_at timestamptz default now());
 
-- username "123" becomes the back-office admin automatically
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,username,role)
  values(new.id, split_part(new.email,'@',1), case when new.email='123@inkhaus.app' then 'admin' else 'customer' end);
  return new;
end $$;
create trigger on_signup after insert on auth.users for each row execute function handle_new_user();
 
create function is_admin() returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from profiles where id=auth.uid() and role='admin') $$;
 
-- checkout: prices come from the DB, stock is decremented atomically
create function place_order(items jsonb, addr text) returns bigint language plpgsql security definer set search_path = public as $$
declare oid bigint; t numeric:=0; r record;
begin
  for r in select (i->>'id')::bigint id,(i->>'qty')::int qty from jsonb_array_elements(items) i loop
    update products set stock=stock-r.qty where id=r.id and stock>=r.qty;
    if not found then raise exception 'Not enough stock for one of the items'; end if;
    t:=t+r.qty*(select price from products where id=r.id);
  end loop;
  insert into orders(user_id,items,total,address) values(auth.uid(),items,t,addr) returning id into oid;
  return oid;
end $$;
 
alter table products enable row level security;
alter table profiles enable row level security;
alter table orders enable row level security;
create policy "products read" on products for select using (true);
create policy "products admin write" on products for all using (is_admin()) with check (is_admin());
create policy "profile own" on profiles for select using (id=auth.uid() or is_admin());
create policy "orders own" on orders for select using (user_id=auth.uid() or is_admin());
create policy "orders admin update" on orders for update using (is_admin());
 
insert into storage.buckets(id,name,public) values('product-images','product-images',true);
create policy "img read" on storage.objects for select using (bucket_id='product-images');
create policy "img admin write" on storage.objects for all using (bucket_id='product-images' and is_admin()) with check (bucket_id='product-images' and is_admin());
 
insert into products(name,brand,category,price,stock,compatible,description) values
('EcoTank L3250 Wi-Fi Printer','Epson','Printers',189.00,14,'L3250','Refillable tank printer. Print, scan and copy from your phone.'),
('PIXMA G3420 Ink Tank','Canon','Printers',169.00,9,'G3420','Low cost per page with spill-free refill bottles.'),
('HP LaserJet M111w','HP','Printers',129.00,6,'M111w','Compact mono laser for home offices.'),
('003 Black Ink Bottle 65ml','Epson','Ink',9.50,120,'L3250 L3210 L1110 L3150','Genuine pigment black ink.'),
('003 Colour Ink Set (C/M/Y)','Epson','Ink',24.00,60,'L3250 L3210 L1110 L3150','Three 65ml bottles: cyan, magenta, yellow.'),
('GI-71 Black Ink Bottle','Canon','Ink',10.50,80,'G3420 G2020 G3020','Genuine pigment black ink, 135ml.'),
('48A Black Toner','HP','Toner',54.00,4,'M111w M111a M141w','Original toner cartridge, about 1,500 pages.'),
('A4 Paper 80gsm (500 sheets)','InkHaus','Paper',5.90,300,'All','Bright white, jam-free paper for every printer.'),
('USB-B Printer Cable 1.8m','InkHaus','Accessories',6.50,3,'All','Shielded cable for desktop printers.');
 
-- accounts made from a username are confirmed automatically (no real email involved)
create function auto_confirm() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email like '%@inkhaus.app' then new.email_confirmed_at := coalesce(new.email_confirmed_at, now()); end if;
  return new;
end $$;
create trigger before_signup before insert on auth.users for each row execute function auto_confirm();
 