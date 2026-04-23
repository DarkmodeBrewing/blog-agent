CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`request_json` text NOT NULL,
	`draft_slug` text,
	`error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`started_at` text,
	`completed_at` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_generation_jobs_status` ON `generation_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_generation_jobs_created_at` ON `generation_jobs` (`created_at`);--> statement-breakpoint
CREATE TABLE `generation_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer,
	`model` text NOT NULL,
	`prompt` text NOT NULL,
	`request_json` text NOT NULL,
	`response_json` text NOT NULL,
	`source_post_slugs_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_generation_runs_post_id` ON `generation_runs` (`post_id`);--> statement-breakpoint
CREATE TABLE `log_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`details` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `post_status_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_post_status_events_post_id` ON `post_status_events` (`post_id`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`ingress` text,
	`body` text NOT NULL,
	`frontmatter_json` text DEFAULT '{}' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`status` text NOT NULL,
	`github_path` text,
	`github_sha` text,
	`source` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_unique` ON `posts` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_posts_status` ON `posts` (`status`);--> statement-breakpoint
CREATE INDEX `idx_posts_source` ON `posts` (`source`);--> statement-breakpoint
CREATE TABLE `token_usage_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`operation` text NOT NULL,
	`stage` text NOT NULL,
	`model` text NOT NULL,
	`response_id` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_token_usage_events_created_at` ON `token_usage_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_token_usage_events_model` ON `token_usage_events` (`model`);--> statement-breakpoint
CREATE INDEX `idx_token_usage_events_session_id` ON `token_usage_events` (`session_id`);