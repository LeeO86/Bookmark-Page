<?php
/*
 * Bookmark-Page (https://github.com/LeeO86/Bookmark-Page)
 *
 * Copyright 2020 Adrian Hilber
 * Licensed under MIT (https://github.com/LeeO86/Bookmark-Page/blob/master/LICENSE)
 */

if(isset($_POST['old']) && isset($_POST['new']) && isset($_POST['json'])){
	include 'db-conn.php';
	$old = $_POST['old'];
	$new = $_POST['new'];
	$sort = $_POST['sort'];
	$remark = $_POST['remark'];
	$json = $_POST['json'];
	$array = json_decode($json);

	foreach ($array as $group => $jsort) {
		$query = 'UPDATE `groups` SET `sort` = "'.$jsort.'" WHERE `groups`.`id` = "'.$group.'"';
		if (!$result = mysqli_query($con, $query)) {
	    	exit(mysqli_error($con));
		}
	}
	
	if($new != '-1'){
		if($old == '-1'){
			$insert = 'INSERT INTO `groups` (`id`, `sort`, `name`, `remarks`) VALUES (NULL, "'.$sort.'", "'.$new.'", "'.$remark.'")';
		}else{
			$insert = 'UPDATE `groups` SET `name` = "'.$new.'", `remarks` = "'.$remark.'" WHERE `groups`.`id` = "'.$old.'"';
		}

		if (!$result = mysqli_query($con, $insert)) {
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