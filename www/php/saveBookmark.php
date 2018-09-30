<?php
if(isset($_POST['id']) && isset($_POST['name']) && isset($_POST['link']) && isset($_POST['favicon']) && isset($_POST['remarks']) && isset($_POST['group'])){
	include 'db-conn.php';
	$id = $_POST['id'];
	$name = $_POST['name'];
	$link = $_POST['link'];
	$favicon = $_POST['favicon'];
	$remarks = $_POST['remarks'];
	$group = $_POST['group'];

	$queryGroup = 'SELECT * From `groups`';

	if (!$resultG = mysqli_query($con, $queryGroup)) {
	    exit(mysqli_error($con));
	}

	while($groupFetch = mysqli_fetch_assoc($resultG)) {
		if($group == $groupFetch['name']){
			if($id == '-1'){
				$insert = 'INSERT INTO `bookmarks` (`id`, `link`, `favicon`, `name`, `remarks`) VALUES (NULL, "'.$link.'", "'.$favicon.'", "'.$name.'", "'.$remarks.'")';
				if (!$result = mysqli_query($con, $insert)) {
			    	exit(mysqli_error($con));
				}
				$getID = 'SELECT `id` FROM `bookmarks` WHERE `link` = "'.$link.'" AND `favicon` = "'.$favicon.'" AND `name` = "'.$name.'" AND `remarks` = "'.$remarks.'"';
				if (!$result = mysqli_query($con, $getID)) {
			    	exit(mysqli_error($con));
				}
				$idFetch = mysqli_fetch_assoc($result);
				$insert2 = 'INSERT INTO `link-groups-bookmarks` (`group-id`, `bookmark-id`) VALUES ("'.$groupFetch['id'].'", "'.$idFetch['id'].'")';
				if (!$result = mysqli_query($con, $insert2)) {
			    	exit(mysqli_error($con));
				}
			}else{
				$insert = 'UPDATE `bookmarks` SET `link` = "'.$link.'", `favicon` = "'.$favicon.'", `name` = "'.$name.'", `remarks` = "'.$remarks.'" WHERE `bookmarks`.`id` = "'.$id.'"';
				if (!$result = mysqli_query($con, $insert)) {
			    	exit(mysqli_error($con));
				}
				$insert2 = 'UPDATE `link-groups-bookmarks` SET `group-id` = "'.$groupFetch['id'].'" WHERE `link-groups-bookmarks`.`bookmark-id` = "'.$id.'"';
				if (!$result = mysqli_query($con, $insert2)) {
			    	exit(mysqli_error($con));
				}
			}
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