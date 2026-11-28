CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"opponent_id" uuid NOT NULL,
	"game_date" date NOT NULL,
	"kickoff" text DEFAULT '' NOT NULL,
	"home_away" text DEFAULT 'home' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_id_team_unique" UNIQUE("id","team_id")
);
--> statement-breakpoint
CREATE TABLE "opponents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"season" integer NOT NULL,
	"head_coach" text DEFAULT '' NOT NULL,
	"offensive_coordinator" text DEFAULT '' NOT NULL,
	"defensive_coordinator" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opponents_id_team_unique" UNIQUE("id","team_id")
);
--> statement-breakpoint
CREATE TABLE "scout_plays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"opponent_id" uuid NOT NULL,
	"name" text DEFAULT 'unknown' NOT NULL,
	"side" text DEFAULT 'offense' NOT NULL,
	"data" jsonb NOT NULL,
	"source" text DEFAULT 'drawn' NOT NULL,
	"in_install" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scout_plays_id_team_unique" UNIQUE("id","team_id")
);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_opponent_id_same_team" FOREIGN KEY ("opponent_id","team_id") REFERENCES "public"."opponents"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opponents" ADD CONSTRAINT "opponents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_plays" ADD CONSTRAINT "scout_plays_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_plays" ADD CONSTRAINT "scout_plays_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_plays" ADD CONSTRAINT "scout_plays_opponent_id_same_team" FOREIGN KEY ("opponent_id","team_id") REFERENCES "public"."opponents"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_team_date" ON "games" USING btree ("team_id","game_date");--> statement-breakpoint
CREATE UNIQUE INDEX "opponents_team_name_season" ON "opponents" USING btree ("team_id","name_key","season");--> statement-breakpoint
CREATE INDEX "scout_plays_team_opponent" ON "scout_plays" USING btree ("team_id","opponent_id");