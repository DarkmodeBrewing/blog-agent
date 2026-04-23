CREATE TABLE `content_bundles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_bundles_key_unique` ON `content_bundles` (`key`);--> statement-breakpoint
CREATE INDEX `idx_content_bundles_key` ON `content_bundles` (`key`);--> statement-breakpoint
CREATE TABLE `post_publications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`target` text NOT NULL,
	`status` text NOT NULL,
	`external_id` text,
	`remote_url` text,
	`file_path` text,
	`commit_sha` text,
	`artifact_json` text,
	`error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`published_at` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_post_publications_post_id` ON `post_publications` (`post_id`);--> statement-breakpoint
CREATE INDEX `idx_post_publications_target` ON `post_publications` (`target`);--> statement-breakpoint
CREATE INDEX `idx_post_publications_status` ON `post_publications` (`status`);--> statement-breakpoint
ALTER TABLE `posts` ADD `bundle_id` integer REFERENCES content_bundles(id);--> statement-breakpoint
ALTER TABLE `posts` ADD `parent_post_id` integer REFERENCES posts(id);--> statement-breakpoint
ALTER TABLE `posts` ADD `content_type` text DEFAULT 'blog' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `variant_role` text DEFAULT 'standalone' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `locked_at` text;--> statement-breakpoint
CREATE INDEX `idx_posts_bundle_id` ON `posts` (`bundle_id`);--> statement-breakpoint
CREATE INDEX `idx_posts_parent_post_id` ON `posts` (`parent_post_id`);--> statement-breakpoint
CREATE INDEX `idx_posts_content_type` ON `posts` (`content_type`);