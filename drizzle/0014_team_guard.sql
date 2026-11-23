-- Second layer of team separation, enforced by Postgres itself: a row can only
-- point at a parent row of the SAME team (a question at its own team's topic, an
-- answer from its own team's player...). The app already scopes every query by
-- team; this makes a cross-team link impossible even if a future bug tried one.
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_id_team_unique" UNIQUE ("id", "team_id");--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_id_team_unique" UNIQUE ("id", "team_id");--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_id_team_unique" UNIQUE ("id", "team_id");--> statement-breakpoint
ALTER TABLE "plays" ADD CONSTRAINT "plays_id_team_unique" UNIQUE ("id", "team_id");--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_id_team_unique" UNIQUE ("id", "team_id");--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_id_team_unique" UNIQUE ("id", "team_id");--> statement-breakpoint
ALTER TABLE "study_sets" ADD CONSTRAINT "study_sets_id_team_unique" UNIQUE ("id", "team_id");--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_id_team_unique" UNIQUE ("id", "team_id");--> statement-breakpoint
ALTER TABLE "upload_pages" ADD CONSTRAINT "upload_pages_id_team_unique" UNIQUE ("id", "team_id");--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_id_team_unique" UNIQUE ("id", "team_id");--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_player_id_same_team" FOREIGN KEY ("player_id", "team_id") REFERENCES "players" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_session_id_same_team" FOREIGN KEY ("session_id", "team_id") REFERENCES "quiz_sessions" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_play_id_same_team" FOREIGN KEY ("play_id", "team_id") REFERENCES "plays" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "plays" ADD CONSTRAINT "plays_upload_id_same_team" FOREIGN KEY ("upload_id", "team_id") REFERENCES "uploads" ("id", "team_id") ON DELETE SET NULL ("upload_id");--> statement-breakpoint
ALTER TABLE "plays" ADD CONSTRAINT "plays_page_id_same_team" FOREIGN KEY ("page_id", "team_id") REFERENCES "upload_pages" ("id", "team_id") ON DELETE SET NULL ("page_id");--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_player_id_same_team" FOREIGN KEY ("player_id", "team_id") REFERENCES "players" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_study_set_id_same_team" FOREIGN KEY ("study_set_id", "team_id") REFERENCES "study_sets" ("id", "team_id") ON DELETE SET NULL ("study_set_id");--> statement-breakpoint
ALTER TABLE "srs_items" ADD CONSTRAINT "srs_items_player_id_same_team" FOREIGN KEY ("player_id", "team_id") REFERENCES "players" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "srs_items" ADD CONSTRAINT "srs_items_play_id_same_team" FOREIGN KEY ("play_id", "team_id") REFERENCES "plays" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "upload_pages" ADD CONSTRAINT "upload_pages_upload_id_same_team" FOREIGN KEY ("upload_id", "team_id") REFERENCES "uploads" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ask_log" ADD CONSTRAINT "ask_log_player_id_same_team" FOREIGN KEY ("player_id", "team_id") REFERENCES "players" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_player_id_same_team" FOREIGN KEY ("player_id", "team_id") REFERENCES "players" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_question_id_same_team" FOREIGN KEY ("question_id", "team_id") REFERENCES "questions" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_topic_id_same_team" FOREIGN KEY ("topic_id", "team_id") REFERENCES "topics" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_dup_of_same_team" FOREIGN KEY ("dup_of", "team_id") REFERENCES "gaps" ("id", "team_id") ON DELETE SET NULL ("dup_of");--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_player_id_same_team" FOREIGN KEY ("player_id", "team_id") REFERENCES "players" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_same_team" FOREIGN KEY ("lesson_id", "team_id") REFERENCES "lessons" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_topic_id_same_team" FOREIGN KEY ("topic_id", "team_id") REFERENCES "topics" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "question_flags" ADD CONSTRAINT "question_flags_question_id_same_team" FOREIGN KEY ("question_id", "team_id") REFERENCES "questions" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "question_flags" ADD CONSTRAINT "question_flags_player_id_same_team" FOREIGN KEY ("player_id", "team_id") REFERENCES "players" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "question_srs" ADD CONSTRAINT "question_srs_player_id_same_team" FOREIGN KEY ("player_id", "team_id") REFERENCES "players" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "question_srs" ADD CONSTRAINT "question_srs_question_id_same_team" FOREIGN KEY ("question_id", "team_id") REFERENCES "questions" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_same_team" FOREIGN KEY ("topic_id", "team_id") REFERENCES "topics" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "teach_pages" ADD CONSTRAINT "teach_pages_upload_id_same_team" FOREIGN KEY ("upload_id", "team_id") REFERENCES "uploads" ("id", "team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "teach_pages" ADD CONSTRAINT "teach_pages_page_id_same_team" FOREIGN KEY ("page_id", "team_id") REFERENCES "upload_pages" ("id", "team_id") ON DELETE CASCADE;
