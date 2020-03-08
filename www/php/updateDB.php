<?php
/*
 * Bookmark-Page (https://github.com/LeeO86/Bookmark-Page)
 *
 * Copyright 2020 Adrian Hilber
 * Licensed under MIT (https://github.com/LeeO86/Bookmark-Page/blob/master/LICENSE)
 */

include 'db-conn.php';
$out = '';


function updateWithFile($filename) {
    if(!file_exists($filename)) return;
    global $con, $out;
    // Temporary variable, used to store current query
    $templine = '';
    // Read in entire file
    $lines = file($filename);
    // Loop through each line
    foreach ($lines as $line) {
    // Skip it if it's a comment
        if (substr($line, 0, 2) == '--' || $line == '')
            continue;

    // Add this line to the current segment
        $templine .= $line;
    // If it has a semicolon at the end, it's the end of the query
        if (substr(trim($line), -1, 1) == ';') {
            // Perform the query
            mysqli_query($con, $templine) or $out .= 'Error performing query <strong>\'' . $templine . '\': ' . mysqli_error($con) . '</strong><br />';
            // Reset temp variable to empty
            $templine = '';
        }
    }
}

if(isset($_POST['version'])){
    $version = explode('.', $_POST['version']);
    $dbVersion = explode('.', $_POST['dbVersion']);
    if($version[0] == '1' && $dbVersion[0] == '1'){
        if($dbVersion[1] == '2'){
            $query = 'UPDATE `global` SET `value` = "'.$_POST['version'].'" WHERE `global`.`key` = "version"';
            if (!$result = mysqli_query($con, $query)) {
                exit(mysqli_error($con));
            }
        }elseif($dbVersion[1] == '1'){
            updateWithFile('update_v1.2.sql');
        }else {
            updateWithFile('update_v1.1.sql');
            updateWithFile('update_v1.2.sql');
        }
    }else {
        updateWithFile('myDb.sql');
    }
    if ($out == ''){
        $out = 'OK';
    }
    sleep(2);
    http_response_code(200);
    echo $out;
    $con->close();
}else{
    http_response_code(400);
    echo("HTTP-POST ERROR");
}

?>