# Orbit Runner – App version

A phone-ready version of the game that you can install. It's the same game as `orbit_runner.py`, with touch controls, a portrait layout, vibration and offline support.

**Controls:** swipe ↑ to move to the outer ring · swipe ↓ for the inner ring · tap to reverse.
On a computer, use ↑/↓ or W/S, and Space to reverse.

## 1. Try it on your computer
```
cd orbit-runner-app
python -m http.server 8000
```
Open http://localhost:8000. To get the phone view, press F12 and turn on the device toolbar.

## 2. Put it on your phone (free, no app store)
The game has to be online over HTTPS before a phone can install it:
1. Go to https://app.netlify.com/drop and drag the `orbit-runner-app` folder onto the page. GitHub Pages works too.
2. Open the link it gives you on your phone.
   - **Android (Chrome):** menu ⋮ → *Add to Home screen* / *Install app*
   - **iPhone (Safari):** Share → *Add to Home Screen*
3. It now opens full-screen from its own icon and works offline.

## 3. Publish to Google Play / the App Store (with real ads)
Wrap the folder with [Capacitor](https://capacitorjs.com). You need Node.js, plus Android Studio for Android or Xcode on a Mac for iOS.
```
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor-community/admob
npx cap init "Orbit Runner" com.yourname.orbitrunner --web-dir .
npx cap add android
npx cap sync
npx cap open android      # build and run from Android Studio
```
Real ads: in `game.js`, uncomment the `AdMobProvider` class. Put your AdMob rewarded ad ID in it, call `AdMob.initialize()` once at startup, and change
`new Game(new MockAdProvider())` to `new Game(new AdMobProvider())`. Nothing else in the game needs to change.
Use Google's **test ad IDs** until your app is approved.

## Files
| File | Purpose |
|---|---|
| `index.html` | Page that holds the game |
| `game.js` | All game code, including the ad system |
| `manifest.json` | App name, icon and full-screen settings for installing |
| `sw.js` | Caches the game so it works offline |
| `icon-*.png` | App icons |
