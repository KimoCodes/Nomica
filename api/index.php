<?php

declare(strict_types=1);

header('Content-Type: application/json');

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/UploadService.php';

use Noella\UploadService;

function jsonInput(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function respond(callable $callback): void
{
    try {
        $data = $callback();
        echo json_encode(['ok' => true] + $data, JSON_THROW_ON_ERROR);
    } catch (Throwable $exception) {
        http_response_code(400);
        echo json_encode([
            'ok' => false,
            'message' => $exception->getMessage(),
        ], JSON_THROW_ON_ERROR);
    }
}

$action = $_GET['action'] ?? '';
$payload = jsonInput();
$uploadService = new UploadService(__DIR__ . '/../uploads');

function isLocalHost(): bool
{
    $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
    return str_starts_with($host, '127.0.0.1') || str_starts_with($host, 'localhost');
}

function requireCsrfForMutation(string $action): void
{
    $mutatingActions = [
        'media_upload',
        'login',
        'register',
        'password_reset_request',
        'password_reset_confirm',
        'logout',
        'lead_create',
        'client_booking_create',
        'client_message_create',
        'client_progress_create',
        'client_workout_profile_save',
        'client_workout_log_create',
        'client_profile_update',
        'client_preferences_update',
        'client_nutrition_update',
        'client_account_features_update',
        'client_program_favorite_toggle',
        'client_community_post_create',
        'cart_add',
        'cart_update',
        'order_create',
        'admin_program_save',
        'admin_program_duplicate',
        'admin_product_save',
        'admin_product_duplicate',
        'admin_order_save',
        'admin_client_save',
        'admin_slot_create',
        'admin_booking_save',
        'admin_settings_update',
        'admin_content_update',
    ];

    if (!in_array($action, $mutatingActions, true)) {
        return;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        throw new RuntimeException('Invalid request method.');
    }

    $expected = (string) ($_SESSION['csrf_token'] ?? '');
    $provided = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($expected === '' || $provided === '' || !hash_equals($expected, $provided)) {
        throw new RuntimeException('Security check failed. Please refresh the page and try again.');
    }
}

respond(function () use ($action, $payload, $repository, $uploadService): array {
    requireCsrfForMutation($action);

    switch ($action) {
        case 'bootstrap':
            return ['state' => $repository->getBootstrapState()];

        case 'media_upload':
            $repository->requireUser();
            $scope = (string) ($_POST['scope'] ?? 'general');
            $allowVideo = filter_var($_POST['allowVideo'] ?? false, FILTER_VALIDATE_BOOLEAN);
            $media = $uploadService->store($_FILES['file'] ?? [], $scope, $allowVideo);
            return ['media' => $media, 'message' => 'Media uploaded successfully.'];

        case 'login':
            $repository->authenticate((string) ($payload['email'] ?? ''), (string) ($payload['password'] ?? ''));
            return ['state' => $repository->getBootstrapState(), 'message' => 'Login successful.'];

        case 'register':
            $repository->register([
                'firstName' => (string) ($payload['firstName'] ?? ''),
                'lastName' => (string) ($payload['lastName'] ?? ''),
                'email' => (string) ($payload['email'] ?? ''),
                'password' => (string) ($payload['password'] ?? ''),
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Account created successfully.'];

        case 'password_reset_request':
            $token = $repository->requestPasswordReset((string) ($payload['email'] ?? ''));
            $response = ['message' => 'If an account exists for that email, a password reset code has been issued.'];
            if ($token && isLocalHost()) {
                $response['devResetToken'] = $token;
                $response['message'] .= ' Local development code generated.';
            }
            return $response;

        case 'password_reset_confirm':
            $repository->resetPasswordWithToken(
                (string) ($payload['email'] ?? ''),
                (string) ($payload['token'] ?? ''),
                (string) ($payload['password'] ?? '')
            );
            return ['message' => 'Password updated. Please log in with your new password.'];

        case 'logout':
            $repository->logout();
            return ['message' => 'Logged out.'];

        case 'lead_create':
            $repository->createLead((string) ($payload['name'] ?? ''), (string) ($payload['email'] ?? ''));
            return ['state' => $repository->getBootstrapState(), 'message' => 'Lead captured.'];

        case 'client_booking_create':
            $user = $repository->requireRole('client');
            $repository->createClientBooking($user['id'], [
                'slotId' => (string) ($payload['slotId'] ?? ''),
                'goal' => (string) ($payload['goal'] ?? ''),
                'notes' => (string) ($payload['notes'] ?? ''),
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Booking request submitted successfully.'];

        case 'client_message_create':
            $user = $repository->requireRole('client');
            $repository->createClientMessage($user['id'], (string) ($payload['topic'] ?? ''), (string) ($payload['body'] ?? ''));
            return ['state' => $repository->getBootstrapState(), 'message' => 'Message sent to your trainer.'];

        case 'cart_update':
            $user = $repository->requireRole('client');
            $repository->updateCartItem(
                $user['id'],
                (string) ($payload['productId'] ?? ''),
                (int) ($payload['quantity'] ?? 0)
            );
            return ['state' => $repository->getBootstrapState(), 'message' => 'Cart updated successfully.'];

        case 'client_progress_create':
            $user = $repository->requireRole('client');
            $repository->createProgressEntry($user['id'], [
                'weight' => (string) ($payload['weight'] ?? ''),
                'waist' => (string) ($payload['waist'] ?? ''),
                'notes' => (string) ($payload['notes'] ?? ''),
                'media' => is_array($payload['media'] ?? null) ? $payload['media'] : [],
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Progress check-in saved.'];

        case 'client_workout_profile_save':
            $user = $repository->requireRole('client');
            $repository->saveWorkoutProfile($user['id'], [
                'goal' => (string) ($payload['goal'] ?? ''),
                'durationMinutes' => (int) ($payload['durationMinutes'] ?? 45),
                'focus' => (string) ($payload['focus'] ?? ''),
                'equipment' => is_array($payload['equipment'] ?? null) ? $payload['equipment'] : [],
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Your personalized workout builder has been updated.'];

        case 'client_workout_log_create':
            $user = $repository->requireRole('client');
            $repository->createWorkoutLog($user['id'], [
                'programId' => (string) ($payload['programId'] ?? ''),
                'sessionDate' => (string) ($payload['sessionDate'] ?? ''),
                'exerciseName' => (string) ($payload['exerciseName'] ?? ''),
                'sets' => (int) ($payload['sets'] ?? 0),
                'reps' => (int) ($payload['reps'] ?? 0),
                'load' => (float) ($payload['load'] ?? 0),
                'rpe' => (float) ($payload['rpe'] ?? 0),
                'durationSeconds' => (int) ($payload['durationSeconds'] ?? 0),
                'distance' => (float) ($payload['distance'] ?? 0),
                'heartRate' => (int) ($payload['heartRate'] ?? 0),
                'notes' => (string) ($payload['notes'] ?? ''),
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Workout log saved.'];

        case 'client_profile_update':
            $user = $repository->requireRole('client');
            $repository->updateClientProfile($user['id'], [
                'firstName' => (string) ($payload['firstName'] ?? ''),
                'lastName' => (string) ($payload['lastName'] ?? ''),
                'email' => (string) ($payload['email'] ?? ''),
                'phone' => (string) ($payload['phone'] ?? ''),
                'avatarUrl' => (string) ($payload['avatarUrl'] ?? ''),
                'heightCm' => (string) ($payload['heightCm'] ?? ''),
                'currentWeight' => (string) ($payload['currentWeight'] ?? ''),
                'sportsPosition' => (string) ($payload['sportsPosition'] ?? ''),
                'trainingHistory' => (string) ($payload['trainingHistory'] ?? ''),
                'achievements' => is_array($payload['achievements'] ?? null) ? $payload['achievements'] : [],
                'fitnessScores' => is_array($payload['fitnessScores'] ?? null) ? $payload['fitnessScores'] : [],
                'injuryNotes' => (string) ($payload['injuryNotes'] ?? ''),
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Profile settings saved.'];

        case 'client_preferences_update':
            $user = $repository->requireRole('client');
            $repository->updateClientPreferences($user['id'], [
                'workoutLocation' => (string) ($payload['workoutLocation'] ?? ''),
                'preferredContact' => (string) ($payload['preferredContact'] ?? ''),
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Preferences updated.'];

        case 'client_nutrition_update':
            $user = $repository->requireRole('client');
            $repository->updateClientNutrition($user['id'], [
                'foodPreferences' => (string) ($payload['foodPreferences'] ?? ''),
                'hydrationGoal' => (string) ($payload['hydrationGoal'] ?? '2.5L'),
                'sportNutritionGuide' => (string) ($payload['sportNutritionGuide'] ?? 'General Performance'),
                'supplementNotes' => (string) ($payload['supplementNotes'] ?? ''),
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Nutrition preferences saved.'];

        case 'client_account_features_update':
            $user = $repository->requireRole('client');
            $repository->updateClientAccountFeatures($user['id'], [
                'subscriptionTier' => (string) ($payload['subscriptionTier'] ?? 'Starter'),
                'connections' => is_array($payload['connections'] ?? null) ? $payload['connections'] : [],
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Account features updated.'];

        case 'client_program_favorite_toggle':
            $user = $repository->requireRole('client');
            $repository->toggleFavoriteProgram($user['id'], (string) ($payload['programId'] ?? ''));
            return ['state' => $repository->getBootstrapState(), 'message' => 'Favorite routines updated.'];

        case 'client_community_post_create':
            $user = $repository->requireRole('client');
            $repository->createCommunityPost($user['id'], [
                'audience' => (string) ($payload['audience'] ?? 'Coach'),
                'body' => (string) ($payload['body'] ?? ''),
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Progress update shared.'];

        case 'cart_add':
            $user = $repository->requireRole('client');
            $repository->addToCart($user['id'], (string) ($payload['productId'] ?? ''), (int) ($payload['quantity'] ?? 1));
            return ['state' => $repository->getBootstrapState(), 'message' => 'Item added to cart.'];

        case 'order_create':
            $user = $repository->requireRole('client');
            $repository->createOrder($user['id']);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Order placed successfully.'];

        case 'admin_program_save':
            $repository->requireRole('admin');
            $repository->saveProgram([
                'id' => $payload['id'] ?? null,
                'name' => (string) ($payload['name'] ?? ''),
                'price' => (float) ($payload['price'] ?? 0),
                'type' => (string) ($payload['type'] ?? ''),
                'status' => (string) ($payload['status'] ?? 'Active'),
                'description' => (string) ($payload['description'] ?? ''),
                'media' => is_array($payload['media'] ?? null) ? $payload['media'] : [],
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Program library updated.'];

        case 'admin_program_duplicate':
            $repository->requireRole('admin');
            $repository->duplicateProgram([
                'name' => (string) ($payload['name'] ?? ''),
                'price' => (float) ($payload['price'] ?? 0),
                'type' => (string) ($payload['type'] ?? ''),
                'description' => (string) ($payload['description'] ?? ''),
                'media' => is_array($payload['media'] ?? null) ? $payload['media'] : [],
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Program duplicated as draft.'];

        case 'admin_product_save':
            $repository->requireRole('admin');
            $repository->saveProduct([
                'id' => $payload['id'] ?? null,
                'name' => (string) ($payload['name'] ?? ''),
                'price' => (float) ($payload['price'] ?? 0),
                'category' => (string) ($payload['category'] ?? ''),
                'inventory' => isset($payload['inventory']) && $payload['inventory'] !== '' ? (int) $payload['inventory'] : null,
                'visibility' => (string) ($payload['visibility'] ?? ''),
                'deliveryType' => (string) ($payload['deliveryType'] ?? ''),
                'status' => (string) ($payload['status'] ?? 'Live'),
                'description' => (string) ($payload['description'] ?? ''),
                'media' => is_array($payload['media'] ?? null) ? $payload['media'] : [],
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Product catalog updated.'];

        case 'admin_product_duplicate':
            $repository->requireRole('admin');
            $repository->duplicateProduct([
                'name' => (string) ($payload['name'] ?? ''),
                'price' => (float) ($payload['price'] ?? 0),
                'category' => (string) ($payload['category'] ?? ''),
                'inventory' => (int) ($payload['inventory'] ?? 0),
                'visibility' => (string) ($payload['visibility'] ?? ''),
                'deliveryType' => (string) ($payload['deliveryType'] ?? ''),
                'description' => (string) ($payload['description'] ?? ''),
                'media' => is_array($payload['media'] ?? null) ? $payload['media'] : [],
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Offer duplicated as a draft.'];

        case 'admin_order_save':
            $repository->requireRole('admin');
            $repository->saveOrder([
                'orderId' => (string) ($payload['orderId'] ?? ''),
                'buyerName' => (string) ($payload['buyerName'] ?? ''),
                'total' => (float) ($payload['total'] ?? 0),
                'status' => (string) ($payload['status'] ?? ''),
                'deliveryMethod' => (string) ($payload['deliveryMethod'] ?? ''),
                'tracking' => (string) ($payload['tracking'] ?? ''),
                'notes' => (string) ($payload['notes'] ?? ''),
                'itemIds' => is_array($payload['itemIds'] ?? null) ? $payload['itemIds'] : [],
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Order queue updated.'];

        case 'admin_client_save':
            $repository->requireRole('admin');
            $repository->saveClient([
                'id' => $payload['id'] ?? null,
                'firstName' => (string) ($payload['firstName'] ?? ''),
                'lastName' => (string) ($payload['lastName'] ?? ''),
                'email' => (string) ($payload['email'] ?? ''),
                'phone' => (string) ($payload['phone'] ?? ''),
                'plan' => (string) ($payload['plan'] ?? ''),
                'progressScore' => (int) ($payload['progressScore'] ?? 0),
                'workoutLocation' => (string) ($payload['workoutLocation'] ?? 'Mixed'),
                'preferredContact' => (string) ($payload['preferredContact'] ?? 'Email'),
                'foodPreferences' => (string) ($payload['foodPreferences'] ?? ''),
                'hydrationGoal' => (string) ($payload['hydrationGoal'] ?? '2.5L'),
                'sportNutritionGuide' => (string) ($payload['sportNutritionGuide'] ?? 'General Performance'),
                'supplementNotes' => (string) ($payload['supplementNotes'] ?? ''),
                'purchasedProgramIds' => is_array($payload['purchasedProgramIds'] ?? null) ? $payload['purchasedProgramIds'] : [],
                'password' => (string) ($payload['password'] ?? ''),
                'avatarUrl' => (string) ($payload['avatarUrl'] ?? ''),
                'heightCm' => (string) ($payload['heightCm'] ?? ''),
                'currentWeight' => (string) ($payload['currentWeight'] ?? ''),
                'sportsPosition' => (string) ($payload['sportsPosition'] ?? ''),
                'trainingHistory' => (string) ($payload['trainingHistory'] ?? ''),
                'achievements' => is_array($payload['achievements'] ?? null) ? $payload['achievements'] : [],
                'fitnessScores' => is_array($payload['fitnessScores'] ?? null) ? $payload['fitnessScores'] : [],
                'injuryNotes' => (string) ($payload['injuryNotes'] ?? ''),
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Client profile saved.'];

        case 'admin_slot_create':
            $repository->requireRole('admin');
            $repository->createAvailabilitySlot([
                'date' => (string) ($payload['date'] ?? ''),
                'type' => (string) ($payload['type'] ?? ''),
                'time' => (string) ($payload['time'] ?? ''),
                'seats' => (int) ($payload['seats'] ?? 1),
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Availability slot saved.'];

        case 'admin_booking_save':
            $repository->requireRole('admin');
            $repository->saveBooking([
                'id' => (string) ($payload['id'] ?? ''),
                'status' => (string) ($payload['status'] ?? ''),
                'goal' => (string) ($payload['goal'] ?? ''),
                'notes' => (string) ($payload['notes'] ?? ''),
                'format' => (string) ($payload['format'] ?? 'Video Call'),
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Booking updated.'];

        case 'admin_settings_update':
            $repository->requireRole('admin');
            $repository->updateSettings([
                'brandName' => (string) ($payload['brandName'] ?? ''),
                'businessEmail' => (string) ($payload['businessEmail'] ?? ''),
                'phone' => (string) ($payload['phone'] ?? ''),
                'instagramUrl' => (string) ($payload['instagramUrl'] ?? ''),
                'instagramLabel' => (string) ($payload['instagramLabel'] ?? ''),
                'tiktokUrl' => (string) ($payload['tiktokUrl'] ?? ''),
                'tiktokLabel' => (string) ($payload['tiktokLabel'] ?? ''),
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Business settings saved.'];

        case 'admin_content_update':
            $repository->requireRole('admin');
            $repository->updateContent([
                'heroHeadline' => (string) ($payload['heroHeadline'] ?? ''),
                'mainCta' => (string) ($payload['mainCta'] ?? ''),
                'aboutSummary' => (string) ($payload['aboutSummary'] ?? ''),
                'aboutSupport' => (string) ($payload['aboutSupport'] ?? ''),
                'heroMediaUrl' => (string) ($payload['heroMediaUrl'] ?? ''),
                'heroMediaType' => (string) ($payload['heroMediaType'] ?? ''),
            ]);
            return ['state' => $repository->getBootstrapState(), 'message' => 'Homepage content saved.'];

        default:
            throw new RuntimeException('Unknown API action.');
    }
});
