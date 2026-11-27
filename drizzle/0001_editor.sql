CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_presence" (
	"page_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"editing" boolean DEFAULT false NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_presence_page_id_user_id_pk" PRIMARY KEY("page_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "doc" "bytea";--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "search_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('dutch', coalesce(title, '')), 'A') || setweight(to_tsvector('dutch', coalesce(search_text, '')), 'B')) STORED;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_presence" ADD CONSTRAINT "page_presence_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_presence" ADD CONSTRAINT "page_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_page_idx" ON "files" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "pages_search_idx" ON "pages" USING gin ("search_vector");