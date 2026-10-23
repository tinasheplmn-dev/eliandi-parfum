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

- `js/catalog.js` — 379 parfums, gegenereerd uit de Google-sheet van Angelo (zie `tools/parse_catalog.py`)
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

- Shop staat op `shop.html`: categorie-overzicht bovenaan, zoeken, filteren op doelgroep, karakter, geurfamilie en prijs, bestellen via de winkelmand.
- Elke geur heeft een eigen pagina op `/geur/<slug>` (`api/geur.js`, op de server opgebouwd uit `js/catalog.js`, `api/_teksten.json` en de dashboard-aanpassingen): maat kiezen, karakter (intensiteit, houdbaarheid, zoetheid, warmte), seizoen en moment, geurpiramide, garantie, verwante geuren.
- Productfoto's: zet ze in `assets/producten/` en koppel ze in `api/_fotos.json`, bijvoorbeeld `{"dames":{"30":"assets/producten/dames-30.jpg","50":"...","100":"..."}}`. Zolang er geen foto is, tekent de pagina een flacon in de kleur van de sterkste geurfamilie.
- Discovery Set-prijs (€49,95) is een aanname; door eigenaar te bevestigen.
- Reviews zijn echte Google-reviews, aangeleverd door de eigenaar.
- Foto's Discovery Set zijn telefoonfoto's; nette productfoto op zwart maakt
  het blok nog sterker.
- Discovery Set online bestellen vanuit de quiz: bewust voor later.
- Sfeerbeelden bij de quizvragen (bijv. via Higgsfield) kunnen later
  worden ingeschoven; de vraagkaarten zijn nu typografisch.

## Waar de site draait

- **Live:** https://eliandi-parfum.vercel.app (Vercel-project `eliandi-parfum`)
- **Beheer:** /beheer, wachtwoord staat in `ADMIN_PASSWORD` in Vercel
- **Opslag:** Upstash for Redis, gekoppeld via de Vercel Marketplace. De
  variabelen `KV_REST_API_URL` en `KV_REST_API_TOKEN` zet Vercel zelf.
- **Betalen:** Mollie, op dit moment met de **testsleutel**. Live zetten
  is `MOLLIE_API_KEY` in Vercel vervangen door de live-sleutel.
- **Agenda:** de Google-agenda van Angelo, via een serviceaccount in het
  Google Cloud-project `eliandi-2`.

Uitrollen vanaf deze map: `npx vercel deploy --prod`. De Git-koppeling
staat nog niet aan; zodra die er is, gaat elke commit op `main` vanzelf
live.

## Bestellen, boeken en betalen

Alles draait op Vercel-functies in `api/` (lokaal voert `server.js` precies
dezelfde code uit). Zonder betaalsleutel rekent alles in **testmodus** af:
de flow werkt volledig, er wordt niets afgeschreven.

| Wat | Pagina | Endpoint |
|---|---|---|
| Discovery Set / De Geurreis | geurwijzer-resultaat | `api/checkout.js` |
| Losse parfums (30/50/100 ml) | winkelmand -> `afrekenen.html` | `api/order.js` |
| The Eliandi Experience, 1 tot 6 personen (aanbetaling) | `experience.html` | `api/slots.js`, `api/book.js` |
| Shop: alle geuren, zoeken, filteren | `shop.html` -> winkelmand -> `afrekenen.html` | `api/products.js`, `api/order.js` |
| Cadeaubon Experience (volledig betaald) | `experience.html#cadeau` -> `cadeaubon.html` | `api/voucher.js` |
| Bevestigen na betaling | `bedankt.html` | `api/confirm.js`, `api/mollie-webhook.js` |
| Beheer (Angelo) | `beheer.html` (/beheer) | `api/admin.js`, `api/content.js`, `api/products.js`, `api/media.js` |

Prijzen van losse parfums komen uit `api/_prices.json`, gegenereerd met
`tools/parse_catalog.py` uit de Google-sheet van Angelo (rood gevulde rijen
worden overgeslagen; `python3 tools/parse_catalog.py` haalt de sheet zelf op
en schrijft `js/catalog.js` en `api/_prices.json`), plus wat Angelo in het dashboard
aanpast of toevoegt (`api/_catalog.js`); de browser kan prijzen niet
beïnvloeden. De standaard Experience-agenda staat in `api/_slots.js`
(1 persoon €74,95, 2 €139,95, 3 €199,95, 4 €249,95, 5 €279,95, daarboven
€50 per extra persoon; 30 minuten per persoon, 50% aanbetaling, di 10-13 en
do 18-20); alles daarvan is in het dashboard aan te passen. Een gezelschap
neemt zoveel aaneengesloten halfuren als personen keer minuten per persoon,
dus zes personen passen alleen op dinsdag (drie uur). Oude boekingen met
`variant: solo|duo` worden gelezen als 1 of 2 personen.

### Betalen via Mollie

`MOLLIE_API_KEY` aanzetten is genoeg: `createPayment()` in `api/_lib.js`
kiest dan Mollie, anders Stripe, anders testmodus. Wat er gebeurt:

- Mollie zet geen kenmerk in de terugkeerlink, dus maken we er zelf een
  (`pay:<kenmerk>` in de opslag). Daarmee bevestigt `/api/confirm` de
  betaling ook als de webhook nog onderweg is.
- `api/mollie-webhook.js` krijgt alleen een kenmerk binnen en haalt de
  betaling zelf op; dat is meteen de controle dat het bericht echt van
  Mollie komt. Het antwoord is altijd 200, anders blijft Mollie het
  opnieuw proberen.
- Lokaal sturen we geen webhook mee: Mollie weigert localhost. De
  bedankpagina bevestigt dan zelf.
- **De Geurreis** is een echt kwartaalabonnement: klant aanmaken, eerste
  betaling met `sequenceType: first`, en zodra die binnen is start het
  abonnement dat over drie maanden begint. Dat gebeurt één keer; webhook
  en terugkeer samen maken geen dubbel abonnement.

### Bevestigingsmails

Via Resend (`api/_mail.js`), zodra `RESEND_API_KEY` bestaat. Zonder die
sleutel wordt er niets verstuurd, logt de server een regel en loopt de
rest gewoon door. Wat er uitgaat:

| Wanneer | Naar wie | Inhoud |
|---|---|---|
| Boeking staat vast (betaald, cadeaubon of handmatig ingepland) | klant | datum, tijd, adres, wat betaald is en wat openstaat, plus een .ics voor de eigen agenda |
| Boeking geannuleerd in het dashboard | klant | welke afspraak vervalt en dat de aanbetaling wordt teruggestort |
| Bestelling betaald | klant | de regels met bedragen, en of hij verzonden of opgehaald wordt |
| Cadeaubon betaald | koper | de code en de link naar de printbare bon |
| Elk van bovenstaande | Angelo (`MAIL_OWNER`) | korte melding met contactgegevens |

Verstuurd vanuit `setBookingStatus` en `onPaid` in `api/_records.js`,
met dezelfde `eenmalig()`-sleutel als de agenda: webhook en terugkeer
samen leveren dus nooit twee mails op.

### Agenda van Angelo (Google)

Met `GOOGLE_CALENDAR_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` loopt zijn eigen
agenda mee (`api/_agenda.js`):

- Staat er al iets in zijn agenda, dan verdwijnt dat tijdstip van de
  site. `api/slots.js` verbergt het, `api/book.js` controleert het nog
  eens op het moment van boeken.
- Elke boeking komt in zijn agenda met naam, telefoon, wat er betaald is
  en de opmerking van de klant. Annuleert hij in het dashboard, dan
  verdwijnt de afspraak ook daar (`setBookingStatus` in `api/_records.js`).
- Instellen: Google Cloud Console > nieuw project > Google Calendar API
  aanzetten > serviceaccount maken > JSON-sleutel downloaden. Daarna
  deelt Angelo zijn agenda met het `client_email` uit die JSON, met
  recht om afspraken te wijzigen.
- Zonder die twee variabelen doet alles hier niets en werkt de site
  precies zoals hiervoor.

Sleutels lokaal: `cp env.voorbeeld .env.local` en invullen. `.env.local`
staat in `.gitignore`.

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

- `MOLLIE_API_KEY` — zet de echte betalingen aan (test_... of live_...)
- `STRIPE_SECRET_KEY` — alleen als je Stripe wilt in plaats van Mollie (de Stripe-webhook is verwijderd: Vercel staat op het gratis plan maximaal 12 functies toe)
- `GOOGLE_CALENDAR_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` — de agenda van
  Angelo: bezette tijden gaan dicht, boekingen komen in zijn agenda
- `RESEND_API_KEY` + `MAIL_FROM` + `MAIL_OWNER` — de bevestigingsmails
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
