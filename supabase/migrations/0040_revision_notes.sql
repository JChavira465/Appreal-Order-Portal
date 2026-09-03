-- What the customer actually wants changed.
--
-- Until now "request changes" set a boolean flag and nothing else. The
-- shop learned that someone was unhappy and had to go find out why by
-- text or phone -- which is exactly the conversation this app exists to
-- absorb. The design back-and-forth is where apparel email chains
-- genuinely pile up, and the app was throwing away the only part of it
-- that carries information.
--
-- revision_note holds the CURRENT outstanding request, cleared when a
-- new mockup goes out. The full round-by-round history already has a
-- home in activity_log, which every order screen renders and which reps
-- can read on their own orders -- so the reason is written there too,
-- and nothing needs a new table to be able to look back at round two.

alter table orders add column if not exists revision_note text;
