# Higgsfield-promptset — beeldkaarten Eliandi geurwijzer

Doel: 30 sfeerbeelden voor de antwoordkaarten van de quiz. Elke prompt levert
één beeld op dat wordt opgeslagen als `assets/quiz/<slug>.jpg`. De quiz pakt
ze automatisch op (ontbreekt een bestand, dan toont de kaart een nette
ornament-fallback, dus beelden kunnen in delen worden toegevoegd).

## Specificaties

- Verhouding **4:5 staand**, minimaal 1200 px breed; opslaan als JPG (kwaliteit ~80).
- Model: een fotorealistisch beeldmodel (bijv. Flux of Seedream via de Higgsfield MCP).
- Geen tekst, logo's, watermerken of herkenbare gezichten in beeld.
- Elke prompt eindigt met de vaste stijl-suffix, zodat alle 30 beelden uit
  één wereld komen.

## Vaste stijl-suffix (achter elke prompt plakken)

> , cinematic luxury perfume brand photography, very dark moody scene, deep
> charcoal black shadows, warm golden accent light, soft haze, shallow depth
> of field, rich texture, no text, no people's faces, editorial quality,
> muted colors with gold highlights

## Vraag 2 — momenten (16:10 gevoel, maar genereer 4:5)

| slug | prompt |
|---|---|
| moment-elke-dag | Morning sunlight through linen curtains falling on a minimal dark dresser with a small perfume bottle, quiet start of the day |
| moment-werk | Elegant dark office desk with a fountain pen, closed leather notebook and a subtle glass perfume flacon, discreet refinement |
| moment-avond | Dim candlelit bar table at night, two crystal glasses, city bokeh lights in the background, anticipation of an evening out |
| moment-gelegenheid | Black-tie evening detail: satin fabric, a gold cufflink and a perfume flacon on dark marble, celebration atmosphere |

## Vraag 3 — sferen

| slug | prompt |
|---|---|
| sfeer-haard | Glowing fireplace embers in a dark room, wool blanket over a leather chair, warm golden light flickering |
| sfeer-kust | Dusk over a calm sea, pale linen beach fabric moving in the wind, last low golden sunlight on the water |
| sfeer-metropool | Night skyline seen from a rooftop, neon reflections on wet glass, dark blue night air with warm city glow |
| sfeer-markt | Oriental spice market at dusk, brass lanterns, sacks of saffron and spices, golden smoke drifting through narrow alley |

## Vraag 4 — steden

Stadskaarten tonen het herkenbare stadsicoon zelf (geen parfumflessen),
altijd bij nacht. Let op: het model geeft soms een wit fotokader mee;
controleer de randen en autocrop indien nodig.

| slug | prompt |
|---|---|
| stad-dubai | Burj Khalifa and the Dubai skyline at night rising above golden desert haze, warm city lights glowing, seen from the dark dunes, no people |
| stad-parijs | The Eiffel Tower at night glowing warm gold, seen across dark Parisian zinc rooftops in soft mist, romantic and mysterious, no people |
| stad-amsterdam | Amsterdam canal at night after rain, typical Dutch canal houses with stepped gable facades, low arched brick bridge with warm lantern lights reflecting in the dark canal water, bicycle silhouette |
| stad-milaan | Night photograph of the Duomo di Milano seen from below: hundreds of ornate marble spires glowing warm amber-gold against a pitch black night sky, dramatic upward perspective, no people, no daylight |
| stad-marrakech | Marrakech medina at night: ancient ochre city wall and minaret silhouette under a deep dark blue night sky, warm golden lantern glow rising from narrow alleys, drifting golden haze, no people |
| stad-newyork | Manhattan skyline at night with the Empire State Building, thousands of warm golden windows against a deep dark sky, light mist between the skyscrapers, no people |

## Vraag 5 — noten (still lifes op donker marmer)

| slug | prompt |
|---|---|
| noot-oud | Dark agarwood chips and a smoking wood sliver on black marble, thin ribbon of smoke rising |
| noot-vanille | Vanilla pods and a drizzle of golden caramel on dark stone, warm gourmand still life |
| noot-bloemen | Deep red rose and white jasmine blossoms scattered on black marble with golden rim light |
| noot-fris | Cut bergamot and lime with water droplets and a sprig of mint on dark slate, crisp and cool |
| noot-specerijen | Saffron threads, cinnamon sticks and cardamom pods in small brass bowls on dark stone |
| noot-fruit | Raspberries, sliced peach and pineapple on dark marble, jewel-like glistening fruit |
| noot-musk | Soft powder and pale silk fabric folds on dark stone, intimate skin-like tones, delicate |
| noot-amber | Chunks of glowing amber resin lit from within on black marble, warm golden glow |

## Vraag 7 — seizoenen

| slug | prompt |
|---|---|
| seizoen-lente | Blossom branch with pale pink petals against a dark background, morning light, fresh beginning |
| seizoen-zomer | Golden summer sun flare over a wheat field edge at evening, warm skin-light atmosphere |
| seizoen-herfst | Fallen golden-brown leaves and chestnuts on dark wet wood, autumn mist, warm low light |
| seizoen-winter | Frost crystals on a dark window at night, warm candle glow from inside, cold air meets warmth |

## Vraag 9 — stijlen

| slug | prompt |
|---|---|
| stijl-mysterieus | A dark silk-draped silhouette in shadow, single beam of golden light, enigmatic atmosphere |
| stijl-warm | Hands cupped around a warm glowing light in darkness, soft golden warmth, embracing feeling |
| stijl-elegant | White gloves and a string of pearls on dark velvet, timeless couture detail, refined |
| stijl-gedurfd | A striking gold-dipped thorned rose on black background, dramatic contrast, bold statement |

## Ronde 2 — resterende vragen (zelfde stijl-suffix, 4:5)

Voor de twee personenbeelden: laat de clausule "no people's faces" uit de
suffix weg en stuur op een afgewend of deels beschaduwd gezicht; dat oogt
luxueuzer en blijft consistent met de mysterieuze toon.

| slug | prompt |
|---|---|
| gender-vrouw | Elegant woman in a flowing dark silk gown with delicate gold jewelry, face gracefully turned away in profile, standing in an oriental archway lit by warm lanterns |
| gender-man | Distinguished man in a tailored black suit adjusting a gold cufflink, face half in shadow turned aside, dark oriental architecture with warm golden light |
| gender-verras | Two contrasting perfume flacons side by side on dark marble, golden smoke intertwining above them, mysterious choice |
| zoet-vol | Golden honey dripping slowly from a wooden dipper over dark caramel, luscious indulgent sweetness |
| zoet-zacht | A single white vanilla orchid beside a delicate golden macaron on dark stone, subtle soft sweetness |
| zoet-niet | Dry vetiver roots and charred oak wood pieces on dark slate, austere and elegant, no sweetness |
| aanwezig-subtiel | Fine barely visible perfume mist being sprayed onto an elegant wrist, intimate close-up, soft golden light |
| aanwezig-merkbaar | A soft trail of golden perfume mist drifting through a dark hallway, inviting elegant presence |
| aanwezig-statement | Dramatic dark perfume flacon under a single theatrical spotlight on a dark stage, commanding presence |
| kennis-eerste | One single elegant perfume flacon in soft golden light on dark wood, the beginning of a discovery |
| kennis-paar | Three refined dark perfume bottles arranged on a dark vanity shelf, warm accent lighting |
| kennis-verzamelaar | A wall of many glowing amber perfume bottles in warm golden light, luxurious private collection |

## Ronde 2 — flacon-mockups voor de resultaatkaarten

Vier mockups (`assets/quiz/mockup-fles-<groep>.jpg`), tonen een naamloze
flacon (blanco label, geen tekst) als plaatshouder tot er echte
productfoto's zijn. Basisprompt, wissel alleen de vloeistof/sfeer:

> Luxury rectangular glass perfume bottle with a black cap and a blank
> black label, standing on black marble, professional product photography,
> [VARIANT], cinematic luxury perfume brand photography, very dark moody
> scene, deep charcoal black shadows, warm golden accent light, soft haze,
> rich texture, no text, editorial quality

| slug | VARIANT |
|---|---|
| mockup-fles-amber | deep amber golden liquid, warm golden glow around the bottle |
| mockup-fles-bloemig | soft rosé toned liquid, a few dark red rose petals beside the bottle |
| mockup-fles-fris | pale cool green-gold liquid, hint of mist and citrus zest beside the bottle |
| mockup-fles-donker | very dark oud-toned liquid, thin ribbon of smoke curling behind the bottle |

## Ronde 2 — Discovery Set professioneel (image-to-image)

De echte doos moet herkenbaar blijven: gebruik de bestaande foto's als
referentie (media_upload van `assets/discovery-front.jpg` en
`assets/discovery-open.jpg`) met een model dat `image_references`
ondersteunt (bijv. nano_banana_pro of seedream). Overschrijf daarna de
bestaande bestandsnamen zodat de site niets hoeft te wijzigen.

| doel (bestandsnaam) | prompt bij referentiebeeld |
|---|---|
| assets/discovery-front.jpg | Professional luxury product photograph of this exact black gift box with gold foil ornaments and logo, standing slightly angled on dark marble, warm golden side light, soft haze, deep black background, editorial quality, keep the box design exactly as in the reference |
| assets/discovery-open.jpg | Professional luxury product photograph of this exact open black gift box with five black 10 ml spray vials with gold caps in black velvet, on dark marble with warm golden accent light, deep black background, editorial quality, keep the box and vials exactly as in the reference |

## Werkwijze met de Higgsfield MCP

1. Genereer per rij: `prompt + stijl-suffix`, 4:5 (mockups en Discovery mogen 4:5 of 3:4).
2. Download het beeld en sla het op als `websites/eliandi-website/assets/quiz/<slug>.jpg`
   (Discovery Set: overschrijf de twee bestanden in `assets/`).
3. Herlaad de quiz; de kaart toont het beeld automatisch.
4. Beoordeel per beeld: valt hij uit de toon (te licht, te bont), genereer
   opnieuw; consistentie gaat boven individuele schoonheid.
