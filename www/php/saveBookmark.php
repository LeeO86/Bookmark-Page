<?php
if(isset($_POST['id']) && isset($_POST['name']) && isset($_POST['link']) && isset($_POST['favicon']) && isset($_POST['remarks']) && isset($_POST['group'])){
	include 'db-conn.php';
	$id = $_POST['id'];
	$sort = $_POST['sort'];
	$name = $_POST['name'];
	$link = $_POST['link'];
	$favicon = $_POST['favicon'];
	$remarks = $_POST['remarks'];
	$u1 = $_POST['user1'];
	$u2 = $_POST['user2'];
	$u3 = $_POST['user3'];
	$u4 = $_POST['user4'];
	$u5 = $_POST['user5'];
	$u6 = $_POST['user6'];
	$u7 = $_POST['user7'];
	$u8 = $_POST['user8'];
	$group = $_POST['group'];

	$queryGroup = 'SELECT * From `groups`';

	if (!$resultG = mysqli_query($con, $queryGroup)) {
	    exit(mysqli_error($con));
	}

	while($groupFetch = mysqli_fetch_assoc($resultG)) {
		if($group == $groupFetch['name']){
			if($id == '-1'){
				$insert = 'INSERT INTO `bookmarks` (`id`, `sort`, `link`, `favicon`, `name`, `remarks`, `user1`, `user2`, `user3`, `user4`, `user5`, `user6`, `user7`, `user8`) VALUES (NULL, "'.$sort.'", "'.$link.'", "'.$favicon.'", "'.$name.'", "'.$remarks.'", "'.$u1.'", "'.$u2.'", "'.$u3.'", "'.$u4.'", "'.$u5.'", "'.$u6.'", "'.$u7.'", "'.$u8.'" )';
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
				$insert = 'UPDATE `bookmarks` SET `link` = "'.$link.'", `favicon` = "'.$favicon.'", `name` = "'.$name.'", `remarks` = "'.$remarks.'", `user1` = "'.$u1.'", `user2` = "'.$u2.'", `user3` = "'.$u3.'", `user4` = "'.$u4.'", `user5` = "'.$u5.'", `user6` = "'.$u6.'", `user7` = "'.$u7.'", `user8` = "'.$u8.'" WHERE `bookmarks`.`id` = "'.$id.'"';
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