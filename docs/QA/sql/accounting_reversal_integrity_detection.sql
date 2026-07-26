-- F-01 accounting reversal integrity detection report.
-- Read-only by design: every statement is a SELECT. Results require accountant review;
-- this file performs no correction, linkage backfill, trigger change, or historical update.

-- 1) Payment captures that have both posted refund journals and a manual journal reversal.
with refund_summary as (
  select
    account_id,
    original_payment_id,
    array_agg(id order by created_at, id) as refund_journal_ids,
    sum(
      case when meta->>'gross_minor' ~ '^\d+$'
        then (meta->>'gross_minor')::numeric
        else 0
      end
    ) as refund_gross_minor,
    bool_or(coalesce(meta->>'gross_minor', '') !~ '^\d+$') as ambiguous_minor_units
  from journal_entries
  where event_type = 'refund.posted'
    and original_payment_id is not null
  group by account_id, original_payment_id
), manual_summary as (
  select
    account_id,
    reversal_of_entry_id as original_entry_id,
    array_agg(id order by created_at, id) as manual_reversal_journal_ids
  from journal_entries
  where event_type = 'journal.reversal'
    and reversal_of_entry_id is not null
  group by account_id, reversal_of_entry_id
)
select
  capture.account_id,
  capture.branch_id,
  capture.id as capture_journal_id,
  capture.payment_id,
  refund.refund_journal_ids,
  refund.refund_gross_minor,
  refund.ambiguous_minor_units,
  manual.manual_reversal_journal_ids
from journal_entries capture
join refund_summary refund
  on refund.account_id = capture.account_id
 and refund.original_payment_id = capture.payment_id
join manual_summary manual
  on manual.account_id = capture.account_id
 and manual.original_entry_id = capture.id
where capture.event_type = 'payment.captured'
  and (refund.refund_gross_minor > 0 or refund.ambiguous_minor_units)
order by capture.account_id, capture.entry_date, capture.id;

-- 2) Inventory postings that have both an operational inventory reversal and a manual reversal.
with inventory_reversal_matches as (
  select distinct
    original.account_id,
    original.id as original_entry_id,
    reversal.id as inventory_reversal_journal_id,
    case
      when reversal.reversal_of_entry_id = original.id then 'reversal_of_entry_id'
      else 'inventory_movement_fallback'
    end as linkage_mode
  from journal_entries original
  join journal_entries reversal
    on reversal.account_id = original.account_id
   and reversal.event_type = 'inventory.reversal'
   and (
     reversal.reversal_of_entry_id = original.id
     or (
       reversal.reversal_of_entry_id is null
       and (
         reversal.meta->>'reversal_of_stock_movement_id' = original.source_id
         or exists (
           select 1
           from financial_events reversal_event
           where reversal_event.id = reversal.financial_event_id
             and reversal_event.account_id = reversal.account_id
             and reversal_event.payload->>'reversal_of_movement_id' = original.source_id
         )
       )
     )
   )
  where original.source_type = 'stock_movement'
    and original.event_type <> 'inventory.reversal'
), manual_matches as (
  select account_id, reversal_of_entry_id as original_entry_id, id as manual_reversal_journal_id
  from journal_entries
  where event_type = 'journal.reversal'
    and reversal_of_entry_id is not null
)
select
  original.account_id,
  original.branch_id,
  original.id as original_journal_id,
  original.event_type as original_event_type,
  original.source_id as original_stock_movement_id,
  array_agg(distinct inventory.inventory_reversal_journal_id) as inventory_reversal_journal_ids,
  array_agg(distinct inventory.linkage_mode) as inventory_linkage_modes,
  array_agg(distinct manual.manual_reversal_journal_id) as manual_reversal_journal_ids
from journal_entries original
join inventory_reversal_matches inventory
  on inventory.account_id = original.account_id
 and inventory.original_entry_id = original.id
join manual_matches manual
  on manual.account_id = original.account_id
 and manual.original_entry_id = original.id
group by original.account_id, original.branch_id, original.id, original.event_type, original.source_id
order by original.account_id, original.entry_date, original.id;

-- 3) Inventory reversal journals that do not carry the authoritative linkage column.
select
  reversal.account_id,
  reversal.branch_id,
  reversal.id as inventory_reversal_journal_id,
  reversal.financial_event_id,
  reversal.source_id as reversal_stock_movement_id,
  reversal.meta->>'reversal_of_stock_movement_id' as claimed_original_stock_movement_id,
  event.payload->>'reversal_of_movement_id' as event_original_stock_movement_id,
  reversal.entry_date,
  reversal.created_at
from journal_entries reversal
left join financial_events event
  on event.id = reversal.financial_event_id
 and event.account_id = reversal.account_id
where reversal.event_type = 'inventory.reversal'
  and reversal.reversal_of_entry_id is null
order by reversal.account_id, reversal.entry_date, reversal.id;

-- 4) More than one economic reversing journal associated with the same original.
-- Multiple partial refunds can be valid; path_types and IDs let an accountant distinguish
-- a legitimate refund series from a duplicate cross-path reversal.
with economic_paths as (
  select
    original.account_id,
    original.id as original_entry_id,
    reversal.id as reversing_journal_id,
    reversal.event_type as path_type
  from journal_entries original
  join journal_entries reversal
    on reversal.account_id = original.account_id
   and reversal.reversal_of_entry_id = original.id

  union all

  select
    capture.account_id,
    capture.id,
    refund.id,
    refund.event_type
  from journal_entries capture
  join journal_entries refund
    on refund.account_id = capture.account_id
   and refund.event_type = 'refund.posted'
   and refund.original_payment_id = capture.payment_id
  where capture.event_type = 'payment.captured'

  union all

  select
    original.account_id,
    original.id,
    reversal.id,
    'inventory.reversal:fallback'
  from journal_entries original
  join journal_entries reversal
    on reversal.account_id = original.account_id
   and reversal.event_type = 'inventory.reversal'
   and reversal.reversal_of_entry_id is null
   and reversal.meta->>'reversal_of_stock_movement_id' = original.source_id
  where original.source_type = 'stock_movement'
    and original.event_type <> 'inventory.reversal'
)
select
  original.account_id,
  original.branch_id,
  original.id as original_journal_id,
  original.event_type as original_event_type,
  count(distinct path.reversing_journal_id) as reversing_journal_count,
  array_agg(distinct path.path_type order by path.path_type) as path_types,
  array_agg(distinct path.reversing_journal_id order by path.reversing_journal_id) as reversing_journal_ids
from economic_paths path
join journal_entries original
  on original.account_id = path.account_id
 and original.id = path.original_entry_id
group by original.account_id, original.branch_id, original.id, original.event_type
having count(distinct path.reversing_journal_id) > 1
order by original.account_id, original.entry_date, original.id;

-- 5) Historical rows whose intended original cannot be resolved automatically.
select
  reversal.account_id,
  reversal.branch_id,
  reversal.id as journal_entry_id,
  reversal.event_type,
  'inventory_reversal_missing_original_evidence' as review_reason,
  reversal.entry_date,
  reversal.created_at
from journal_entries reversal
left join financial_events event
  on event.id = reversal.financial_event_id
 and event.account_id = reversal.account_id
where reversal.event_type = 'inventory.reversal'
  and reversal.reversal_of_entry_id is null
  and nullif(reversal.meta->>'reversal_of_stock_movement_id', '') is null
  and nullif(event.payload->>'reversal_of_movement_id', '') is null

union all

select
  refund.account_id,
  refund.branch_id,
  refund.id,
  refund.event_type,
  'refund_missing_valid_gross_minor',
  refund.entry_date,
  refund.created_at
from journal_entries refund
where refund.event_type = 'refund.posted'
  and coalesce(refund.meta->>'gross_minor', '') !~ '^\d+$'

union all

select
  reversal.account_id,
  reversal.branch_id,
  reversal.id,
  reversal.event_type,
  'manual_reversal_missing_linkage',
  reversal.entry_date,
  reversal.created_at
from journal_entries reversal
where reversal.event_type = 'journal.reversal'
  and reversal.reversal_of_entry_id is null
order by account_id, entry_date, journal_entry_id;
