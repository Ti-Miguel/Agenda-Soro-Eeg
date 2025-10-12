<?php
// api/db.php
declare(strict_types=1);

// ⚠️ Em produção, prefira usar variáveis de ambiente (.htaccess/SetEnv)
$DB_HOST = 'localhost';
$DB_NAME = 'u380360322_agenda';
$DB_USER = 'u380360322_agenda';
$DB_PASS = 'Miguel847829';

header('Content-Type: application/json; charset=utf-8');
// CORS simples (ajuste se precisar restringir)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

function pdo(): PDO {
  global $DB_HOST, $DB_NAME, $DB_USER, $DB_PASS;
  $dsn = "mysql:host={$DB_HOST};dbname={$DB_NAME};charset=utf8mb4";
  $opt = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ];
  return new PDO($dsn, $DB_USER, $DB_PASS, $opt);
}

function json_input(): array {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function respond($data, int $code = 200): void {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function bad_request($msg){ respond(['error'=>$msg], 400); }
function conflict($msg){ respond(['error'=>$msg], 409); }
function not_found($msg){ respond(['error'=>$msg], 404); }
