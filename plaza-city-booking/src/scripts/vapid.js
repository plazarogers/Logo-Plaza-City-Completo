// Genera un par de llaves VAPID para Web Push. Pégalas en .env.
import webpush from 'web-push';
const keys = webpush.generateVAPIDKeys();
console.log('# Agrega estas líneas a tu archivo .env (o a las variables de entorno del servidor):');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:admin@plazacity.net');
