ALTER TABLE "plays" ADD COLUMN "side" text DEFAULT 'offense' NOT NULL;--> statement-breakpoint
ALTER TABLE "plays" ADD COLUMN "good_vs" jsonb DEFAULT '{"yes":[],"no":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "side" text DEFAULT 'offense' NOT NULL;