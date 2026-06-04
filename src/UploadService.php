<?php

declare(strict_types=1);

namespace Noella;

use RuntimeException;

final class UploadService
{
    public function __construct(private readonly string $uploadRoot, private readonly string $publicPrefix = 'uploads')
    {
    }

    public function store(array $file, string $scope, bool $allowVideo = false): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new RuntimeException('Please choose a file to upload.');
        }

        $tmpName = (string) ($file['tmp_name'] ?? '');
        if ($tmpName === '' || !is_uploaded_file($tmpName)) {
            throw new RuntimeException('The uploaded file is not valid.');
        }

        $originalName = (string) ($file['name'] ?? 'upload');
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        $allowed = $allowVideo
            ? ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'webm']
            : ['jpg', 'jpeg', 'png', 'webp', 'gif'];

        if (!in_array($extension, $allowed, true)) {
            throw new RuntimeException($allowVideo ? 'Only images or videos are allowed here.' : 'Only image uploads are allowed here.');
        }

        $mime = mime_content_type($tmpName) ?: 'application/octet-stream';
        $isVideo = str_starts_with($mime, 'video/');
        $maxSize = $isVideo ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
        if ((int) ($file['size'] ?? 0) > $maxSize) {
            throw new RuntimeException($isVideo ? 'Videos must be 25MB or smaller.' : 'Images must be 8MB or smaller.');
        }

        $scope = preg_replace('/[^a-z0-9_-]/i', '-', strtolower($scope)) ?: 'general';
        $root = rtrim($this->uploadRoot, '/');
        if (!is_dir($root) && !mkdir($root, 0777, true) && !is_dir($root)) {
            throw new RuntimeException('Unable to create the upload root directory.');
        }
        if (!is_writable($root)) {
            @chmod($root, 0777);
        }
        if (!is_writable($root)) {
            throw new RuntimeException('The upload root directory is not writable.');
        }

        $directory = $root . '/' . $scope;
        if (!is_dir($directory) && !mkdir($directory, 0777, true) && !is_dir($directory)) {
            throw new RuntimeException('Unable to create the upload directory.');
        }
        if (!is_writable($directory)) {
            @chmod($directory, 0777);
        }
        if (!is_writable($directory)) {
            throw new RuntimeException('The upload directory is not writable.');
        }

        $filename = $scope . '-' . bin2hex(random_bytes(6)) . '.' . $extension;
        $target = $directory . '/' . $filename;
        if (!move_uploaded_file($tmpName, $target)) {
            throw new RuntimeException('Unable to save the uploaded file.');
        }

        @chmod($target, 0666);

        return [
            'url' => $this->publicPrefix . '/' . $scope . '/' . $filename,
            'type' => $isVideo ? 'video' : 'image',
            'name' => $originalName,
        ];
    }
}
