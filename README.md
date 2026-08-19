<div align="center">

# 🏃 Treeniloki

**Analysoi juoksutreenisi selaimessa — ilman tilejä, ilman palvelimia, ilman että data poistuu koneeltasi.**

Raahaa GPX-tiedostot sivulle ja saat kuntotrendit, loukkaantumisriskin, sykealueet ja valmennusvinkit.

### [→ Avaa Treeniloki](https://eliaskarj.github.io/treeniloki/) · [Vie treenit Sports Trackerista](https://eliaskarj.github.io/treeniloki/export.html)

`ei asennusta` · `ei tilejä` · `ei riippuvuuksia` · `100 % selaimessa`

</div>

---

## Sisältö

- [Käyttöönotto](#käyttöönotto) — toimii selaimessa, mitään ei tarvitse asentaa
- [Mistä GPX-tiedostot?](#mistä-gpx-tiedostot) — Sports Tracker -vienti
- [Mitä sivu näyttää](#mitä-sivu-näyttää) — kaikki tulokset selitettynä
- [Perusluvut ja niiden laskenta](#perusluvut-ja-niiden-laskenta)
- [Paikallinen ajo ja kehitys](#paikallinen-ajo-ja-kehitys)
- [Testit](#testit)
- [Projektin rakenne](#projektin-rakenne)
- [Vihamielinen syöte](#vihamielinen-syöte)
- [Tietosuoja](#tietosuoja)

Jokaisen laskennan kohdalla on **▸ Miksi näin** -perustelu: mihin raja-arvo perustuu ja
mitä se ei kerro.

---

## Käyttöönotto

Treeniloki on julkaistu GitHub Pagesiin. **Mitään ei tarvitse asentaa, kloonata eikä
kirjautua** — avaa vain osoite selaimessa.

| Sivu | Osoite | Mihin |
|------|--------|-------|
| **Analyysi** | [eliaskarj.github.io/treeniloki](https://eliaskarj.github.io/treeniloki/) | Raahaa GPX-tiedostot ja katso tulokset |
| **Vienti** | […/export.html](https://eliaskarj.github.io/treeniloki/export.html) | Hae treenit Sports Trackerista |

### Ensimmäinen käyttökerta

1. Avaa **[vientisivu](https://eliaskarj.github.io/treeniloki/export.html)** ja raahaa painike
   kirjanmerkkipalkkiin *(vain kerran — sivulla on havainnekuvat)*
2. Kirjaudu [sports-tracker.com](https://www.sports-tracker.com)iin, klikkaa kirjanmerkkiä ja
   valitse muoto — *Kevyt* antaa yhden pienen tiedoston, *GPX* alkuperäiset
3. Avaa **[analyysisivu](https://eliaskarj.github.io/treeniloki/)** ja raahaa saamasi tiedosto
   tai tiedostot pudotusalueeseen

Seuraavilla kerroilla riittää kohta 2 uusien treenien hakemiseen ja kohta 3.

> **▸ Miksi pelkkä Pages riittää:** sovelluksessa ei ole palvelinpuolta lainkaan. GPX-tiedostot
> luetaan ja analysoidaan selaimessasi JavaScriptillä, joten Pages tarjoilee vain staattiset
> tiedostot. Tämä on myös tietosuojan ydin: treenidatasi ei koskaan lähde koneeltasi, koska
> mitään ei ole minne lähettää.
>
> **▸ Miksi tämä on turvallista vaikka sivu on julkinen:** julkaistu sivu on pelkkää koodia,
> ei dataa. Sinun treenisi eivät ole siellä — ne ovat sinun koneellasi ja päätyvät selaimen
> muistiin vasta kun raahaat ne itse sivulle.

### Ongelmatilanteet

| Oire | Syy ja ratkaisu |
|------|-----------------|
| Raahaus ei tee mitään | Tiedostot eivät ole `.gpx`-päätteisiä, tai niistä puuttuu reitti. Ilman GPS-jälkeä olevat treenit ohitetaan. |
| Kaaviot jäävät tyhjiksi | Dataa on liian vähän. Osa laskuista vaatii ≥ 3 treeniä, VO₂max ≥ 3 km:n lenkkejä. |
| Sykealueet puuttuvat | GPX-tiedostoissa ei ole sykedataa. Kaikki muu toimii silti. |
| Kirjanmerkki ei tee mitään | Et ole kirjautuneena sports-tracker.comiin, tai olet väärällä sivustolla. |
| Vienti tarjoaa zip-pakettia | Valitsit GPX-muodon selaimessa jossa ei ole kansioon kirjoitusta. Se toimii, mutta paketti on iso. Valitse *Kevyt*, tai käytä Chromea/Edgeä. |
| Ladattu tiedosto on tyhjä | Vanha vika: latauksen blob-osoite vapautettiin liian aikaisin ja Safari ehti lukea sen jo tyhjänä. Korjattu — lataa sivu uudelleen. |

---

## Mistä GPX-tiedostot?

Sports Trackerissa ei ole joukkovientiä. Treenilokissa on siihen **kirjanmerkkipainike**:
raahaat sen kerran palkkiin, ja sen jälkeen vienti on yhden klikkauksen päässä. Konsolia ei
tarvita. Vaiheet ovat yllä kohdassa [Käyttöönotto](#käyttöönotto); tässä on se mitä konepellin
alla tapahtuu ja miksi.

### Kaksi muotoa

Paneeli kysyy aluksi kumman haluat. Oletus valitaan selaimen mukaan.

| | **Kevyt** | **GPX** |
|---|---|---|
| Tulos | yksi tiedosto | yksi tiedosto per treeni |
| Koko, 3436 treeniä | **~1,6 MB** | ~2,3 GB |
| Toimii | kaikissa selaimissa | parhaiten Chrome/Edge |
| Puhelimeen | kyllä | ei käytännössä |
| Reittiviiva säilyy | ei | kyllä |

Tiedostot nimetään GPX-muodossa `YYYY-MM-DD_<laji>_<workoutKey>.gpx`, kevyt muoto on
`treeniloki-YYYY-MM-DD.json`. Molemmat raahataan analyysisivulle samalla tavalla. Ilman
GPS-reittiä olevat treenit (käsin lisätyt, sisäjuoksut) ohitetaan.

> **▸ Miksi kevyt muoto on tuhat kertaa pienempi:** analyysi ei tarvitse reittipisteitä.
> Se tarvitsee matkan, keston, nousumetrit ja tahdin — jotka lasketaan kertaalleen —
> ja sykkeen aikajakauman. Mitattuna: 10 km lenkki sekunnin näytteistyksellä on GPX:nä
> **676 kt**, kompaktina tietueena **0,5 kt**.
>
> **▸ Miksi syke tallennetaan histogrammina eikä valmiina alueina:** sykealueet lasketaan
> koko historian korkeimmasta havainnosta, jota ei voi tietää yhtä treeniä vietäessä. Kun
> tallennetaan minuutit lyöntitaajuutta kohti, alueet voidaan laskea uudelleen mistä tahansa
> maksimista — täsmälleen kuten reittipisteistä. Tämä on testattu vertaamalla molempia
> muotoja rinnakkain.
>
> **▸ Mitä menetetään, rehellisesti:** reittiviiva katoaa. Sovellus ei piirrä karttaa, joten
> mitään näkyvää ei häviä, mutta karttaa ei voi jälkikäteen rakentaa siitä datasta. Lisäksi
> lasketut arvot jäätyvät vientihetkeen: jos nousumetrien kynnys joskus muuttuu, vanhoja
> tiedostoja ei voi laskea uudelleen. Siksi kevyt muoto on **vaihtoehto GPX:lle, ei korvaaja.**

### Ei tarvitse valita: molemmat samalla vaivalla

Kun treenit on ladattu analyysisivulle, sivun yläreunaan ilmestyy painike
**⤓ Tallenna kevyt tiedosto**. Se kirjoittaa ladatuista treeneistä saman `.json`-tiedoston
ilman että vientiä tarvitsee ajaa uudelleen Sports Trackeria vasten.

Käytännössä siis:

1. Vie **kerran GPX-muodossa** → täysi arkisto reitteineen koneellasi
2. Raahaa analyysisivulle
3. Paina **⤓ Tallenna kevyt tiedosto** → ~1,6 MB puhelinta varten

> **▸ Miksi tämä sulkee kierron:** GPX-vienti säilyttää reittiviivan, mutta 2,3 gigatavua ei
> kulje puhelimeen. Ilman tätä painiketta joutuisi valitsemaan kumman haluaa — tai ajamaan
> koko 3436 treenin viennin kahdesti. Nyt arkisto ja kevyt tiedosto syntyvät samalla vaivalla.
>
> **▸ Miksi tunniste poimitaan tiedostonimestä:** vientitiedostot ovat muotoa
> `YYYY-MM-DD_<laji>_<workoutKey>.gpx`, joten workoutKey saadaan talteen myös GPX:stä
> ladatuille treeneille. Näin sama treeni tunnistetaan samaksi riippumatta siitä kummasta
> muodosta se on luettu, eikä kaksoiskappaleita synny jos pudotat molemmat.

**Jos ajo katkeaa** — kone jämähtää, suljet välilehden, verkko pätkii — klikkaa kirjanmerkkiä
uudelleen ja valitse sama kansio. Jo tallennetut ohitetaan automaattisesti.

> **▸ Miksi reidittömät muistetaan erikseen:** sisäjuoksusta ei synny tiedostoa, joten pelkkä
> kansion sisältö ei kerro että se on jo tarkistettu — ilman muistiinpanoa jokainen jatkoajo
> hakisi ne kaikki uudelleen. Määrä on käyttäjäkohtainen eikä sitä voi tietää etukäteen, joten
> lista karttuu ajon aikana kansioon tiedostoon `.treeniloki-ei-reittia.txt`. Se on tavallista
> tekstiä ja voit poistaa sen, jos haluat tarkistaa treenit uudelleen.
>
> **▸ Miksi HTTP-virhettä ei muisteta:** vanhentunut sessio palauttaa 401 tai 403 *jokaiselle*
> treenille. Jos ne kirjattaisiin pysyvästi ohitettaviksi, koko loppuhistoria katoaisi hiljaa
> — vienti näyttäisi onnistuneelta, mutta tuhannet treenit olisivat merkitty ikuisesti
> reidittömiksi. Siksi vain aito 200-vastaus ilman trackpointeja lasketaan pysyväksi
> tosiasiaksi; HTTP-virheet raportoidaan erikseen ja yritetään seuraavalla ajolla uudelleen.

> **▸ Miksi kirjanmerkki eikä konsoli:** kirjanmerkki ajetaan sivun omassa kontekstissa aivan
> kuten konsoliin liitetty skripti, joten se pääsee käsiksi sessiotunnisteeseen. Ero on
> käytettävyydessä: kertaluontoisen raahauksen jälkeen vienti on yksi klikkaus, eikä
> kehittäjätyökaluja tarvitse avata koskaan.
>
> **▸ Miksi tunniste ei poistu selaimesta:** painike lukee tunnisteen Sports Trackerin oman
> sivun `localStorage`sta ja lähettää sen takaisin samaan API:in, minne selaimesi lähettää sen
> muutenkin joka pyynnössä. Uutta altistusta ei synny — toisin kuin komentorivivaihtoehdossa,
> jossa tunniste pitäisi kopioida terminaaliin ja se päätyisi komentohistoriaan ja
> prosessilistaukseen.
>
> **▸ Miksi koko koodi on kirjanmerkin sisällä:** vaihtoehto olisi ladata skripti
> ulkopuoliselta palvelimelta, mutta silloin Sports Trackerin CSP voisi estää sen — ja sivulle
> injektoitaisiin kolmannen osapuolen koodia. Itsenäinen kirjanmerkki (36 kt) välttää molemmat.
>
> **▸ Miksi suoraan kansioon:** File System Access API kirjoittaa jokaisen GPX:n heti levylle,
> jolloin muistinkulutus ei riipu treenien määrästä. Alkuperäinen zip-tapa keräsi kaikki
> muistiin: mitattuna 200 treeniä → 46 MB, 400 → 88 MB, 800 → 173 MB, eli tuhansilla
> treeneillä lähes gigatavu. Sivutuotteena jatkaminen muuttui ilmaiseksi — valmis tiedosto
> kansiossa *on* tieto siitä mikä on tehty.
>
> **▸ Miksi zip kirjoitetaan itse eikä kirjastolla:** zip-polku haki ennen JSZipin CDN:stä.
> Kirjanmerkki ajetaan sports-tracker.comin omassa kontekstissa, jonka CSP voi estää vieraan
> skriptin — ja silloin vienti epäonnistui *hiljaa*. `tools/zip.js` on noin 170 riviä ja
> kirjoittaa pakkaamattoman zipin ilman riippuvuuksia. Samalla jokainen GPX suljetaan heti
> omaksi Blobikseen, joten JS-keossa on vain keskushakemisto (~60 tavua per tiedosto) eikä
> koko sisältö. Pakkausta ei ole: deflate vaatisi juuri sen kirjaston josta haluttiin eroon.

### Selaintuki ja puhelin

| Selain | Kevyt muoto | GPX-muoto |
|--------|-------------|-----------|
| Chrome, Edge | toimii | suoraan kansioon, jatkaminen automaattinen |
| **Firefox, Safari** | **toimii, suositus** | zip-paketti — toimii, mutta iso tiedosto |

Firefoxissa ja Safarissa ei ole kansioon kirjoitusta, joten GPX-vienti kokoaa yhden
zip-paketin. Muisti riittää — jokainen tiedosto siirtyy selaimen blob-rekisteriin heti — mutta
paketti on noin 0,7 Mt treeniltä, eikä keskeytynyt lataus jatku mistään. Kevyt muoto välttää
molemmat: muistissa on noin 0,5 kt treeniltä, tulos on yksi pieni tiedosto, ja keskeytynyt ajo
jatkuu. Siksi se on näissä selaimissa oletus.

**Puhelin.** Analyysisivu toimii puhelimessa sellaisenaan — ei vaakavieritystä, kaaviot
skaalautuvat, taulukko on luettava. Kevyt tiedosto (~1,6 MB) latautuu puhelimeen ongelmitta,
joten **historian katselu puhelimella onnistuu hyvin.**

**Vienti puhelimella onnistuu, iPhonella jopa hyvin.** Vientisivulla on omat ohjeensa: Safari
tukee kirjanmerkkejä oikeasti, ja *Pikakomennot*-sovelluksen "Suorita JavaScript verkkosivulla"
tekee viennistä yhden napautuksen jakovalikosta. Androidilla tilanne on nurinkurinen —
Chromessa kirjanmerkin laukaisu vaatii sen *nimen* kirjoittamista osoiteriville.

> **▸ Miksi ensivienti kannattaa silti tehdä koneella:** este ei ole käynnistäminen vaan kesto.
> Tuhansien treenien ensivienti kestää noin puoli tuntia, ja puhelin keskeyttää
> taustavälilehden herkästi — ruutu pitäisi pitää päällä koko ajan. Sen jälkeen puhelin
> riittää: jatkoajossa haettavaa on vain muutama uusi treeni, koska vanhat ohitetaan.

### Vaihtoehto: Node-komentorivi

Jos haluat ajaa viennin taustalla ilman selainta, repossa on myös CLI. Hae sessiotunniste
kerran selaimen konsolista sports-tracker.comissa:

```js
localStorage.getItem("sessionkey")
```

Aja sitten repon juuressa:

```bash
ST_SESSION_KEY=<avain> npm run export
```

GPX:t ilmestyvät kansioon `./gpx-export`. Valitsimet: `--out <kansio>`, `--limit <n>`,
`--throttle <ms>`, `--force`, `--help`. Keskeytynyt ajo jatkuu ajamalla sama komento uudelleen.

> **▸ Varaus:** tässä tunniste on kopioitava selaimesta terminaaliin, jolloin se päätyy
> leikepöydälle ja mahdollisesti komentohistoriaan. Kirjanmerkki on tältä osin turvallisempi.
> Kirjaudu ulos ja takaisin sisään ajon jälkeen, niin käytetty tunniste mitätöityy.

---

## Mitä sivu näyttää

Kaikki alla oleva lasketaan pudottamistasi GPX-tiedostoista. Mitään ei lähetetä minnekään.

Tiedostojen lisäysalue vie tyhjällä sivulla koko yläreunan, mutta **kutistuu yhdeksi riviksi
heti kun treenejä on ladattu** — rivi ottaa raahauksen vastaan siinä missä koko alue, ja
aukeaa klikkaamalla. Ohitettujen tiedostojen viesti jää näkyviin kutistuksesta huolimatta.

> **▸ Miksi se kutistuu:** tyhjällä sivulla pudotusalue on ainoa asia jolla on merkitystä.
> Datan jälkeen se on pelkkää tilaa, joka työntää tulokset alaspäin — eli juuri sen mitä
> tultiin katsomaan.

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
| **Kokonaisaika** | Kaikkien treenien yhteiskesto tunteina ja minuutteina |
| **Nousumetrit** | Kaikkien treenien yhteenlaskettu nousu |
| **Ka. tahti** | Kokonaisaika ÷ kokonaismatka, muodossa `min:sek` per km |
| **Lenkkejä** | Ladattujen treenien määrä |
| **Lenkkejä / vk** | Treenitiheys **aktiivisilta jaksoilta** — yli 14 vrk:n tauot jätetään laskusta pois |
| **Pisin lenkki** | Historian pisin yksittäinen treeni |

> **▸ Miksi tauot jätetään tiheydestä pois:** jos juoksit vuoden ajan 3 kertaa viikossa, pidit
> 3 kuukauden tauon ja jatkoit, koko kalenteriajalla jakaminen antaisi noin 2,3 lenkkiä
> viikossa — luku, jota et ole koskaan elänyt. Kysymys "kuinka usein juoksen kun juoksen" on
> valmennuksellisesti hyödyllisempi kuin "kuinka monta lenkkiä kalenterivuodessa". Tauon
> vaikutus raportoidaan erikseen omassa kortissaan, joten tieto ei katoa.
>
> **▸ Miksi keskitahti lasketaan kokonaisuuksista:** summa ÷ summa painottaa automaattisesti
> pitkiä lenkkejä. Yksittäisten tahtien keskiarvo antaisi 2 km:n hölkälle saman painon kuin
> 30 km:n pitkälle, mikä vääristäisi kuvaa tyypillisestä vauhdistasi.

**Ennätykset** — historian huiput, jokainen päivämäärän ja lenkin nimen kanssa.

| Ennätys | Mistä se lasketaan |
|---------|--------------------|
| **Pisin lenkki** | Suurin yksittäinen matka |
| **Nopein tahti** | Paras min/km **vähintään 3 km:n** lenkeiltä |
| **Eniten nousua** | Suurin yksittäisen lenkin nousu |
| **Suurin viikko** | Suurin maanantaista alkavan kalenteriviikon yhteismatka |
| **Eniten lenkkejä / vk** | Eniten treenejä sisältänyt kalenteriviikko |
| **Pisin putki** | Pisin katkeamaton sarja viikkoja, joilla on vähintään yksi treeni |

> **▸ Miksi tahtiennätys vaatii 3 km:** 800 metrin kiihdytys voittaisi muuten aina, eikä se
> kerro juoksukunnosta samaa asiaa kuin täysimittainen suoritus. Sama raja on käytössä
> VO₂max-arviossa, joten kaksi eri lukua eivät voi olla eri mieltä siitä, mikä lenkki oli paras.
>
> **▸ Miksi putki lasketaan viikoissa eikä päivissä:** päiväputki rankaisisi lepopäivistä,
> jotka kuuluvat jokaiseen järkevään ohjelmaan. Viikkoputki mittaa sitä, mitä oikeasti
> halutaan tietää — jatkuvuutta.
>
> **▸ Miksi puuttuva ennätys jätetään pois:** jos yhtään ≥ 3 km:n lenkkiä ei ole, tahtiennätystä
> ei ole olemassa. Nolla tai viiva sen paikalla näyttäisi mittaustulokselta; poissa oleva rivi
> ei näytä miltään, mikä on tässä totuudenmukaisempaa.

### Välilehti: Kehitys

| Kaavio | Mitä siinä on |
|--------|---------------|
| **Matka / aika** | Pylväs jokaisesta treenistä. **Oranssi pylväs = merkitty matkahyppäys.** Katkoviiva on lineaarinen trendi, ja otsikko kertoo suunnan muodossa `km/kk`. |
| **Tahti** | Viiva min/km. Huom: **ylöspäin = hitaampi.** Laskeva viiva on siis hyvä uutinen. |
| **Kestävyyskunto** | VO₂max-arvion kehitys. Vaatii vähintään kaksi ≥ 3 km:n suoritusta, muuten näyttää huomautuksen. |

Jokaisessa kaaviossa on **asteikon arvot** vasemmassa reunassa ja **aikaväli** alareunassa.
Kun viet hiiren kaavion päälle — tai kosketat sitä puhelimella — kaavion alle ilmestyy
osoittamasi kohdan **päivämäärä ja tarkat luvut**.

> **▸ Miksi tahtiakselia ei käännetä ympäri:** min/km on käänteinen mittari — pienempi on
> parempi. Akselin kääntäminen tekisi kaaviosta intuitiivisemman, mutta arvot eivät enää
> vastaisi taulukon lukuja, mikä on omiaan aiheuttamaan lukuvirheitä. Suunta kerrotaan siksi
> otsikossa sanallisesti.
>
> **▸ Miksi kaavioihin lisättiin luvut:** ilman asteikkoa käyrä kertoo vain muodon. Muoto
> vastaa kysymykseen "nouseeko vai laskeeko", mutta ei kysymykseen "kuinka paljon" — ja juuri
> jälkimmäistä pitkää historiaa selatessa haluaa tietää.

### Välilehti: Terveys & riski

Jokainen kortti näyttää tuloksen lisäksi **taustaluvut, joista se syntyy**: kuormasuhteen
molemmat osat, taukojen määrän ja pisimmän tauon, sekä minuutit jokaisessa syke- ja
tehoalueessa.

> **▸ Miksi taustaluvut näkyviin:** pelkkä suhdeluku on jotain, joka pitää uskoa. Kun sen
> osoittaja ja nimittäjä ovat vieressä, sen voi tarkistaa — ja huomata itse, jos luku on
> outo siksi, että historiaa on liian vähän eikä siksi, että treenaaminen olisi mennyt pieleen.

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

### Lajivalinta — painikerivi tilannearvion alla

Jos historiassa on useampi laji, sivun yläreunaan ilmestyy rivi
**Kaikki · Juoksu · …**. Valinta rajaa **koko sivun**: jokainen luku, kaavio ja
taulukko lasketaan vain valitun lajin treeneistä. Yhdellä lajilla riviä ei näytetä.

Laji tulee vientitiedoston nimestä (`2024-01-01_running_abc.gpx`) ja tallentuu myös
kevyeen muotoon, joten erittely säilyy kun historia luetaan takaisin.

> **▸ Miksi rajaus koskee koko sivua eikä yhtä paneelia:** tahti, VO₂max ja
> 80/20-jakauma ovat juoksun mittoja. Pyöräilyn 30 km/h ei ole "nopea tahti" samassa
> mielessä, eikä sen syke tarkoita samaa kuormaa. Jos lajit lasketaan yhteen, luvut
> näyttävät oikeilta mutta eivät mittaa mitään — ja se on huonompi tilanne kuin
> puuttuva luku, koska virhettä ei huomaa.
>
> **▸ Miksi tuntemattomat lajit näkyvät numerona:** Sports Tracker antaa treenille
> `activityId`-numeron, ja vain juoksu (1) on varmistettu. Muut näkyvät muodossa
> **Laji 14**. Nimen arvaaminen väärin olisi pahempaa kuin numeron näyttäminen:
> väärä nimi näyttää tiedolta. Voit nimetä omasi `src/analysis/sports.mjs`-tiedoston
> `LABELS`-taulukossa — pelkkä sivun lataus riittää, vientiä ei tarvitse ajaa uusiksi.
>
> **▸ Miksi valikko piilotetaan yhdellä lajilla:** valinta, jossa on yksi vaihtoehto,
> ei ole valinta. Se veisi tilaa ja saisi lukijan etsimään merkitystä jota ei ole.

**Salitreenit ja muut reidittömät suoritukset** tulevat mukaan kevyeen vientiin. Niistä ei
synny GPX:ää, joten aiemmin ne katosivat kokonaan; nyt kesto, laji ja nimi luetaan
Sports Trackerin omasta treenilistauksesta. **Vaatii uuden viennin** — vanhassa
tiedostossa niitä ei ole.

> **▸ Miksi ne eivät vääristä tahtia:** salitreeni on esimerkiksi 45 minuuttia ilman
> kilometrejä. Jos sen minuutit jaettaisiin juoksun kilometreillä, keskitahti hidastuisi
> ilman että yksikään lenkki muuttui. Keskitahti lasketaan siksi vain matkallisista
> treeneistä. Kokonaisajassa ne ovat mukana: se on tehtyä työtä.
>
> **▸ Mitä listauksesta luetaan ja mitä siinä oletetaan:** kesto, matka, nousu ja laji.
> API antaa keston sekunteina ja matkan metreinä, mutta kesto tarkistetaan silti —
> yli 200 000 ei ole uskottava sekuntimäärä (55 h) mutta on tavallinen millisekuntiluku,
> joten se tulkitaan millisekunneiksi. Epäuskottava matka tai nousu hylätään nollaksi
> ennemmin kuin päästetään summiin. Ilman kestoa treeni ohitetaan ja ohitusten määrä
> kerrotaan viennin lopussa.

### Välilehti: Kaudet

Kolme taulukkoa. **Lajit** ensin — matka, lenkit, aika, nousu, tahti ja osuus
kokonaismatkasta — ja se lasketaan aina **koko historiasta**, myös silloin kun sivu on
rajattu yhteen lajiin: rajaus kertoo mitä katsot, lajitaulukko kertoo mitä on olemassa.
Sen alla **vuodet** ja **kuukaudet**, uusin ensin. Molemmissa samat sarakkeet —
matka, lenkkien määrä, kokonaisaika, nousumetrit ja keskitahti — sekä suhteellinen palkki,
jonka pituus kertoo kauden matkan verrattuna historian kovimpaan kauteen.

> **▸ Miksi palkki lukujen rinnalle:** kahdenkymmenen kuukauden rivistöä ei lueta riviltä
> riville, vaan silmäillään. Palkki tekee hiljaiset ja kovat kaudet näkyviksi ilman että
> yhtäkään lukua tarvitsee lukea; luvut ovat vieressä sitä varten, kun haluaa tarkistaa.
>
> **▸ Miksi kauden tahti on kokonaisaika ÷ kokonaismatka:** sama syy kuin keskitahdissa —
> yksittäisten lenkkien tahtien keskiarvo antaisi lyhyelle vetolenkille saman painon kuin
> pitkälle peruslenkille. Kuukausi, jossa on yksi 4:00-kilometri ja kahdeksan kilometriä
> 8:00-tahtia, ei ole 6:00-kuukausi vaan 7:33-kuukausi.
>
> **▸ Miksi tyhjiä kausia ei näytetä:** kuukausi ilman treenejä ei saa omaa riviään. Rivistö
> kertoo mitä on tehty; tauot raportoidaan Terveys-välilehdellä, jossa niillä on merkitystä.

Kapealla näytöllä palkkisarake piilotetaan ja taulukkoa voi vierittää sivusuunnassa —
leikkautunut sarake olisi huonompi kuin vieritettävä.

### Välilehti: Treenit

Taulukko kaikista treeneistä, uusin ylimpänä: päivä, nimi, matka, tahti, nousumetrit ja
huomautus (`✓` = ei hyppäystä, `▲`/`⚠` = matkahyppäys prosentteineen, tai "tauon jälkeen").
Kerralla näytetään **200 riviä**; loput painikkeella.

> **▸ Miksi uusin ylimpänä:** viimeisimmät treenit ovat ne, joiden perusteella seuraava
> päätös tehdään. Taulukko ei myöskään vaadi vieritystä loppuun ollakseen hyödyllinen.
>
> **▸ Miksi taulukko sivutetaan:** 3436 treeniä kerralla on noin 27 500 DOM-solmua eli yli
> 90 % koko sivun solmuista — mitattuna selvästi raskain yksittäinen asia mitä sivu tekee,
> ja puhelimessa se on se kohta joka voi kaataa välilehden. Kukaan ei selaa kolmea ja puolta
> tuhatta riviä kerralla, joten oletuksena ladataan 200 ja loput pyydettäessä. Sivutuksen
> jälkeen sama historia on 3 191 solmua.

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

## Paikallinen ajo ja kehitys

Tätä ei tarvita sovelluksen käyttämiseen — vain jos haluat muokata koodia tai ajaa oman
kopiosi. Sovellus on pelkkää HTML:ää ja JavaScriptiä: **ei `npm install`-vaihetta, ei
kääntämistä.**

```bash
git clone https://github.com/EliasKarj/treeniloki
cd treeniloki
python3 -m http.server 8000     # tai: npx serve .  /  php -S localhost:8000
```

Avaa sitten `http://localhost:8000/index.html`.

> [!IMPORTANT]
> **Älä avaa `index.html`-tiedostoa suoraan kaksoisklikkaamalla.** Sivu jää tyhjäksi.
>
> Syy: sovellus käyttää ES-moduuleja (`<script type="module">`), joita selain kieltäytyy
> lataamasta `file://`-osoitteesta tietoturvasyistä (CORS). Osoitteen pitää alkaa
> `http://localhost` — siksi tarvitset palvelimen. Sama koskee `export.html`-sivua: se
> rakentaa kirjanmerkin lukemalla omat lähdetiedostonsa, mikä ei onnistu `file://`-tilassa.

| Oire | Ratkaisu |
|------|----------|
| Sivu on täysin tyhjä | Avasit tiedoston `file://`-osoitteesta — käynnistä palvelin yllä olevalla komennolla. |
| `Address already in use` | Portti 8000 on varattu, kokeile `python3 -m http.server 8080`. |
| `python3: command not found` | Kokeile `python -m http.server 8000` tai `npx serve .`. |

Julkaisu tapahtuu automaattisesti: `main`-haaraan menevä push julkaistaan Pagesiin, mutta
vasta kun testit ja kattavuuskynnys ovat menneet läpi.

---

## Testit

Testit vaativat **Node.js 22+**. Riippuvuuksia ei tarvitse asentaa — kaikki käyttää Nodeen
sisäänrakennettua `node:test`-kirjastoa.

```bash
npm test              # koko testisarja, 346 testiä
npm run test:watch    # ajaa uudelleen kun tiedostot muuttuvat
npm run test:coverage # kattavuus + kynnysarvot (kaatuu jos alle 90 %)
```

### Mitä testataan

| Testitiedosto | Kohde | Testejä |
|---------------|-------|---------|
| `test/*.test.mjs` (13 kpl) | Analyysimoduulit yksitellen | 58 |
| `test/edges.test.mjs` | Raja-arvot — jokainen kynnys molemmilta puolilta | 38 |
| `tools/core.test.js` | Jaettu vientiydin: uudelleenyritys, jatkaminen, reidittömät listauksesta | 45 |
| `test/render.test.mjs` | `app/render/*` — kortit, ennätykset, kaudet, lajit, kaavioiden lukema | 47 |
| `tools/export-cli.test.mjs` | Node-CLI: argumentit, levylle kirjoitus, jatkaminen | 24 |
| `test/compact.test.mjs` | Kevyt muoto: riittävyys GPX:ään verrattuna, tallennus, kelvoton data | 21 |
| `test/periods.test.mjs` | Vuosi- ja kuukausiyhteenvedot, ennätykset, viikkoputket | 19 |
| `test/interaction.test.mjs` | Pudotus, välilehdet, tavoite, kevyen tallennus, vioittuneet | 17 |
| `test/loader.test.mjs` | Lisäysalueen kutistuminen ja raahaus kutistettuun riviin | 5 |
| `test/zip.test.mjs` | Oma zip-kirjoitin: keskushakemisto, CRC, UTF-8, zip32:n rajat | 8 |
| `test/sports.test.mjs` | Lajien erittely, nimeäminen, säilyminen kevyessä muodossa | 12 |
| `test/sportfilter.test.mjs` | Lajivalikko: ilmestyminen, rajaus, paluu kaikkiin | 6 |
| `test/hostile.test.mjs` | Vihamielinen ja vioittunut GPX: XSS, XXE, ReDoS, NaN, kaatumiset | 15 |
| `test/assets.test.mjs` | Sivujen eheys, moduuliverkko, kirjanmerkin liitettävyys | 16 |
| `test/pipeline.test.mjs` | Koko putki GPX-tekstistä valmiiseen malliin | 13 |
| | **Yhteensä** | **346** |

Kattavuus lähdekoodista: **rivit 99 %, haaraumat 94 %, funktiot 98 %**. Kattamatta jää
lähinnä `app/main.mjs`:n selainliima — tiedoston lataus levylle ja välilehtien vaihto —
sekä `export-cli.mjs`:n prosessitason kuori, jotka molemmat vaativat oikean ympäristön.

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
  render/               Piirtokerros — verdict, overview, charts, health, periods, table
src/
  parse/
    gpx.mjs             GPX-jäsennin (regex-pohjainen, toimii sekä selaimessa että Nodessa)
    compact.mjs         Kevyt vientimuoto: sarjoitus ja luku
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
    periods.mjs           vuosi- ja kuukausiyhteenvedot
    records.mjs           ennätykset ja viikkoputket
    sports.mjs            lajien erittely, nimet ja rajaus
test/
  *.test.mjs            Analyysimoduulien, renderin ja putken testit
  helpers/              DOM-stub ja GPX-fixturet (ei riippuvuuksia)
export.html             Vientisivu: rakentaa kirjanmerkkipainikkeen
tools/
  core.js                    Jaettu ydin: API-haut, uudelleenyritys, nimeäminen
  zip.js                     Pakkaamaton zip-kirjoitin ilman riippuvuuksia
  export-overlay.js          Kirjanmerkin käyttöliittymä (selain)
  export-cli.mjs             Node-komentorivi
.github/workflows/      CI: testit, kattavuus, julkaisu
```

---

## Vihamielinen syöte

GPX-tiedosto voi tulla tuntemattomalta, rikkinäiseltä laitteelta tai olla katkennut kesken.
Jäsennin kohtelee syötettä epäluotettavana ja jokainen alla oleva väite on testattu
tiedostossa `test/hostile.test.mjs`.

| Hyökkäys | Tilanne |
|----------|---------|
| **XSS** treenin nimessä | Ei mahdollinen. Nimen kaappaava kuvio sulkee `<`-merkin pois, joten tagia ei voi edes poimia. Entiteettikoodattu hyökkäys purkautuu `innerHTML`:ssä tekstisolmuksi, ei merkkaukseksi. |
| **XXE** / ulkoiset entiteetit | Ei mahdollinen. Regex-jäsennin ei laajenna entiteettejä, joten `&xxe;` pysyy kirjaimellisena merkkijonona. |
| **ReDoS** | Ei havaittu. 200 000 merkkiä ilman sulkevaa tagia jäsentyy alle millisekunnissa; laiskat kvantifioijat on rajattu `>`-merkkiin. |
| **Prototyyppisaaste** | Ei mahdollinen. Kentät ovat kiinteitä, syötteestä ei tule avaimia. |
| **NaN-myrkytys** | Korjattu. Kelvoton koordinaatti pudotetaan pisteineen. |
| **Kaatuminen pitkällä tiedostolla** | Korjattu. |

> **▸ Uhkamalli rehellisesti:** sovellus on paikallinen, palvelinta ei ole eikä muiden
> käyttäjien dataa ole olemassa. Pahin mitä vihamielinen GPX voi tehdä on rikkoa **oma**
> näkymäsi — sillä ei ole mitään mitä varastaa eikä ketään muuta kohteena. Se ei silti ole
> syy jättää asiaa: sama koodi käsittelee myös aidosti vioittuneita tiedostoja oikeilta
> laitteilta.
>
> **▸ Miksi NaN oli oikea ongelma:** `lat="..."` täyttää lukuja kaappaavan merkkiluokan mutta
> tuottaa `NaN`:n. Yksi tällainen piste levitti NaN:n matkaan, tahtiin, kokonaissummiin ja
> jokaiseen kaavioon — eli **yksi rikkinäinen tiedosto rikkoi koko koontinäytön**, ei vain
> omaa riviään. Nyt kelvottomat koordinaatit ja WGS84-alueen ulkopuoliset arvot pudotetaan
> jäsennysvaiheessa.
>
> **▸ Miksi pitkä tiedosto kaatoi jäsentimen:** sykkeen maksimi laskettiin
> `Math.max(...hrs)`-levityksellä, joka heittää `RangeError`in noin 125 000 lukeman jälkeen.
> Tähän ei tarvittu pahantahtoisuutta lainkaan: **40 tunnin ultra sekunnin näytteistyksellä
> ylittää rajan itsestään.** Nyt maksimi lasketaan silmukalla, ja 300 000 pistettä jäsentyy
> ilman ongelmia.
>
> **▸ Miksi epäuskottava syke hylätään:** sykealueet lasketaan koko historian korkeimmasta
> havaitusta sykkeestä, joten yksittäinen anturivirhe — vaikka 999 — siirtäisi kaikki
> aluerajat ja saisi jokaisen treenin näyttämään helpolta. Alueen 25–240 ulkopuoliset lukemat
> käsitellään puuttuvina.
>
> **▸ Miksi pisteet järjestetään ajan mukaan:** laitteet lähettävät toisinaan pisteitä
> epäjärjestyksessä, ja käänteinen pari tuotti negatiivisen keston ja negatiivisen tahdin.
> Järjestäminen on anteeksiantavampi kuin tiedoston hylkääminen.
>
> **▸ Miksi yksi tiedosto ei enää kaada koko pudotusta:** aiemmin `addFiles` ei napannut
> virheitä, joten sadan tiedoston joukossa yksi lukukelvoton keskeytti kaiken eikä mitään
> renderöity. Nyt jokainen tiedosto on erikseen suojattu, ja ohitetut nimetään
> pudotusalueen alla — hiljaisuus ei saa näyttää onnistumiselta.

---

## Tietosuoja

- **GPX-tiedostot luetaan selaimessa** — niitä ei ladata mihinkään palvelimelle.
- **Export-skripti** lukee vain Sports Trackerin sessiotunnisteen `localStorage`-muistista
  ajon ajaksi ja hakee ainoastaan omia treenejäsi. Mitään ei lähetetä ulkopuolelle.
- Halutessasi voit kirjautua ulos ja takaisin sisään ajon jälkeen vaihtaaksesi sessiotunnisteen.
- **Ulkoisia latauksia ei ole.** Kirjanmerkki on itsenäinen, ja zip kirjoitetaan omalla
  koodilla — mitään ei haeta CDN:stä sen enempää vienti- kuin analyysivaiheessakaan.

---

## Vastuuvapauslauseke

Treeniloki on harjoittelun seurantatyökalu, ei lääketieteellinen laite. Riskiarviot,
VO₂max-luvut ja valmennusvinkit ovat kirjallisuuteen perustuvia arvioita omasta datastasi,
eivät diagnooseja. Kipu, vamma tai terveyshuoli kuuluu ammattilaiselle riippumatta siitä,
mitä tämä sivu näyttää.

---

## Lisenssi

2026 EliasKarj. Katso [LICENSE](./LICENSE).
