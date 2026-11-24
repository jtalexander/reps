ALTER TABLE "teams" ADD COLUMN "library_styles" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "diagram" jsonb;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "diagram" jsonb;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "library_key" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "library_version" integer;