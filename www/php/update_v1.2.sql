-- update bookmarks table

-- update groups table
ALTER TABLE `groups` ADD `remarks` TEXT NOT NULL AFTER `name`;

-- update global table
INSERT INTO `global` (`key`, `value`) VALUES ('hideU1', '0'), ('hideU2', '0'), ('hideU3', '0'), ('hideU4', '0'), ('hideU5', '0'), ('hideU6', '0'), ('hideU7', '0'), ('hideU8', '0');
INSERT INTO `global` (`key`, `value`) VALUES ('background', 'grey');

-- update version in global;
UPDATE `global` SET `value` = '1.2.3' WHERE `global`.`key` = 'version';
