// ── Clé publique VAPID (générée via npx web-push generate-vapid-keys) ──
// ── Favicon injection globale ──────────────────────────
(function() {
  if (!document.querySelector('link[rel="icon"]')) {
    var lnk = document.createElement('link');
    lnk.rel = 'icon'; lnk.type = 'image/svg+xml'; lnk.href = '/favicon.svg';
    document.head.appendChild(lnk);
  }
})();

const VAPID_PUBLIC_KEY =
  'BM4Xv-k-mb4QfCxNxx5H5LNqASlJalpwsUqwDFVB-EHGxNcx98ILu8uwUeeaJc6tnhqbYdSvpCCrXpkINu8u-ck';

// ── Conversion base64url → Uint8Array pour pushManager.subscribe() ──
function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// ── Enregistrement du Service Worker ──
async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('[PWA] Service Worker enregistré :', reg.scope);
    return reg;
  } catch (err) {
    console.error('[PWA] Échec enregistrement SW :', err);
    return null;
  }
}

// ── Abonnement push après login candidat ──
async function subscribeToPush(supabase, userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('[PWA] Push notifications non supportées sur ce navigateur');
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.log('[PWA] Permission push refusée');
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, subscription: subscription.toJSON() },
      { onConflict: 'user_id' },
    );
  if (error) {
    console.error('[PWA] Erreur sauvegarde subscription :', error.message);
  } else {
    console.log('[PWA] Push subscription enregistrée pour', userId);
  }
}

// ── Désabonnement (optionnel, à appeler sur logout) ──
async function unsubscribeFromPush(supabase, userId) {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
    await supabase.from('push_subscriptions').delete().eq('user_id', userId);
    console.log('[PWA] Subscription push supprimée');
  }
}

// Auto-init Service Worker au chargement
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', registerSW);
} else {
  registerSW();
}
