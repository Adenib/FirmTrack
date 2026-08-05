-- journal_lines.debit_usd/credit_usd were numeric(12,2) (max ~10 billion),
-- sized assuming USD-scale amounts. AELEX's real Naira-denominated trial
-- balance has individual accounts exceeding that (e.g. Debtors Bills
-- Unpaid at ~28.4 billion), so posting real opening balances overflowed.
-- Widened to numeric(18,2), matching plenty of headroom above what
-- post_journal_entry's own internal numeric(14,2) balance-check variables
-- already assume is a reasonable upper bound.
alter table public.journal_lines alter column debit_usd type numeric(18, 2);
alter table public.journal_lines alter column credit_usd type numeric(18, 2);
