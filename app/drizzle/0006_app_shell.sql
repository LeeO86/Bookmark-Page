ALTER TABLE `tags` ADD `display_label` text;--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `sidebar_collapsed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `group_modes` text DEFAULT '{}' NOT NULL;