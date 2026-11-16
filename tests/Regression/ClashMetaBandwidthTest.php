<?php

// Standalone regression checks; no application boot, database or real credentials.
$root = dirname(__DIR__, 2);
require getenv('XBOARD_TEST_AUTOLOAD') ?: $root . '/vendor/autoload.php';
require $root . '/app/Protocols/ClashMeta.php';

use App\Protocols\ClashMeta;
use Symfony\Component\Yaml\Yaml;

function buildFixture($bandwidth, int $version = 2, array $extra = []): array
{
    $settings = array_merge([
        'version' => $version,
        'tls' => ['server_name' => 'fixture.example.org', 'allow_insecure' => false],
    ], $extra);
    if ($bandwidth !== '__missing__') {
        $settings['bandwidth'] = $bandwidth;
    }
    return ClashMeta::buildHysteria('fixture-not-a-real-password', [
        'name' => 'fixture', 'host' => '127.0.0.1', 'port' => 443,
        'protocol_settings' => $settings,
    ], []);
}

function check(bool $ok, string $name): void
{
    if (!$ok) {
        throw new RuntimeException('Regression failed: ' . $name);
    }
    echo "PASS {$name}\n";
}

foreach ([null, [], '__missing__', ['up' => null, 'down' => null], ['up' => '', 'down' => '']] as $index => $bandwidth) {
    $proxy = buildFixture($bandwidth);
    check(!array_key_exists('up', $proxy) && !array_key_exists('down', $proxy), 'Hy2 unset bandwidth case ' . $index);
    check($proxy['type'] === 'hysteria2' && $proxy['password'] === 'fixture-not-a-real-password', 'Hy2 auth/type case ' . $index);
}
$proxy = buildFixture(['up' => 100, 'down' => 200]);
check($proxy['up'] === 100 && $proxy['down'] === 200, 'numeric bandwidth');
$proxy = buildFixture(['up' => '30 Mbps', 'down' => '200 Mbps']);
check($proxy['up'] === '30 Mbps' && $proxy['down'] === '200 Mbps', 'bandwidth unit strings');
$proxy = buildFixture(['up' => 0, 'down' => 0]);
check($proxy['up'] === 0 && $proxy['down'] === 0, 'explicit zero retained');
$proxy = buildFixture(['up' => 100, 'down' => null]);
check($proxy['up'] === 100 && !array_key_exists('down', $proxy), 'upstream only');
$proxy = buildFixture(['up' => null, 'down' => 200]);
check(!array_key_exists('up', $proxy) && $proxy['down'] === 200, 'downstream only');
$proxy = buildFixture(['up' => null, 'down' => null], 1);
check(array_key_exists('up', $proxy) && array_key_exists('down', $proxy), 'Hy1 behavior retained');
check($proxy['type'] === 'hysteria' && $proxy['auth_str'] === 'fixture-not-a-real-password', 'Hy1 authentication');
$proxy = buildFixture(['up' => 50, 'down' => 100], 1);
check($proxy['up'] === 50 && $proxy['down'] === 100, 'Hy1 explicit bandwidth');
$proxy = buildFixture(null, 2, ['hop_interval' => 30, 'obfs' => ['open' => true, 'type' => 'salamander', 'password' => 'fixture-obfs']]);
check($proxy['hop-interval'] === 30 && $proxy['obfs'] === 'salamander' && $proxy['obfs-password'] === 'fixture-obfs', 'Hy2 transport');
check($proxy['sni'] === 'fixture.example.org' && $proxy['skip-cert-verify'] === false, 'TLS verification retained');
$roundtrip = Yaml::parse(Yaml::dump(['proxies' => [$proxy]], 4));
check(!array_key_exists('up', $roundtrip['proxies'][0]) && !array_key_exists('down', $roundtrip['proxies'][0]), 'YAML does not reintroduce nulls');
echo "All 21 regression checks passed.\n";
