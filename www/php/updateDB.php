<?php
/*
 * Bookmark-Page (https://github.com/LeeO86/Bookmark-Page)
 *
 * Copyright 2020 Adrian Hilber
 * Licensed under MIT (https://github.com/LeeO86/Bookmark-Page/blob/master/LICENSE)
 */

if(isset($_POST['version'])){
    $version = explode('.', $_POST['version']);
    $dbVersion = explode('.', $_POST['dbVersion']);
    $out = '';
    $filename ='';
    include 'db-conn.php';
    if($version[0] == '1' && $version[1] == '1') {
        if($version[2] == '1' && $dbVersion[0] == '1' && $dbVersion[1] == '1'){
            $query = 'UPDATE `global` SET `value` = "'.$_POST['version'].'" WHERE `global`.`key` = "version"';
            if (!$result = mysqli_query($con, $query)) {
                exit(mysqli_error($con));
            }
        }else{
            $filename = 'update_v1.1.sql';
        }
    }else{
        // Name of the file
        $filename = 'update_v'.$_POST['version'].'.sql';
    }
    if(!empty($filename)){
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
                $con->query($templine) or $out .= 'Error performing query \'<strong>' . $templine . '\': ' . $con->error() . '<br />';
                // Reset temp variable to empty
                $templine = '';
            }
        }
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