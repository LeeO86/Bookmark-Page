<?php
/*
 * Bookmark-Page (https://github.com/LeeO86/Bookmark-Page)
 *
 * Copyright 2020 Adrian Hilber
 * Licensed under MIT (https://github.com/LeeO86/Bookmark-Page/blob/master/LICENSE)
 */

if(isset($_POST['id'])){
	include 'db-conn.php';
	$id = $_POST['id'];

    $delete = 'DELETE FROM `bookmarks` WHERE `bookmarks`.`id` = "'.$id.'"';
    if (!$result = mysqli_query($con, $delete)) {
        exit(mysqli_error($con));
    }
    $delete2 = 'DELETE FROM `link-groups-bookmarks` WHERE `link-groups-bookmarks`.`bookmark-id` = "'.$id.'"';
    if (!$result = mysqli_query($con, $delete2)) {
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