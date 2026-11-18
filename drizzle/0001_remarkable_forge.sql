ALTER TABLE "plays" ADD COLUMN "kind" text DEFAULT 'play' NOT NULL;--> statement-breakpoint
ALTER TABLE "plays" ADD COLUMN "item" jsonb;--> statement-breakpoint
ALTER TABLE "plays" ADD COLUMN "name_key" text;--> statement-breakpoint
ALTER TABLE "plays" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "plays" ADD COLUMN "source_pages" integer[] DEFAULT '{}'::int[] NOT NULL;--> statement-breakpoint
CREATE INDEX "plays_team_kind_idx" ON "plays" USING btree ("team_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "plays_library_name" ON "plays" USING btree ("team_id","kind","name_key") WHERE kind not in ('play', 'page');