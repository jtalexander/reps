-- A topic name's concept words, the same rule as conceptWords() in src/teach/shared.ts:
-- capitals, letters and digits only, 3+ characters, minus words too common to mean a concept.
CREATE OR REPLACE FUNCTION reps_concept_words(name text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT coalesce(array_agg(DISTINCT w ORDER BY w), '{}')
  FROM regexp_split_to_table(regexp_replace(upper(name), '[^A-Z0-9 ]+', ' ', 'g'), ' +') AS w
  WHERE length(w) >= 3
    AND w <> ALL (ARRAY['THE','AND','VS','OUR','PLAY','PLAYS','PASS','RUN','GAME','RIGHT','LEFT','PROTECTION','FORMATIONS','FORMATION','BASE'])
$$;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "concept_words" text[] GENERATED ALWAYS AS (reps_concept_words(name)) STORED;--> statement-breakpoint
CREATE INDEX "topics_concept_words" ON "topics" USING gin ("concept_words");