-- Saves several transactions in ONE database transaction: either all of them are stored
-- (each with its own transaction id across the four tables) or none are.
--
-- p_items is a JSON array like:
--   [{"type":"debit","date":"2026-09-15","amount":500,"party":"Akhil",
--     "category_id":null,"new_category":"Friends & Family","raw_text":"15 sep akhil 500rs"}, ...]
create or replace function public.add_transactions(p_items jsonb)
returns uuid[]
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_ids uuid[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nothing to save';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Too many transactions at once (max 50)';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_ids := v_ids || public.add_transaction(
      p_type         => v_item->>'type',
      p_date         => (v_item->>'date')::date,
      p_amount       => (v_item->>'amount')::numeric,
      p_party        => nullif(v_item->>'party', ''),
      p_category_id  => nullif(v_item->>'category_id', '')::uuid,
      p_new_category => nullif(v_item->>'new_category', ''),
      p_raw_text     => nullif(v_item->>'raw_text', '')
    );
  end loop;

  return v_ids;
end;
$$;

revoke execute on function public.add_transactions(jsonb) from public, anon;
grant execute on function public.add_transactions(jsonb) to authenticated;

notify pgrst, 'reload schema';
