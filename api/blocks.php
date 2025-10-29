<?php
declare(strict_types=1);
require __DIR__ . '/db.php';

$pdo = pdo();
$method = $_SERVER['REQUEST_METHOD'];

header('Content-Type: application/json; charset=utf-8');

try {
  switch ($method) {
    case 'GET':
      handle_get($pdo);  // ?type=soro&eeg&date=YYYY-MM-DD
      break;

    case 'POST':
      $b = json_input(); // {type,date,start_time,end_time,reason?}
      handle_post($pdo, $b);
      break;

    case 'DELETE':
      $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
      handle_delete($pdo, $id);
      break;

    default:
      respond(['error'=>'Método não suportado'], 405);
  }
} catch (PDOException $e) {
  respond(['error'=>'DB: '.$e->getMessage()], 500);
}

function handle_get(PDO $pdo){
  $type = $_GET['type'] ?? null;
  $date = $_GET['date'] ?? null;
  if (!$type || !in_array($type, ['soro','eeg'], true)) respond(['error'=>'type inválido'],400);
  if (!$date) respond(['error'=>'date obrigatório'],400);

  $st = $pdo->prepare("SELECT * FROM blocks WHERE type=? AND date=? ORDER BY start_time");
  $st->execute([$type, $date]);
  respond($st->fetchAll());
}

function handle_post(PDO $pdo, array $b){
  foreach (['type','date','start_time','end_time'] as $f){
    if (empty($b[$f])) respond(['error'=>"Campo obrigatório: $f"],400);
  }
  if (!in_array($b['type'], ['soro','eeg'], true)) respond(['error'=>'type inválido'],400);

  $st = $pdo->prepare("INSERT INTO blocks (type,date,start_time,end_time,reason) VALUES (?,?,?,?,?)");
  $st->execute([$b['type'],$b['date'],$b['start_time'],$b['end_time'],$b['reason'] ?? null]);
  respond(['id'=>$pdo->lastInsertId()], 201);
}

function handle_delete(PDO $pdo, int $id){
  if ($id <= 0) respond(['error'=>'id inválido'],400);
  $st = $pdo->prepare("DELETE FROM blocks WHERE id=?");
  $st->execute([$id]);
  respond(['ok'=>true]);
}
