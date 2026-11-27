CREATE TYPE "public"."page_kind" AS ENUM('page', 'database', 'row');--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "kind" "page_kind" DEFAULT 'page' NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "db_schema" jsonb;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "props" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "todo_page_id" uuid;