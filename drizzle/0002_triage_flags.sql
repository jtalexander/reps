CREATE TABLE "question_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gaps" ADD COLUMN "priority" text DEFAULT 'key' NOT NULL;--> statement-breakpoint
ALTER TABLE "gaps" ADD COLUMN "dup_of" uuid;--> statement-breakpoint
ALTER TABLE "question_flags" ADD CONSTRAINT "question_flags_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_flags" ADD CONSTRAINT "question_flags_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_flags" ADD CONSTRAINT "question_flags_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_flags" ADD CONSTRAINT "question_flags_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_flags_team" ON "question_flags" USING btree ("team_id","status");--> statement-breakpoint
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_dup_of_gaps_id_fk" FOREIGN KEY ("dup_of") REFERENCES "public"."gaps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gaps_dup_of" ON "gaps" USING btree ("dup_of");--> statement-breakpoint
-- Until a triage pass ranks them, the first three questions per topic (the model lists the most important first) are the ones asked.
UPDATE "gaps" SET "priority" = 'optional' WHERE "sort" >= 3;
