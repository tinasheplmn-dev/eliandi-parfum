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

## Webshopbeheer, facturen en beveiliging (oktober 2026)

**Dashboard voor Angelo** (`/beheer`), zo eenvoudig mogelijk gehouden:

- **Bestellingen:** standaard alleen wat nog te doen is. Per bestelling een status (`wordt voorbereid`, `verzonden`, `klaar om op te halen`, `afgeleverd`, `geannuleerd`), een veld voor track & trace, een notitie en een knop **Factuur**. Bij verzonden, klaar om op te halen en geannuleerd krijgt de klant automatisch een mail.
- **Facturen:** bij elke betaalde bestelling maakt `api/_factuur.js` een PDF-factuur (doorlopend nummer `IN001000`, `IN001001`, …) en stuurt hem als bijlage mee in de bevestigingsmail. Opmaak volgt de oude PrestaShop-factuur. Bedrijfsgegevens, btw-nummer, factuurreeks en de drempel voor gratis verzending staan onder **Bedrijf & facturen**.
- **Klanten:** iedereen die bestelde of een Experience boekte, met totaal besteed. Daaronder de **wachtlijst** voor de Experience.
- **Producten:** per geur prijzen, **voorraad per maat** (leeg = onbeperkt, 0 = uitverkocht; betaalde bestellingen boeken automatisch af) en **reviews** per geur.
- **Kortingen:** kortingscodes in procenten of euro, met minimumbedrag, einddatum en maximaal aantal keer.

**Shop:** zoeksuggesties tijdens het typen, raster- of lijstweergave, recent bekeken, tot drie geuren vergelijken, zelf een Discovery Set samenstellen (`/shop#discovery`), uitverkochte maten, sterren uit de reviews. De shop laadt eerst `js/catalog-lite.js` en daarna de volledige catalogus; beide schrijft `tools/parse_catalog.py`.

**Afrekenen:** kortingscode, gratis verzending vanaf de drempel (standaard €75) met "nog €X tot gratis verzending" in de winkelmand.

**Experience:** wachtlijst als er geen plek is, of als geen enkel moment past.

**Talen:** Nederlands, Engels en Arabisch (van rechts naar links) via `js/taal.js` en `js/i18n-data.js`. De keuze staat rechtsboven en blijft bewaard; `?lang=en` of `?lang=ar` in een link zet hem. Geurnoten en geurfamilies worden woord voor woord vertaald. De productomschrijvingen uit de sheet zijn nog alleen Nederlands. Ontbrekende vertalingen vind je met `?i18n=debug` in de console.

**Afbeeldingen:** alle foto's staan ook als WebP, met een kleinere variant van 800 px voor telefoons. Social media-previews (`og:image`) gebruiken nog de JPG.

**Beveiliging:**

- Beveiligingsheaders in `vercel.json` (onder meer Content-Security-Policy, HSTS, X-Frame-Options).
- Inloggen in het dashboard blokkeert na tien foute pogingen per IP-adres een kwartier.
- Limiet per IP-adres op bestellen, boeken, cadeaubonnen en het controleren van kortingscodes, tegen raden en spam.
- Klantinvoer komt nooit als HTML in de meldingsmails aan Angelo.
- Facturen zijn alleen te downloaden met een geldige dashboard-sessie (12 uur geldig).
- De dagelijkse taak draait alleen met het juiste `CRON_SECRET`.

**Vercel Hobby:** maximaal twaalf functies. Er zijn er nu precies twaalf, dus nieuwe functies gaan in een bestaand bestand (zoals de factuurdownload en de dagtaak in `api/admin.js`).

## Parfumolie, productfoto's, zoektermen en vertaalde productteksten (oktober 2026)

- **Parfumolie:** elke geur met een prijs is ook te koop als olie van 6 ml (€9,95) en 13 ml (€14,95). Prijzen en aan/uit staan onder **Bedrijf & facturen**, voorraad per geur onder **Producten** (plekken 4 en 5 in de voorraadlijst). In bestellingen en op de factuur heet de regel "<geur> · parfumolie 6 ml".
- **Productfoto's** staan in `assets/producten/` en zijn gekoppeld in `api/_fotos.json` per doelgroep en maat: dames = crème 30 ml, wit 50 ml, rood 100 ml; heren = donker 30 ml, zwart met zilver 50 en 100 ml; unisex = wit met zwarte dop 30 ml, mat zwart 50 ml, helder met goud 100 ml; olie = gouden dop (dames), zwarte dop (heren en unisex). Andere koppeling? Pas alleen dat bestand aan.
- **Zoektermen per product:** in het dashboard per geur (en bij zelf toegevoegde parfums). Klanten vinden de geur ook op die woorden, bijvoorbeeld de bekende geur waar hij op lijkt. De termen staan niet zichtbaar op de site, alleen als "Zoekterm" in de zoeksuggestie van wie erop zoekt.
- **Vertaalde productteksten:** intro en verhaal van alle 379 geuren staan in het Engels en Arabisch in `api/_vertalingen.json`. `js/i18n-producten.js` (intro's voor shop en geurwijzer) maak je opnieuw met `node tools/vertalingen_bouw.js`. Na een nieuwe export van de sheet of nieuwe producten toont `node tools/vertalingen_ontbrekend.js` welke teksten nog vertaald moeten worden; tot dan staat daar de Nederlandse tekst met een korte melding.

## Dashboard, inzichten, SEO en beveiliging (oktober 2026, ronde 2)

**Dashboard (`/beheer`)**
- **Vandaag** (startscherm): omzet vandaag, 7 en 30 dagen; bestellingen om klaar te maken; Experiences vandaag en morgen; voorraad die bijna op is; afgebroken betalingen en wachtlijst.
- **Inzichten**: bezoeken, conversie, omzet per dag, trechter van bezoek tot betaling, verlaten winkelwagens, afgebroken betalingen, bestsellers, verdeling per maat en olie, kortingscodes, nieuwe en terugkerende klanten, geurwijzer, meest bekeken geuren, waar op gezocht wordt en zoekopdrachten zonder resultaat. Periode 7, 30, 90 dagen of een jaar, met vergelijking met de periode ervoor.
- **Meten zonder cookies**: `js/meet.js` stuurt anonieme tellers naar `POST /api/products` (bezoek per browservenster, product bekeken, winkelmand, afrekenen, zoekwoord, geurwijzer). Geen IP-adressen of persoonsgegevens; zoekwoorden met @ of lange cijferreeksen worden genegeerd. Lokaal wordt niet meegeteld (behalve met `?meet=1`).
- **Bestellingen**: zoeken (naam, e-mail, nummer, geur), filter op status en periode, privénotitie, factuur en pakbon als PDF, export naar Excel.
- **Klanten**: klik op een klant voor alle aankopen, Experiences en een privénotitie; "Gegevens wissen" voor een AVG-verzoek (bestellingen blijven zeven jaar bewaard voor de belasting). Export naar Excel.
- **Producten**: zoektermen zichtbaar als labels, filter "alleen met zoektermen", zoeken op zoekterm, overzicht van alle zoektermen, export van voorraad en prijzen naar Excel.
- **Account & beveiliging**: tweestapsverificatie (authenticator-app met QR-code en acht herstelcodes), wachtwoord wijzigen (minstens 12 tekens; daarna zijn andere apparaten uitgelogd), overal uitloggen, back-up downloaden, logboek van alle handelingen.
- **Op de telefoon**: het dashboard kan als app op het beginscherm (`beheer.webmanifest`).

**Beveiliging, technisch** (`api/_beveiliging.js`)
- Sessietokens bevatten een versienummer; "overal uitloggen" en een nieuw wachtwoord maken oude tokens ongeldig.
- Downloads (factuur, pakbon, exports, back-up) lopen via links die vijf minuten geldig zijn; het inlogtoken staat nooit meer in een URL.
- Elke nacht een back-up in de opslag (`backup:<datum>`, 14 dagen bewaard), naast de handmatige download.
- Optioneel `ADMIN_SECRET` in Vercel: los geheim voor het ondertekenen van sessies (anders `ADMIN_PASSWORD`).

**SEO**
- `/sitemap.xml`, `/robots.txt` en `/feed.xml` komen uit `api/geur.js` en gebruiken automatisch het domein waarop de site draait.
- Productpagina's bestaan in drie talen op de server: `/geur/<slug>`, `?lang=en`, `?lang=ar`, met `hreflang`-verwijzingen. De vertaling gebruikt dezelfde woordenlijst als de browser (`ELIANDI_I18N_KERN` in `js/i18n-data.js`).
- Gestructureerde gegevens per product: prijs per maat, voorraad, verzendkosten NL/BE, reviews en kruimelpad.
- `/feed.xml` is een productfeed voor Google Merchant Center (gratis vermeldingen in Google Shopping): per geur en maat, met foto, prijs en voorraad.
- Zoektermen staan als `<meta name="keywords">` in de productpagina en werken in de zoekfunctie van de site. Google gebruikt meta-keywords niet voor de ranking.
- Bij de overstap naar www.eliandiparfum.com: de `rel="canonical"` in de statische pagina's (index, shop, experience, quiz) nog omzetten naar het nieuwe domein, en het domein aanmelden bij Google Search Console met `/sitemap.xml`.

**Privacy**: `privacy.html`, gelinkt in de voettekst en bij het afrekenen.

## Video's, factuurlogo en extra beveiliging (oktober 2026, ronde 3)

**Video's**
- Opslag: Vercel Blob-store `eliandi-media` (openbaar, regio Parijs), gekoppeld aan het project; sleutel `BLOB_READ_WRITE_TOKEN` staat in Vercel. Video's zijn te groot voor Upstash.
- De browser uploadt rechtstreeks naar Blob (`js/video-upload.js`, met de gebundelde `js/vendor/blob-upload.js` uit `@vercel/blob` 2.8.2). De server (`videoToken` in `api/admin.js`) geeft een sleutel uit die een uur geldig is, voor één bestand, alleen MP4/MOV/WebM en maximaal 200 MB. Van een beeld uit het begin wordt een poster gemaakt (via `mediaUpload`).
- **Bij een geur**: dashboard > Producten > Video toevoegen. Opgeslagen in `cms:product-videos`; op de productpagina een extra miniatuur "Video", plus `VideoObject` in de gestructureerde gegevens.
- **Op de site**: in de bewerkmodus op een foto klikken > Video plaatsen. De video neemt plek, vorm en data-attributen van de foto over, speelt zonder geluid in een lus en alleen als hij in beeld is. Opgeslagen als `videos` in `cms:content:<pagina>`.
- Vervangen of weggehaalde video's worden direct uit Blob verwijderd; de nachtelijke taak ruimt video's op die nergens meer staan en ouder zijn dan een dag (`videosOpruimen`).
- `api/_blob.js` is een gebundelde versie van `@vercel/blob` (geen npm-installatie nodig). Opnieuw bouwen: `esbuild` op `require('@vercel/blob/client').generateClientTokenFromReadWriteToken` en `require('@vercel/blob').{del,list}` met `--platform=node --format=cjs`.

**Wijzigingen in het dashboard live**
- Productpagina's, `/api/products` en `/api/content` sturen browsers altijd naar de nieuwste versie (`Cache-Control: max-age=0, must-revalidate`); alleen Vercel bewaart ze 15 tot 30 seconden (`Vercel-CDN-Cache-Control`). Een wijziging staat dus binnen ongeveer een minuut overal.
- Getest van dashboard naar site: prijs, zoekterm, verbergen (ook uit sitemap), voorraad 0, review, sitetekst, productvideo en sitevideo.
- De nachtelijke back-up nam de sitepagina's niet mee (verkeerde sleutelnaam); dat is hersteld, en de productvideo's gaan nu ook mee.

**Factuur en pakbon**: het logo (goud op zwart, `api/_logo-factuur.jpg`) staat linksboven, als JPEG rechtstreeks in de PDF.

**Beveiliging**
- De site gebruikt geen PHP of WordPress; de Vercel-firewall weigert verzoeken naar typische aanvalspaden (`.php`, `wp-`, `.env`, `.git`, `phpmyadmin` enz.). Regel "Scanners en PHP-aanvallen weren", beheer via `vercel firewall`.
- Verzoeken vanaf een andere website (Origin van een ander domein) mogen niet bestellen, boeken, een bon kopen, afrekenen of inloggen (`vreemdeHerkomst` in `api/_lib.js`).
- Limiet per adres ook op de Discovery Set-checkout; het IP-adres komt uit `x-real-ip` (door Vercel gezet, niet te vervalsen).
- Mail aan Angelo (`MAIL_OWNER`) bij inloggen vanaf een nieuw apparaat of nieuwe plek, en na vijf foute wachtwoorden.
- Geüploade afbeeldingen moeten echt een JPEG, PNG of WebP zijn (controle op de inhoud, niet alleen de naam).
- Extra headers: `Cross-Origin-Opener-Policy`, `object-src 'none'`, `upgrade-insecure-requests`, HSTS twee jaar; `/beheer` mag nergens in een frame en wordt nooit gecachet; `/api/` krijgt `noindex`.
- `/.well-known/security.txt` met het contactadres voor wie een lek vindt.
- Niet beschikbaar op het gratis Hobby-plan van Vercel: rate limiting in de firewall en de OWASP-regelset (Pro). De site heeft wel eigen limieten per adres op inloggen, bestellen, boeken, bonnen en kortingscodes.

**Foto's uploaden in de bewerkmodus (29 oktober 2026)**
- Tot de update van 29 oktober blokkeerde de Content-Security-Policy `blob:`-afbeeldingen, terwijl de bewerkmodus elke foto zo inleest om hem te verkleinen. Daardoor gaf elke upload "Dit bestand kan niet als afbeelding worden gelezen". `img-src` staat nu `blob:` toe.
- iPhone-foto's (HEIC) kan Chrome op Windows niet lezen. Die worden dan in de browser omgezet naar JPEG met `js/vendor/heic-to.js` (heic-to 1.6.6, CSP-versie, LGPL-3.0, alleen geladen bij een HEIC-bestand; vraagt `worker-src 'self' blob:`).
