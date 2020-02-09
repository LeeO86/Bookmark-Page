<?php
/*
 * Bookmark-Page (https://github.com/LeeO86/Bookmark-Page)
 *
 * Copyright 2020 Adrian Hilber
 * Licensed under MIT (https://github.com/LeeO86/Bookmark-Page/blob/master/LICENSE)
 */

$favcolors = '../img/favcolors';
$icons = '../img/icons';
if(isset($_POST['color'])){
    $file = $_POST['color'];
    $src = $favcolors . '/' . $file;
    copy($src, '../favicon.ico');

    http_response_code(200);
	echo("OK");
}else{
	$scanned_favcolors = array_diff(scandir($favcolors), array('..', '.'));
	$scanned_icons = array_diff(scandir($icons), array('..', '.'));
	$out = array('favcolors' => $scanned_favcolors, 'icons' => $scanned_icons);
    header('Content-Type: application/json');
    echo json_encode($out);
}


?>