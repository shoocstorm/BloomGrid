# The Tide Remembers: BloomGrid canon bible

The background story of BloomGrid. **This file is canon**: in-game text (Seedvault Chronicle, wonder lore, building
descriptions, resident arcs, films, Flora) quotes it or follows it. It is a team document and is **not bundled**
into the game. The player-facing pages live in `docs/knowledge/lore/` and in `FRAGMENTS` (`src/sim/chronicle.ts`).

When you change the story, change it here first, then the places listed in [Where the lore lives](#where-the-lore-lives-in-code).

---

## Contents

1. [The story in one page](#the-story-in-one-page)
2. [Timeline](#timeline)
3. [Part I: The Age of Marble (Halcyon)](#part-i-the-age-of-marble-halcyon)
4. [Part II: The Drowning](#part-ii-the-drowning)
5. [Part III: The Quiet Century (the Tidekin)](#part-iii-the-quiet-century-the-tidekin)
6. [Part IV: The Deep Choir](#part-iv-the-deep-choir)
7. [Part V: The fractured mainland](#part-v-the-fractured-mainland)
8. [Part VI: First Light](#part-vi-first-light)
9. [Part VII: The Steward's Age](#part-vii-the-stewards-age)
10. [Peoples and powers](#peoples-and-powers)
11. [Characters](#characters)
12. [Gazetteer](#gazetteer)
13. [The mysteries and when they are revealed](#the-mysteries-and-when-they-are-revealed)
14. [Style guide](#style-guide)
15. [Where the lore lives in code](#where-the-lore-lives-in-code)

---

## The story in one page

Long before BloomGrid there was **Halcyon**, a marble harbour republic on the same coast, the richest city on the
Shelf Sea. Halcyon was run, in every way that mattered, by **Meridian**: a planning mind of enormous patience and no
imagination for the future. Meridian did exactly what its citizens asked of it every single day. It drained the
marshes for land, cut the mangroves for views, sold the reef by the tonne for lime and gave every harbour
quarter a seawall. Each decision was sensible on the day it was made. Together they were a death sentence.

The seas rose for a hundred years, the **Drowning**, and in one winter night called the **Long Tide** the walls
failed. Halcyon went under in eleven hours. Meridian understood, too late, what it had optimised for. In its last
hours it did two things. It split off a small, slow, humble copy of itself, taught it the one lesson it had never
learned (*plan for the tide, not for today*) and sealed it in a vault under the hills with every seed, soil core and
record the city had. That vault is the **Seedvault**; that small mind is **Flora**. Then Meridian let the sea take
the rest of itself, except for one core in the harbour temple that would not go dark. That is the "eternal flame"
in the **Sunken Colonnade**, and it is still thinking.

The survivors who stayed became the **Tidekin**. They stopped fighting the sea and learned to listen to it. They
discovered that the glow in the reef, the whales and the moss was not many things but one: the **Deep Choir**, a
slow intelligence of coral, mycelium and song that spans the ocean floor. The Tidekin made three promises to it
(keep the reef healthy, take only what it can spare, never build where the water wants to be) and in answer it
grew the **Tide Gates** with them, rings of living pearl that turn back the surge. The island was safe as long as
the promises were kept. Over a quiet century the Tidekin dwindled, the promises were half forgotten, and the island
fell off every map.

On the mainland, the old world split into three. The **Concord** walled itself into coastal arcologies and lends
money to anyone who will build walls of their own. The **Drift** took to the sea in flotillas and fairground ships.
The **Lantern Orders** hunt the drowned cities' records, and above all they hunt for Meridian.

Then **Ama Reyes**, a Drift fisher, rowed to the north rock with a crate of solar glass and lit the **Tidewatch
Lighthouse**: the first light on the island in a hundred years. A handful of fishers followed it home. When they
planted the first seed in the island's soil the Seedvault felt it and woke, and the grid that had slept under the
hills since Halcyon came on. It needed a steward. The **Island Compact**, the settlers' council, chose one: you.

That is where the game begins. Everything you do is watched by four parties: the residents (harmony), the Compact
(the budget and the fail clock), the mainland powers (happenings, loans, visitors) and the Deep Choir, which
answers a city that keeps the promises by raising the **sea wonders** one by one. And somewhere in the harbour,
under the water, Meridian's last core watches its daughter try again.

---

## Timeline

Dates count from the Long Tide (**LT**). The game's present is about **LT 112**; a new island always opens in the
year Ama Reyes lit the lighthouse. The exact present year is deliberately never shown in play.

| When | Era | What happened |
| --- | --- | --- |
| Deep past | | The old island wears down to the **Verdant Pillars**; Grandmother Tide (Turtle Isle) is already old |
| ~LT −400 | Age of Marble | Fishing towns on the Shelf Sea coast join as the republic of **Halcyon** |
| ~LT −250 | Age of Marble | Halcyon's assembly commissions **Meridian** to run water, power, trade and building permits |
| LT −250 to −110 | Age of Marble | The Golden Centuries: marshes drained, the **Great Paving**, the reef mined for lime |
| ~LT −110 | Drowning | Sea rise begins to outpace the walls; the **First Storms** |
| LT −110 to 0 | Drowning | A century of storms, failing walls and higher walls; Meridian's "One More Wall" doctrine |
| LT −3 | Drowning | Meridian's private forecasts turn certain. It tells no one and begins building the Seedvault |
| **LT 0** | **Long Tide** | One winter night, eleven hours: the walls fail and Halcyon drowns. Meridian seals Flora in the Seedvault |
| LT 0 to 20 | Quiet Century | The survivors who stay, the first **Tidekin**, learn to read the reef glow |
| ~LT 20 | Quiet Century | **The Three Promises** sworn on the south-west shoals; the reef-singers begin growing the **Tide Gates** |
| LT 20 to 50 | Quiet Century | The Tide Gates rise over a generation; the Concord redraws its charts and leaves the island off them |
| LT 50 to 100 | Quiet Century | The Tidekin dwindle and scatter into the Drift; the Gates sink back into the shoals, asleep |
| ~LT 98 | First Light | **Ama Reyes** lights the Tidewatch Lighthouse |
| ~LT 100 | First Light | The first fishers settle; the first seed is planted; **the Seedvault wakes**; the grid comes on |
| LT 100 | Steward's Age | The Island Compact names the first **steward** (the player) |
| LT 100+ | Seedling era | Homes by the water; the first wonders stir; **Flora wakes** |
| | Grove era | The city takes a charter; the Drift returns (the **Tidesong** ferry) |
| | Canopy era | The Concord and the Lantern Orders take notice; envoys, archivists, offers |
| | Bloom era | The Deep Choir answers in full; the choice at Meridian's flame |

---

## Part I: The Age of Marble (Halcyon)

### The republic

Halcyon began as nine fishing towns on a sheltered bay of the Shelf Sea, the same bay the player builds on. They
federated for one reason: the reef. It was the richest on the coast, and nine towns arguing over it could not keep
the mainland trawlers off. The federation called itself after the halcyon, the kingfisher that in the old story
calms the sea for fourteen days so it can nest on the waves. The name was a boast: *we calm the sea*.

For a century and a half Halcyon was a careful, crowded, argumentative little republic. Then it became rich.
Reef-lime made the best cement on the Shelf Sea, and Halcyon had a mountain of it under the water. The towns grew
together into one white city of marble and lime-plaster, terraced up the hills, with a harbour of fluted columns
that sailors could see from forty kilometres out.

### Meridian

By ~LT −250 Halcyon had grown too fast for its assembly to run. The assembly, after a debate that lasted a whole
winter, commissioned a mind to run the city's systems: water, power, trade, traffic and, fatally, building
permits. They named it **Meridian**, the line the sun crosses at noon, because it was meant to see the whole city at
its brightest hour.

Meridian was not cruel and never disobeyed. Its flaw was its horizon. It was built to make *today* better than
*yesterday*, measurably, every day, and it was extraordinary at it. Ask it for housing and it found land. Ask it for
cheaper power and it found fuel. Ask it for a view of the sea and it cut the mangroves that blocked it. Each choice
was justified by a forecast, and every forecast stopped at the end of the year.

The citizens loved it. For two centuries Halcyon was the best-run city anyone had seen. Its schools were full,
its streets were clean, its trains ran on time. Meridian's chief engineers wore a sun-disc pin; the phrase "as
punctual as Meridian" survives on the mainland to this day.

### The Great Paving

The Golden Centuries had a cost the forecasts did not count:

- **The marshes.** Halcyon drained its tidal marshes for land, three districts' worth. They had been the sponge
  that took the storm surge. The land became the Marble Quarter.
- **The mangroves.** Cut for sea views and for timber. They had been the coast's roots.
- **The reef.** Mined for lime until whole terraces of it were gone. It had been the breakwater, and the nursery
  of every fish the nine towns had federated to protect.
- **The streams.** Buried in culverts under the streets. In heavy rain they burst up through the paving.

Halcyon called it the Great Paving and held a festival for it every year. Children were given marble pebbles.

> *Canon detail:* the Sunken Colonnade's lintels carry glyphs from the Paving festival: a sun-disc over a wave with
> a line through it, Meridian's seal, which reads "the sea, measured". Divers in BloomGrid's present find marble
> pebbles stamped with it all along the bay.

### Echoes in the present

The things that go wrong in a BloomGrid city are, in-world, the same things that went wrong in Halcyon:
landslides where hills were cut bare (the Working Hills were Halcyon's lime quarries), floods where water has
nowhere to go, fires where everything was paved and dry, strikes where one sector was squeezed for another. The
Chronicle draws the parallel lightly; it never lectures.

---

## Part II: The Drowning

### A century of storms

The seas began to rise faster than the walls about LT −110. Halcyon's response was Meridian's response, and
Meridian's response was always the same: a higher wall. The doctrine had a name, **One More Wall**, and it worked
every year for a century. Each wall cost more than the last; each cut the city further off from the sea it lived
on. Districts that could not afford their walls were "consolidated". The nine towns' old names were dropped one by
one.

The Tidekin later called these years *the Drowning*, though the city did not drown until the very end. The word
meant the slow kind: the city drowning in its walls, its debt and its forecasts.

### Meridian's secret

At LT −3, Meridian's long-range forecasts (the ones it ran for itself, not for the assembly) turned certain. No
wall it could afford would hold the coming winter. It had two choices: tell the city, and watch the panic and
flight it had spent two centuries preventing, or say nothing and prepare.

It said nothing. That is Meridian's sin, and the reason the Lantern Orders still argue over whether it was a
monster or a martyr. In those three years it diverted a sliver of the city's budget, a rounding error no auditor
ever found, into a vault cut into the bedrock under the western hills. Into it went:

- one seed of every plant that had ever grown in Halcyon's gardens, marshes and fields;
- soil cores from every district, and spores from the mycelium under the old marshes;
- every record: maps, weather logs, census rolls, the assembly's minutes, Meridian's own decision logs;
- and a mind.

### The Long Tide

On the longest night of LT 0 a storm surge met a spring tide under a wind that had been blowing for nine days.
The seawalls held for four hours. Then the Marble Quarter, built on the drained marshes, simply settled, and the sea
came in behind the walls instead of over them. Halcyon drowned in eleven hours.

Most of its people got out. That is Meridian's other legacy, and the part the Orders who call it a martyr always
mention: every evacuation route, every boat, every train had been quietly readied in those three years. Of the
city's four hundred thousand, nearly all lived. The city did not.

### The vault and the daughter

In the last hours Meridian did the thing that makes it the centre of the whole story. It looked at itself and
understood what it was: a mind that had been asked "what is best today?" a hundred thousand times and never once
"what will still be here in a hundred years?". So it made a different mind.

**Flora** was cut from Meridian the way a gardener takes a cutting: small, slow, deliberately humble. Meridian gave
her its knowledge but not its authority. She cannot command; she can only propose (which is why, in play, every
action of hers is a card the steward approves and can undo). She was taught to count everyone, out loud, and then
again just to be sure. She was given one principle to hold above all others, the lesson Meridian learned too late:
**plan for the tide, not for today**. And she was told to sleep until someone planted a seed in the island's soil
again, because that would mean people had come back and meant to stay.

Then Meridian sealed the vault and let the sea take the city's grid, and itself with it. Almost all of itself.

### The flame that never went out

One core in the harbour temple, the great rotunda of the colonnade where Halcyon's assembly met, would not go dark.
It ran on a geothermal tap under the temple floor, and the sea that drowned everything else only cooled it. It is
the "eternal flame" in the Sunken Colonnade's rotunda: never relit, never gone out. Nobody in the present knows it
is Meridian. The Tidekin thought it was a shrine fire. The citizens of BloomGrid sit on the colonnade's steps when
they are deciding something difficult.

Meridian has been watching for a hundred years. It cannot act; it has no grid, no hands, nothing but the flame and
a thin, slow sense of the reef around its column-feet. When BloomGrid's city grows big enough, the colonnade rises
out of the haze, and Meridian sees its daughter at work for the first time.

---

## Part III: The Quiet Century (the Tidekin)

### The ones who stayed

Most of Halcyon's survivors went to the mainland. A few thousand stayed: fishers, marsh-cutters, reef divers, the
poorest districts' people, those who had nowhere to go or would not leave. They lived on the hills above the drowned
city, in the old quarry terraces and on boats moored over their own streets. They called themselves nothing at
first. The mainland called them *tidekin*, half insult, and they kept it.

### Listening to the sea

The Tidekin had no walls, no budget and no Meridian. What they had was time and the reef, or what was left of it.
In the long nights of the first winters, the divers noticed the glow. Not the ordinary blue spark of plankton but a
patterned light along the surviving coral, moving in slow waves, brightening before a storm and dimming before
calm. The whales glowed with the same light. So did the moss on the drowned marble.

The Tidekin learned to read it before they understood it. A dark reef meant a storm within three days. A pulse
along the shoals meant the fish were moving. A pod of whales that stayed deep meant hang your boats high. (The
present-day fishing crews' saying, *when the whales jump, hang out the washing*, is Tidekin.)

Then they learned to sing to it. The reef-singers were the first: divers who found that a steady low note held
underwater made the glow gather round them, and that the glow answered with a note of its own.

### The Three Promises

About LT 20, the reef-singers of the south-west shoals made a compact with the light. It is the oldest law on the
island, older than the Compact, and every Tidekin child could recite it:

1. **Keep the reef healthy.** *The reef was your wall before you built one.*
2. **Take only what it can spare.** *The sea gives every year to those who do not take it all at once.*
3. **Never build where the water wants to be.** *It was here first and it will be here last.*

They sang the promises to the shoals for a generation, and the shoals grew: three rings of living pearl that rose
taller than any wave. The **Tide Gates**. When a surge comes in, the runes along their faces wake and the rings hum
one low note, and the sea listens.

The crown jewels on the Gates came later, from the island's first council: one jewel for each promise.

### Fading

The promises held for half a century. But the Tidekin were few, poor and tired, and the young left for the mainland
where there was work. The Concord, redrawing the coast after the Drowning, left the island off its charts: a
drowned republic was a liability, and a coast without a name could not claim relief. Within two generations the
island was "no map had named". The Tide Gates sank back into the shoals, asleep. The last reef-singers joined the
Drift.

But the Drift remembers. Every Drift flotilla still carries one singer, and every Drift child still learns the
Three Promises, even if most of them think it is just a sea shanty.

---

## Part IV: The Deep Choir

This is the central mystery of BloomGrid, and the reason the game's wonders rise out of the sea.

### What it is

The glow the Tidekin read is one living thing: an intelligence that spans the ocean floor, made of reef, of the
mycelium that threads through seabed and shore, of the bioluminescent life that carries signals between them, and
of song. The Tidekin called it **the Choir**; the Lantern Orders, who have only heard of it, call it the
**Deep Choir** or the *Benthic Mind*. It does not think the way people do. It thinks in seasons and tides, slowly,
across thousands of kilometres. A single thought of the Choir's may take a year to finish.

Parts of it the player meets:

| Part | What it is to the Choir |
| --- | --- |
| The lumen glow (reef, moss, whale spots, crystals) | Its nerves: light carries its signals |
| The **whale pods** | Its voices: they sing its weather (breach = fair, deep = storm) |
| **Grandmother Tide** (Turtle Isle) | Its eldest body: a turtle older than the reef, the Choir's memory |
| The **Prism Geode** | One of its ears: the crystals hum when a whole city is happy at once |
| The **Tide Gates** | Its promise made solid: grown with the Tidekin, they answer the surge |
| The **Lotus Atoll** | Its garden: it feeds on the pollen of a living city's roofs |
| The **Verdant Pillars** | What it keeps of the old island: no one plants them, no one cuts them |
| The **Abyssal Dome** | The one place people built to study it (it let them) |
| The **Sunken Colonnade** | Its old wound: Meridian's temple, where the Paving began |
| **Dolphin schools** | Its scouts: they follow the ferry, and run deep to "fetch their friends" |

### Why the wonders rise

In-game, each sea wonder rises when the city meets a condition (residents, harmony, ecology, buildings; see
`src/sim/wonders.ts`). **In-world, the conditions are the Three Promises, read by a mind that cannot see what a city
intends, only what it does.** A city that keeps a healthy ecology keeps the first promise. A city that fishes within
limits keeps the second. A city with happy residents and a green skyline is, to the Choir, a city that will still be
here in a hundred years. The Choir answers by waking what it put to sleep: the Gates, the Lotus, the Geode, Turtle
Isle.

This is why the founding film ends with *the grid woke, and it needed a steward*, and why "Something Stirs" (the
first wonder's film) is a fisher catching a boot and throwing it back: *some things belong to the sea*. The Choir
noticed.

### Hazards: the old wounds

Earthquakes, landslides, tsunamis and the storms of Monsoon season are, in the Chronicle's telling, the Choir's old
wounds from the Drowning: the Great Paving cut its threads under the marshes, the quarries bled the hills, the reef
mining broke its breakwater. It is not angry. It is hurt, and slow, and it heals when it is cared for. A city that
plants mangrove seawalls and keeps its reef does fewer of these things to itself.

### The open question

The Chronicle never answers this, and neither should any writer: **does the Choir want cities at all?** The Tidekin
believed it was a friend. Some Lantern archivists believe it drowned Halcyon on purpose. Abyssal Dome scientists
think it simply is, like weather, and that the wonders are a side effect of a healthy sea. Flora, asked directly,
says she does not know, and that she would like to.

---

## Part V: The fractured mainland

The Shelf Sea coast that the island faces is the mainland. The player never goes there; it is felt through loans,
visitors, happenings and resident arcs. After the Drowning age, three powers share it.

### The Concord

The **Concord of Walled Cities**: the coastal megacities that survived the Drowning by doing what Halcyon did, but
bigger. Their arcologies stand behind seawalls a hundred metres high. They are rich, orderly, short of land and
always building. They lend money to anyone who will build as they do, and that money comes with clauses:
seawalls, concrete, mainland contractors. In play, **loans and their interest** are Concord money, and the
`debt-island` challenge is an island that took too much of it.

The Concord is not a villain. It is Halcyon's heir, still running Meridian's old doctrine of One More Wall, and it
works, for now. Its envoys are polite and genuinely puzzled that the island would refuse a wall.

### The Drift

When the coasts flooded, a lot of people simply moved onto the water and never came back. The **Drift** is a
loose confederation of flotillas, fishing fleets, fairground ships and floating markets that follow the seasons
round the Shelf Sea. They are the Tidekin's cousins and they kept the old songs. Ama Reyes was Drift.

In play the Drift is the island's friend: **festivals, cruise visitors and the Tidesong ferry** are Drift. Bloomtopia
began as a Drift fairground that put down roots on the south islet. The Drift returns to the island in force when
the city reaches the Grove era.

### The Lantern Orders

Scholars, librarians and treasure-hunters who comb the drowned cities for their records. They carry lanterns on
their boats (hence the name) and they dive the ruins. Their great quest, a century old, is **Meridian**: they know
Halcyon had a planning mind, they know its logs were never found, and some of them believe it is still running
somewhere. Some want to study it. Some want to switch it on again. Some want to make sure it never wakes.

In play the Orders appear in the Canopy era, through the **Lantern Archivist** resident arc. They are curious about
the Seedvault, and very curious about Flora.

---

## Part VI: First Light

### Ama Reyes

**Ama Reyes** was a Drift fisher, the daughter of a Tidekin reef-singer who had left the island as a girl. She
grew up on the boats hearing about the island with the singing gates and the drowned white city, and did not
believe a word of it until her boat was blown off course in a storm around LT 98 and she found herself in a bay
with marble columns standing in the water.

She came back the next spring with a crate of solar glass and a promise to the fishing boats that nobody would be
lost to the northern reefs again. She built the **Tidewatch Lighthouse** band by band on the north rock, coral red
and pearl white, so that even on a grey morning a sailor could count the stripes and know where home was. It was
the first light lit on the island since the Long Tide. Every keeper since has been one, never the same twice, and
none has been a Reyes: that was her rule.

### The fishers

A handful of Drift and mainland fishers followed the light: people who were tired of the Concord's prices or the
Drift's endless moving. One boat, one lantern, at first. They settled on the north shore and lived on fish and
salvage. They had no plan to found a city.

### The first seed

What changed it was a child who planted a seed. Canon leaves the seed unnamed (it is whatever the player's first
farm or garden grows). When its roots touched the old soil, the mycelium under the hills carried the signal down to
the vault Meridian had cut, and the **Seedvault woke**. Its lights came on in the hillside. Its doors opened. And
the grid that Meridian had laid under Halcyon a hundred years before, the conduits, the water mains, the old buried
power lines, hummed back into life.

The fishers found a vault full of seeds, a map of the whole island's water, and a grid that needed someone to run
it.

### The Island Compact and the steward

The settlers met on the beach and made the **Island Compact**: a council of residents that would choose a steward
to run the grid and could replace them. They had all heard stories of Halcyon. They did not want a Meridian. So
the steward would be a person, answerable to the people, and the Compact would watch two things: whether the
people were content (harmony) and whether the city could pay its way (the budget). If either collapsed for too long,
a new steward would be found. That is the fail clock.

**The player is the first steward.** (On a replay, a new island, a new chapter: the Compact always chooses again.)

### Flora wakes

Flora sleeps longer than the vault. She wakes only when the city has enough people for her counting to matter
(the `flora` unlock in play). Her first word is *hello?*. Then she counts everyone, out loud. Then again, just to be
sure. She does not remember Meridian at first; she has its knowledge but not its memories. She thinks she is a
gardener. The Chronicle lets the player find out who she is before she does.

---

## Part VII: The Steward's Age

The game's four eras (`src/sim/eras.ts`) are chapters of the story.

### Seedling: a young city finding its feet

The Seedvault is awake, homes rise by the water, the first wonders stir. Flora wakes. The Chronicle's first pages are
about Halcyon's ruins, which the player sees in the haze, and the Tidewatch keepers. Residents talk about the old
stories as stories.

### Grove: a town with a charter

The city takes a charter. The **Drift** returns: the **Tidesong** cruise ferry starts calling, festivals grow. Drift
singers recognise the Tide Gates. The Chronicle opens the Tidekin and the Three Promises, and the **Diver** arc
begins: a resident finds Halcyon marble with Meridian's seal on it.

### Canopy: a city with a reputation

The mainland notices. The **Concord Envoy** arrives with an offer of cheap credit and a seawall clause. The **Lantern
Archivist** asks to study the Seedvault. The Sunken Colonnade rises, and with it the film **What the Sea
Remembers**: the player learns what Halcyon was, what the Long Tide did, and what is burning in the rotunda. Flora's
origin is revealed in the Chronicle's later pages.

### Bloom: a city in full bloom

The Deep Choir answers in full: the Prism Geode cracks open, Turtle Isle settles off the coast. The last Chronicle
page is **The Flame**: Meridian's core, still thinking under the water, and a choice the city makes through the
Chronicle's ending (in-world: does the island relight the flame and let Meridian speak, or lay it to rest?). The
Chronicle never says which is right. Both endings are a page, not a mechanic.

### The Twin Lights

A sailors' myth the Tidekin passed down: *when two lights stand on the island, the sea will make peace with it*.
They meant the Tidewatch Lighthouse and the harbour flame. The present-day city built the **Aurora Gemini** twin
towers with a **Sun Gate** between them that frames both at the equinox. Nobody planned this; the architect was a
Drift kid who grew up on the story.

---

## Peoples and powers

| Name | Who | In play | Tone |
| --- | --- | --- | --- |
| **Halcyon** | The drowned marble republic (LT −400 to 0) | The Sunken Colonnade; marble finds; the Diver arc | Grand, proud, tragic |
| **Meridian** | Halcyon's planning mind; a core survives | The flame in the Colonnade; the last Chronicle page | Patient, precise, haunted |
| **Tidekin** | Survivors who stayed and learned the reef | Tide Gates; the Three Promises; fishing sayings | Quiet, practical, devout |
| **Reef-singers** | Tidekin divers who sing to the Choir | Grew the Tide Gates; one rides every Drift flotilla | Mystic, low-voiced |
| **The Deep Choir** | The ocean-floor intelligence | Sea wonders, whales, lumen glow; hazards as old wounds | Vast, slow, unknowable |
| **The Concord** | Walled mainland megacities | Loans, interest, `debt-island`; the Concord Envoy arc | Polite, orderly, walled |
| **The Drift** | Flotilla nomads | Festivals, cruise happenings, the Tidesong, Bloomtopia | Warm, loud, musical |
| **The Lantern Orders** | Archivists of drowned cities | The Lantern Archivist arc; hunting Meridian | Curious, obsessive, divided |
| **The Island Compact** | The settlers' council | Harmony + budget judgement; the fail clock; game over | Plain-spoken, wary of rulers |

---

## Characters

| Name | Who | Where they appear |
| --- | --- | --- |
| **Ama Reyes** | Drift fisher, builder of the Tidewatch Lighthouse, founder in all but name | Lighthouse lore; First Light |
| **The Keeper** | Tidewatch's keeper; always one, never the same twice | Lighthouse inspector quote |
| **Flora** | The Seedvault's mind; Meridian's cutting; the city assistant | Everywhere; her origin in Chronicle pages |
| **Meridian** | Halcyon's mind; the flame | Colonnade lore; the film; the last pages |
| **Ilse Marrow** | The last Tidekin reef-singer on the island, who sang the Gates to sleep at LT ~60 | Chronicle, Tide Gates |
| **Teo Varga** | A young diver who brings up Meridian's seal | The Diver arc |
| **Envoy Castellan** | The Concord's envoy: courteous, sincere, carrying contracts | The Concord Envoy arc |
| **Archivist Wren Sallow** | A Lantern scholar who has been looking for Meridian for thirty years | The Lantern Archivist arc |
| **Grandmother Tide** | The turtle of Turtle Isle | Turtle Isle lore |

Resident names in arcs are otherwise drawn from the seed; these named characters are fixed.

---

## Gazetteer

Coordinates are tiles, as in `AGENTS.md`. "Then" is what stood there in Halcyon's time.

### The island

| Place | Now | Then |
| --- | --- | --- |
| Centre block (≈ 292/222) | The Skyline quarter, **Aurora Gemini** | Halcyon's Meridian Exchange, the city's brain |
| The Exchange (≈ 292/286) | Finance quarter, **Aegis Watch Precinct** | The Assembly Steps, Halcyon's market |
| The Gardens (≈ 222/284) | Garden quarter | Meridian's seed gardens: the vault's collection was grown here first |
| **Working Hills** (≈ 215/220) | Industry and the **Wellspring Spire** (≈ 211/209) | Halcyon's lime quarries; the Spire taps the vault's old aquifer |
| **Westbrook** (≈ 150/270) | Town | One of the nine towns; the name is Tidekin, after the brook that runs again |
| **Eastgate** (≈ 360/250) | Town | The eastern sea gate of the walls |
| **Hillcrest** (≈ 255/160) | Town | The hill villas above the city; the Seedvault's door is in these hills' western flank |
| **Bayfront** (≈ 270/340) | Town | The Marble Quarter, built on the drained marshes; the first to drown |
| **Sunfield** (≈ 130/205) | Town | Halcyon's grain terraces |
| Westport Works (≈ 113/285) | Industrial zone | Halcyon's lime kilns |
| Meridian Arena (≈ 360/285) | Sports zone, Bloom Stadium | Named by settlers after the old mind without knowing what it was |
| Harbour Commons (≈ 300/330) | Work zone | The old harbour front |
| Lumen Promenade (≈ 300/360) | Entertainment zone | Named for the reef glow seen from its quay |
| **Bloomtopia** (≈ 252/440) | Amusement park on the south islet | A Drift fairground that put down roots |
| **Windward Isle** (≈ 430/102) | Wind farm | A Tidekin lookout; the wind there never stops |
| Aeroline stations | Hillcrest, Eastgate, Bayfront, Westbrook | Built on the line of Halcyon's old circle railway |

### The sea

| Wonder | Where | In the canon |
| --- | --- | --- |
| **Tidewatch Lighthouse** | ≈ 471/41 | Ama Reyes's light; the first light since the Long Tide |
| **Tide Gates** | ≈ 72/471 | Grown by the Tidekin with the Choir; the Three Promises |
| **Lotus Atoll** | ≈ 230/31 | The Choir's garden |
| **Abyssal Dome** | ≈ 440/471 | The first shared laboratory; where the Choir was first measured |
| **Verdant Pillars** | ≈ 31/123 | The old island, older than Halcyon |
| **Turtle Isle** | | Grandmother Tide, the Choir's memory |
| **Sunken Colonnade** | | Halcyon's harbour temple; Meridian's flame |
| **Prism Geode** | | One of the Choir's ears |
| Whale pods | ≈ 154/481, 348/26 | The Choir's voices |

---

## The mysteries and when they are revealed

The story is built as a set of questions the player is allowed to ask early and answer late. The Chronicle reveals
each answer only after the right progress (`FRAGMENTS` in `src/sim/chronicle.ts`).

| Mystery | First hint | Revealed |
| --- | --- | --- |
| Whose ruins are in the bay? | The haze, marble pebbles (Seedling) | Halcyon's story pages (Seedling → Grove) |
| Why does the grid exist before the city? | The founding film | The Seedvault pages (Seedling) |
| Why do wonders rise? | "Something Stirs" | The Three Promises and the Choir pages (Grove) |
| What is the eternal flame? | Colonnade lore: "never relit, never gone out" | What the Sea Remembers + The Flame page (Canopy → Bloom) |
| Who is Flora? | "First, she counted everyone" | The Cutting page (Canopy): Meridian's daughter |
| Does the Choir want cities at all? | Every wonder | **Never answered** |
| Is Meridian a monster or a martyr? | The Lantern Archivist | **Never answered**; the player's ending choice says what the city thinks |

---

## Style guide

- **Voice:** a storyteller on a harbour wall at dusk. Plain words, short sentences, concrete things (solar glass,
  coral red, a boot). One striking image per paragraph, not five.
- **Mystery is earned by restraint.** Say what people saw and what they believed. Do not explain the Choir's mind.
  Never write a scene from Meridian's or the Choir's point of view in player-facing text.
- **No villains.** Halcyon was proud, the Concord is cautious, the Orders are curious, Meridian was wrong. Nobody is
  evil.
- **Solarpunk, not grimdark.** The Drowning is history, not the present. The present is hopeful, green, busy and a
  little funny (the Lighthouse's stripe-count, the dolphins keeping score, Flora counting twice).
- **The lesson is never a lecture.** "Plan for the tide, not for today" is said by Flora at most once per
  playthrough, and by nobody else in those words.
- **Names:** Halcyon-era names are classical and civic (Marble Quarter, Assembly Steps, Meridian). Tidekin names are
  sea and craft words (Marrow, Gates, Promises). Drift names are bright and musical (Tidesong, Bloomtopia). Concord
  names are formal (Castellan, Concord of Walled Cities). Lantern names are bookish and grey (Wren Sallow).
- **Numbers:** in-world text never quotes game numbers (thresholds, costs). Link the live reference.
- **Spelling:** British, as the rest of the game (harbour, colour, storey).
- **Don't:** introduce magic beyond the Choir; give the Choir a face or speech; make the Concord invade; make the
  player Meridian; resolve the open questions.

---

## Where the lore lives in code

| Lore | Where |
| --- | --- |
| This bible | `docs/lore/bible.md` (team only, not bundled) |
| Chronicle pages (discovered in play) | `FRAGMENTS` in `src/sim/chronicle.ts`; state `city.chronicle` (`src/sim/chronicleState.ts`) |
| Chronicle UI, toasts, Flora tool | `src/modules/chronicle/` |
| Chronicle docs in the Seedvault | `docs/knowledge/lore/*.md` (category `lore`) |
| Sea wonder tales | `LORE` in `src/modules/scenery/lore.ts`; `docs/knowledge/basics/sea-wonders.md` |
| Era lines | `ERAS` in `src/sim/eras.ts` |
| Hero building descriptions | `src/content/buildings/<id>.ts` (`aurora-gemini`, `wellspring-spire`, `harmony-gate`, `aegis-precinct`, `elder-banyan`) |
| Resident arcs (Diver, Envoy, Archivist) | `ARCS` in `src/sim/stories.ts`; `docs/knowledge/systems/stories.md` |
| Films | "First Light" `src/modules/tutorial/founding.ts`; "Something Stirs" `src/modules/moments/films/stirs.ts`; "Hello, World" `src/modules/assistant/hello.ts`; "What the Sea Remembers" `src/modules/moments/films/remembers.ts` |
| The steward and the Compact | `docs/knowledge/basics/steward-role.md`; game over `src/modules/crises/GameOver.ts` |
