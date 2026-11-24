ALTER TABLE "plays" ADD COLUMN "in_install" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "install_name" text;