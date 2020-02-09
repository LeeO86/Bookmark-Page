<?php
/*
 * Bookmark-Page (https://github.com/LeeO86/Bookmark-Page)
 *
 * Copyright 2020 Adrian Hilber
 * Licensed under MIT (https://github.com/LeeO86/Bookmark-Page/blob/master/LICENSE)
 */

if(isset($_POST['groupname'])){
	include 'db-conn.php';
	$name = $_POST['groupname'];

	$query = 'SELECT COUNT(*) FROM `link-groups-bookmarks` `L` INNER JOIN `groups` `G` ON `L`.`group-id` = `G`.`id` WHERE `G`.name = "'.$name.'"';
	if (!$result = mysqli_query($con, $query)) {
        exit(mysqli_error($con));
	}
	$fetch = mysqli_fetch_assoc($result);

	if ($fetch['COUNT(*)'] == 0){
		$delete = 'DELETE FROM `groups` WHERE `groups`.`name` = "'.$name.'"';
	}else{
		$delete = 'DELETE `B`, `G`, `L` FROM `bookmarks` `B` INNER JOIN `link-groups-bookmarks` `L` ON `B`.`id` = `L`.`bookmark-id` INNER JOIN `groups` `G` ON `L`.`group-id` = `G`.`id` WHERE `G`.name = "'.$name.'"';
	}

    if (!$result = mysqli_query($con, $delete)) {
        exit(mysqli_error($con));
    }
	
	http_response_code(200);
	echo("OK");

	mysqli_close($con);
}else{
	http_response_code(400);
	echo("HTTP-POST ERROR");
}

?>