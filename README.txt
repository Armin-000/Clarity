CLARITY WEB 5.1.1 — DEPLOY READY

Clarity je web/PWA aplikacija za hrvatski live prijepis.

Glavne odluke u ovoj verziji
-----------------------------
- Nema desktop/native wrappera.
- Nema vlastitog server-side speech-to-text enginea.
- Svaki uređaj koristi SpeechRecognition/Web Speech API koji nudi njegov preglednik/platforma.
- Jezik je postavljen na hr-HR.
- Clarity ne izvlači imena iz rečenica poput "Ja sam Armin". Govornici ostaju Govornik 1, 2, 3...
- Povijest i postavke ostaju lokalno u pregledniku.
- Brisanje razgovora i rečenica dostupno je izravnim gumbom, uključujući touch uređaje.
- PWA manifest i service worker su uključeni.
- Jedan Start/Kraj ciklus daje jedan odlomak; browserovi interni restartovi ne cijepaju tekst.
- Dodan je hrvatski Clarity rječnik i konzervativni correction layer za česte STT pogreške (npr. gluhi ma → gluhima).
- Ako browser podržava contextual phrase biasing, prioritet dobivaju izrazi vezani uz sluh, gluhoću i pristupačnost.

Pokretanje lokalno
------------------
npm install
npm run dev

Otvori: http://localhost:8768

Produkcijski deploy
-------------------
npm install
npm start

Server poštuje PORT i HOST varijable okoline i po defaultu sluša na 0.0.0.0:8768.
Za mikrofon na javnoj domeni OBAVEZNO koristi HTTPS. Preporučena domena: https://clarity.codarox.com/

Važno
------
Kvaliteta i dostupnost speech recognitiona ovise o browseru i operacijskom sustavu korisnika. Clarity namjerno ne pokušava zamijeniti platformsku STT uslugu vlastitim modelom.
