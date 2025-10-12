<?php
// api/appointments.php
declare(strict_types=1);
require __DIR__ . '/db.php';

$pdo = pdo();
$method = $_SERVER['REQUEST_METHOD'];

try {
  switch ($method) {
    case 'GET':
      handle_get($pdo);
      break;

    case 'POST':
      $body = json_input();
      handle_post($pdo, $body);
      break;

    case 'PUT':
      $body = json_input();
      handle_put($pdo, $body);
      break;

    case 'PATCH':
      $body = json_input();
      handle_patch($pdo, $body);
      break;

    case 'DELETE':
      $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
      handle_delete($pdo, $id);
      break;

    default:
      bad_request('Método não suportado');
  }
} catch (PDOException $e) {
  // Erros de chave única => conflito (horário duplicado)
  if ((int)$e->getCode() === 23000) {
    conflict('Já existe um agendamento para este TIPO, DATA e HORÁRIO.');
  }
  respond(['error'=>'DB: '.$e->getMessage()], 500);
}

function handle_get(PDO $pdo){
  // Filtros: type (obrigatório), date, week_start=YYYY-MM-DD, month=YYYY-MM
  $type = isset($_GET['type']) ? $_GET['type'] : null;
  if (!$type || !in_array($type, ['soro','eeg'], true)) bad_request('type inválido');

  // por dia
  if (!empty($_GET['date'])) {
    $date = $_GET['date'];
    $st = $pdo->prepare("SELECT * FROM appointments WHERE type=? AND date=? ORDER BY time ASC");
    $st->execute([$type, $date]);
    respond($st->fetchAll());
  }

  // por semana
  if (!empty($_GET['week_start'])) {
    $start = new DateTime($_GET['week_start']);
    $end = (clone $start)->modify('+6 day')->format('Y-m-d');
    $s = $start->format('Y-m-d');
    $st = $pdo->prepare("SELECT * FROM appointments WHERE type=? AND date BETWEEN ? AND ? ORDER BY date,time");
    $st->execute([$type, $s, $end]);
    respond($st->fetchAll());
  }

  // por mês
  if (!empty($_GET['month'])) {
    $ym = $_GET['month']; // YYYY-MM
    $first = new DateTime("{$ym}-01");
    $last = (clone $first)->modify('last day of this month')->format('Y-m-d');
    $f = $first->format('Y-m-d');
    $st = $pdo->prepare("SELECT * FROM appointments WHERE type=? AND date BETWEEN ? AND ? ORDER BY date,time");
    $st->execute([$type, $f, $last]);
    respond($st->fetchAll());
  }

  // Todos (do tipo)
  $st = $pdo->prepare("SELECT * FROM appointments WHERE type=? ORDER BY date,time");
  $st->execute([$type]);
  respond($st->fetchAll());
}

function handle_post(PDO $pdo, array $b){
  required($b, ['type','date','time','name','cpf','phone','status']);
  $st = $pdo->prepare("INSERT INTO appointments (type,date,time,name,cpf,phone,status) VALUES (?,?,?,?,?,?,?)");
  $st->execute([$b['type'],$b['date'],$b['time'],$b['name'],$b['cpf'],$b['phone'],$b['status']]);
  respond(['id'=>$pdo->lastInsertId()], 201);
}

function handle_put(PDO $pdo, array $b){
  required($b, ['id','type','date','time','name','cpf','phone','status']);
  $st = $pdo->prepare("UPDATE appointments SET type=?, date=?, time=?, name=?, cpf=?, phone=?, status=? WHERE id=?");
  $st->execute([$b['type'],$b['date'],$b['time'],$b['name'],$b['cpf'],$b['phone'],$b['status'],$b['id']]);
  respond(['ok'=>true]);
}

function handle_patch(PDO $pdo, array $b){
  if (empty($b['id'])) bad_request('id obrigatório');
  // Ex.: { "id": 10, "status": "FEITO" }
  if (isset($b['status'])) {
    $st = $pdo->prepare("UPDATE appointments SET status=? WHERE id=?");
    $st->execute([$b['status'],$b['id']]);
    respond(['ok'=>true]);
  }
  bad_request('Nada para atualizar');
}

function handle_delete(PDO $pdo, int $id){
  if ($id <= 0) bad_request('id inválido');
  $st = $pdo->prepare("DELETE FROM appointments WHERE id=?");
  $st->execute([$id]);
  respond(['ok'=>true]);
}

function required(array $arr, array $fields){
  foreach ($fields as $f) if (!isset($arr[$f]) || $arr[$f]==='') bad_request("Campo obrigatório: {$f}");
}
