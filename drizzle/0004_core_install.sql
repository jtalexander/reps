ALTER TABLE "questions" ADD COLUMN "tier" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "in_install" boolean DEFAULT false NOT NULL;