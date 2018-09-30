<?php
if(isset($_POST['old']) && isset($_POST['new'])){
	include 'db-conn.php';
	$old = $_POST['old'];
	$new = $_POST['new'];

	if($old == '-1'){
		$insert = 'INSERT INTO `groups` (`id`, `name`) VALUES (NULL, "'.$new.'")';
	}else if($new == '-1'){
		$insert = '';
	}else{
		$insert = 'UPDATE `groups` SET `name` = "'.$new.'" WHERE `groups`.`name` = "'.$old.'"';
	}

	if (!$result = mysqli_query($con, $insert)) {
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