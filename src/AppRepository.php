<?php

declare(strict_types=1);

namespace Noella;

use PDO;
use RuntimeException;

final class AppRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function getBootstrapState(): array
    {
        $session = $this->currentSession();
        $role = $session['role'] ?? 'public';
        $userId = $session['userId'] ?? null;

        $users = [];
        $leads = [];
        $carts = [];
        $orders = [];
        $bookings = [];
        $messages = [];
        $progressEntries = [];
        $workoutProfile = null;
        $workoutLogs = [];
        $personalizedWorkout = null;
        $programs = $this->programs();
        $products = $this->products();
        $communityPosts = [];

        if ($role === 'admin') {
            $users = $this->users();
            $leads = $this->leads();
            $carts = $this->carts();
            $orders = $this->orders();
            $bookings = $this->bookings();
            $messages = $this->messages();
            $progressEntries = $this->progressEntries();
        } elseif ($role === 'client' && $userId) {
            $client = $this->userById($userId);
            $users = [$client];
            $carts = [$userId => $this->cartForUser($userId)];
            $orders = array_values(array_filter($this->orders(), fn (array $order): bool => $order['userId'] === $userId));
            $bookings = array_values(array_filter($this->bookings(), fn (array $booking): bool => $booking['userId'] === $userId));
            $messages = array_values(array_filter($this->messages(), fn (array $message): bool => $message['userId'] === $userId));
            $progressEntries = array_values(array_filter($this->progressEntries(), fn (array $entry): bool => $entry['userId'] === $userId));
            $workoutProfile = $this->workoutProfileForUser($userId);
            $workoutLogs = array_values(array_filter($this->workoutLogs(), fn (array $entry): bool => $entry['userId'] === $userId));
            $personalizedWorkout = $this->buildPersonalizedWorkout($workoutProfile);
            $communityPosts = $this->communityPostsForUser($client);
            $programs = array_values(array_filter(
                $programs,
                fn (array $program): bool => in_array($program['id'], $client['purchasedProgramIds'], true)
            ));
            if (($client['subscriptionTier'] ?? 'Starter') === 'Starter') {
                $programs = array_values(array_filter(
                    $programs,
                    fn (array $program): bool => stripos((string) $program['status'], 'premium') === false
                ));
            }
        }

        if ($role !== 'admin') {
            $programs = array_values(array_filter(
                $programs,
                fn (array $program): bool => trim((string) $program['name']) !== ''
                    && trim((string) $program['description']) !== ''
                    && $program['status'] !== 'Draft'
            ));
            $products = array_values(array_filter(
                $products,
                fn (array $product): bool => trim((string) ($product['displayName'] ?: $product['name'])) !== ''
                    && trim((string) $product['description']) !== ''
                    && $product['status'] !== 'Draft'
                    && $product['visibility'] !== 'Private link only'
            ));
        }

        return [
            'site' => $this->settingsGroup('site'),
            'content' => $this->settingsGroup('content'),
            'users' => $users,
            'session' => $session,
            'leads' => $leads,
            'availability' => $this->availability(),
            'programs' => $programs,
            'products' => $products,
            'carts' => $carts,
            'orders' => $orders,
            'bookings' => $bookings,
            'messages' => $messages,
            'progressEntries' => $progressEntries,
            'workoutProfile' => $workoutProfile,
            'workoutLogs' => $workoutLogs,
            'personalizedWorkout' => $personalizedWorkout,
            'workoutOfDay' => $this->workoutOfDay($workoutProfile),
            'communityPosts' => $communityPosts,
            'csrfToken' => $this->csrfToken(),
        ];
    }

    public function authenticate(string $email, string $password): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM users WHERE lower(email) = lower(:email) LIMIT 1');
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            throw new RuntimeException('Invalid email or password.');
        }

        $_SESSION['user_id'] = $user['id'];
        $_SESSION['role'] = $user['role'];

        return $this->toUser($user);
    }

    public function register(array $payload): void
    {
        $firstName = trim((string) ($payload['firstName'] ?? ''));
        $lastName = trim((string) ($payload['lastName'] ?? ''));
        $email = trim((string) ($payload['email'] ?? ''));
        $password = (string) ($payload['password'] ?? '');

        if ($firstName === '' || $lastName === '' || $email === '' || $password === '') {
            throw new RuntimeException('All registration fields are required.');
        }

        $existing = $this->findUserByEmail($payload['email']);
        if ($existing) {
            throw new RuntimeException('That email is already registered.');
        }

        $stmt = $this->pdo->prepare(
            'INSERT INTO users (id, role, first_name, last_name, email, password_hash, phone, plan, joined_at, preferences_json, progress_score, purchased_program_ids_json, favorite_program_ids_json, subscription_tier, connections_json)
             VALUES (:id, :role, :first_name, :last_name, :email, :password_hash, :phone, :plan, :joined_at, :preferences_json, :progress_score, :purchased_program_ids_json, :favorite_program_ids_json, :subscription_tier, :connections_json)'
        );
        $id = $this->uuid('user-client');
        $stmt->execute([
            ':id' => $id,
            ':role' => 'client',
            ':first_name' => $firstName,
            ':last_name' => $lastName,
            ':email' => $email,
            ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
            ':phone' => '',
            ':plan' => '',
            ':joined_at' => date('Y-m-d'),
            ':preferences_json' => json_encode([
                'workoutLocation' => 'Mixed',
                'preferredContact' => 'Email',
                'foodPreferences' => '',
            ], JSON_THROW_ON_ERROR),
            ':progress_score' => 0,
            ':purchased_program_ids_json' => json_encode([], JSON_THROW_ON_ERROR),
            ':favorite_program_ids_json' => json_encode([], JSON_THROW_ON_ERROR),
            ':subscription_tier' => 'Starter',
            ':connections_json' => json_encode(['Coach Noella'], JSON_THROW_ON_ERROR),
        ]);

        $_SESSION['user_id'] = $id;
        $_SESSION['role'] = 'client';
    }

    public function requestPasswordReset(string $email): ?string
    {
        $user = $this->findUserByEmail($email);
        if (!$user) {
            return null;
        }

        $token = bin2hex(random_bytes(24));
        $this->pdo->prepare('DELETE FROM password_reset_tokens WHERE user_id = :user_id AND used_at IS NULL')->execute([
            ':user_id' => $user['id'],
        ]);
        $stmt = $this->pdo->prepare(
            'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at)
             VALUES (:id, :user_id, :token_hash, :expires_at, NULL)'
        );
        $stmt->execute([
            ':id' => $this->uuid('preset'),
            ':user_id' => $user['id'],
            ':token_hash' => hash('sha256', $token),
            ':expires_at' => date('c', time() + 30 * 60),
        ]);

        return $token;
    }

    public function resetPasswordWithToken(string $email, string $token, string $password): void
    {
        $email = trim($email);
        $token = trim($token);
        if ($email === '' || $token === '' || $password === '') {
            throw new RuntimeException('Email, reset code, and new password are required.');
        }

        if (strlen($password) < 8) {
            throw new RuntimeException('Password must be at least 8 characters.');
        }

        $user = $this->findUserByEmail($email);
        if (!$user) {
            throw new RuntimeException('The reset code is invalid or expired.');
        }

        $stmt = $this->pdo->prepare(
            'SELECT * FROM password_reset_tokens
             WHERE user_id = :user_id AND token_hash = :token_hash AND used_at IS NULL
             ORDER BY expires_at DESC LIMIT 1'
        );
        $stmt->execute([
            ':user_id' => $user['id'],
            ':token_hash' => hash('sha256', $token),
        ]);
        $reset = $stmt->fetch();
        if (!$reset || strtotime((string) $reset['expires_at']) < time()) {
            throw new RuntimeException('The reset code is invalid or expired.');
        }

        $stmt = $this->pdo->prepare('UPDATE users SET password_hash = :password_hash WHERE id = :id');
        $stmt->execute([
            ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
            ':id' => $user['id'],
        ]);

        $this->pdo->prepare('UPDATE password_reset_tokens SET used_at = :used_at WHERE id = :id')->execute([
            ':used_at' => date('c'),
            ':id' => $reset['id'],
        ]);
    }

    public function logout(): void
    {
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
    }

    public function createLead(string $name, string $email): void
    {
        $stmt = $this->pdo->prepare('INSERT INTO leads (id, name, email, created_at) VALUES (:id, :name, :email, :created_at)');
        $stmt->execute([
            ':id' => $this->uuid('lead'),
            ':name' => $name,
            ':email' => $email,
            ':created_at' => date('Y-m-d'),
        ]);
    }

    public function createClientBooking(string $userId, array $payload): void
    {
        $slot = $this->availabilityById($payload['slotId']);
        if (!$slot) {
            throw new RuntimeException('That slot is no longer available.');
        }
        $user = $this->userById($userId);
        $stmt = $this->pdo->prepare(
            'INSERT INTO bookings (id, user_id, client_name, session_name, date_label, time_label, format_label, status, goal, notes)
             VALUES (:id, :user_id, :client_name, :session_name, :date_label, :time_label, :format_label, :status, :goal, :notes)'
        );
        $stmt->execute([
            ':id' => $this->uuid('booking'),
            ':user_id' => $userId,
            ':client_name' => $user['firstName'] . ' ' . ($user['lastName'] !== '' ? substr($user['lastName'], 0, 1) . '.' : ''),
            ':session_name' => $slot['type'],
            ':date_label' => $slot['date'],
            ':time_label' => $slot['time'],
            ':format_label' => 'Video Call',
            ':status' => 'Pending',
            ':goal' => $payload['goal'],
            ':notes' => $payload['notes'],
        ]);

        $this->createMessage($userId, 'Support', 'Booking Request Received', 'Your booking request for ' . $slot['type'] . ' on ' . $slot['date'] . ' at ' . $slot['time'] . ' has been received.', 'Unread', 'Today');
    }

    public function createClientMessage(string $userId, string $topic, string $body): void
    {
        if (trim($topic) === '' || trim($body) === '') {
            throw new RuntimeException('A message topic and body are both required.');
        }

        $this->createMessage($userId, 'Client', $topic, $body, 'Unread', 'Today');
    }

    public function createProgressEntry(string $userId, array $payload): void
    {
        if (trim((string) ($payload['weight'] ?? '')) === '' && trim((string) ($payload['waist'] ?? '')) === '' && trim((string) ($payload['notes'] ?? '')) === '') {
            throw new RuntimeException('Add at least one progress detail before saving your check-in.');
        }

        $stmt = $this->pdo->prepare(
            'INSERT INTO progress_entries (id, user_id, weight, waist, notes, media_json, created_at)
             VALUES (:id, :user_id, :weight, :waist, :notes, :media_json, :created_at)'
        );
        $stmt->execute([
            ':id' => $this->uuid('progress'),
            ':user_id' => $userId,
            ':weight' => $payload['weight'],
            ':waist' => $payload['waist'],
            ':notes' => $payload['notes'],
            ':media_json' => json_encode($this->sanitizeMediaList($payload['media'] ?? []), JSON_THROW_ON_ERROR),
            ':created_at' => date('Y-m-d'),
        ]);

        $user = $this->userById($userId);
        $score = min(100, ((int) $user['progressScore']) + 2);
        $update = $this->pdo->prepare('UPDATE users SET progress_score = :score WHERE id = :id');
        $update->execute([
            ':score' => $score,
            ':id' => $userId,
        ]);
    }

    public function saveWorkoutProfile(string $userId, array $payload): void
    {
        $goal = trim((string) ($payload['goal'] ?? ''));
        $focus = trim((string) ($payload['focus'] ?? ''));
        $durationMinutes = max(10, min(180, (int) ($payload['durationMinutes'] ?? 45)));
        $equipment = array_values(array_filter(array_map('strval', $payload['equipment'] ?? [])));

        if ($goal === '') {
            throw new RuntimeException('Choose a workout goal before building a plan.');
        }

        $stmt = $this->pdo->prepare(
            'INSERT INTO workout_profiles (user_id, goal, duration_minutes, focus, equipment_json, updated_at)
             VALUES (:user_id, :goal, :duration_minutes, :focus, :equipment_json, :updated_at)
             ON CONFLICT(user_id) DO UPDATE SET goal = excluded.goal, duration_minutes = excluded.duration_minutes,
             focus = excluded.focus, equipment_json = excluded.equipment_json, updated_at = excluded.updated_at'
        );
        $stmt->execute([
            ':user_id' => $userId,
            ':goal' => $goal,
            ':duration_minutes' => $durationMinutes,
            ':focus' => $focus,
            ':equipment_json' => json_encode($equipment, JSON_THROW_ON_ERROR),
            ':updated_at' => date('Y-m-d'),
        ]);
    }

    public function createWorkoutLog(string $userId, array $payload): void
    {
        $exerciseName = trim((string) ($payload['exerciseName'] ?? ''));
        if ($exerciseName === '') {
            throw new RuntimeException('Exercise name is required for the workout log.');
        }

        $sets = max(0, (int) ($payload['sets'] ?? 0));
        $reps = max(0, (int) ($payload['reps'] ?? 0));
        $loadValue = max(0, (float) ($payload['load'] ?? 0));
        $rpe = max(0, min(10, (float) ($payload['rpe'] ?? 0)));
        $durationSeconds = max(0, (int) ($payload['durationSeconds'] ?? 0));
        $distanceValue = max(0, (float) ($payload['distance'] ?? 0));
        $heartRate = max(0, (int) ($payload['heartRate'] ?? 0));
        $volume = $sets * $reps * $loadValue;
        $caloriesBurned = max(0, round(($durationSeconds / 60) * 7 + ($distanceValue * 45) + ($heartRate > 0 ? $heartRate * 0.15 : 0), 1));
        $sessionDate = trim((string) ($payload['sessionDate'] ?? '')) ?: date('Y-m-d');

        $stmt = $this->pdo->prepare(
            'INSERT INTO workout_logs (id, user_id, program_id, session_date, exercise_name, sets, reps, load_value, rpe, volume, duration_seconds, distance_value, heart_rate, calories_burned, notes, created_at)
             VALUES (:id, :user_id, :program_id, :session_date, :exercise_name, :sets, :reps, :load_value, :rpe, :volume, :duration_seconds, :distance_value, :heart_rate, :calories_burned, :notes, :created_at)'
        );
        $stmt->execute([
            ':id' => $this->uuid('wlog'),
            ':user_id' => $userId,
            ':program_id' => trim((string) ($payload['programId'] ?? '')),
            ':session_date' => $sessionDate,
            ':exercise_name' => $exerciseName,
            ':sets' => $sets,
            ':reps' => $reps,
            ':load_value' => $loadValue,
            ':rpe' => $rpe,
            ':volume' => $volume,
            ':duration_seconds' => $durationSeconds,
            ':distance_value' => $distanceValue,
            ':heart_rate' => $heartRate,
            ':calories_burned' => $caloriesBurned,
            ':notes' => trim((string) ($payload['notes'] ?? '')),
            ':created_at' => date('Y-m-d'),
        ]);

        $user = $this->userById($userId);
        $score = min(100, ((int) $user['progressScore']) + 1);
        $update = $this->pdo->prepare('UPDATE users SET progress_score = :score WHERE id = :id');
        $update->execute([
            ':score' => $score,
            ':id' => $userId,
        ]);
    }

    public function workoutPdfDocument(string $userId, ?string $programId = null): array
    {
        $profile = $this->workoutProfileForUser($userId);
        $program = $programId ? $this->findProgramForUser($userId, $programId) : null;
        $workout = $program
            ? $this->programWorkoutOutline($program)
            : $this->buildPersonalizedWorkout($profile);

        return [
            'profile' => $profile,
            'workout' => $workout,
            'wod' => $this->workoutOfDay($profile),
            'user' => $this->userById($userId),
        ];
    }

    public function updateClientProfile(string $userId, array $payload): void
    {
        $firstName = trim((string) ($payload['firstName'] ?? ''));
        $lastName = trim((string) ($payload['lastName'] ?? ''));
        $email = trim((string) ($payload['email'] ?? ''));
        $phone = trim((string) ($payload['phone'] ?? ''));

        if ($firstName === '' || $lastName === '' || $email === '') {
            throw new RuntimeException('First name, last name, and email are required.');
        }

        $existing = $this->findRawUserByEmail($email);
        if ($existing && $existing['id'] !== $userId) {
            throw new RuntimeException('That email address is already in use.');
        }

        $stmt = $this->pdo->prepare(
            'UPDATE users
             SET first_name = :first_name, last_name = :last_name, email = :email, phone = :phone, avatar_url = :avatar_url,
                 height_cm = :height_cm, current_weight = :current_weight, sports_position = :sports_position,
                 training_history = :training_history, achievements_json = :achievements_json,
                 fitness_scores_json = :fitness_scores_json, injury_notes = :injury_notes
             WHERE id = :id'
        );
        $stmt->execute([
            ':first_name' => $firstName,
            ':last_name' => $lastName,
            ':email' => $email,
            ':phone' => $phone,
            ':avatar_url' => trim((string) ($payload['avatarUrl'] ?? '')),
            ':height_cm' => trim((string) ($payload['heightCm'] ?? '')),
            ':current_weight' => trim((string) ($payload['currentWeight'] ?? '')),
            ':sports_position' => trim((string) ($payload['sportsPosition'] ?? '')),
            ':training_history' => trim((string) ($payload['trainingHistory'] ?? '')),
            ':achievements_json' => json_encode(array_values(array_filter(array_map('trim', array_map('strval', $payload['achievements'] ?? [])))), JSON_THROW_ON_ERROR),
            ':fitness_scores_json' => json_encode(is_array($payload['fitnessScores'] ?? null) ? $payload['fitnessScores'] : [], JSON_THROW_ON_ERROR),
            ':injury_notes' => trim((string) ($payload['injuryNotes'] ?? '')),
            ':id' => $userId,
        ]);
    }

    public function updateClientPreferences(string $userId, array $payload): void
    {
        $user = $this->userById($userId);
        $preferences = $user['preferences'];
        $preferences['workoutLocation'] = $payload['workoutLocation'];
        $preferences['preferredContact'] = $payload['preferredContact'];

        $stmt = $this->pdo->prepare('UPDATE users SET preferences_json = :preferences WHERE id = :id');
        $stmt->execute([
            ':preferences' => json_encode($preferences, JSON_THROW_ON_ERROR),
            ':id' => $userId,
        ]);
    }

    public function updateClientNutrition(string $userId, array $payload): void
    {
        $user = $this->userById($userId);
        $preferences = $user['preferences'];
        $preferences['foodPreferences'] = (string) ($payload['foodPreferences'] ?? '');
        $preferences['hydrationGoal'] = (string) ($payload['hydrationGoal'] ?? ($preferences['hydrationGoal'] ?? '2.5L'));
        $preferences['sportNutritionGuide'] = (string) ($payload['sportNutritionGuide'] ?? ($preferences['sportNutritionGuide'] ?? 'General Performance'));
        $preferences['supplementNotes'] = (string) ($payload['supplementNotes'] ?? ($preferences['supplementNotes'] ?? ''));

        $stmt = $this->pdo->prepare('UPDATE users SET preferences_json = :preferences WHERE id = :id');
        $stmt->execute([
            ':preferences' => json_encode($preferences, JSON_THROW_ON_ERROR),
            ':id' => $userId,
        ]);
    }

    public function updateClientAccountFeatures(string $userId, array $payload): void
    {
        $connections = array_values(array_filter(array_map('trim', array_map('strval', $payload['connections'] ?? []))));
        $user = $this->userById($userId);

        $stmt = $this->pdo->prepare('UPDATE users SET subscription_tier = :subscription_tier, connections_json = :connections_json WHERE id = :id');
        $stmt->execute([
            ':subscription_tier' => $user['subscriptionTier'] ?: 'Starter',
            ':connections_json' => json_encode($connections, JSON_THROW_ON_ERROR),
            ':id' => $userId,
        ]);
    }

    public function toggleFavoriteProgram(string $userId, string $programId): void
    {
        if ($programId === '') {
            throw new RuntimeException('Choose a routine before saving it as a favorite.');
        }

        $user = $this->userById($userId);
        if (!in_array($programId, $user['purchasedProgramIds'], true)) {
            throw new RuntimeException('That routine is not available in your account.');
        }
        $favorites = $user['favoriteProgramIds'];
        if (in_array($programId, $favorites, true)) {
            $favorites = array_values(array_filter($favorites, fn (string $id): bool => $id !== $programId));
        } else {
            $favorites[] = $programId;
        }

        $stmt = $this->pdo->prepare('UPDATE users SET favorite_program_ids_json = :favorites WHERE id = :id');
        $stmt->execute([
            ':favorites' => json_encode(array_values(array_unique($favorites)), JSON_THROW_ON_ERROR),
            ':id' => $userId,
        ]);
    }

    public function createCommunityPost(string $userId, array $payload): void
    {
        $body = trim((string) ($payload['body'] ?? ''));
        $audience = trim((string) ($payload['audience'] ?? 'Coach'));

        if ($body === '') {
            throw new RuntimeException('Write a short update before sharing it.');
        }

        $stmt = $this->pdo->prepare(
            'INSERT INTO community_posts (id, user_id, audience, body, created_at)
             VALUES (:id, :user_id, :audience, :body, :created_at)'
        );
        $stmt->execute([
            ':id' => $this->uuid('cpost'),
            ':user_id' => $userId,
            ':audience' => $audience,
            ':body' => $body,
            ':created_at' => date('Y-m-d'),
        ]);

        $this->createMessage($userId, 'Community', 'Shared Progress Update', $body, 'Unread', 'Today');
    }

    public function addToCart(string $userId, string $productId, int $quantity): void
    {
        if ($quantity < 1) {
            throw new RuntimeException('Quantity must be at least 1.');
        }

        $product = $this->productById($productId);
        if (!$product) {
            throw new RuntimeException('That product could not be found.');
        }
        if ($product['status'] === 'Draft') {
            throw new RuntimeException('That product is not available for purchase yet.');
        }
        if ($product['inventory'] !== null && $product['inventory'] <= 0) {
            throw new RuntimeException('That product is out of stock.');
        }

        $stmt = $this->pdo->prepare('SELECT quantity FROM cart_items WHERE user_id = :user_id AND product_id = :product_id');
        $stmt->execute([
            ':user_id' => $userId,
            ':product_id' => $productId,
        ]);
        $current = $stmt->fetchColumn();
        $nextQuantity = ($current === false ? 0 : (int) $current) + $quantity;

        if ($product['inventory'] !== null && $nextQuantity > $product['inventory']) {
            throw new RuntimeException('Requested quantity exceeds the remaining stock.');
        }

        if ($current === false) {
            $insert = $this->pdo->prepare('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (:user_id, :product_id, :quantity)');
            $insert->execute([
                ':user_id' => $userId,
                ':product_id' => $productId,
                ':quantity' => $nextQuantity,
            ]);
            return;
        }

        $update = $this->pdo->prepare('UPDATE cart_items SET quantity = :quantity WHERE user_id = :user_id AND product_id = :product_id');
        $update->execute([
            ':quantity' => $nextQuantity,
            ':user_id' => $userId,
            ':product_id' => $productId,
        ]);
    }

    public function updateCartItem(string $userId, string $productId, int $quantity): void
    {
        if ($quantity < 0) {
            throw new RuntimeException('Quantity must be zero or greater.');
        }

        $product = $this->productById($productId);
        if (!$product) {
            throw new RuntimeException('That product could not be found.');
        }

        if ($product['status'] === 'Draft') {
            throw new RuntimeException('That product is not available for purchase yet.');
        }

        if ($product['inventory'] !== null && $quantity > $product['inventory']) {
            throw new RuntimeException('Requested quantity exceeds the remaining stock.');
        }

        if ($quantity === 0) {
            $delete = $this->pdo->prepare('DELETE FROM cart_items WHERE user_id = :user_id AND product_id = :product_id');
            $delete->execute([
                ':user_id' => $userId,
                ':product_id' => $productId,
            ]);
            return;
        }

        $stmt = $this->pdo->prepare('SELECT quantity FROM cart_items WHERE user_id = :user_id AND product_id = :product_id');
        $stmt->execute([
            ':user_id' => $userId,
            ':product_id' => $productId,
        ]);
        $current = $stmt->fetchColumn();

        if ($current === false) {
            $insert = $this->pdo->prepare('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (:user_id, :product_id, :quantity)');
            $insert->execute([
                ':user_id' => $userId,
                ':product_id' => $productId,
                ':quantity' => $quantity,
            ]);
            return;
        }

        $update = $this->pdo->prepare('UPDATE cart_items SET quantity = :quantity WHERE user_id = :user_id AND product_id = :product_id');
        $update->execute([
            ':quantity' => $quantity,
            ':user_id' => $userId,
            ':product_id' => $productId,
        ]);
    }

    public function createOrder(string $userId): void
    {
        $cart = $this->cartForUser($userId);
        if ($cart === []) {
            throw new RuntimeException('Add at least one item before placing an order.');
        }

        $user = $this->userById($userId);
        $products = $this->productsByIds(array_column($cart, 'productId'));
        $subtotal = 0.0;
        foreach ($cart as $item) {
            if (!isset($products[$item['productId']])) {
                throw new RuntimeException('One or more cart items are no longer available.');
            }
            if ($products[$item['productId']]['inventory'] !== null && $item['quantity'] > $products[$item['productId']]['inventory']) {
                throw new RuntimeException('One or more cart items no longer have enough stock.');
            }
            $subtotal += ($products[$item['productId']]['price'] ?? 0) * $item['quantity'];
        }
        $shipping = $subtotal > 0 ? 5 : 0;
        $total = $subtotal + $shipping;

        $id = $this->nextOrderId();
        $insert = $this->pdo->prepare(
            'INSERT INTO orders (id, user_id, buyer_name, total, status, delivery_method, tracking, notes, created_at)
             VALUES (:id, :user_id, :buyer_name, :total, :status, :delivery_method, :tracking, :notes, :created_at)'
        );
        $insert->execute([
            ':id' => $id,
            ':user_id' => $userId,
            ':buyer_name' => $user['firstName'] . ' ' . $user['lastName'],
            ':total' => $total,
            ':status' => 'Pending Payment',
            ':delivery_method' => 'Courier delivery',
            ':tracking' => 'PENDING',
            ':notes' => 'Placed through the client portal cart. Payment still needs to be collected manually or through a connected gateway.',
            ':created_at' => date('Y-m-d'),
        ]);

        $insertItem = $this->pdo->prepare('INSERT INTO order_items (order_id, item_id) VALUES (:order_id, :item_id)');
        foreach ($cart as $item) {
            $insertItem->execute([
                ':order_id' => $id,
                ':item_id' => $item['productId'],
            ]);
        }

        $inventoryUpdate = $this->pdo->prepare(
            'UPDATE products SET inventory = :inventory WHERE id = :id AND inventory IS NOT NULL'
        );
        foreach ($cart as $item) {
            $product = $products[$item['productId']] ?? null;
            if (!$product || $product['inventory'] === null) {
                continue;
            }
            $inventoryUpdate->execute([
                ':inventory' => max(0, $product['inventory'] - $item['quantity']),
                ':id' => $item['productId'],
            ]);
        }

        $clear = $this->pdo->prepare('DELETE FROM cart_items WHERE user_id = :user_id');
        $clear->execute([':user_id' => $userId]);
    }

    public function saveProgram(array $payload): void
    {
        $existing = $this->findRecord('programs', $payload['id'] ?? null, $payload['name']);
        if ($existing) {
            $stmt = $this->pdo->prepare(
                'UPDATE programs SET name = :name, price = :price, type = :type, status = :status, description = :description, media_json = :media_json WHERE id = :id'
            );
            $stmt->execute([
                ':name' => $payload['name'],
                ':price' => $payload['price'],
                ':type' => $payload['type'],
                ':status' => $payload['status'],
                ':description' => $payload['description'],
                ':media_json' => json_encode($this->sanitizeMediaList($payload['media'] ?? []), JSON_THROW_ON_ERROR),
                ':id' => $existing['id'],
            ]);
            return;
        }

        $stmt = $this->pdo->prepare(
            'INSERT INTO programs (id, name, price, type, status, description, preview_json, completion, media_json)
             VALUES (:id, :name, :price, :type, :status, :description, :preview_json, :completion, :media_json)'
        );
        $stmt->execute([
            ':id' => $this->uuid('prog'),
            ':name' => $payload['name'],
            ':price' => $payload['price'],
            ':type' => $payload['type'],
            ':status' => $payload['status'],
            ':description' => $payload['description'],
            ':preview_json' => json_encode(['Week 1 - Updated program outline', 'Week 2 - Continue progression'], JSON_THROW_ON_ERROR),
            ':completion' => 0,
            ':media_json' => json_encode($this->sanitizeMediaList($payload['media'] ?? []), JSON_THROW_ON_ERROR),
        ]);
    }

    public function duplicateProgram(array $payload): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO programs (id, name, price, type, status, description, preview_json, completion, media_json)
             VALUES (:id, :name, :price, :type, :status, :description, :preview_json, :completion, :media_json)'
        );
        $stmt->execute([
            ':id' => $this->uuid('prog'),
            ':name' => $payload['name'] . ' Copy',
            ':price' => $payload['price'],
            ':type' => $payload['type'],
            ':status' => 'Draft',
            ':description' => $payload['description'],
            ':preview_json' => json_encode(['Week 1 - Draft copy', 'Week 2 - Draft copy'], JSON_THROW_ON_ERROR),
            ':completion' => 0,
            ':media_json' => json_encode($this->sanitizeMediaList($payload['media'] ?? []), JSON_THROW_ON_ERROR),
        ]);
    }

    public function saveProduct(array $payload): void
    {
        $name = trim((string) ($payload['name'] ?? ''));
        if ($name === '') {
            throw new RuntimeException('Product name is required.');
        }

        $existing = $this->findRecord('products', $payload['id'] ?? null, $payload['name']);
        if ($existing) {
            $stmt = $this->pdo->prepare(
                'UPDATE products
                 SET name = :name, display_name = :display_name, price = :price, category = :category, inventory = :inventory,
                     visibility = :visibility, delivery_type = :delivery_type, status = :status, description = :description, media_json = :media_json
                 WHERE id = :id'
            );
            $stmt->execute([
                ':name' => $name,
                ':display_name' => $name,
                ':price' => $payload['price'],
                ':category' => $payload['category'],
                ':inventory' => $payload['inventory'],
                ':visibility' => $payload['visibility'],
                ':delivery_type' => $payload['deliveryType'],
                ':status' => $payload['status'],
                ':description' => $payload['description'],
                ':media_json' => json_encode($this->sanitizeMediaList($payload['media'] ?? []), JSON_THROW_ON_ERROR),
                ':id' => $existing['id'],
            ]);
            return;
        }

        $stmt = $this->pdo->prepare(
            'INSERT INTO products (id, name, display_name, price, category, inventory, visibility, delivery_type, status, description, details_json, media_json)
             VALUES (:id, :name, :display_name, :price, :category, :inventory, :visibility, :delivery_type, :status, :description, :details_json, :media_json)'
        );
        $stmt->execute([
            ':id' => $this->uuid('prod'),
            ':name' => $name,
            ':display_name' => $name,
            ':price' => $payload['price'],
            ':category' => $payload['category'],
            ':inventory' => $payload['inventory'],
            ':visibility' => $payload['visibility'],
            ':delivery_type' => $payload['deliveryType'],
            ':status' => $payload['status'],
            ':description' => $payload['description'],
            ':details_json' => json_encode(['Updated in admin'], JSON_THROW_ON_ERROR),
            ':media_json' => json_encode($this->sanitizeMediaList($payload['media'] ?? []), JSON_THROW_ON_ERROR),
        ]);
    }

    public function duplicateProduct(array $payload): void
    {
        $name = trim((string) ($payload['name'] ?? ''));
        if ($name === '') {
            throw new RuntimeException('Product name is required before duplicating.');
        }

        $stmt = $this->pdo->prepare(
            'INSERT INTO products (id, name, display_name, price, category, inventory, visibility, delivery_type, status, description, details_json, media_json)
             VALUES (:id, :name, :display_name, :price, :category, :inventory, :visibility, :delivery_type, :status, :description, :details_json, :media_json)'
        );
        $stmt->execute([
            ':id' => $this->uuid('prod'),
            ':name' => $name . ' Copy',
            ':display_name' => $name . ' Copy',
            ':price' => $payload['price'],
            ':category' => $payload['category'],
            ':inventory' => $payload['inventory'],
            ':visibility' => $payload['visibility'],
            ':delivery_type' => $payload['deliveryType'],
            ':status' => 'Draft',
            ':description' => $payload['description'],
            ':details_json' => json_encode(['Duplicated from admin'], JSON_THROW_ON_ERROR),
            ':media_json' => json_encode($this->sanitizeMediaList($payload['media'] ?? []), JSON_THROW_ON_ERROR),
        ]);
    }

    public function saveOrder(array $payload): void
    {
        $items = array_values(array_filter(array_map('strval', $payload['itemIds'] ?? [])));
        $stmt = $this->pdo->prepare('SELECT id FROM orders WHERE id = :id');
        $stmt->execute([':id' => $payload['orderId']]);
        $exists = $stmt->fetchColumn();

        if ($exists === false) {
            $insert = $this->pdo->prepare(
                'INSERT INTO orders (id, user_id, buyer_name, total, status, delivery_method, tracking, notes, created_at)
                 VALUES (:id, NULL, :buyer_name, :total, :status, :delivery_method, :tracking, :notes, :created_at)'
            );
            $insert->execute([
                ':id' => $payload['orderId'],
                ':buyer_name' => $payload['buyerName'],
                ':total' => $payload['total'],
                ':status' => $payload['status'],
                ':delivery_method' => $payload['deliveryMethod'],
                ':tracking' => $payload['tracking'],
                ':notes' => $payload['notes'],
                ':created_at' => date('Y-m-d'),
            ]);
            $this->replaceOrderItems($payload['orderId'], $items);
            return;
        }

        $update = $this->pdo->prepare(
            'UPDATE orders
             SET buyer_name = :buyer_name, total = :total, status = :status, delivery_method = :delivery_method, tracking = :tracking, notes = :notes
             WHERE id = :id'
        );
        $update->execute([
            ':buyer_name' => $payload['buyerName'],
            ':total' => $payload['total'],
            ':status' => $payload['status'],
            ':delivery_method' => $payload['deliveryMethod'],
            ':tracking' => $payload['tracking'],
            ':notes' => $payload['notes'],
            ':id' => $payload['orderId'],
        ]);
        $this->replaceOrderItems($payload['orderId'], $items);
    }

    public function createAvailabilitySlot(array $payload): void
    {
        $date = trim((string) ($payload['date'] ?? ''));
        $time = trim((string) ($payload['time'] ?? ''));
        $type = trim((string) ($payload['type'] ?? ''));
        $seats = max(1, (int) ($payload['seats'] ?? 1));

        if ($date === '' || $time === '' || $type === '') {
            throw new RuntimeException('Date, time, and session type are required for a booking slot.');
        }

        $stmt = $this->pdo->prepare(
            'INSERT INTO availability_slots (id, date_label, time_label, session_type, seats)
             VALUES (:id, :date_label, :time_label, :session_type, :seats)'
        );
        $stmt->execute([
            ':id' => $this->uuid('slot'),
            ':date_label' => $date,
            ':time_label' => $time,
            ':session_type' => $type,
            ':seats' => $seats,
        ]);
    }

    public function saveClient(array $payload): void
    {
        $email = trim((string) ($payload['email'] ?? ''));
        if ($email === '') {
            throw new RuntimeException('Client email is required.');
        }

        $existingByEmail = $this->findRawUserByEmail($email);
        $existingById = isset($payload['id']) && $payload['id'] ? $this->findRawUserById((string) $payload['id']) : null;
        $existing = $existingById ?: $existingByEmail;

        if ($existing && $existing['role'] !== 'client') {
            throw new RuntimeException('That email is already used by another account.');
        }

        if ($existing && $existingByEmail && $existingByEmail['id'] !== $existing['id']) {
            throw new RuntimeException('That email is already used by another client.');
        }

        $preferences = [
            'workoutLocation' => (string) ($payload['workoutLocation'] ?? 'Mixed'),
            'preferredContact' => (string) ($payload['preferredContact'] ?? 'Email'),
            'foodPreferences' => (string) ($payload['foodPreferences'] ?? ''),
            'hydrationGoal' => (string) ($payload['hydrationGoal'] ?? '2.5L'),
            'sportNutritionGuide' => (string) ($payload['sportNutritionGuide'] ?? 'General Performance'),
            'supplementNotes' => (string) ($payload['supplementNotes'] ?? 'Whey protein, creatine, electrolyte mix'),
        ];
        $purchasedProgramIds = array_values(array_filter(array_map('strval', $payload['purchasedProgramIds'] ?? [])));
        $plan = (string) ($payload['plan'] ?? '');
        $password = (string) ($payload['password'] ?? '');
        $achievements = array_values(array_filter(array_map('trim', array_map('strval', $payload['achievements'] ?? []))));
        $fitnessScores = is_array($payload['fitnessScores'] ?? null) ? $payload['fitnessScores'] : [];

        if ($existing) {
            $sql = 'UPDATE users
                    SET first_name = :first_name, last_name = :last_name, email = :email, phone = :phone, plan = :plan,
                        preferences_json = :preferences_json, progress_score = :progress_score, purchased_program_ids_json = :purchased_program_ids_json, avatar_url = :avatar_url,
                        height_cm = :height_cm, current_weight = :current_weight, sports_position = :sports_position,
                        training_history = :training_history, achievements_json = :achievements_json,
                        fitness_scores_json = :fitness_scores_json, injury_notes = :injury_notes';
            $params = [
                ':first_name' => (string) ($payload['firstName'] ?? ''),
                ':last_name' => (string) ($payload['lastName'] ?? ''),
                ':email' => $email,
                ':phone' => (string) ($payload['phone'] ?? ''),
                ':plan' => $plan,
                ':preferences_json' => json_encode($preferences, JSON_THROW_ON_ERROR),
                ':progress_score' => max(0, min(100, (int) ($payload['progressScore'] ?? 0))),
                ':purchased_program_ids_json' => json_encode($purchasedProgramIds, JSON_THROW_ON_ERROR),
                ':avatar_url' => trim((string) ($payload['avatarUrl'] ?? '')),
                ':height_cm' => trim((string) ($payload['heightCm'] ?? '')),
                ':current_weight' => trim((string) ($payload['currentWeight'] ?? '')),
                ':sports_position' => trim((string) ($payload['sportsPosition'] ?? '')),
                ':training_history' => trim((string) ($payload['trainingHistory'] ?? '')),
                ':achievements_json' => json_encode($achievements, JSON_THROW_ON_ERROR),
                ':fitness_scores_json' => json_encode($fitnessScores, JSON_THROW_ON_ERROR),
                ':injury_notes' => trim((string) ($payload['injuryNotes'] ?? '')),
                ':id' => $existing['id'],
            ];

            if ($password !== '') {
                $sql .= ', password_hash = :password_hash';
                $params[':password_hash'] = password_hash($password, PASSWORD_DEFAULT);
            }

            $sql .= ' WHERE id = :id';
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            return;
        }

        if ($password === '') {
            throw new RuntimeException('A password is required when creating a client.');
        }

        $stmt = $this->pdo->prepare(
            'INSERT INTO users (id, role, first_name, last_name, email, password_hash, phone, plan, joined_at, preferences_json, progress_score, purchased_program_ids_json, avatar_url, height_cm, current_weight, sports_position, training_history, achievements_json, fitness_scores_json, injury_notes)
             VALUES (:id, :role, :first_name, :last_name, :email, :password_hash, :phone, :plan, :joined_at, :preferences_json, :progress_score, :purchased_program_ids_json, :avatar_url, :height_cm, :current_weight, :sports_position, :training_history, :achievements_json, :fitness_scores_json, :injury_notes)'
        );
        $id = $this->uuid('user-client');
        $stmt->execute([
            ':id' => $id,
            ':role' => 'client',
            ':first_name' => (string) ($payload['firstName'] ?? ''),
            ':last_name' => (string) ($payload['lastName'] ?? ''),
            ':email' => $email,
            ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
            ':phone' => (string) ($payload['phone'] ?? ''),
            ':plan' => $plan,
            ':joined_at' => date('Y-m-d'),
            ':preferences_json' => json_encode($preferences, JSON_THROW_ON_ERROR),
            ':progress_score' => max(0, min(100, (int) ($payload['progressScore'] ?? 0))),
            ':purchased_program_ids_json' => json_encode($purchasedProgramIds, JSON_THROW_ON_ERROR),
            ':avatar_url' => trim((string) ($payload['avatarUrl'] ?? '')),
            ':height_cm' => trim((string) ($payload['heightCm'] ?? '')),
            ':current_weight' => trim((string) ($payload['currentWeight'] ?? '')),
            ':sports_position' => trim((string) ($payload['sportsPosition'] ?? '')),
            ':training_history' => trim((string) ($payload['trainingHistory'] ?? '')),
            ':achievements_json' => json_encode($achievements, JSON_THROW_ON_ERROR),
            ':fitness_scores_json' => json_encode($fitnessScores, JSON_THROW_ON_ERROR),
            ':injury_notes' => trim((string) ($payload['injuryNotes'] ?? '')),
        ]);
    }

    public function saveBooking(array $payload): void
    {
        $stmt = $this->pdo->prepare(
            'UPDATE bookings
             SET status = :status, goal = :goal, notes = :notes, format_label = :format_label
             WHERE id = :id'
        );
        $stmt->execute([
            ':status' => (string) ($payload['status'] ?? 'Pending'),
            ':goal' => (string) ($payload['goal'] ?? ''),
            ':notes' => (string) ($payload['notes'] ?? ''),
            ':format_label' => (string) ($payload['format'] ?? 'Video Call'),
            ':id' => (string) ($payload['id'] ?? ''),
        ]);

        if ($stmt->rowCount() === 0) {
            throw new RuntimeException('Booking not found.');
        }
    }

    public function updateSettings(array $payload): void
    {
        $this->saveSetting('site', 'brandName', $payload['brandName']);
        $this->saveSetting('site', 'businessEmail', $payload['businessEmail']);
        $this->saveSetting('site', 'phone', $payload['phone']);
        $this->saveSetting('site', 'instagramUrl', $payload['instagramUrl']);
        $this->saveSetting('site', 'instagramLabel', $payload['instagramLabel']);
        $this->saveSetting('site', 'tiktokUrl', $payload['tiktokUrl']);
        $this->saveSetting('site', 'tiktokLabel', $payload['tiktokLabel']);
    }

    public function updateContent(array $payload): void
    {
        $this->saveSetting('content', 'heroHeadline', $payload['heroHeadline']);
        $this->saveSetting('content', 'mainCta', $payload['mainCta']);
        $this->saveSetting('content', 'aboutSummary', $payload['aboutSummary']);
        $this->saveSetting('content', 'aboutSupport', $payload['aboutSupport']);
        $this->saveSetting('content', 'heroMediaUrl', (string) ($payload['heroMediaUrl'] ?? ''));
        $this->saveSetting('content', 'heroMediaType', (string) ($payload['heroMediaType'] ?? ''));
    }

    public function requireUser(): array
    {
        $userId = $_SESSION['user_id'] ?? null;
        if (!$userId) {
            throw new RuntimeException('Please log in to continue.');
        }

        return $this->userById($userId);
    }

    public function requireRole(string $role): array
    {
        $user = $this->requireUser();
        if ($user['role'] !== $role) {
            throw new RuntimeException('You do not have access to that area.');
        }

        return $user;
    }

    private function settingsGroup(string $group): array
    {
        $stmt = $this->pdo->prepare('SELECT key_name, value FROM settings WHERE group_name = :group');
        $stmt->execute([':group' => $group]);
        $settings = [];
        foreach ($stmt->fetchAll() as $row) {
            $settings[$row['key_name']] = $row['value'];
        }
        return $settings;
    }

    private function saveSetting(string $group, string $key, string $value): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO settings (group_name, key_name, value) VALUES (:group_name, :key_name, :value)
             ON CONFLICT(group_name, key_name) DO UPDATE SET value = excluded.value'
        );
        $stmt->execute([
            ':group_name' => $group,
            ':key_name' => $key,
            ':value' => $value,
        ]);
    }

    private function users(): array
    {
        return array_map(fn (array $user): array => $this->toUser($user), $this->pdo->query('SELECT * FROM users ORDER BY role DESC, first_name ASC')->fetchAll());
    }

    private function leads(): array
    {
        return $this->pdo->query('SELECT * FROM leads ORDER BY created_at DESC')->fetchAll();
    }

    private function availability(): array
    {
        return array_values(array_filter(array_map(
            fn (array $row): array => [
                'id' => $row['id'],
                'date' => $row['date_label'],
                'time' => $row['time_label'],
                'type' => $row['session_type'],
                'seats' => (int) $row['seats'],
            ],
            $this->pdo->query("SELECT * FROM availability_slots WHERE trim(date_label) <> '' AND trim(time_label) <> '' AND trim(session_type) <> '' ORDER BY date_label ASC, time_label ASC")->fetchAll()
        ), fn (array $slot): bool => $this->isFutureAvailabilitySlot($slot)));
    }

    private function isFutureAvailabilitySlot(array $slot): bool
    {
        $timestamp = strtotime((string) $slot['date']);
        if ($timestamp === false) {
            return true;
        }

        return $timestamp >= strtotime('today');
    }

    private function programs(): array
    {
        return array_map(
            fn (array $row): array => [
                'id' => $row['id'],
                'name' => $row['name'],
                'price' => (float) $row['price'],
                'type' => $row['type'],
                'status' => $row['status'],
                'description' => $row['description'],
                'preview' => json_decode($row['preview_json'], true, 512, JSON_THROW_ON_ERROR),
                'completion' => (int) $row['completion'],
                'media' => json_decode($row['media_json'] ?: '[]', true, 512, JSON_THROW_ON_ERROR),
            ],
            $this->pdo->query('SELECT * FROM programs ORDER BY name ASC')->fetchAll()
        );
    }

    private function products(): array
    {
        return array_map(
            fn (array $row): array => [
                'id' => $row['id'],
                'name' => $row['name'],
                'displayName' => $row['display_name'],
                'price' => (float) $row['price'],
                'category' => $row['category'],
                'inventory' => $row['inventory'] === null ? null : (int) $row['inventory'],
                'visibility' => $row['visibility'],
                'deliveryType' => $row['delivery_type'],
                'status' => $row['status'],
                'description' => $row['description'],
                'details' => json_decode($row['details_json'], true, 512, JSON_THROW_ON_ERROR),
                'media' => json_decode($row['media_json'] ?: '[]', true, 512, JSON_THROW_ON_ERROR),
            ],
            $this->pdo->query('SELECT * FROM products ORDER BY name ASC')->fetchAll()
        );
    }

    private function carts(): array
    {
        $rows = $this->pdo->query('SELECT * FROM cart_items')->fetchAll();
        $carts = [];
        foreach ($rows as $row) {
            $carts[$row['user_id']][] = [
                'productId' => $row['product_id'],
                'quantity' => (int) $row['quantity'],
            ];
        }
        return $carts;
    }

    private function cartForUser(string $userId): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM cart_items WHERE user_id = :user_id');
        $stmt->execute([':user_id' => $userId]);
        return array_map(
            fn (array $row): array => [
                'productId' => $row['product_id'],
                'quantity' => (int) $row['quantity'],
            ],
            $stmt->fetchAll()
        );
    }

    private function orders(): array
    {
        $rows = $this->pdo->query('SELECT * FROM orders ORDER BY created_at DESC, id DESC')->fetchAll();
        $orderItems = [];
        foreach ($this->pdo->query('SELECT * FROM order_items')->fetchAll() as $item) {
            $orderItems[$item['order_id']][] = $item['item_id'];
        }

        return array_map(
            fn (array $row): array => [
                'id' => $row['id'],
                'userId' => $row['user_id'],
                'buyerName' => $row['buyer_name'],
                'itemIds' => $orderItems[$row['id']] ?? [],
                'total' => (float) $row['total'],
                'status' => $row['status'],
                'deliveryMethod' => $row['delivery_method'],
                'tracking' => $row['tracking'],
                'notes' => $row['notes'],
                'createdAt' => $row['created_at'],
            ],
            $rows
        );
    }

    private function bookings(): array
    {
        return array_map(
            fn (array $row): array => [
                'id' => $row['id'],
                'userId' => $row['user_id'],
                'clientName' => $row['client_name'],
                'session' => $row['session_name'],
                'dateLabel' => $row['date_label'],
                'time' => $row['time_label'],
                'format' => $row['format_label'],
                'status' => $row['status'],
                'goal' => $row['goal'],
                'notes' => $row['notes'],
            ],
            $this->pdo->query('SELECT * FROM bookings ORDER BY date_label ASC, time_label ASC')->fetchAll()
        );
    }

    private function messages(): array
    {
        return array_map(
            fn (array $row): array => [
                'id' => $row['id'],
                'userId' => $row['user_id'],
                'from' => $row['from_name'],
                'topic' => $row['topic'],
                'body' => $row['body'],
                'status' => $row['status'],
                'createdAt' => $row['created_at'],
            ],
            $this->pdo->query('SELECT * FROM messages ORDER BY id DESC')->fetchAll()
        );
    }

    private function progressEntries(): array
    {
        return array_map(
            fn (array $row): array => [
                'id' => $row['id'],
                'userId' => $row['user_id'],
                'weight' => $row['weight'],
                'waist' => $row['waist'],
                'notes' => $row['notes'],
                'media' => json_decode($row['media_json'] ?: '[]', true, 512, JSON_THROW_ON_ERROR),
                'createdAt' => $row['created_at'],
            ],
            $this->pdo->query('SELECT * FROM progress_entries ORDER BY created_at DESC, id DESC')->fetchAll()
        );
    }

    private function workoutLogs(): array
    {
        return array_map(
            fn (array $row): array => [
                'id' => $row['id'],
                'userId' => $row['user_id'],
                'programId' => $row['program_id'],
                'sessionDate' => $row['session_date'],
                'exerciseName' => $row['exercise_name'],
                'sets' => (int) $row['sets'],
                'reps' => (int) $row['reps'],
                'load' => (float) $row['load_value'],
                'rpe' => (float) $row['rpe'],
                'volume' => (float) $row['volume'],
                'durationSeconds' => (int) $row['duration_seconds'],
                'distance' => (float) ($row['distance_value'] ?? 0),
                'heartRate' => (int) ($row['heart_rate'] ?? 0),
                'caloriesBurned' => (float) ($row['calories_burned'] ?? 0),
                'notes' => $row['notes'],
                'createdAt' => $row['created_at'],
            ],
            $this->pdo->query('SELECT * FROM workout_logs ORDER BY session_date DESC, id DESC')->fetchAll()
        );
    }

    private function communityPostsForUser(array $user): array
    {
        $rows = $this->pdo->query('SELECT * FROM community_posts ORDER BY created_at DESC, id DESC')->fetchAll();

        return array_values(array_map(
            fn (array $row): array => [
                'id' => $row['id'],
                'userId' => $row['user_id'],
                'audience' => $row['audience'],
                'body' => $row['body'],
                'createdAt' => $row['created_at'],
            ],
            array_filter(
                $rows,
                fn (array $row): bool => $row['user_id'] === $user['id'] || $row['audience'] === 'Community'
            )
        ));
    }

    private function workoutProfileForUser(string $userId): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM workout_profiles WHERE user_id = :user_id LIMIT 1');
        $stmt->execute([':user_id' => $userId]);
        $row = $stmt->fetch();
        if ($row) {
            return [
                'goal' => $row['goal'],
                'durationMinutes' => (int) $row['duration_minutes'],
                'focus' => $row['focus'],
                'equipment' => json_decode($row['equipment_json'] ?: '[]', true, 512, JSON_THROW_ON_ERROR),
                'updatedAt' => $row['updated_at'],
            ];
        }

        $user = $this->userById($userId);
        return [
            'goal' => 'Strength',
            'durationMinutes' => 45,
            'focus' => $user['preferences']['workoutLocation'] === 'Home' ? 'efficient full body training' : 'balanced performance',
            'equipment' => $user['preferences']['workoutLocation'] === 'Home' ? ['Bodyweight', 'Dumbbells'] : ['Barbell', 'Dumbbells', 'Cable'],
            'updatedAt' => date('Y-m-d'),
        ];
    }

    private function buildPersonalizedWorkout(array $profile): array
    {
        $goal = strtolower((string) ($profile['goal'] ?? 'strength'));
        $durationMinutes = max(10, (int) ($profile['durationMinutes'] ?? 45));
        $equipment = array_values(array_filter(array_map('strval', $profile['equipment'] ?? [])));
        $focus = trim((string) ($profile['focus'] ?? ''));

        if (str_contains($goal, 'fat')) {
            $title = 'Conditioning Builder';
            $blocks = [
                ['label' => 'Prep', 'minutes' => 8, 'items' => ['Dynamic mobility flow', 'Core activation', 'Low-impact pulse raise']],
                ['label' => 'Main Circuit', 'minutes' => 18, 'items' => ['Goblet squat x 12', 'Push-up x 10', 'Alternating reverse lunge x 10 / side']],
                ['label' => 'Finisher', 'minutes' => 8, 'items' => ['30s fast feet', '30s mountain climbers', '30s recovery walk']],
            ];
        } elseif (str_contains($goal, 'hypertrophy') || str_contains($goal, 'muscle')) {
            $title = 'Lean Muscle Builder';
            $blocks = [
                ['label' => 'Prep', 'minutes' => 7, 'items' => ['Band shoulder prep', 'Hip opener series', 'Ramp-up sets']],
                ['label' => 'Primary Lift', 'minutes' => 16, 'items' => ['Compound press or squat 4 x 6-8', 'Tempo-controlled accessory 3 x 10']],
                ['label' => 'Pump Finish', 'minutes' => 10, 'items' => ['Isolation superset 3 rounds', 'Controlled final set at RPE 8']],
            ];
        } elseif (str_contains($goal, 'sport') || str_contains($goal, 'speed') || str_contains($goal, 'athlete')) {
            $title = 'Field Performance Session';
            $blocks = [
                ['label' => 'Prep', 'minutes' => 8, 'items' => ['Sprint mechanics drill', 'Ankle stiffness hops', 'Med-ball primer']],
                ['label' => 'Power', 'minutes' => 14, 'items' => ['Jump variation 4 x 3', 'Acceleration starts 6 reps']],
                ['label' => 'Strength', 'minutes' => 12, 'items' => ['Posterior-chain lift 4 x 5', 'Single-leg strength 3 x 6 / side']],
            ];
        } else {
            $title = 'Strength Foundation Session';
            $blocks = [
                ['label' => 'Prep', 'minutes' => 8, 'items' => ['Breathing and bracing', 'Hip + thoracic mobility', 'Primer sets']],
                ['label' => 'Main Lift', 'minutes' => 18, 'items' => ['Primary barbell pattern 5 x 5', 'Secondary pull 4 x 6']],
                ['label' => 'Accessory', 'minutes' => 10, 'items' => ['Single-leg or upper-back work 3 x 8', 'Carries or anti-rotation core']],
            ];
        }

        return [
            'title' => $title,
            'goal' => ucfirst($goal),
            'durationMinutes' => $durationMinutes,
            'focus' => $focus !== '' ? $focus : 'general readiness',
            'equipment' => $equipment,
            'blocks' => $blocks,
            'coachNote' => 'Use the built-in timers for work intervals and keep top sets around RPE 7 to 9 unless recovery is poor.',
        ];
    }

    private function workoutOfDay(?array $profile): array
    {
        $seed = (int) date('Ymd');
        $goal = strtolower((string) ($profile['goal'] ?? 'strength'));
        $templates = str_contains($goal, 'fat')
            ? [
                ['title' => 'EMOM Engine', 'focus' => 'conditioning', 'blocks' => ['12-minute EMOM: squat, push, march', '8-minute carry finisher', '3-minute cooldown']],
                ['title' => 'Core + Sweat', 'focus' => 'fat loss', 'blocks' => ['3 rounds of hinges, step-ups, plank drags', '6-minute incline walk push']],
            ]
            : [
                ['title' => 'Power Primer', 'focus' => 'strength', 'blocks' => ['5 x 3 explosive main lift', '3 x 8 accessory pair', 'Loaded carry finish']],
                ['title' => 'Upper / Lower Blend', 'focus' => 'balanced strength', 'blocks' => ['Press + row pairing', 'Squat variation 4 x 6', 'Core finisher']],
            ];
        $pick = $templates[$seed % count($templates)];

        return [
            'date' => date('Y-m-d'),
            'title' => $pick['title'],
            'focus' => $pick['focus'],
            'blocks' => $pick['blocks'],
            'challenge' => ($seed % 2 === 0) ? 'Keep rest under 60 seconds on accessory work.' : 'Finish with one bonus set if technique stays sharp.',
        ];
    }

    private function findProgramForUser(string $userId, string $programId): ?array
    {
        $user = $this->userById($userId);
        if (!in_array($programId, $user['purchasedProgramIds'], true)) {
            return null;
        }

        return $this->findProgram($programId);
    }

    private function findProgram(string $programId): ?array
    {
        foreach ($this->programs() as $program) {
            if ($program['id'] === $programId) {
                return $program;
            }
        }

        return null;
    }

    private function programWorkoutOutline(array $program): array
    {
        return [
            'title' => $program['name'],
            'goal' => $program['type'],
            'durationMinutes' => 45,
            'focus' => $program['description'],
            'equipment' => ['Coach Program'],
            'blocks' => array_map(
                static function (string $item): array {
                    $parts = explode(' - ', $item, 2);
                    return [
                        'label' => $parts[0] ?? 'Session Block',
                        'minutes' => 12,
                        'items' => [($parts[1] ?? $item)],
                    ];
                },
                $program['preview']
            ),
            'coachNote' => 'Follow the assigned program sequence and log your top sets after the session.',
        ];
    }

    private function currentSession(): ?array
    {
        $userId = $_SESSION['user_id'] ?? null;
        $role = $_SESSION['role'] ?? null;
        if (!$userId || !$role) {
            return null;
        }

        return [
            'userId' => $userId,
            'role' => $role,
        ];
    }

    private function csrfToken(): string
    {
        if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }

        return $_SESSION['csrf_token'];
    }

    private function toUser(array $user): array
    {
        return [
            'id' => $user['id'],
            'role' => $user['role'],
            'firstName' => $user['first_name'],
            'lastName' => $user['last_name'],
            'email' => $user['email'],
            'phone' => $user['phone'],
            'plan' => $user['plan'],
            'joinedAt' => $user['joined_at'],
            'preferences' => json_decode($user['preferences_json'], true, 512, JSON_THROW_ON_ERROR),
            'progressScore' => (int) $user['progress_score'],
            'purchasedProgramIds' => json_decode($user['purchased_program_ids_json'], true, 512, JSON_THROW_ON_ERROR),
            'avatarUrl' => $user['avatar_url'] ?? '',
            'favoriteProgramIds' => json_decode($user['favorite_program_ids_json'] ?: '[]', true, 512, JSON_THROW_ON_ERROR),
            'subscriptionTier' => $user['subscription_tier'] ?? 'Starter',
            'connections' => json_decode($user['connections_json'] ?: '[]', true, 512, JSON_THROW_ON_ERROR),
            'athleteProfile' => [
                'heightCm' => $user['height_cm'] ?? '',
                'currentWeight' => $user['current_weight'] ?? '',
                'sportsPosition' => $user['sports_position'] ?? '',
                'trainingHistory' => $user['training_history'] ?? '',
                'achievements' => json_decode($user['achievements_json'] ?: '[]', true, 512, JSON_THROW_ON_ERROR),
                'fitnessScores' => json_decode($user['fitness_scores_json'] ?: '{}', true, 512, JSON_THROW_ON_ERROR),
                'injuryNotes' => $user['injury_notes'] ?? '',
            ],
        ];
    }

    private function userById(string $id): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $user = $stmt->fetch();
        if (!$user) {
            throw new RuntimeException('User not found.');
        }
        return $this->toUser($user);
    }

    private function findUserByEmail(string $email): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM users WHERE lower(email) = lower(:email) LIMIT 1');
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();
        return $user ? $this->toUser($user) : null;
    }

    private function findRawUserByEmail(string $email): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM users WHERE lower(email) = lower(:email) LIMIT 1');
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();
        return $user ?: null;
    }

    private function findRawUserById(string $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $user = $stmt->fetch();
        return $user ?: null;
    }

    private function availabilityById(string $id): ?array
    {
        foreach ($this->availability() as $slot) {
            if ($slot['id'] === $id) {
                return $slot;
            }
        }
        return null;
    }

    private function createMessage(string $userId, string $from, string $topic, string $body, string $status, string $createdAt): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO messages (id, user_id, from_name, topic, body, status, created_at)
             VALUES (:id, :user_id, :from_name, :topic, :body, :status, :created_at)'
        );
        $stmt->execute([
            ':id' => $this->uuid('msg'),
            ':user_id' => $userId,
            ':from_name' => $from,
            ':topic' => $topic,
            ':body' => $body,
            ':status' => $status,
            ':created_at' => $createdAt,
        ]);
    }

    private function nextOrderId(): string
    {
        $last = $this->pdo->query("SELECT id FROM orders WHERE id LIKE '#FF-%' ORDER BY id DESC LIMIT 1")->fetchColumn();
        if (!$last) {
            return '#FF-2001';
        }
        $number = (int) preg_replace('/\D/', '', (string) $last);
        return '#FF-' . ($number + 1);
    }

    private function findRecord(string $table, ?string $id, string $name): ?array
    {
        if ($id) {
            $stmt = $this->pdo->prepare("SELECT * FROM {$table} WHERE id = :id LIMIT 1");
            $stmt->execute([':id' => $id]);
            $record = $stmt->fetch();
            if ($record) {
                return $record;
            }
        }

        $stmt = $this->pdo->prepare("SELECT * FROM {$table} WHERE lower(name) = lower(:name) LIMIT 1");
        $stmt->execute([':name' => $name]);
        return $stmt->fetch() ?: null;
    }

    private function productsByIds(array $ids): array
    {
        $all = [];
        foreach ($this->products() as $product) {
            $all[$product['id']] = $product;
        }
        return $all;
    }

    private function productById(string $id): ?array
    {
        $products = $this->productsByIds([$id]);
        return $products[$id] ?? null;
    }

    private function replaceOrderItems(string $orderId, array $itemIds): void
    {
        $delete = $this->pdo->prepare('DELETE FROM order_items WHERE order_id = :order_id');
        $delete->execute([':order_id' => $orderId]);

        if ($itemIds === []) {
            return;
        }

        $insert = $this->pdo->prepare('INSERT INTO order_items (order_id, item_id) VALUES (:order_id, :item_id)');
        foreach ($itemIds as $itemId) {
            $insert->execute([
                ':order_id' => $orderId,
                ':item_id' => $itemId,
            ]);
        }
    }

    private function uuid(string $prefix): string
    {
        return $prefix . '-' . bin2hex(random_bytes(4));
    }

    private function sanitizeMediaList(array $items): array
    {
        return array_values(array_filter(array_map(
            static fn ($item): ?array => is_array($item) && isset($item['url'], $item['type'])
                ? [
                    'url' => (string) $item['url'],
                    'type' => (string) $item['type'],
                    'name' => (string) ($item['name'] ?? basename((string) $item['url'])),
                ]
                : null,
            $items
        )));
    }
}
