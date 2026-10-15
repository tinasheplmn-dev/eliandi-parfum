# Eliandi Parfum — merksite

Luxueus online visitekaartje voor **Eliandi Parfum**, Vughterstraat 70, 's-Hertogenbosch.
One-page site in de merkidentiteit uit het brandbook (Eliandi Zwart + Luxe Goud,
Playfair Display / Montserrat), met echte winkelfoto's als ruggengraat.

**Motion-concept: "de gouden essence"** — een canvas met gouddeeltjes die als
parfumdamp door de hele site omhoog zweven (sterkst in de hero en de cinematic
break, gedimd daartussen; reageert subtiel op de muis). Daaromheen: cinematic
intro, Ken Burns-hero met rooksluiers, scroll-reveals, sticky ritueel-sectie met
fotowissel, reviewslider en magnetische knoppen.

## Lokaal draaien

```bash
node server.js        # → http://localhost:8048
```

Geen build-stap en geen dependencies — de site is volledig statisch
(HTML + CSS + vanilla JS, fonts via Google Fonts).

## Deployen

Upload de map (zonder `server.js`, die is alleen lokale preview) naar elke
statische host: Netlify, Vercel, Cloudflare Pages of klassieke hosting.
Er is niets te configureren.

## Structuur

```
index.html        alle secties (one-page met ankers)
css/style.css     volledige artdirection
js/main.js        essence-deeltjes, scroll-choreografie, menu
assets/           4 echte winkelfoto's, echt logo (vrijstaand) + favicon
assets/icons/     ronde merkwaarde-badges uit het brandbook (PNG,
                  badge-*.png = met gouden ring, losse iconen ernaast)
```

Het logo is uit het brandbook (p01) geknipt en met floodfill vrijstaand
gemaakt; de iconen komen van brandbookpagina's 23, 24 en 6 en zijn met
luminance-keying transparant gemaakt en op ronde gouden badges gezet.

## De geurwijzer (quiz.html)

Persoonlijkheidsquiz die van de volledige catalogus naar de vijf best
passende parfums leidt. Tien vragen (één meerkeuze), analyse-tussenscherm,
lead-capture (naam + e-mail + AVG-vinkje) en een resultaatpagina met
match-percentages, onderbouwing per parfum en een Discovery Set-teaser.

- `js/catalog.js` — 379 parfums, gegenereerd uit `Webshop producten .xlsx`
  met `tools/parse_catalog.py` (python3 + openpyxl; pas bovenin het pad naar
  de Excel aan en draai opnieuw bij een nieuwe cataloguslijst). Per parfum:
  naam, doelgroep, geurfamilies, noten, intro, vanaf-prijs en afgeleide
  geurdimensies.
- `js/quiz.js` — vragen, matching (cosinus op geurdimensies + nabijheid op
  warmte/zoetheid/intensiteit/moment), onderbouwing in merkstem, leads.
- **Leads doorsturen naar CRM/n8n:** vul bovenin `js/quiz.js` de constante
  `LEAD_WEBHOOK` met een webhook-URL. Leeg = alleen lokaal bewaard
  (localStorage `eliandi_leads`).

## Geurwijzer + Discovery Set afrekenen

De quiz (`quiz.html`) matcht op de volledige catalogus (`js/catalog.js`,
gegenereerd uit het Excel van de eigenaar) en eindigt in een bestelbare
Discovery Set: de vijf matches als 5 × 10 ml samples.

**Betalen (Stripe Checkout, iDEAL + kaart)** loopt via `api/checkout.js`
(Vercel serverless, geen dependencies). Zonder sleutel draait alles in
mockmodus (bedankpagina met testmodus-melding, er wordt niets afgerekend).
Live zetten = in Vercel deze environment variables instellen:

- `STRIPE_SECRET_KEY` — de geheime sleutel uit het Stripe-dashboard
- `DISCOVERY_PRICE_CENTS` — prijs van de set in centen (standaard 4995);
  houd `DISCOVERY_PRICE` in `js/quiz.js` gelijk aan wat de klant ziet
- `SHIPPING_PRICE_CENTS` — verzendkosten in centen (standaard 495, 0 = gratis)

Bestellingen verschijnen in het Stripe-dashboard met de vijf parfums,
het geurprofiel en de voornaam als metadata.

**Beeldkaarten**: de visuele vragen tonen foto's uit `assets/quiz/<slug>.jpg`
zodra die bestaan (ontbreekt een beeld, dan toont de kaart een gouden
ornament-fallback). De volledige promptset voor het genereren staat in
`tools/higgsfield-prompts.md`.

## Nog open

- Webshop voor losse flacons komt later (architectuur ligt klaar in api/).
- Discovery Set-prijs (€49,95) is een aanname; door eigenaar te bevestigen.
- Reviews zijn echte Google-reviews, aangeleverd door de eigenaar.
- Foto's Discovery Set zijn telefoonfoto's; nette productfoto op zwart maakt
  het blok nog sterker.
- Discovery Set online bestellen vanuit de quiz: bewust voor later.
- Sfeerbeelden bij de quizvragen (bijv. via Higgsfield) kunnen later
  worden ingeschoven; de vraagkaarten zijn nu typografisch.

## Bestellen, boeken en betalen

Alles draait op Vercel-functies in `api/` (lokaal voert `server.js` precies
dezelfde code uit). Zonder betaalsleutel rekent alles in **testmodus** af:
de flow werkt volledig, er wordt niets afgeschreven.

| Wat | Pagina | Endpoint |
|---|---|---|
| Discovery Set / De Geurreis | geurwijzer-resultaat | `api/checkout.js` |
| Losse parfums (30/50/100 ml) | winkelmand -> `afrekenen.html` | `api/order.js` |
| De Eliandi Experience, Solo of Duo (aanbetaling) | `experience.html` | `api/slots.js`, `api/book.js` |
| Cadeaubon Experience (volledig betaald) | `experience.html#cadeau` -> `cadeaubon.html` | `api/voucher.js` |
| Bevestigen na betaling | `bedankt.html` | `api/confirm.js`, `api/stripe-webhook.js` |
| Beheer (Angelo) | `beheer.html` (/beheer) | `api/admin.js`, `api/content.js`, `api/products.js`, `api/media.js` |

Prijzen van losse parfums komen uit `api/_prices.json`, gegenereerd met
`tools/parse_catalog.py` uit de Excel, plus wat Angelo in het dashboard
aanpast of toevoegt (`api/_catalog.js`); de browser kan prijzen niet
beïnvloeden. De standaard Experience-agenda staat in `api/_slots.js`
(Solo €75 / 30 min, Duo €140 / 60 min, 50% aanbetaling, di 10-13 en do
18-20); alles daarvan is in het dashboard aan te passen. Betaalprovider
wisselen = alleen `createPayment()` in `api/_lib.js` aanpassen.

### Beheer voor Angelo (/beheer)

Inloggen met het wachtwoord uit `ADMIN_PASSWORD` (lokaal zonder die
variabele: `eliandi-lokaal`, werkt alleen op localhost). Tabbladen:

- **Boekingen** — komende afspraken met contactgegevens, opmerkingen en
  geurwijzer-uitslag; afronden, annuleren, zelf inplannen (telefonische
  boeking), tijden blokkeren in de agenda
- **Bestellingen** — webshop- en Discovery-bestellingen, plus cadeaubonnen
- **Producten** — eigen parfums toevoegen (komen direct in geurwijzer en
  winkelmand), prijzen van de vaste collectie wijzigen of verbergen
- **Site bewerken** — opent de pagina in bewerkmodus (`?bewerken`): klik
  op een tekst om te typen, klik op een foto om te vervangen, Opslaan.
  Wijzigingen worden in de browser toegepast; de oorspronkelijke tekst
  blijft in de HTML staan voor zoekmachines
- **Agenda & prijzen** — prijzen, aanbetaling, tijden per weekdag,
  gesloten dagen

### Omgevingsvariabelen (Vercel > Settings > Environment Variables)

- `STRIPE_SECRET_KEY` — zet de echte betalingen aan
- `STRIPE_WEBHOOK_SECRET` — voor `api/stripe-webhook` (events
  `checkout.session.completed` en `checkout.session.expired`)
- `ADMIN_PASSWORD` — wachtwoord voor /beheer (verplicht; zonder deze
  variabele kan online niemand inloggen)
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — **verplicht
  in productie**: hier staan boekingen, bestellingen, cadeaubonnen,
  producten, tekstwijzigingen en geüploade foto's. Zonder deze opslag
  gaat alles verloren bij een herstart (gratis via de Upstash-integratie
  op de Vercel Marketplace)
- `SHIPPING_PRICE_CENTS` (standaard 495), `DISCOVERY_PRICE_CENTS`,
  `SUBSCRIPTION_PRICE_CENTS`, `SITE_URL`
