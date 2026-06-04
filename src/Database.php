<?php

declare(strict_types=1);

namespace Noella;

use PDO;

final class Database
{
    private PDO $pdo;

    public function __construct(string $databasePath)
    {
        $directory = dirname($databasePath);
        if (!is_dir($directory) && !mkdir($directory, 0777, true) && !is_dir($directory)) {
            throw new \RuntimeException(sprintf('Unable to create database directory: %s', $directory));
        }

        if (!is_writable($directory)) {
            @chmod($directory, 0777);
        }

        if (!is_writable($directory)) {
            throw new \RuntimeException(sprintf('Database directory is not writable: %s', $directory));
        }

        $this->pdo = new PDO('sqlite:' . $databasePath);
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $this->pdo->exec('PRAGMA foreign_keys = ON');

        if (is_file($databasePath) && !is_writable($databasePath)) {
            @chmod($databasePath, 0666);
        }

        if (is_file($databasePath) && !is_writable($databasePath)) {
            throw new \RuntimeException(sprintf('Database file is not writable: %s', $databasePath));
        }

        $this->migrate();
        $this->cleanupDemoData();
        $this->seed();
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }

    private function migrate(): void
    {
        $this->pdo->exec(
            <<<SQL
            CREATE TABLE IF NOT EXISTS settings (
                group_name TEXT NOT NULL,
                key_name TEXT NOT NULL,
                value TEXT NOT NULL,
                PRIMARY KEY (group_name, key_name)
            );

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                role TEXT NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                phone TEXT NOT NULL DEFAULT '',
                plan TEXT NOT NULL DEFAULT '',
                joined_at TEXT NOT NULL,
                preferences_json TEXT NOT NULL,
                progress_score INTEGER NOT NULL DEFAULT 0,
                purchased_program_ids_json TEXT NOT NULL,
                avatar_url TEXT NOT NULL DEFAULT '',
                favorite_program_ids_json TEXT NOT NULL DEFAULT '[]',
                subscription_tier TEXT NOT NULL DEFAULT 'Starter',
                connections_json TEXT NOT NULL DEFAULT '[]',
                height_cm TEXT NOT NULL DEFAULT '',
                current_weight TEXT NOT NULL DEFAULT '',
                sports_position TEXT NOT NULL DEFAULT '',
                training_history TEXT NOT NULL DEFAULT '',
                achievements_json TEXT NOT NULL DEFAULT '[]',
                fitness_scores_json TEXT NOT NULL DEFAULT '{}',
                injury_notes TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS leads (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS availability_slots (
                id TEXT PRIMARY KEY,
                date_label TEXT NOT NULL,
                time_label TEXT NOT NULL,
                session_type TEXT NOT NULL,
                seats INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS programs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                description TEXT NOT NULL,
                preview_json TEXT NOT NULL,
                completion INTEGER NOT NULL DEFAULT 0,
                media_json TEXT NOT NULL DEFAULT '[]'
            );

            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                display_name TEXT NOT NULL,
                price REAL NOT NULL,
                category TEXT NOT NULL,
                inventory INTEGER,
                visibility TEXT NOT NULL,
                delivery_type TEXT NOT NULL,
                status TEXT NOT NULL,
                description TEXT NOT NULL,
                details_json TEXT NOT NULL,
                media_json TEXT NOT NULL DEFAULT '[]'
            );

            CREATE TABLE IF NOT EXISTS cart_items (
                user_id TEXT NOT NULL,
                product_id TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                PRIMARY KEY (user_id, product_id)
            );

            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                buyer_name TEXT NOT NULL,
                total REAL NOT NULL,
                status TEXT NOT NULL,
                delivery_method TEXT NOT NULL,
                tracking TEXT NOT NULL,
                notes TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS order_items (
                order_id TEXT NOT NULL,
                item_id TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bookings (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                client_name TEXT NOT NULL,
                session_name TEXT NOT NULL,
                date_label TEXT NOT NULL,
                time_label TEXT NOT NULL,
                format_label TEXT NOT NULL,
                status TEXT NOT NULL,
                goal TEXT NOT NULL,
                notes TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                from_name TEXT NOT NULL,
                topic TEXT NOT NULL,
                body TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS progress_entries (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                weight TEXT NOT NULL,
                waist TEXT NOT NULL,
                notes TEXT NOT NULL,
                created_at TEXT NOT NULL,
                media_json TEXT NOT NULL DEFAULT '[]'
            );

            CREATE TABLE IF NOT EXISTS workout_profiles (
                user_id TEXT PRIMARY KEY,
                goal TEXT NOT NULL,
                duration_minutes INTEGER NOT NULL DEFAULT 45,
                focus TEXT NOT NULL DEFAULT '',
                equipment_json TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS workout_logs (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                program_id TEXT NOT NULL DEFAULT '',
                session_date TEXT NOT NULL,
                exercise_name TEXT NOT NULL,
                sets INTEGER NOT NULL DEFAULT 0,
                reps INTEGER NOT NULL DEFAULT 0,
                load_value REAL NOT NULL DEFAULT 0,
                rpe REAL NOT NULL DEFAULT 0,
                volume REAL NOT NULL DEFAULT 0,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                distance_value REAL NOT NULL DEFAULT 0,
                heart_rate INTEGER NOT NULL DEFAULT 0,
                calories_burned REAL NOT NULL DEFAULT 0,
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS community_posts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                audience TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token_hash TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used_at TEXT
            );
            SQL
        );

        $this->ensureColumn('users', 'avatar_url', "TEXT NOT NULL DEFAULT ''");
        $this->ensureColumn('users', 'favorite_program_ids_json', "TEXT NOT NULL DEFAULT '[]'");
        $this->ensureColumn('users', 'subscription_tier', "TEXT NOT NULL DEFAULT 'Starter'");
        $this->ensureColumn('users', 'connections_json', "TEXT NOT NULL DEFAULT '[]'");
        $this->ensureColumn('users', 'height_cm', "TEXT NOT NULL DEFAULT ''");
        $this->ensureColumn('users', 'current_weight', "TEXT NOT NULL DEFAULT ''");
        $this->ensureColumn('users', 'sports_position', "TEXT NOT NULL DEFAULT ''");
        $this->ensureColumn('users', 'training_history', "TEXT NOT NULL DEFAULT ''");
        $this->ensureColumn('users', 'achievements_json', "TEXT NOT NULL DEFAULT '[]'");
        $this->ensureColumn('users', 'fitness_scores_json', "TEXT NOT NULL DEFAULT '{}'");
        $this->ensureColumn('users', 'injury_notes', "TEXT NOT NULL DEFAULT ''");
        $this->ensureColumn('programs', 'media_json', "TEXT NOT NULL DEFAULT '[]'");
        $this->ensureColumn('products', 'media_json', "TEXT NOT NULL DEFAULT '[]'");
        $this->ensureColumn('progress_entries', 'media_json', "TEXT NOT NULL DEFAULT '[]'");
        $this->ensureColumn('workout_logs', 'distance_value', "REAL NOT NULL DEFAULT 0");
        $this->ensureColumn('workout_logs', 'heart_rate', "INTEGER NOT NULL DEFAULT 0");
        $this->ensureColumn('workout_logs', 'calories_burned', "REAL NOT NULL DEFAULT 0");
    }

    private function seed(): void
    {
        $siteSettings = [
            ['site', 'brandName', 'Noella'],
            ['site', 'businessEmail', ''],
            ['site', 'phone', ''],
            ['site', 'instagramUrl', ''],
            ['site', 'instagramLabel', ''],
            ['site', 'tiktokUrl', ''],
            ['site', 'tiktokLabel', ''],
            ['site', 'leadMagnetUrl', ''],
            ['content', 'heroHeadline', 'Train with Noella'],
            ['content', 'mainCta', 'Explore Programs'],
            ['content', 'aboutSummary', 'Use the admin area to add your real programs, products, content, and clients.'],
            ['content', 'aboutSupport', 'This website now starts clean so you can publish your own business details instead of inheriting demo copy.'],
            ['content', 'heroMediaUrl', ''],
            ['content', 'heroMediaType', ''],
        ];

        $insertSetting = $this->pdo->prepare(
            'INSERT INTO settings (group_name, key_name, value) VALUES (:group_name, :key_name, :value)
             ON CONFLICT(group_name, key_name) DO NOTHING'
        );
        foreach ($siteSettings as [$group, $key, $value]) {
            $insertSetting->execute([
                ':group_name' => $group,
                ':key_name' => $key,
                ':value' => $value,
            ]);
        }

        $insertUser = $this->pdo->prepare(
            'INSERT INTO users (id, role, first_name, last_name, email, password_hash, phone, plan, joined_at, preferences_json, progress_score, purchased_program_ids_json)
             VALUES (:id, :role, :first_name, :last_name, :email, :password_hash, :phone, :plan, :joined_at, :preferences_json, :progress_score, :purchased_program_ids_json)'
        );

        $users = [
            [
                'id' => 'user-admin',
                'role' => 'admin',
                'first_name' => 'Noella',
                'last_name' => 'Admin',
                'email' => 'admin@noella.local',
                'password' => 'admin890',
                'phone' => '',
                'plan' => 'Owner Access',
                'joined_at' => '2026-01-05',
                'preferences' => ['workoutLocation' => 'Mixed', 'preferredContact' => 'Email', 'foodPreferences' => ''],
                'progress_score' => 100,
                'purchased_program_ids' => [],
            ],
        ];

        $adminCount = (int) $this->pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();
        if ($adminCount > 0) {
            return;
        }

        foreach ($users as $user) {
            $insertUser->execute([
                ':id' => $user['id'],
                ':role' => $user['role'],
                ':first_name' => $user['first_name'],
                ':last_name' => $user['last_name'],
                ':email' => $user['email'],
                ':password_hash' => password_hash($user['password'], PASSWORD_DEFAULT),
                ':phone' => $user['phone'],
                ':plan' => $user['plan'],
                ':joined_at' => $user['joined_at'],
                ':preferences_json' => json_encode($user['preferences'], JSON_THROW_ON_ERROR),
                ':progress_score' => $user['progress_score'],
                ':purchased_program_ids_json' => json_encode($user['purchased_program_ids'], JSON_THROW_ON_ERROR),
            ]);
        }

    }

    private function cleanupDemoData(): void
    {
        $sampleClientCount = (int) $this->pdo->query(
            "SELECT COUNT(*) FROM users WHERE id IN ('user-client-noella', 'user-client-sara', 'user-client-jade')"
        )->fetchColumn();
        $sampleProgramCount = (int) $this->pdo->query(
            "SELECT COUNT(*) FROM programs WHERE id IN ('prog-glute', 'prog-fatburn', 'prog-vip', 'prog-mealplan')"
        )->fetchColumn();
        $sampleProductCount = (int) $this->pdo->query(
            "SELECT COUNT(*) FROM products WHERE id IN ('prod-bands', 'prod-journal', 'prod-shaker', 'prod-ankle', 'prod-mat', 'prod-straps', 'prod-summer-kit')"
        )->fetchColumn();

        if ($sampleClientCount === 0 && $sampleProgramCount === 0 && $sampleProductCount === 0) {
            return;
        }

        $this->pdo->exec('DELETE FROM order_items');
        $this->pdo->exec('DELETE FROM orders');
        $this->pdo->exec('DELETE FROM cart_items');
        $this->pdo->exec('DELETE FROM bookings');
        $this->pdo->exec('DELETE FROM messages');
        $this->pdo->exec('DELETE FROM progress_entries');
        $this->pdo->exec('DELETE FROM availability_slots');
        $this->pdo->exec('DELETE FROM products');
        $this->pdo->exec('DELETE FROM programs');
        $this->pdo->exec("DELETE FROM users WHERE role = 'client'");
        $this->pdo->exec('DELETE FROM leads');
        $this->pdo->exec('DELETE FROM settings');
    }

    private function ensureColumn(string $table, string $column, string $definition): void
    {
        $stmt = $this->pdo->query("PRAGMA table_info({$table})");
        $columns = $stmt ? $stmt->fetchAll() : [];
        foreach ($columns as $existing) {
            if (($existing['name'] ?? null) === $column) {
                return;
            }
        }

        $this->pdo->exec(sprintf('ALTER TABLE %s ADD COLUMN %s %s', $table, $column, $definition));
    }
}
