<?php

declare(strict_types=1);

use Noella\AppRepository;
use Noella\Database;

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/AppRepository.php';

$sessionPath = __DIR__ . '/../data/sessions';
if (!is_dir($sessionPath) && !mkdir($sessionPath, 0777, true) && !is_dir($sessionPath)) {
    throw new RuntimeException('Unable to create the PHP session directory.');
}

if (!is_writable($sessionPath)) {
    @chmod($sessionPath, 0777);
}

if (!is_writable($sessionPath)) {
    throw new RuntimeException('The PHP session directory is not writable.');
}

session_save_path($sessionPath);
session_start();

$database = new Database(__DIR__ . '/../data/app.sqlite');
$repository = new AppRepository($database->pdo());
