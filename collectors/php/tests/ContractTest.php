<?php
/**
 * Test de CONTRAT entre l'API AI Labs Audit et le collecteur PHP.
 *
 * Les autres tests valident des morceaux isolés. Celui-ci sert la réponse
 * RÉELLE de l'API (fixture produite par l'application Flask, partagée avec le
 * test Go) via un serveur HTTP local, puis vérifie que Cache extrait bien les
 * patterns. Le bug de production venait de là : HTTP 200, JSON valide, clé
 * attendue absente, zéro pattern chargé, aucune erreur nulle part.
 *
 * Usage : php collectors/php/tests/ContractTest.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../src/AilabsTracker.php';
require_once __DIR__ . '/../src/Cache.php';
require_once __DIR__ . '/../src/Defaults.php';
require_once __DIR__ . '/../src/Detector.php';
require_once __DIR__ . '/../src/Buffer.php';

use AilabsAudit\Tracker\Cache;
use AilabsAudit\Tracker\Detector;

$echecs = 0;
$reussites = 0;

function verifier(string $intitule, bool $condition, string $detail = ''): void
{
    global $echecs, $reussites;
    if ($condition) {
        $reussites++;
        echo "  OK   $intitule\n";
    } else {
        $echecs++;
        echo "  FAIL $intitule" . ($detail !== '' ? " — $detail" : '') . "\n";
    }
}

/** Charge une fixture partagée avec le test Go. */
function fixture(string $nom): array
{
    $chemin = __DIR__ . '/../../log-agent/testdata/' . $nom;
    if (!is_file($chemin)) {
        fwrite(STDERR, "Fixture absente: $chemin\n");
        exit(1);
    }
    return json_decode((string) file_get_contents($chemin), true);
}

/** Démarre un serveur HTTP local qui rejoue une réponse d'API. */
function demarrerServeur(string $corpsJson, string $etag): array
{
    $racine = sys_get_temp_dir() . '/ailabs_contrat_' . bin2hex(random_bytes(4));
    mkdir($racine);

    file_put_contents($racine . '/corps.json', $corpsJson);
    file_put_contents($racine . '/routeur.php', <<<'PHP'
<?php
$corps = file_get_contents(__DIR__ . '/corps.json');
$etag  = trim(file_get_contents(__DIR__ . '/etag.txt'));
$recu  = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
header('ETag: ' . $etag);
header('Content-Type: application/json');
if ($recu !== '' && $recu === $etag) {
    http_response_code(304);
    return true;
}
echo $corps;
return true;
PHP);
    file_put_contents($racine . '/etag.txt', $etag);

    $port = random_int(8300, 8999);
    $cmd = sprintf(
        'php -S 127.0.0.1:%d -t %s %s/routeur.php > /dev/null 2>&1 & echo $!',
        $port,
        escapeshellarg($racine),
        escapeshellarg($racine)
    );
    $pid = (int) shell_exec($cmd);

    for ($i = 0; $i < 60; $i++) {
        $sock = @fsockopen('127.0.0.1', $port, $e, $s, 0.2);
        if ($sock) {
            fclose($sock);
            return [$pid, "http://127.0.0.1:$port", $racine];
        }
        usleep(100000);
    }
    fwrite(STDERR, "Serveur de test non démarré sur le port $port\n");
    exit(1);
}

function arreterServeur(array $srv): void
{
    [$pid, , $racine] = $srv;
    if ($pid > 0) {
        exec("kill $pid 2>/dev/null");
    }
    array_map('unlink', glob($racine . '/*') ?: []);
    @rmdir($racine);
}

/** Lit une propriété privée pour observer l'état interne du cache. */
function lire(object $objet, string $propriete)
{
    $r = new ReflectionProperty($objet, $propriete);
    $r->setAccessible(true);
    return $r->getValue($objet);
}

echo "Contrat API → collecteur PHP\n";

// ── 1. Réponse réelle de l'API : les patterns doivent être chargés ──
$fx = fixture('api_bot_signatures.json');
$srv = demarrerServeur(json_encode($fx['corps'], JSON_UNESCAPED_SLASHES), $fx['etag']);

$cache = new Cache($srv[1], 'trk_test', 'secret');
$repli = lire($cache, 'botSignatures');
$patterns = $cache->getBotSignatures();

verifier(
    'la reponse reelle de l API charge des patterns',
    count($patterns) > 0,
    '0 pattern extrait : HTTP 200 + JSON valide ne prouvent rien'
);
verifier('liste complete (5 patterns)', count($patterns) === 5, count($patterns) . ' recus');
verifier('la liste remplace bien le repli compile', $patterns !== $repli);

// ── 2. Test discriminant : signature absente du repli ──
$temoin = 'AI21Bot';
$uaTemoin = 'Mozilla/5.0 (compatible; AI21Bot/1.0; +https://ai21.com/bot)';
verifier(
    "temoin $temoin absent du repli compile",
    Detector::matchBot($uaTemoin, $repli) === null
        || Detector::matchBot($uaTemoin, $repli) === ''
);
verifier("temoin $temoin present dans le cache apres refresh", in_array($temoin, $patterns, true));
verifier(
    "temoin $temoin detectable par le moteur",
    Detector::matchBot($uaTemoin, $patterns) === $temoin,
    var_export(Detector::matchBot($uaTemoin, $patterns), true)
);

// ── 3. ETag mémorisé ──
verifier('ETag memorise apres chargement', lire($cache, 'botEtag') === $fx['etag']);

arreterServeur($srv);

// ── 4. Referents ──
$fxr = fixture('api_ai_referrers.json');
$srv = demarrerServeur(json_encode($fxr['corps'], JSON_UNESCAPED_SLASHES), $fxr['etag']);
$cacheRef = new Cache($srv[1], 'trk_test', 'secret');
$domaines = $cacheRef->getAiReferrers();
verifier('les referents sont charges (3 domaines)', count($domaines) === 3, count($domaines) . ' recus');
arreterServeur($srv);

// ── 5. Cas degrades : le repli ne doit jamais etre ecrase ──
$degrades = [
    'ancienne enveloppe data/meta seule' => '{"data":[{"pattern":"GPTBot"}],"meta":{}}',
    'liste vide'                          => '{"signatures":[],"data":[],"meta":{}}',
    'structure inattendue'                => '{"signatures":[{"autre":"champ"}],"data":[],"meta":{}}',
    'corps vide'                          => '{}',
];
foreach ($degrades as $intitule => $corps) {
    $srv = demarrerServeur($corps, '"x"');
    $c = new Cache($srv[1], 'trk_test', 'secret');
    $avant = lire($c, 'botSignatures');
    $apres = $c->getBotSignatures();
    verifier("$intitule : le repli est conserve", $apres === $avant);
    arreterServeur($srv);
}

echo "\n$reussites reussites, $echecs echecs\n";
exit($echecs === 0 ? 0 : 1);
