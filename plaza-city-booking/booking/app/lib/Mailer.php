<?php
declare(strict_types=1);

/** Correo saliente con mail() de PHP (en SiteGround sale por el servidor de correo del dominio). */
final class Mailer
{
    /** Solo pruebas: si es un arreglo, los correos se guardan aquí en vez de enviarse. */
    public static ?array $outbox = null;

    public static function send(string $to, string $subject, string $text): bool
    {
        if (self::$outbox !== null) {
            self::$outbox[] = ['to' => $to, 'subject' => $subject, 'text' => $text];
            return true;
        }
        if (!function_exists('mail') || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
            return false;
        }
        $host = parse_url((string) Config::get('base_url'), PHP_URL_HOST) ?: 'localhost';
        $host = preg_replace('/^www\./', '', $host);
        $replyTo = preg_replace('/^mailto:/', '', (string) (Config::get('vapid')['subject'] ?? ''));
        $headers = [
            'From: Plaza City <no-reply@' . $host . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
        ];
        if (filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
            $headers[] = 'Reply-To: ' . $replyTo;
        }
        $subj = function_exists('mb_encode_mimeheader') ? mb_encode_mimeheader($subject, 'UTF-8') : $subject;
        return @mail($to, $subj, str_replace("\n", "\r\n", $text), implode("\r\n", $headers), '-f no-reply@' . $host);
    }
}
