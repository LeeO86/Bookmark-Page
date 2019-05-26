<?php
if(isset($_POST['old']) && isset($_POST['new']) && isset($_POST['json'])){
	include 'db-conn.php';
	$old = $_POST['old'];
	$new = $_POST['new'];
	$sort = $_POST['sort'];
	$json = $_POST['json'];
	$array = json_decode($json);

	foreach ($array as $group => $sort) {
		$query = 'UPDATE `groups` SET `sort` = "'.$sort.'" WHERE `groups`.`name` = "'.$group.'"';
		if (!$result = mysqli_query($con, $query)) {
	    	exit(mysqli_error($con));
		}
	}
	
	if($new != '-1'){
		if($old == '-1'){
			$insert = 'INSERT INTO `groups` (`id`, `sort`, `name`) VALUES (NULL, "'.$sort.'", "'.$new.'")';
		}else{
			$insert = 'UPDATE `groups` SET `name` = "'.$new.'" WHERE `groups`.`name` = "'.$old.'"';
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