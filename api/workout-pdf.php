<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

function pdfEscape(string $value): string
{
    return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $value);
}

function pdfTextBlock(array $lines): string
{
    $y = 780;
    $chunks = ["BT", "/F1 12 Tf"];
    foreach ($lines as $line) {
        $chunks[] = sprintf('1 0 0 1 50 %d Tm (%s) Tj', $y, pdfEscape($line));
        $y -= 16;
        if ($y < 40) {
            break;
        }
    }
    $chunks[] = 'ET';
    return implode("\n", $chunks);
}

function buildPdf(string $text): string
{
    $lines = preg_split('/\R/', $text) ?: [];
    $stream = pdfTextBlock($lines);
    $objects = [];
    $objects[] = '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj';
    $objects[] = '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj';
    $objects[] = '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj';
    $objects[] = '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj';
    $objects[] = sprintf("5 0 obj << /Length %d >> stream\n%s\nendstream endobj", strlen($stream), $stream);

    $pdf = "%PDF-1.4\n";
    $offsets = [0];
    foreach ($objects as $object) {
        $offsets[] = strlen($pdf);
        $pdf .= $object . "\n";
    }

    $xrefOffset = strlen($pdf);
    $pdf .= "xref\n0 " . (count($objects) + 1) . "\n";
    $pdf .= "0000000000 65535 f \n";
    for ($i = 1; $i < count($offsets); $i++) {
        $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
    }
    $pdf .= "trailer << /Size " . (count($objects) + 1) . " /Root 1 0 R >>\n";
    $pdf .= "startxref\n{$xrefOffset}\n%%EOF";

    return $pdf;
}

try {
    $user = $repository->requireRole('client');
    $document = $repository->workoutPdfDocument($user['id'], isset($_GET['program']) ? (string) $_GET['program'] : null);
    $workout = $document['workout'];
    $wod = $document['wod'];
    $profile = $document['profile'];
    $lines = [
        'Noella Workout Plan',
        'Client: ' . $document['user']['firstName'] . ' ' . $document['user']['lastName'],
        'Date: ' . date('Y-m-d'),
        '',
        'Personalized Workout: ' . $workout['title'],
        'Goal: ' . $workout['goal'],
        'Duration: ' . $workout['durationMinutes'] . ' min',
        'Focus: ' . $workout['focus'],
        'Equipment: ' . implode(', ', $profile['equipment']),
        '',
        'Blocks:',
    ];

    foreach ($workout['blocks'] as $block) {
        $lines[] = '- ' . $block['label'] . ' (' . $block['minutes'] . ' min)';
        foreach ($block['items'] as $item) {
            $lines[] = '  * ' . $item;
        }
    }

    $lines[] = '';
    $lines[] = 'Workout of the Day: ' . $wod['title'];
    foreach ($wod['blocks'] as $block) {
        $lines[] = '  * ' . $block;
    }
    $lines[] = 'Challenge: ' . $wod['challenge'];
    $lines[] = '';
    $lines[] = 'Coach Note: ' . $workout['coachNote'];

    $pdf = buildPdf(implode("\n", $lines));

    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="noella-workout-plan.pdf"');
    echo $pdf;
} catch (Throwable $exception) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo $exception->getMessage();
}
