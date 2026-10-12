CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`colour_mode` text,
	`view_modes` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `filters` ADD `view_mode` text DEFAULT 'list' NOT NULL;