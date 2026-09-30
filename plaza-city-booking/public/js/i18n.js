// Textos de la interfaz. ES por defecto; EN disponible desde Ajustes.
const es = {
  'app.subtitle': 'Áreas comunes',
  'nav.home': 'Inicio', 'nav.calendar': 'Calendario', 'nav.mine': 'Mis apartados', 'nav.activity': 'Bitácora', 'nav.settings': 'Ajustes',
  'auth.login': 'Iniciar sesión', 'auth.email': 'Correo', 'auth.password': 'Contraseña', 'auth.enter': 'Entrar',
  'auth.onlyInvite': 'El registro es únicamente con un link de invitación enviado por la administración del edificio.',
  'auth.register': 'Crear cuenta', 'auth.name': 'Nombre completo', 'auth.company': 'Empresa', 'auth.suite': 'Suite / oficina',
  'auth.password8': 'Contraseña (mínimo 8 caracteres)', 'auth.haveAccount': '¿Ya tienes cuenta?', 'auth.inviteInvalid': 'Este link de invitación no es válido o ya expiró. Pide uno nuevo a la administración.',
  'auth.inviteFor': 'Invitación', 'auth.logout': 'Cerrar sesión',
  'home.title': 'Hola, {name}', 'home.next': 'Tu próximo apartado', 'home.none': 'No tienes apartados próximos.', 'home.book': 'Apartar un espacio',
  'home.week': 'Disponibilidad de los próximos 7 días', 'home.day': 'Día', 'home.freeUse': 'Uso libre', 'home.closed': 'Cerrado', 'home.hoursBooked': '{booked}/{total} h apartadas',
  'home.rules': 'Reglas del edificio',
  'rules.hours': 'Los apartados son por hora, en horario de Chicago (America/Chicago).',
  'rules.conference': 'Conference Room: lunes a viernes 8:00–17:00, más sesiones especiales 17:00–21:00.',
  'rules.atrium': 'Atrium y Lounge (2º piso): lunes a viernes 17:00–21:00 y sábados 8:00–13:00.',
  'rules.sunday': 'Domingos y días festivos federales de EE.UU.: uso libre, por orden de llegada (no se aparta).',
  'rules.window': 'Se puede apartar con hasta {days} días de anticipación, máximo {max} horas por apartado y {quota} horas por espacio al día.',
  'rules.checkin': 'Haz check-in desde {before} min antes hasta {grace} min después del inicio; si no, el espacio se libera automáticamente.',
  'rules.cancel': 'Solo quien apartó puede cancelar. Todos los inquilinos ven la bitácora de actividad.',
  'cal.title': 'Calendario', 'cal.prevWeek': 'Semana anterior', 'cal.nextWeek': 'Semana siguiente', 'cal.today': 'Hoy',
  'cal.free': 'Libre', 'cal.busy': 'Ocupado', 'cal.mine': 'Tuyo', 'cal.past': 'Pasado', 'cal.special': 'Sesión especial',
  'cal.freeUseTitle': 'Uso libre, por orden de llegada', 'cal.sunday': 'Los domingos no se aparta: el que llega primero lo usa.',
  'cal.holiday': 'Día festivo ({name}): no se aparta, el que llega primero lo usa.', 'cal.closedDay': 'Este espacio no tiene horario este día.',
  'cal.tapHours': 'Toca una hora libre para apartarla; toca otra contigua para extender (máx. {max} h).',
  'cal.selected': '{space} · {date} · {from}–{to} ({n} h)', 'cal.confirm': 'Confirmar apartado', 'cal.clear': 'Quitar', 'cal.note': 'Nota (opcional, visible para todos)',
  'cal.booked': 'Apartado confirmado. Los demás inquilinos fueron notificados.', 'cal.checkedIn': 'Check-in registrado',
  'cal.legend': 'Leyenda',
  'mine.title': 'Mis apartados', 'mine.none': 'Aún no tienes apartados.', 'mine.upcoming': 'Próximos y en curso', 'mine.history': 'Historial (30 días)',
  'mine.checkin': 'Hacer check-in', 'mine.checkinAt': 'Check-in disponible desde {time}', 'mine.checkedIn': 'Check-in hecho', 'mine.cancel': 'Cancelar', 'mine.release': 'Liberar (terminar antes)',
  'mine.confirmCancel': '¿Cancelar este apartado? El espacio quedará libre para los demás.', 'mine.confirmRelease': '¿Liberar las horas restantes? Ya no podrás recuperarlas.',
  'mine.cancelled': 'Apartado cancelado.', 'mine.released': 'Espacio liberado.', 'mine.noShowWarning': 'Sin check-in antes de {time} el espacio se liberará solo.',
  'status.active': 'Activo', 'status.cancelled': 'Cancelado', 'status.released': 'Liberado', 'status.completed': 'Completado', 'status.no_show': 'Liberado por no presentarse', 'status.ended_early': 'Terminado antes',
  'act.title': 'Bitácora de actividad', 'act.desc': 'Registro público de quién apartó qué espacio, cuándo y por cuánto tiempo.', 'act.more': 'Cargar más', 'act.none': 'Sin actividad todavía.',
  'act.booked': '{who} apartó {space}', 'act.cancelled': '{who} canceló {space}', 'act.released': '{space} se liberó automáticamente (sin check-in de {who})',
  'act.ended_early': '{who} liberó {space} antes de tiempo', 'act.checked_in': '{who} hizo check-in en {space}', 'act.registered': '{who} se registró',
  'act.duration': '{n} h',
  'set.title': 'Ajustes', 'set.push': 'Notificaciones push', 'set.pushDesc': 'Recibe un aviso cuando alguien aparte, cancele o libere un espacio.',
  'set.pushOn': 'Activar en este dispositivo', 'set.pushOff': 'Desactivar en este dispositivo', 'set.pushTest': 'Enviar prueba', 'set.pushActive': 'Activas en este dispositivo',
  'set.pushDisabledServer': 'El servidor no tiene configuradas las llaves VAPID; las notificaciones push están desactivadas.', 'set.pushUnsupported': 'Este navegador no soporta notificaciones push. En iPhone, agrega la app a la pantalla de inicio (Compartir → Agregar a inicio) y ábrela desde ahí.',
  'set.pushDenied': 'Bloqueaste las notificaciones para este sitio. Actívalas en la configuración del navegador.',
  'set.profile': 'Perfil', 'set.save': 'Guardar', 'set.saved': 'Guardado.', 'set.lang': 'Idioma', 'set.owner': 'Administración del edificio', 'set.ownerLink': 'Gestionar links de invitación',
  'set.install': 'Instalar como app', 'set.installDesc': 'Agrega Plaza City a tu pantalla de inicio para abrirla como una app.',
  'inv.title': 'Links de invitación', 'inv.desc': 'Solo el dueño del edificio genera invitaciones. Comparte el link con el nuevo inquilino; caduca solo por fecha o número de usos.',
  'inv.key': 'Llave de dueño (OWNER_KEY)', 'inv.unlock': 'Acceder', 'inv.label': 'Etiqueta (p. ej. Suite 204 – Acme)', 'inv.uses': 'Usos', 'inv.days': 'Días de validez', 'inv.create': 'Generar link',
  'inv.copy': 'Copiar', 'inv.copied': 'Link copiado.', 'inv.revoke': 'Revocar', 'inv.active': 'Activo', 'inv.expired': 'Expirado', 'inv.used': 'Usado', 'inv.revoked': 'Revocado',
  'inv.expires': 'Expira', 'inv.registered': 'Registrados con este link', 'inv.none': 'No hay invitaciones.', 'inv.users': 'Usuarios registrados', 'inv.forget': 'Salir del modo dueño',
  'common.loading': 'Cargando…', 'common.error': 'Ocurrió un error.', 'common.close': 'Cerrar', 'common.hours': 'h', 'common.at': 'a las', 'common.by': 'por',
  'space.conference': 'Conference Room', 'space.atrium': 'Atrium', 'space.lounge': 'Lounge (2º piso)',
};
const en = {
  'app.subtitle': 'Shared spaces',
  'nav.home': 'Home', 'nav.calendar': 'Calendar', 'nav.mine': 'My bookings', 'nav.activity': 'Activity', 'nav.settings': 'Settings',
  'auth.login': 'Sign in', 'auth.email': 'Email', 'auth.password': 'Password', 'auth.enter': 'Sign in',
  'auth.onlyInvite': 'Registration is only possible through an invitation link sent by building management.',
  'auth.register': 'Create account', 'auth.name': 'Full name', 'auth.company': 'Company', 'auth.suite': 'Suite / office',
  'auth.password8': 'Password (8+ characters)', 'auth.haveAccount': 'Already have an account?', 'auth.inviteInvalid': 'This invitation link is invalid or expired. Ask management for a new one.',
  'auth.inviteFor': 'Invitation', 'auth.logout': 'Sign out',
  'home.title': 'Hi, {name}', 'home.next': 'Your next booking', 'home.none': 'You have no upcoming bookings.', 'home.book': 'Book a space',
  'home.week': 'Availability for the next 7 days', 'home.day': 'Day', 'home.freeUse': 'Free use', 'home.closed': 'Closed', 'home.hoursBooked': '{booked}/{total} h booked',
  'home.rules': 'Building rules',
  'rules.hours': 'Bookings are hourly, in Chicago time (America/Chicago).',
  'rules.conference': 'Conference Room: Monday–Friday 8:00–17:00, plus special sessions 17:00–21:00.',
  'rules.atrium': 'Atrium and Lounge (2nd floor): Monday–Friday 17:00–21:00 and Saturdays 8:00–13:00.',
  'rules.sunday': 'Sundays and U.S. federal holidays: free use, first come first served (no bookings).',
  'rules.window': 'Book up to {days} days ahead, max {max} hours per booking and {quota} hours per space per day.',
  'rules.checkin': 'Check in from {before} min before until {grace} min after the start; otherwise the space is released automatically.',
  'rules.cancel': 'Only the person who booked can cancel. Every tenant can see the activity log.',
  'cal.title': 'Calendar', 'cal.prevWeek': 'Previous week', 'cal.nextWeek': 'Next week', 'cal.today': 'Today',
  'cal.free': 'Free', 'cal.busy': 'Booked', 'cal.mine': 'Yours', 'cal.past': 'Past', 'cal.special': 'Special session',
  'cal.freeUseTitle': 'Free use, first come first served', 'cal.sunday': 'No bookings on Sundays: whoever arrives first uses it.',
  'cal.holiday': 'Federal holiday ({name}): no bookings, whoever arrives first uses it.', 'cal.closedDay': 'This space has no hours on this day.',
  'cal.tapHours': 'Tap a free hour to book it; tap an adjacent one to extend (max {max} h).',
  'cal.selected': '{space} · {date} · {from}–{to} ({n} h)', 'cal.confirm': 'Confirm booking', 'cal.clear': 'Clear', 'cal.note': 'Note (optional, visible to everyone)',
  'cal.booked': 'Booking confirmed. Other tenants have been notified.', 'cal.checkedIn': 'Checked in',
  'cal.legend': 'Legend',
  'mine.title': 'My bookings', 'mine.none': 'No bookings yet.', 'mine.upcoming': 'Upcoming and in progress', 'mine.history': 'History (30 days)',
  'mine.checkin': 'Check in', 'mine.checkinAt': 'Check-in opens at {time}', 'mine.checkedIn': 'Checked in', 'mine.cancel': 'Cancel', 'mine.release': 'Release (end early)',
  'mine.confirmCancel': 'Cancel this booking? The space will be free for others.', 'mine.confirmRelease': 'Release the remaining hours? You will not be able to get them back.',
  'mine.cancelled': 'Booking cancelled.', 'mine.released': 'Space released.', 'mine.noShowWarning': 'Without check-in before {time} the space will be released automatically.',
  'status.active': 'Active', 'status.cancelled': 'Cancelled', 'status.released': 'Released', 'status.completed': 'Completed', 'status.no_show': 'Released (no-show)', 'status.ended_early': 'Ended early',
  'act.title': 'Activity log', 'act.desc': 'Public record of who booked which space, when and for how long.', 'act.more': 'Load more', 'act.none': 'No activity yet.',
  'act.booked': '{who} booked {space}', 'act.cancelled': '{who} cancelled {space}', 'act.released': '{space} was auto-released (no check-in by {who})',
  'act.ended_early': '{who} released {space} early', 'act.checked_in': '{who} checked in at {space}', 'act.registered': '{who} joined',
  'act.duration': '{n} h',
  'set.title': 'Settings', 'set.push': 'Push notifications', 'set.pushDesc': 'Get notified when someone books, cancels or releases a space.',
  'set.pushOn': 'Enable on this device', 'set.pushOff': 'Disable on this device', 'set.pushTest': 'Send test', 'set.pushActive': 'Enabled on this device',
  'set.pushDisabledServer': 'The server has no VAPID keys configured; push notifications are disabled.', 'set.pushUnsupported': 'This browser does not support push notifications. On iPhone, add the app to your Home Screen (Share → Add to Home Screen) and open it from there.',
  'set.pushDenied': 'Notifications are blocked for this site. Enable them in your browser settings.',
  'set.profile': 'Profile', 'set.save': 'Save', 'set.saved': 'Saved.', 'set.lang': 'Language', 'set.owner': 'Building management', 'set.ownerLink': 'Manage invitation links',
  'set.install': 'Install as app', 'set.installDesc': 'Add Plaza City to your home screen to open it like an app.',
  'inv.title': 'Invitation links', 'inv.desc': 'Only the building owner generates invitations. Share the link with the new tenant; it expires on its own by date or number of uses.',
  'inv.key': 'Owner key (OWNER_KEY)', 'inv.unlock': 'Access', 'inv.label': 'Label (e.g. Suite 204 – Acme)', 'inv.uses': 'Uses', 'inv.days': 'Valid for (days)', 'inv.create': 'Generate link',
  'inv.copy': 'Copy', 'inv.copied': 'Link copied.', 'inv.revoke': 'Revoke', 'inv.active': 'Active', 'inv.expired': 'Expired', 'inv.used': 'Used', 'inv.revoked': 'Revoked',
  'inv.expires': 'Expires', 'inv.registered': 'Registered with this link', 'inv.none': 'No invitations.', 'inv.users': 'Registered users', 'inv.forget': 'Leave owner mode',
  'common.loading': 'Loading…', 'common.error': 'Something went wrong.', 'common.close': 'Close', 'common.hours': 'h', 'common.at': 'at', 'common.by': 'by',
  'space.conference': 'Conference Room', 'space.atrium': 'Atrium', 'space.lounge': 'Lounge (2nd floor)',
};

const dicts = { es, en };
let current = 'es';

export function setLang(l) {
  current = dicts[l] ? l : 'es';
  try { localStorage.setItem('pc.lang', current); } catch {}
  document.documentElement.lang = current;
}
export function getLang() { return current; }
export function initLang(userLang) {
  let l = userLang;
  try { l = localStorage.getItem('pc.lang') || userLang; } catch {}
  setLang(l || ((navigator.language || 'es').startsWith('en') ? 'en' : 'es'));
  if (userLang) setLang(userLang);
}
export function t(key, vars = {}) {
  let s = dicts[current][key] ?? dicts.es[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
export function locale() { return current === 'en' ? 'en-US' : 'es-MX'; }
