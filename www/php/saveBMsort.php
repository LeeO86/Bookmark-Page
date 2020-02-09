<?php
/*
 * Bookmark-Page (https://github.com/LeeO86/Bookmark-Page)
 *
 * Copyright 2020 Adrian Hilber
 * Licensed under MIT (https://github.com/LeeO86/Bookmark-Page/blob/master/LICENSE)
 */

if(isset($_POST['json'])){
	include 'db-conn.php';
	$json = $_POST['json'];
	$array = json_decode($json);

	foreach ($array as $id => $sort) {
		$query = 'UPDATE `bookmarks` SET `sort` = "'.$sort.'" WHERE `bookmarks`.`id` = "'.$id.'"';
		if (!$result = mysqli_query($con, $query)) {
	    	exit(mysqli_error($con));
		}
	}
	
	http_response_code(200);
	echo("OK");

	mysqli_close($con);
}else{
	http_response_code(400);
	echo("HTTP-POST ERROR");
}

?>