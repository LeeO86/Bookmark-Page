ALTER TABLE `action_templates` ADD `inputs` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `actions` ADD `inputs` text DEFAULT '[]' NOT NULL;