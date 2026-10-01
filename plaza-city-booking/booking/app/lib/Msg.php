<?php
declare(strict_types=1);

/** Mensajes del servidor en español e inglés. */
final class AppError extends RuntimeException
{
    public string $errCode;
    public int $status;
    public array $vars;

    public function __construct(string $code, int $status = 400, array $vars = [])
    {
        parent::__construct($code);
        $this->errCode = $code;
        $this->status = $status;
        $this->vars = $vars;
    }
}

final class Msg
{
    public static string $lang = 'es';

    private const ES = [
        'unknown_space' => 'Espacio desconocido.',
        'bad_date' => 'Fecha inválida.',
        'bad_hours' => 'Las horas deben ser enteras.',
        'bad_range' => 'La hora final debe ser mayor a la inicial.',
        'too_long' => 'Máximo {max} horas por apartado.',
        'sunday' => 'Los domingos el espacio es de uso libre, por orden de llegada.',
        'holiday' => 'Día festivo ({name}): uso libre, por orden de llegada.',
        'closure' => 'El edificio cerró este espacio ese día: {reason}',
        'closure_free' => 'Ese día el espacio es de uso libre, por orden de llegada: {reason}',
        'closed' => 'El espacio no tiene horario disponible ese día.',
        'outside_hours' => 'La hora {hour} está fuera del horario permitido.',
        'past' => 'Esa hora ya pasó.',
        'too_far' => 'Solo se puede apartar con hasta {days} días de anticipación.',
        'access_ends' => 'Tu acceso termina el {date}; no puedes apartar después de esa fecha.',
        'quota' => 'Máximo {max} horas por día en este espacio por usuario (ya tienes {used}).',
        'too_many_active' => 'Tienes demasiados apartados activos (máximo {max}). Cancela alguno o espera a que pasen.',
        'conflict' => 'La hora {hour} ya está apartada por alguien más.',
        'not_found' => 'No encontrado.',
        'forbidden_cancel' => 'Solo quien apartó el espacio puede cancelarlo.',
        'forbidden_checkin' => 'Solo quien apartó puede hacer check-in.',
        'not_active' => 'Este apartado ya no está activo.',
        'already_ended' => 'Este apartado ya terminó.',
        'locked_in' => 'Ya no se puede cancelar: faltan menos de {min} minutos para el inicio.',
        'too_early' => 'El check-in se abre {min} minutos antes del inicio.',
        'too_late' => 'La ventana de check-in ya cerró.',
        'auth_required' => 'Inicia sesión para continuar.',
        'bad_credentials' => 'Correo o contraseña incorrectos.',
        'account_disabled' => 'Tu cuenta está desactivada. Contacta a la administración del edificio.',
        'invalid_invite' => 'Este link de invitación no es válido o ya expiró.',
        'bad_name' => 'Escribe tu nombre.',
        'bad_email' => 'Correo inválido.',
        'bad_password' => 'La contraseña debe tener al menos 8 caracteres.',
        'wrong_password' => 'La contraseña actual no es correcta.',
        'email_taken' => 'Ese correo ya está registrado. Inicia sesión.',
        'invalid_reset' => 'Este link para restablecer la contraseña no es válido o ya expiró.',
        'rate_limited' => 'Demasiados intentos. Espera unos minutos.',
        'csrf' => 'Solicitud no permitida.',
        'owner_required' => 'Llave de administración incorrecta.',
        'not_installed' => 'La aplicación no está instalada. Abre install.php.',
        'push_disabled' => 'Las notificaciones push no están configuradas en el servidor.',
        'bad_subscription' => 'Suscripción push inválida.',
        'past_date' => 'La fecha ya pasó.',
        'request_own' => 'Este apartado es tuyo.',
        'request_too_early' => 'Solo puedes pedir el espacio después de los primeros {min} minutos del apartado.',
        'request_pending' => 'Ya hay una solicitud pendiente para este apartado.',
        'request_already' => 'Ya pediste este espacio una vez.',
        'request_closed' => 'Esta solicitud ya no está pendiente.',
        'held_for_requester' => 'Este espacio está reservado para {name} hasta las {time}, porque lo pidió primero.',
        'server_error' => 'Error interno del servidor.',
        'unknown_route' => 'Ruta desconocida.',
    ];

    private const EN = [
        'unknown_space' => 'Unknown space.',
        'bad_date' => 'Invalid date.',
        'bad_hours' => 'Hours must be whole numbers.',
        'bad_range' => 'End time must be after start time.',
        'too_long' => 'Maximum {max} hours per booking.',
        'sunday' => 'On Sundays the space is free to use, first come first served.',
        'holiday' => 'Holiday ({name}): free use, first come first served.',
        'closure' => 'Building management closed this space that day: {reason}',
        'closure_free' => 'That day the space is free to use, first come first served: {reason}',
        'closed' => 'This space has no available hours that day.',
        'outside_hours' => '{hour} is outside the allowed hours.',
        'past' => 'That time has already passed.',
        'too_far' => 'You can only book up to {days} days ahead.',
        'access_ends' => 'Your access ends on {date}; you cannot book after that date.',
        'quota' => 'Maximum {max} hours per day in this space per user (you already have {used}).',
        'too_many_active' => 'You have too many active bookings (max {max}). Cancel one or wait until they pass.',
        'conflict' => '{hour} is already booked by someone else.',
        'not_found' => 'Not found.',
        'forbidden_cancel' => 'Only the person who booked can cancel.',
        'forbidden_checkin' => 'Only the person who booked can check in.',
        'not_active' => 'This booking is no longer active.',
        'already_ended' => 'This booking has already ended.',
        'locked_in' => 'Too late to cancel: it starts in less than {min} minutes.',
        'too_early' => 'Check-in opens {min} minutes before the start.',
        'too_late' => 'The check-in window has closed.',
        'auth_required' => 'Please sign in to continue.',
        'bad_credentials' => 'Wrong email or password.',
        'account_disabled' => 'Your account is disabled. Please contact building management.',
        'invalid_invite' => 'This invitation link is invalid or has expired.',
        'bad_name' => 'Please enter your name.',
        'bad_email' => 'Invalid email.',
        'bad_password' => 'Password must be at least 8 characters.',
        'wrong_password' => 'Current password is incorrect.',
        'email_taken' => 'That email is already registered. Please sign in.',
        'invalid_reset' => 'This password reset link is invalid or has expired.',
        'rate_limited' => 'Too many attempts. Please wait a few minutes.',
        'csrf' => 'Request not allowed.',
        'owner_required' => 'Wrong management key.',
        'not_installed' => 'The app is not installed. Open install.php.',
        'push_disabled' => 'Push notifications are not configured on the server.',
        'bad_subscription' => 'Invalid push subscription.',
        'past_date' => 'That date has passed.',
        'request_own' => 'This booking is yours.',
        'request_too_early' => 'You can only ask for the space after the first {min} minutes of the booking.',
        'request_pending' => 'There is already a pending request for this booking.',
        'request_already' => 'You already asked for this space once.',
        'request_closed' => 'This request is no longer pending.',
        'held_for_requester' => 'This space is held for {name} until {time} because they asked first.',
        'server_error' => 'Internal server error.',
        'unknown_route' => 'Unknown route.',
    ];

    public static function t(string $code, array $vars = [], ?string $lang = null): string
    {
        $dict = ($lang ?? self::$lang) === 'en' ? self::EN : self::ES;
        $s = $dict[$code] ?? $code;
        foreach ($vars as $k => $v) {
            $s = str_replace('{' . $k . '}', (string) $v, $s);
        }
        return $s;
    }
}
