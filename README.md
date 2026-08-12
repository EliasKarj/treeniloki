<div align="center">

# 🏃 Treeniloki

**Analysoi juoksutreenisi selaimessa — ilman tilejä, ilman palvelimia, ilman että data poistuu koneeltasi.**

Raahaa GPX-tiedostot sivulle ja saat kuntotrendit, loukkaantumisriskin, sykealueet ja valmennusvinkit.

`ei riippuvuuksia` · `ei build-vaihetta` · `100 % selaimessa` · `Node 22 + npm testeihin`

</div>

---

## Sisältö

- [Pika-aloitus](#pika-aloitus) — miten saat sivun pyörimään paikallisesti
- [Mistä GPX-tiedostot?](#mistä-gpx-tiedostot) — Sports Tracker -export
- [Mitä sivu näyttää](#mitä-sivu-näyttää) — kaikki tulokset selitettynä
- [Perusluvut ja niiden laskenta](#perusluvut-ja-niiden-laskenta)
- [Testit](#testit)
- [Projektin rakenne](#projektin-rakenne)
- [Tietosuoja](#tietosuoja)

Jokaisen laskennan kohdalla on **▸ Miksi näin** -perustelu: mihin raja-arvo perustuu ja
mitä se ei kerro.

---

## Pika-aloitus

Sovellus on pelkkää HTML:ää ja JavaScriptiä. **Ei `npm install`-vaihetta, ei kääntämistä.**
Tarvitset vain paikallisen web-palvelimen.

### 1. Hae projekti koneellesi

```bash
git clone https://github.com/EliasKarj/treeniloki
cd treeniloki
```

### 2. Käynnistä paikallinen palvelin

Valitse **yksi** näistä — kaikki tekevät saman asian:

```bash
python3 -m http.server 8000     # Python (asennettuna useimmiten valmiiksi)
npx serve .                     # Node.js
npx http-server -p 8000         # Node.js, vaihtoehto
php -S localhost:8000           # PHP
```

### 3. Avaa selaimessa

```
http://localhost:8000/index.html
```

Raahaa GPX-tiedostot pudotusalueeseen — analyysi ilmestyy heti. Palvelimen saat suljettua
painamalla `Ctrl+C` terminaalissa.

> [!IMPORTANT]
> **Älä avaa `index.html`-tiedostoa suoraan kaksoisklikkaamalla.** Sivu jää tyhjäksi.
>
> Syy: sovellus käyttää ES-moduuleja (`<script type="module">`), joita selain kieltäytyy
> lataamasta `file://`-osoitteesta tietoturvasyistä (CORS). Osoitteen pitää alkaa
> `http://localhost` — siksi tarvitset yllä olevan palvelimen.

### Ongelmatilanteet

| Oire | Syy ja ratkaisu |
|------|-----------------|
| Sivu on täysin tyhjä | Avasit tiedoston `file://`-osoitteesta. Käynnistä palvelin kohdan 2 mukaan. |
| `Address already in use` | Portti 8000 on varattu. Käytä toista porttia, esim. `python3 -m http.server 8080`. |
| Raahaus ei tee mitään | Tiedostot eivät ole `.gpx`-päätteisiä, tai niistä puuttuu reitti. Ilman GPS-jälkeä olevat treenit ohitetaan. |
| Kaaviot jäävät tyhjiksi | Dataa on liian vähän. Osa laskuista vaatii ≥ 3 treeniä, VO₂max ≥ 3 km:n lenkkejä. |
| `python3: command not found` | Kokeile `python -m http.server 8000` tai Node-vaihtoehtoa `npx serve .`. |

---

## Mistä GPX-tiedostot?

Sports Trackerissa ei ole joukkovientiä. Repo sisältää konsoliskriptin, joka lataa koko
treenihistoriasi GPX-tiedostoina yhtenä zip-pakettina — käyttäen olemassa olevaa
kirjautumistasi, ei salasanaa.

1. Kirjaudu sisään osoitteessa <https://www.sports-tracker.com>
2. Avaa selaimen kehittäjätyökalut → **Console** (`F12`)
3. Liitä koko `tools/sports-tracker-export.js`-tiedoston sisältö ja paina Enter
4. Seuraa etenemistä lokista — `sports-tracker-export-YYYY-MM-DD.zip` latautuu lopuksi
5. Pura zip ja raahaa GPX-tiedostot Treenilokin pudotusalueeseen

Tiedostot nimetään muotoon `YYYY-MM-DD_<laji>_<workoutKey>.gpx`. Ilman GPS-reittiä olevat
treenit (käsin lisätyt, sisäjuoksut) ohitetaan. Yhteenveto tulostaa löydetyt `activityId`:t —
voit lisätä ne skriptin `ACTIVITY_NAMES`-listaan saadaksesi selkeämmät lajinimet.

### Jos ajo katkeaa kesken

Yksittäiset GPX-haut yrittävät automaattisesti uudelleen verkkovirheen sattuessa (3 yritystä,
kasvava odotus), eikä yksi epäonnistunut treeni enää kaada koko ajoa. Jos koko ajo silti
pysähtyy — esimerkiksi kone meni lepotilaan — katso viimeinen tulostettu numero ja jatka siitä:

```js
window.TREENI_RESUME_FROM = 414;   // liitä sitten skripti uudelleen
```

Syntyvä zip sisältää tällöin vain loput treenit. Pura molemmat zipit samaan kansioon —
tiedostonimet ovat treenikohtaisia, joten mikään ei mene päällekkäin.

> **▸ Miksi uudelleenyritys vain verkkovirheelle?** Siisti HTTP-vastaus (404, 403) on
> palvelimen todellinen vastaus — sen uudelleenyrittäminen tuottaisi saman tuloksen ja
> hidastaisi ajoa turhaan. Poikkeuksena lentävä `fetch` sen sijaan tarkoittaa katkennutta
> yhteyttä, joka usein korjaantuu itsestään sekunneissa.

---

## Mitä sivu näyttää

Kaikki alla oleva lasketaan pudottamistasi GPX-tiedostoista. Mitään ei lähetetä minnekään.

### Tilannearvio — palkki sivun yläreunassa

Yhden rivin yhteenveto: **kuntosuunta** ja **loukkaantumisriski**.

| Osa | Miten se määräytyy |
|-----|--------------------|
| ↑ Kunto nousussa | Tahdin trendi paranee (regressiokerroin < −0,005 min/km/vrk) |
| → Kunto vakaa | Trendi on nollan tuntumassa |
| ↓ Kunto laskussa | Tahti hidastuu (kerroin > 0,005) |
| Riski **korkea** | Iso matkahyppäys (>30 %) **tai** kuormasuhde ACWR > 1,5 |
| Riski **kohonnut** | Kohtalainen hyppäys (>10 %) **tai** ACWR > 1,3 |
| Riski **matala** | Ei kumpaakaan yllä olevista |

Alle 3 treenillä palkki näyttää vain "Kerää lisää dataa".

> **▸ Miksi näin:** Raja 0,005 min/km/vrk vastaa noin 9 sekuntia kilometriltä kuukaudessa —
> tarpeeksi iso muutos ollakseen todellinen eikä GPS- tai päiväkohtaista kohinaa. Nollan
> ympärille jätetty kuollut alue estää palkkia heilumasta "nousussa" ja "laskussa" välillä
> joka lenkin jälkeen. Kolmen treenin alaraja on siksi, että kahden pisteen läpi kulkeva
> suora ei ole trendi vaan pelkkä viiva. Riski otetaan **kahden eri mekanismin** pahimmasta:
> yksittäinen ylipitkä lenkki (äkillinen kudosrasitus) ja kokonaiskuorman nopea nousu
> (kumulatiivinen rasitus) ovat eri asioita, ja kumpi tahansa yksinään riittää nostamaan riskiä.

### Välilehti: Yleiskuva

**Tavoitepainikkeet** — *Nopeus · Kestävyys · Rasvanpoltto · Loukkaantumissuoja*.
Valinta ei muuta lukuja, vaan **järjestää valmennusvinkit** tavoitteesi kannalta
tärkeimmät ensin (esim. Loukkaantumissuoja nostaa hyppäys- ja kuormavinkit kärkeen).

> **▸ Miksi vain järjestys muuttuu:** fysiologia ei muutu tavoitteen mukaan — sama treeni
> tuottaa saman kuorman riippumatta siitä, mitä tavoittelet. Vain se muuttuu, mitkä
> havainnot ovat sinulle juuri nyt tärkeimpiä. Lukujen muuttaminen tavoitteen mukaan
> antaisi harhaanjohtavan vaikutelman siitä, että mittaus itsessään olisi tavoitesidonnainen.

**Valmennusvinkit** — automaattisesti johdetut huomiot, vasemmasta reunasta väreillä
porrastettuna: punainen = hälytys, oranssi = varoitus, turkoosi = tiedoksi. Vinkkejä syntyy
matkahyppäyksistä (sisältää konkreettisen km-katon seuraavalle pitkälle), kuormasuhteesta,
tauon jälkeisestä paluusta, 80/20-jakaumasta, tahtitrendistä ja VO₂max-suunnasta.

**Avainluvut**

| Luku | Selitys |
|------|---------|
| **Kestävyyskunto** (VO₂max) | Tuorein viikoittainen VO₂max-arvio (ks. laskenta alempana) |
| **Kokonaismatka** | Kaikkien treenien yhteispituus kilometreinä |
| **Ka. tahti** | Kokonaisaika ÷ kokonaismatka, muodossa `min:sek` per km |
| **Lenkkejä / vk** | Treenitiheys **aktiivisilta jaksoilta** — yli 14 vrk:n tauot jätetään laskusta pois |

> **▸ Miksi tauot jätetään tiheydestä pois:** jos juoksit vuoden ajan 3 kertaa viikossa, pidit
> 3 kuukauden tauon ja jatkoit, koko kalenteriajalla jakaminen antaisi noin 2,3 lenkkiä
> viikossa — luku, jota et ole koskaan elänyt. Kysymys "kuinka usein juoksen kun juoksen" on
> valmennuksellisesti hyödyllisempi kuin "kuinka monta lenkkiä kalenterivuodessa". Tauon
> vaikutus raportoidaan erikseen omassa kortissaan, joten tieto ei katoa.
>
> **▸ Miksi keskitahti lasketaan kokonaisuuksista:** summa ÷ summa painottaa automaattisesti
> pitkiä lenkkejä. Yksittäisten tahtien keskiarvo antaisi 2 km:n hölkälle saman painon kuin
> 30 km:n pitkälle, mikä vääristäisi kuvaa tyypillisestä vauhdistasi.

### Välilehti: Kehitys

| Kaavio | Mitä siinä on |
|--------|---------------|
| **Matka / aika** | Pylväs jokaisesta treenistä. **Oranssi pylväs = merkitty matkahyppäys.** Katkoviiva on lineaarinen trendi, ja otsikko kertoo suunnan muodossa `km/kk`. |
| **Tahti** | Viiva min/km. Huom: **ylöspäin = hitaampi.** Laskeva viiva on siis hyvä uutinen. |
| **Kestävyyskunto** | VO₂max-arvion kehitys. Vaatii vähintään kaksi ≥ 3 km:n suoritusta, muuten näyttää huomautuksen. |

> **▸ Miksi tahtiakselia ei käännetä ympäri:** min/km on käänteinen mittari — pienempi on
> parempi. Akselin kääntäminen tekisi kaaviosta intuitiivisemman, mutta arvot eivät enää
> vastaisi taulukon lukuja, mikä on omiaan aiheuttamaan lukuvirheitä. Suunta kerrotaan siksi
> otsikossa sanallisesti.

### Välilehti: Terveys & riski

#### Iso matkahyppäys

Vertaa jokaista lenkkiä **edeltävän 30 vrk:n pisimpään** lenkkiin.

| Merkintä | Raja | Tulkinta |
|----------|------|----------|
| `KORKEA` | yli **+30 %** | Iso yksittäinen hyppäys nostaa rasitusvammariskiä |
| `KOHONNUT` | yli **+10 %** | Matka nousi reippaasti |
| `OK` | alle +10 % | Ei merkittävää hyppäystä |

Tauon jälkeiset **kaksi ensimmäistä lenkkiä ohitetaan** merkinnästä.

> **▸ Miksi vertailukohtana on pisin eikä keskiarvo:** kudosten — jänteiden, luuston,
> sidekudoksen — sietokyvyn yksittäiselle pitkälle suoritukselle määrää pisin matka, johon ne
> ovat viime aikoina tottuneet, ei keskimääräinen lenkki. Jos olet juossut 20 kertaa 5 km ja
> kerran 15 km, 16 km ei ole sinulle vieras rasitus, vaikka keskiarvoosi nähden se olisi
> kolminkertainen.
>
> **▸ Miksi 30 vrk:** rasitusvammojen kannalta olennainen sidekudoksen adaptaatio tapahtuu
> viikoissa, ei päivissä. Lyhyempi ikkuna unohtaisi kuukauden takaisen pitkän lenkin, jonka
> vaikutus on yhä olemassa; huomattavasti pidempi ikkuna taas antaisi puolen vuoden takaiselle
> maratonille painoarvon, jota sillä ei enää ole.
>
> **▸ Miksi +10 % ja +30 %:** +10 % on juoksuvalmennuksen klassinen nyrkkisääntö
> volyymin nostotahdista, ja se toimii tässä ensimmäisenä huomiorajana. +30 % on selvästi sen
> yli menevä hyppäys, jota ei voi selittää normaalilla progressiolla. Molemmat ovat
> nyrkkisääntöjä, eivät kynnysarvoja, joiden alapuolella olisi turvallista ja yläpuolella
> vaarallista.
>
> **▸ Miksi tauon jälkeen ohitetaan kaksi lenkkiä:** tauon jälkeen 30 vrk:n vertailuikkuna on
> tyhjä tai vanhentunut, joten *mikä tahansa* paluulenkki näyttää valtavalta hyppäykseltä.
> Se olisi väärä hälytys, joka peittäisi todelliset hyppäykset alleen. Kaksi lenkkiä riittää
> täyttämään ikkunan uudelleen, ja tauon todellinen merkitys kerrotaan sen omassa kortissa.

#### Kuormasuhde (ACWR)

Viime viikon kuorma jaettuna tavanomaisella viikkokuormalla:

```
kuorma per treeni = matka_km × (1 + nousumetrit / 500)
ACWR = (7 vrk:n kuorma) ÷ (28 vrk:n kuorma ÷ 4)
```

| Arvo | Tulkinta |
|------|----------|
| yli **1,5** | Kuorma noussut nopeasti — harkitse kevennysviikkoa |
| **0,8–1,5** | Kuorma tasapainossa |
| alle **0,8** | Kuorma matala — tilaa lisätä maltilla |

> **▸ Miksi suhdeluku eikä absoluuttinen kuorma:** 60 km viikossa on eri asia maratoonarille
> ja aloittelijalle. Kuormaa kannattaa siksi verrata siihen, mihin *sinä* olet tottunut, ei
> mihinkään yleiseen tasoon. Nimittäjä (28 vrk ÷ 4) on tavanomainen viikkosi, osoittaja
> viimeisin viikko.
>
> **▸ Miksi 7 ja 28 vrk:** viikko on juoksun luonnollinen sykli, ja neljä viikkoa on lyhin
> jakso, joka tasoittaa yksittäisen kevennys- tai kilpailuviikon vaikutuksen pois
> vertailutasosta.
>
> **▸ Miksi nousumetrit kertoimena:** mäkinen 10 km rasittaa selvästi enemmän kuin tasainen
> 10 km, mutta pelkkä matka ei erota niitä. Jakaja 500 tarkoittaa, että 500 nousumetriä
> kaksinkertaistaa lenkin kuorman. Kyseessä on karkea approksimaatio — tarkempi malli vaatisi
> sykkeen tai koetun rasituksen jokaiselta treeniltä, eikä sitä ole GPX:ssä luotettavasti.
>
> **▸ Rehellinen varaus:** ACWR on urheilutieteessä **kiistelty** mittari. Alkuperäisiä
> tuloksia on kritisoitu tilastollisista artefakteista, ja sen ennustearvo yksilötasolla on
> heikko. Se on tässä mukana suuntaa antavana muutosnopeuden mittarina, ei loukkaantumisen
> ennustajana — ja siksi se vaikuttaa riskiarvioon vain yhdessä matkahyppäyksen kanssa.

#### Tauon vaikutus

Etsii vähintään **14 vrk:n** tauot ja kertoo, montako lenkkiä paluun jälkeen kesti päästä
takaisin taukoa edeltäneiden **kolmen** lenkin keskitahtiin. Mukana on kuntotason konteksti
tauon pituuden mukaan:

| Tauko | Odotettavissa |
|-------|---------------|
| 14–20 vrk | Pieni notkahdus tahtiin — fysiologisesti normaalia |
| 21–41 vrk | Noin 6–7 % VO₂max-lasku — normaalia, ei merkki virheestä |
| 42–62 vrk | Kunto laskenut selvästi, palautuu rakenteellisella paluulla |
| 63+ vrk | Jopa ~20 % VO₂max-lasku on tässä kohtaa normaalia |

> **▸ Miksi raja on 14 vrk:** mitattava detraining-vaikutus alkaa näkyä noin kahden viikon
> täydellisen tauon jälkeen. Sitä lyhyemmät katkot — loma, flunssa, kiireinen työviikko —
> kuuluvat normaaliin treenirytmiin, eikä niitä ole syytä nostaa erikseen esiin.
>
> **▸ Miksi kolmen lenkin keskiarvo vertailukohtana:** yksittäinen taukoa edeltänyt lenkki voi
> olla kilpailu tai palauttava hölkkä, jolloin vertailu vääristyy kumpaankin suuntaan. Kolme
> lenkkiä antaa vakaan lähtötason ulottumatta kuitenkaan niin kauas taaksepäin, että
> vertailtaisiin jo eri kuntokauteen.
>
> **▸ Miksi sanamuodot ovat rauhoittavia:** kunnon lasku tauon aikana on fysiologinen
> väistämättömyys, ei merkki epäonnistumisesta. Tekstit kertovat mitä on **odotettavissa**,
> jotta normaali notkahdus ei johda ylikompensointiin — joka on itsessään
> loukkaantumisriski. Prosenttiluvut ovat kirjallisuuden suuruusluokkia, eivät sinulle
> mitattuja arvoja.

#### Helppo–kova-jakauma (80/20)

Viimeisten **28 vrk:n** treenit jaettuna **kestolla painotettuna** helppoon, keskitehoiseen ja
kovaan. Luokittelu tehdään **sykealueen** perusteella jos sykedataa on (alueet 1–2 = helppo,
3 = keski, 4–5 = kova); muuten tahdin perusteella suhteessa jakson mediaanitahtiin
(yli 5 % hitaampi = helppo, yli 5 % nopeampi = kova).

Tulos ratkaistaan tässä järjestyksessä — ensimmäinen täyttyvä ehto voittaa:

| Tulos | Ehto | Viesti |
|-------|------|--------|
| Kovaa on paljon | kovaa > 25 % | Lisää helppoja lenkkejä palautumiseen |
| Liikaa keskitehoa | keskitehoa ≥ 35 % | Polarisoi: helpot helpommaksi, kovat kovemmaksi |
| Jakauma kunnossa | helppoa ≥ 75 % | ~80/20 toteutuu |

Jos mikään ehto ei täyty — helppoa on alle 75 % ilman että keski tai kova ylittää rajansa —
tulos on "liikaa keskitehoa", koska loppuosa ajasta on tällöin väistämättä harmaalla alueella.

> **▸ Miksi 80/20:** kestävyysurheilun tutkimuksessa (mm. Seilerin työ polarisoidusta
> harjoittelusta) huippukestävyysurheilijat viettävät johdonmukaisesti noin 80 % harjoitusajastaan
> matalalla teholla ja vain noin 20 % kovalla. Helppo volyymi kehittää aerobista pohjaa ilman
> palautumisvelkaa, jolloin kovat harjoitukset voidaan tehdä aidosti kovaa.
>
> **▸ Miksi "liikaa keskitehoa" on oma varoituksensa:** harmaa vyöhyke on kuntoilijan
> tyypillisin virhe — jokainen lenkki juostaan "reippaasti". Se on liian kovaa palautuakseen
> kunnolla ja liian kevyttä tuottaakseen kovan harjoituksen ärsykettä, joten se kerää väsymystä
> ilman vastaavaa kehitystä.
>
> **▸ Miksi kesto eikä lenkkien lukumäärä:** kahden tunnin peruslenkki ja 20 minuutin
> intervalliosuus eivät ole yhtä suuria panoksia jakaumaan. Lukumääräpohjainen laskenta
> yliarvioisi lyhyet kovat treenit rajusti.
>
> **▸ Miksi syke ensisijaisesti, tahti varalla:** syke kuvaa **sisäistä** kuormaa — sitä mitä
> keho oikeasti kokee. Tahti on **ulkoinen** suure, jota mäet, vastatuuli, helle ja alusta
> vääristävät: sama 5:30/km voi olla helppo tasamaalla ja kova mäessä. Tahtia käytetään vain
> kun sykedataa ei ole.
>
> **▸ Miksi ±5 % omasta mediaanitahdista:** ilman sykettä ei ole absoluuttista ankkuria, joten
> vertailukohdaksi otetaan sinun oma tyypillinen vauhtisi. Mediaani kestää yksittäiset
> poikkeamat keskiarvoa paremmin. ±5 % on riittävän leveä absorboimaan GPS- ja
> maastovaihtelun, mutta kapea erottamaan aidosti helpon aidosti kovasta.
>
> **▸ Miksi 28 vrk:** neljä viikkoa vastaa tyypillistä harjoitusjaksoa — pitkä tarpeeksi
> tasoittamaan yksittäisen poikkeavan viikon, lyhyt tarpeeksi kuvaamaan nykytilaa eikä
> menneen kauden tottumuksia.

#### Sykealueet

Näkyy vain jos GPX-tiedostoissa on sykedataa. Alueet lasketaan osuutena **datassa havaitusta
maksimisykkeestä** (ei iän perusteella):

| Alue | Osuus maksimista |
|------|------------------|
| Z1 | alle 60 % |
| Z2 | 60–70 % |
| Z3 | 70–80 % |
| Z4 | 80–90 % |
| Z5 | yli 90 % |

Palkki näyttää ajan jakautumisen alueittain sekä helppo/keski/kova-prosentit.

> **▸ Miksi havaittu maksimi eikä 220 − ikä:** kaavan 220 − ikä hajonta on luokkaa 10–12
> lyöntiä minuutissa, eli se osuu suurella osalla ihmisistä selvästi väärin — ja virhe siirtää
> kaikkia alueita kerralla. Omasta datastasi havaittu korkein syke on ainakin *todella
> tapahtunut*, joten se on rehellisempi lähtökohta. Sovellus ei myöskään kysy ikääsi, mikä
> pitää sen datattomana.
>
> **▸ Varaus:** jos et ole koskaan juossut kovaa mittarin kanssa, havaittu maksimi jää alle
> todellisen, jolloin kaikki alueet näyttävät liian kovilta. Luku on merkitty arvioksi
> nimenomaan tästä syystä.
>
> **▸ Miksi aika lasketaan pisteväleistä:** GPS-pisteiden aikaväli ei ole vakio. Laskemalla
> jokaisen peräkkäisen pisteparin todellinen kesto ja kirjaamalla se alkupisteen alueelle,
> tulos on oikea myös silloin kun tallennustiheys vaihtelee kesken lenkin.

### Välilehti: Treenit

Taulukko kaikista treeneistä, uusin ylimpänä: päivä, nimi, matka, tahti, nousumetrit ja
huomautus (`✓` = ei hyppäystä, `▲`/`⚠` = matkahyppäys prosentteineen, tai "tauon jälkeen").

> **▸ Miksi uusin ylimpänä:** viimeisimmät treenit ovat ne, joiden perusteella seuraava
> päätös tehdään. Taulukko ei myöskään vaadi vieritystä loppuun ollakseen hyödyllinen.

---

## Perusluvut ja niiden laskenta

| Suure | Laskutapa |
|-------|-----------|
| **Matka** | Haversine-etäisyys peräkkäisten GPS-pisteiden välillä, summattuna |
| **Kesto** | Viimeisen ja ensimmäisen pisteen aikaleiman erotus |
| **Nousumetrit** | Peräkkäisten pisteiden korkeuserot, vain yli **0,3 m** nousut summataan |
| **Tahti** | Kesto ÷ matka, minuuttia per kilometri |
| **Trendit** | Pienimmän neliösumman regressiokerroin **päivien** suhteen (yksikkö / vrk) |

> **▸ Miksi haversine:** GPS antaa pisteet pallokoordinaatteina, ja haversine on niiden välinen
> isoympyräetäisyys. Lyhyillä väleillä se on käytännössä tarkka, ja polun pituus saadaan
> summaamalla. Matkaa ei lueta GPX:n omista kenttistä, koska niitä ei ole standardissa
> luotettavasti — laskenta pisteistä toimii kaikilla laitteilla samalla tavalla.
>
> **▸ Miksi 0,3 m:n kynnys nousumetreissä:** GPS:n ja barometrin korkeuslukema heilahtelee
> muutamia kymmenesosia metriä myös paikallaan seistessä. Ilman kynnystä jokainen positiivinen
> heilahdus summautuisi, ja tuhansien pisteiden lenkillä kertyisi satoja metrejä olematonta
> nousua. 0,3 m suodattaa kohinan pois säilyttäen todelliset nousut.
>
> **▸ Miksi kesto on kulunut aika:** ensimmäisen ja viimeisen pisteen erotus on yksiselitteinen
> ja toimii kaikilla tiedostoilla. **Huomaa varaus:** tauot eivät vähene siitä, joten pitkän
> kahvitauon sisältävä lenkki näyttää hitaammalta kuin se oli. Tahti on siis "kulunut tahti",
> ei "liiketahti".
>
> **▸ Miksi trendi lasketaan päiviä eikä lenkin järjestysnumeroa vastaan:** jos juokset yhtenä
> viikkona viisi kertaa ja seuraavana kerran, järjestysnumeropohjainen regressio antaisi
> tiiviille viikolle liikaa painoa ja vääristäisi ajan suhteen mitattua kehitystä.
> Päiväpohjaisuus pitää aika-akselin oikeana.
>
> **▸ Miksi pienin neliösumma:** se käyttää kaikkia havaintoja, toisin kuin
> ensimmäisen ja viimeisen lenkin vertailu, jossa yksi poikkeava suoritus kummassa tahansa
> päässä kääntäisi koko johtopäätöksen.

### VO₂max-arvio

Käyttää Danielsin kaavoja: ensin hapenkulutus juoksuvauhdista, sitten se osuus maksimista,
jota kyseisen kestoinen suoritus edellyttää.

```
vo2  = −4,60 + 0,182258·v + 0,000104·v²          v = nopeus m/min
pct  = 0,8 + 0,1894393·e^(−0,012778·t) + 0,2989558·e^(−0,1932605·t)     t = kesto min
VO₂max ≈ vo2 / pct
```

Jokaiselta 7 vrk:n jaksolta valitaan **nopein vähintään 3 km:n suoritus**, ja tuorein näistä
näytetään avainlukuna.

> **▸ Miksi Daniels:** juoksun hapenkulutus tietyllä nopeudella on hyvin mallinnettu, ja
> ylläpidettävä osuus maksimista laskee kestoa vastaan ennustettavasti. Yhdessä nämä antavat
> kenttäsuorituksesta VO₂max-vastineen ilman laboratoriota. Kyseessä on **arvio**, ei mittaus.
>
> **▸ Miksi vähintään 3 km:** lyhyemmässä suorituksessa lähdöt, pysähdykset, liikennevalot ja
> vauhdinjaon epätasaisuus dominoivat lopputulosta liikaa. Kaava olettaa tasaisen, ylläpidetyn
> tehon, eikä lyhyt lenkki täytä sitä oletusta.
>
> **▸ Miksi nopein per viikko eikä joka lenkki:** kaava olettaa lähes maksimaalista
> suoritusta. Palauttava hölkkä tuottaisi absurdin matalan "VO₂max-arvon", ja jokaisen lenkin
> piirtäminen tekisi kuvaajasta lukukelvottoman sahalaidan. Viikon paras suoritus on
> järkevä approksimaatio "mihin pystyin tuolla viikolla", ja se antaa vertailukelpoisen
> aikasarjan.
>
> **▸ Varaus:** koska arvio nojaa parhaaseen suoritukseen, se laskee näennäisesti kevyellä
> viikolla, vaikka kunto ei olisi laskenut. Lue trendiä useamman viikon yli, älä yksittäisen
> pisteen muutoksesta.

### GPX-jäsennys

Jäsennin lukee `<trkpt>`-pisteet säännöllisillä lausekkeilla ja poimii sijainnin, korkeuden,
aikaleiman ja sykkeen (myös nimiavaruudellisista `gpxtpx:hr`-muodoista). Piste ilman
aikaleimaa ohitetaan, ja alle kahden pisteen tiedosto hylätään kokonaan.

> **▸ Miksi regex eikä DOMParser:** `DOMParser` on olemassa vain selaimessa. Regex-pohjainen
> jäsennin toimii sellaisenaan sekä selaimessa että Nodessa, joten sama koodi voidaan
> yksikkötestata CI:ssä ilman erillistä XML-riippuvuutta tai selainsimulaatiota. GPX on
> tarpeeksi säännönmukainen, että tämä on turvallista.
>
> **▸ Miksi aikaleima on pakollinen:** ilman aikaa ei voi laskea kestoa, tahtia eikä
> sykealueiden aikajakaumaa. Sijainti yksinään ei riitä mihinkään sovelluksen laskennoista.

---

## Testit

Testit vaativat **Node.js 22+**. Riippuvuuksia ei tarvitse asentaa — kaikki käyttää Nodeen
sisäänrakennettua `node:test`-kirjastoa.

```bash
npm test              # koko testisarja, 170 testiä
npm run test:watch    # ajaa uudelleen kun tiedostot muuttuvat
npm run test:coverage # kattavuus + kynnysarvot (kaatuu jos alle 90 %)
```

### Mitä testataan

| Testitiedosto | Kohde | Testejä |
|---------------|-------|---------|
| `test/workout · aggregate · breaks · spikeRisk · trainingLoad · detraining · intensity · hrZones · vo2max · goals · coaching · verdict · gpx` | Analyysimoduulit yksitellen | 58 |
| `test/edges.test.mjs` | Raja-arvot ja poikkeustilanteet — jokainen kynnys molemmilta puolilta | 38 |
| `test/render.test.mjs` | `app/render/*` — kortit, taulukko, kaaviot, tavoitepainikkeet | 23 |
| `test/pipeline.test.mjs` | Koko putki GPX-tekstistä valmiiseen malliin | 13 |
| `test/interaction.test.mjs` | Tiedostojen pudotus, välilehdet, tavoitteen vaihto | 8 |
| `test/assets.test.mjs` | `index.html`:n viittaukset ja moduuliverkko | 7 |
| `tools/sports-tracker-export.test.js` | Export-skripti: uudelleenyritys, jatkaminen, virheensieto | 23 |

Kattavuus lähdekoodista: **rivit 94 %, haaraumat 94 %, funktiot 96 %**. Kattamatta jää
export-skriptin selainliima (JSZip-lataus ja tiedoston tallennus), jota ei voi ajaa Nodessa.

> **▸ Miksi laskenta on eriytetty piirtämisestä:** `src/analysis/`-moduulit ovat puhtaita
> funktioita ilman DOM-riippuvuuksia, joten jokainen raja-arvo yllä on testattavissa
> suoraan Nodessa ilman selainta. Piirtokerros `app/render/` vain esittää valmiin mallin.
> Tämän rajan säilyminen on itsessään testattu: `assets.test.mjs` kaatuu, jos jokin
> `src/`-moduuli alkaa koskea `document`- tai `window`-olioon.
>
> **▸ Miksi DOM-stub eikä jsdom:** projektin lupaus on nolla riippuvuutta. `test/helpers/dom.mjs`
> toteuttaa käsin juuri ne DOM-rajapinnat joita `app/` oikeasti käyttää — mitään muuta se ei
> osaa, jolloin testaamaton DOM-kutsu kaatuu näkyvästi sen sijaan että menisi läpi liian
> kyvykästä jäljitelmää vasten.
>
> **▸ Miksi päästä päähän -testit yksikkötestien lisäksi:** jokainen moduuli voi läpäistä omat
> testinsä käsin kirjoitettua mallia vasten, ja silti kenttä voi olla nimetty uudelleen
> moduulien välillä. `pipeline.test.mjs` importoi `app/main.mjs`:n itsensä, joten sovelluksen
> oma johdotus on se mitä testataan.

### CI

`.github/workflows/ci.yml` ajaa kolme työtä jokaisesta pushista ja pull requestista:

| Työ | Sisältö |
|-----|---------|
| **Testit** | Koko sarja Node 22:lla ja 24:llä rinnakkain |
| **Kattavuus** | Sama sarja kynnysarvoilla — alle 90 % kaataa buildin |
| **Julkaisu** | GitHub Pages, vain `main`-haarasta ja vasta kun molemmat yllä ovat vihreitä |

---

## Projektin rakenne

```
index.html              Sivun runko: pudotusalue, välilehdet, ohjeet
app/
  main.mjs              Tiedostojen luku, näkymämallin kokoaminen, välilehtien logiikka
  styles.css            Ulkoasu
  render/               Piirtokerros — verdict, overview, charts, health, table
src/
  parse/gpx.mjs         GPX-jäsennin (regex-pohjainen, toimii sekä selaimessa että Nodessa)
  analysis/             Puhdas laskentalogiikka, ei DOM-riippuvuuksia
    workout.mjs           matka, kesto, nousu, tahti
    aggregate.mjs         kokonaissummat ja keskiarvot
    breaks.mjs            tauot, trendit, paluuanalyysi, treenitiheys
    spikeRisk.mjs         matkahyppäysten tunnistus
    trainingLoad.mjs      ACWR-kuormasuhde
    detraining.mjs        tauon kuntovaikutuksen sanallistus
    intensity.mjs         80/20-jakauma
    hrZones.mjs           sykealueet
    vo2max.mjs            VO₂max-arvio (Daniels)
    verdict.mjs           yläpalkin tilannearvio
    coaching.mjs          valmennusvinkkien johtaminen
    goals.mjs             tavoitteet ja vinkkien painotus
test/                   Analyysimoduulien testit
tools/                  Sports Tracker -export-skripti ja sen testit
docs/                   Suunnitelmat ja tekniset speksit
```

---

## Tietosuoja

- **GPX-tiedostot luetaan selaimessa** — niitä ei ladata mihinkään palvelimelle.
- **Export-skripti** lukee vain Sports Trackerin sessiotunnisteen `localStorage`-muistista
  ajon ajaksi ja hakee ainoastaan omia treenejäsi. Mitään ei lähetetä ulkopuolelle.
- Halutessasi voit kirjautua ulos ja takaisin sisään ajon jälkeen vaihtaaksesi sessiotunnisteen.
- Ainoa ulkoinen lataus on JSZip-kirjasto CDN:stä zip-paketin luomiseksi export-vaiheessa.

---

## Vastuuvapauslauseke

Treeniloki on harjoittelun seurantatyökalu, ei lääketieteellinen laite. Riskiarviot,
VO₂max-luvut ja valmennusvinkit ovat kirjallisuuteen perustuvia arvioita omasta datastasi,
eivät diagnooseja. Kipu, vamma tai terveyshuoli kuuluu ammattilaiselle riippumatta siitä,
mitä tämä sivu näyttää.

---

## Lisenssi

2026 EliasKarj. Katso [LICENSE](./LICENSE).
