/* Runtime configuration for Orbit Runner.
 *
 * Leave these blank for local/offline play. Fill them in when you deploy the
 * score server and create a Facebook app.
 *
 * facebookAppId: the numeric App ID from https://developers.facebook.com/apps/
 * apiBase:       origin of server/orbit_server.py, e.g. "https://orbit-api.example.com"
 *               (leave empty to use the local personal board only)
 * facebookFriends: request the user_friends permission on login. Facebook only
 *               returns friends who also use the app, and the permission needs
 *               app review for production.
 */
window.ORBIT_CONFIG = {
  facebookAppId: "",
  apiBase: "",
  facebookFriends: false,
  leaderboardSize: 20,

  // Real rewarded ads (Capacitor native builds only). Leave blank to use the
  // built-in simulated ad in the browser.
  admobRewardedId: "",
  admobTestMode: true,
  admobConsent: true,
};
