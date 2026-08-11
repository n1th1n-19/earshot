CREATE TYPE "public"."member_role" AS ENUM('host', 'cohost', 'speaker', 'invited');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('scheduled', 'live', 'ended');--> statement-breakpoint
CREATE TYPE "public"."speaker_policy" AS ENUM('everyone', 'invited');--> statement-breakpoint
CREATE TABLE "room_bans" (
	"room_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"banned_by" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "room_bans_room_user_uniq" UNIQUE("room_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "room_members" (
	"room_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" NOT NULL,
	"granted_by" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "room_members_room_user_uniq" UNIQUE("room_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"topics" text[],
	"status" "room_status" DEFAULT 'scheduled' NOT NULL,
	"speaker_policy" "speaker_policy" DEFAULT 'everyone' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"peak_listeners" integer DEFAULT 0 NOT NULL,
	"livekit_room" text NOT NULL,
	CONSTRAINT "rooms_livekit_room_unique" UNIQUE("livekit_room")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"last_seen_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "room_bans" ADD CONSTRAINT "room_bans_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_bans" ADD CONSTRAINT "room_bans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_bans" ADD CONSTRAINT "room_bans_banned_by_users_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;