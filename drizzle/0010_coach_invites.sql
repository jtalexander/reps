ALTER TABLE "teams" ADD COLUMN "coach_invite_code" text;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_coachInviteCode_unique" UNIQUE("coach_invite_code");