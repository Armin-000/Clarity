# Clarity — preview na Macu i Android/iPhone uređaju

Za ovaj preview nisu potrebni Vite, dodatni npm paketi ni drugi STT server.
Web aplikacija se poslužuje iz `build/` direktorija.

## Mac (lokalno)

```bash
npm run dev
```

Otvori **http://localhost:5173**. Ovo je lokalna adresa na Macu.
Adresa `0.0.0.0` nije URL za otvaranje u pregledniku.

## Mobitel (HTTPS + QR kod)

Samo prvi put instaliraj alate:

```bash
brew install cloudflared qrencode
```

Zatim u rootu projekta pokreni:

```bash
npm run preview:phone
```

Naredba pokreće lokalni statički preview, stvara privremeni `https://...trycloudflare.com` link
te ispisuje QR kod u terminalu. Skeniraj QR kod mobitelom u Chromeu ili Safariju,
odaberi Start i dopusti pristup mikrofonu kada preglednik zatraži.

Za gašenje oba procesa: **Ctrl+C**.

## Zašto ne samo LAN IP?

`http://192.168.x.x:5173` preko kućne mreže **nije** siguran kontekst.
Preglednici mogu blokirati funkcije mikrofona, iako je servis dostupan.
`http://localhost:5173` jest siguran kontekst samo na uređaju na kojem je server pokrenut.
HTTPS tunnel omogućuje test na telefonu bez instaliranja i povjeravanja razvojnih
TLS certifikata na telefonu.

Quick Tunnel zahtijeva internet i **svatko tko ima privremenu adresu može otvoriti aplikaciju**.
Nemoj dijeliti adresu javno. Link prestaje raditi kad se tunnel ugasi.
Web Speech servis preglednika također može trebati internetsku vezu.

Ako HTTPS preview otvara Clarity, ali transkripcija na Androidu i dalje ne radi,
provjeri dozvolu za mikrofon, jezik sustavnog speech servisa i browser konzolu.
HTTPS rješava kontekst, ne jamči podršku za SpeechRecognition na svim uređajima.

## Produkcija i izvorni kod

`npm start` i dalje pokreće izvorni `server.mjs` na portu 8768, bez promjene produkcije.
`npm test`, `npm run build`, `npm run sync:native` ostaju nepromijenjeni.
