-- Run ONCE in Supabase > SQL Editor. Safe to run again.
-- 1) Let the website read/write tables (new Supabase projects block this by default)
grant usage on schema public to anon, authenticated;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select on public.profiles to authenticated;
grant select, update on public.orders to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
 
-- 2) Payment method + tracking number on orders
alter table public.orders add column if not exists payment text default 'Cash on delivery';
alter table public.orders add column if not exists tracking text;
 
drop function if exists public.place_order(jsonb, text);
create or replace function public.place_order(items jsonb, addr text, pay text) returns bigint
language plpgsql security definer set search_path = public as $$
declare oid bigint; t numeric := 0; r record;
begin
  for r in select (i->>'id')::bigint id, (i->>'qty')::int qty from jsonb_array_elements(items) i loop
    update products set stock = stock - r.qty where id = r.id and stock >= r.qty;
    if not found then raise exception 'Not enough stock for one of the items'; end if;
    t := t + r.qty * (select price from products where id = r.id);
  end loop;
  insert into orders(user_id, items, total, address, payment) values(auth.uid(), items, t, addr, pay) returning id into oid;
  return oid;
end $$;
 
-- customers can cancel their own Pending orders (stock is returned)
create or replace function public.cancel_order(oid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = oid and user_id = auth.uid() and status = 'Pending';
  if not found then raise exception 'Only pending orders can be cancelled'; end if;
  update orders set status = 'Cancelled' where id = oid;
  update products p set stock = p.stock + (i->>'qty')::int from jsonb_array_elements(o.items) i where p.id = (i->>'id')::bigint;
end $$;
 
grant execute on function public.place_order(jsonb, text, text) to authenticated;
grant execute on function public.cancel_order(bigint) to authenticated;
 