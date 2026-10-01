<?php
declare(strict_types=1);

/**
 * Web Push estándar sin dependencias externas:
 *  - VAPID (RFC 8292): JWT ES256 firmado con OpenSSL.
 *  - Cifrado del mensaje aes128gcm (RFC 8188 / RFC 8291) con ECDH P-256 + HKDF.
 * Requiere PHP >= 8.0 con OpenSSL (presente en prácticamente todo hosting).
 */
final class WebPush
{
    private const P256_SPKI_PREFIX = '3059301306072a8648ce3d020106082a8648ce3d030107034200';

    public static function b64u(string $s): string
    {
        return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    }

    public static function b64uDecode(string $s): string
    {
        $r = base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
        return $r === false ? '' : $r;
    }

    private static function pad32(string $s): string
    {
        return str_pad(ltrim($s, "\0") === '' ? "\0" : $s, 32, "\0", STR_PAD_LEFT);
    }

    private static function newEcKey()
    {
        $k = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        if ($k === false) {
            throw new RuntimeException('OpenSSL no pudo generar una llave EC P-256');
        }
        return $k;
    }

    public static function rawPublicKey($key): string
    {
        $d = openssl_pkey_get_details($key);
        return "\x04" . self::pad32($d['ec']['x']) . self::pad32($d['ec']['y']);
    }

    public static function publicKeyFromRaw(string $raw)
    {
        if (strlen($raw) !== 65 || $raw[0] !== "\x04") {
            throw new InvalidArgumentException('Llave pública P-256 inválida');
        }
        $der = hex2bin(self::P256_SPKI_PREFIX) . $raw;
        $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
        $k = openssl_pkey_get_public($pem);
        if ($k === false) {
            throw new InvalidArgumentException('Llave pública P-256 inválida');
        }
        return $k;
    }

    /** @return array{public_key:string, private_key_pem:string} */
    public static function generateVapidKeys(): array
    {
        $k = self::newEcKey();
        openssl_pkey_export($k, $pem);
        return ['public_key' => self::b64u(self::rawPublicKey($k)), 'private_key_pem' => $pem];
    }

    /** Firma DER (SEQUENCE{r,s}) -> r||s de 64 bytes (formato JOSE). */
    public static function derToJose(string $der): string
    {
        $pos = 2;
        if (ord($der[1]) & 0x80) {
            $pos += ord($der[1]) & 0x7f;
        }
        $out = '';
        for ($i = 0; $i < 2; $i++) {
            $pos++; // 0x02
            $len = ord($der[$pos++]);
            $out .= self::pad32(substr(ltrim(substr($der, $pos, $len), "\0"), -32));
            $pos += $len;
        }
        return $out;
    }

    public static function vapidAuthorization(string $endpoint, array $vapid, ?int $now = null): string
    {
        $p = parse_url($endpoint);
        $aud = $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '');
        $header = self::b64u(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
        $claims = self::b64u(json_encode(['aud' => $aud, 'exp' => ($now ?? time()) + 12 * 3600, 'sub' => $vapid['subject']]));
        $input = "$header.$claims";
        if (!openssl_sign($input, $der, $vapid['private_key_pem'], OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('No se pudo firmar el JWT VAPID');
        }
        return 'vapid t=' . $input . '.' . self::b64u(self::derToJose($der)) . ', k=' . $vapid['public_key'];
    }

    /** Cifra $payload para la suscripción (p256dh y auth en base64url). */
    public static function encrypt(string $payload, string $p256dhB64, string $authB64): string
    {
        $uaPublic = self::b64uDecode($p256dhB64);
        $authSecret = self::b64uDecode($authB64);
        if (strlen($authSecret) < 16) {
            throw new InvalidArgumentException('auth inválido');
        }
        $eph = self::newEcKey();
        $asPublic = self::rawPublicKey($eph);
        $shared = openssl_pkey_derive(self::publicKeyFromRaw($uaPublic), $eph, 32);
        if ($shared === false) {
            throw new RuntimeException('ECDH falló');
        }
        $ikm = hash_hkdf('sha256', $shared, 32, "WebPush: info\0" . $uaPublic . $asPublic, $authSecret);
        $salt = random_bytes(16);
        $cek = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
        $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);
        $tag = '';
        $ct = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
        if ($ct === false) {
            throw new RuntimeException('AES-GCM falló');
        }
        return $salt . pack('N', 4096) . chr(65) . $asPublic . $ct . $tag;
    }

    /**
     * Envía en paralelo. $messages: [['endpoint','p256dh','auth','payload'], ...]
     * Devuelve el código HTTP por índice (0 = error de red).
     */
    public static function sendMany(array $messages, array $vapid, int $ttl = 21600): array
    {
        $results = [];
        $prepared = [];
        foreach ($messages as $i => $m) {
            try {
                $body = self::encrypt($m['payload'], $m['p256dh'], $m['auth']);
                $prepared[$i] = [
                    'url' => $m['endpoint'],
                    'body' => $body,
                    'headers' => [
                        'Content-Type: application/octet-stream',
                        'Content-Encoding: aes128gcm',
                        'TTL: ' . ($m['ttl'] ?? $ttl),
                        'Urgency: ' . ($m['urgency'] ?? 'normal'),
                        'Authorization: ' . self::vapidAuthorization($m['endpoint'], $vapid),
                        'Content-Length: ' . strlen($body),
                    ],
                ];
            } catch (Throwable $e) {
                $results[$i] = 400; // suscripción corrupta: se limpiará
            }
        }
        if (!$prepared) {
            return $results;
        }
        if (function_exists('curl_multi_init')) {
            $mh = curl_multi_init();
            $handles = [];
            foreach ($prepared as $i => $r) {
                $ch = curl_init($r['url']);
                curl_setopt_array($ch, [
                    CURLOPT_POST => true,
                    CURLOPT_POSTFIELDS => $r['body'],
                    CURLOPT_HTTPHEADER => $r['headers'],
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT => 10,
                    CURLOPT_CONNECTTIMEOUT => 5,
                ]);
                curl_multi_add_handle($mh, $ch);
                $handles[$i] = $ch;
            }
            do {
                $status = curl_multi_exec($mh, $active);
                if ($active) {
                    curl_multi_select($mh, 1.0);
                }
            } while ($active && $status === CURLM_OK);
            foreach ($handles as $i => $ch) {
                $results[$i] = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_multi_remove_handle($mh, $ch);
            }
            curl_multi_close($mh);
            return $results;
        }
        foreach ($prepared as $i => $r) {
            $ctx = stream_context_create(['http' => [
                'method' => 'POST', 'header' => implode("\r\n", $r['headers']), 'content' => $r['body'],
                'timeout' => 10, 'ignore_errors' => true,
            ]]);
            @file_get_contents($r['url'], false, $ctx);
            $code = 0;
            foreach ($http_response_header ?? [] as $h) {
                if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $mm)) {
                    $code = (int) $mm[1];
                }
            }
            $results[$i] = $code;
        }
        return $results;
    }
}
