# MW Engine — Scripting Language Reference

> The **MW Engine** (a.k.a. *Schwarzwald-Hexen Adventure Engine*) is a single-file React
> app (`src/app/App.tsx`) that runs text-based, choice-driven adventure games written in a
> small declarative scripting language. This document is the canonical reference for that
> language. It is **verified against the parser source** (`parseScript`, `executeSystem`,
> greeting/reaction handling in `src/app/App.tsx`) and against a full real-world game
> (*Muriels Wald*), and it deliberately corrects/expands the bundled
> `SCRIPTING_DOCUMENTATION.txt` where the implementation differs.

---

## 0. The 5 things that aren't obvious (read this first)

These are the mechanics that the surface-level docs get wrong or omit, and that you cannot
infer from the syntax alone. Everything else follows from them.

1. **A `SYSTEM` executes exactly ONE line per call — chosen at random from the lines whose
   requirements are currently satisfied.** It does *not* run all its lines top-to-bottom.
   To run several commands together, put them on **one line**. To branch or randomize, use
   **multiple lines** with different requirements. (Source: `executeSystem` filters
   `validLines` then does `validLines[Math.floor(Math.random()*…)]`.)

2. **Repeated tokens are counted.** `(pfennig, pfennig, pfennig)` does not mean "needs
   pfennig" three times — it means **"needs at least 3 pfennig."** The parser tallies
   duplicate requirement tokens into a per-item count and checks `inventory[item] >= count`.
   This is how prices, damage thresholds, and "N-of-something" gates are built.

3. **Listing the same inhabitant/line multiple times is weighted randomness.** When a
   `SCENE` lists several valid inhabitants, the engine shows **one at random**. Listing
   `guard` six times and `boss` once makes `guard` six times as likely. Greetings and
   per-item reactions work the same way: multiple matching entries → one is picked at random.

4. **A game is many `.txt` files merged into one script.** On ZIP/folder upload the engine
   sorts files (`debug.txt` first, then alphabetically), strips comments, and concatenates
   them. Filenames are therefore organizational only — people prefix them with `&`, `0`, `z`
   to control sort order. All definitions share one global namespace keyed by `id`.

5. **Only world memory (`@…`) persists to the cloud (Telegraph), never the inventory.**
   Saving a game means *copying inventory into memory* and uploading; loading reverses it.
   This is why real games contain long chains of `save_*`/`load_*` systems.

---

## 1. Core model

The engine has exactly three kinds of game objects plus two support constructs:

| Section  | Keyword  | What it is |
|----------|----------|------------|
| Location | `SCENE`  | A place. Has an image, inhabitants, and destinations (exits). |
| Character| `PERSON` | An NPC. Has an image, greetings, and reactions to items. |
| Item     | `SYMBOL` | An inventory object. Has an image and a name. |
| Config   | `DEBUG`  | Global setup: start commands, theme, cloud credentials. |
| Subroutine| `SYSTEM`| A named, callable list of command lines (one runs per call — see §0.1). |

All game logic is expressed through three state stores and the requirements that read them:

- **Inventory** — multiset of items (`{ id: count }`). IDs are **case-insensitive**
  (lowercased internally).
- **World memory** — key→number map (`{ key: value }`). Keys are **case-SENSITIVE**.
  This is the only state synced to the cloud.
- **Current location + current character** — where the player is and who they're talking to.

The player advances by: tapping a **greeting** (dialogue line), giving the character an
**item** (triggering a **reaction**), or choosing a **destination** to travel. Each of those
carries a string of **commands** that mutate state and/or move the player.

### Basic syntax rules

- IDs: alphanumeric + underscore, matched by `\w+`.
- `//` line comments and `/* … */` block comments are stripped before parsing. (The bundled
  docs only mention `//`; block comments are used heavily and **are** supported.)
- Blank lines are ignored. Leading/trailing whitespace is trimmed.
- Display text is always in `"double quotes"`.

---

## 2. Sections in detail

### 2.1 `DEBUG` — configuration

Appears once, at the top of the (merged) script. `key: value` lines. Keys are
case-insensitive; both English and German key names are accepted.

```
DEBUG
start: &start §narrator +map        // commands run once at game start
debug: true                          // true shows IDs / debug affordances
inherit: false                       // underscore name/image inheritance (default true)
welt: my-world-id                    // Telegraph world id   (English: world)
token: secret123                     // Telegraph access token
background: #000000                  // hex background (default #000000)
textcolor: #e6e6e6                   // hex body text (default #e6e6e6)
textfont: Garamond (24, normal)      // FontName (size_px, style)
labelfont: IM Fell English           // font for names/labels
animation: page                      // page | slide | none
```

| Key (EN / DE) | Meaning |
|---|---|
| `start` | Command string executed at launch. May teleport (`&`), set character (`§`), add items (`+`), call a system (`#`), etc. |
| `debug` | `true`/`false`. Debug mode. |
| `world` / `welt` | Telegraph world id for cloud memory. |
| `token` | Telegraph token. |
| `background` | Hex color. |
| `textcolor` | Hex color. |
| `textfont` / `labelfont` | `Name (size, style)`. Style ∈ normal/italic/bold/bold italic. **If no parentheses are given, style defaults to `normal`** (overriding the IM Fell English italic default). |
| `animation` | `page` (fade+scale), `slide` (horizontal), `none`. |
| `inherit` | `false` disables automatic name/image inheritance via underscore prefixes. |
| `ort`, `charakter`/`person`, `inventar` | German-only debug starting state: location, character, comma-list of starting items. |

`start:` can also call a `SYSTEM` (e.g. `start: #connect`) to run boot logic — the standard
pattern for "download cloud save, then offer Continue."

### 2.2 `SCENE` — locations

```
SCENE id (Display Name)
<image>
inhabitantId (requirements)
inhabitantId
> destinationId (requirements)
> destinationId "Custom label" (requirements)
#systemcall
```

- **Header name modes** (same for PERSON/SYMBOL):
  - `SCENE x` — no parentheses → use id, or inherit if `inherit:true`.
  - `SCENE x ()` — empty parentheses → **show no name** (image-only places).
  - `SCENE x (Real Name)` — explicit display name.
- **Image** is either the first bare line after the header, or a `bild:` / `mask:` key line
  (`bild` = German "image"). Use a single **emoji**, an **image filename**
  (`forest.png` — extension optional in practice), `@otherId` to reuse another object's
  image, or `none` for a blank image.
- **Inhabitants**: bare `characterId (optional requirements)` lines. At entry the engine
  collects all inhabitants whose requirements pass and shows **one at random** (duplicates
  increase weight — see §0.3). Omit inhabitants for an empty location.
- **Destinations**: lines starting with `>`. Optional `"Custom label"` overrides the target
  location's name; optional `(requirements)` gate the exit. If a scene has exactly one valid
  destination and no character interaction pending, the engine can auto-advance.
- **System call**: a `#systemId` line auto-runs when the location is entered.

### 2.3 `PERSON` — characters

```
PERSON id (Display Name)
<image>
(requirements) "greeting text" COMMANDS
"greeting text" COMMANDS
[itemId] (requirements) "reaction text" COMMANDS
[] "reaction when player gives nothing" COMMANDS
Reaktionen:
[itemId] "reaction text" COMMANDS
#systemcall
```

- **Greetings**: a `"text" commands` line, optionally preceded by `(requirements)` (inline,
  on the same line, **or** on the line directly above). When the character appears, the
  engine picks **one random greeting among those whose requirements pass** (falling back to
  all greetings if none match). → Multiple unconditional greeting lines = random flavor text.
- **Reactions**: `[itemId] (requirements) "text" commands`. Triggered when the player gives
  that item to the character. Stored as a **list per item**, so repeated `[item]` lines give
  randomized/conditional responses (one valid entry chosen at random).
  - `[]` (empty brackets) = the **"nothing"** reaction, used when the player advances without
    giving an item. Internally the id is `nichts`. This is the workhorse for "continue /
    move on / look around" actions, including random foraging (`[] "You find a mushroom" +mushroom`).
  - A `Reaktionen:` line switches the rest of the block into reactions-only mode (cosmetic
    grouping; inline reactions work without it).
- **Auto-skip**: a reaction (or greeting) whose text is exactly `"."` is shown briefly and
  then auto-advances, running its commands without a tap. Use for invisible state changes and
  chained transitions. ⚠️ Never let an auto-skip trigger itself — infinite loop.
- **`#systemId`** line: auto-runs when the character appears.

### 2.4 `SYMBOL` — items

```
SYMBOL id (Display Name)
<image>
```

Name modes identical to SCENE. Image via first bare line or `bild:`/`mask:`. Counts are
managed automatically (`+`/`-`). A symbol needs no body beyond its image; many real items are
just `SYMBOL id (Name)` with a `bild:` line. `@otherId` as the image reuses another item's
art (e.g. a "fake" variant pointing at the real item's picture).

### 2.5 `SYSTEM` — subroutines

```
SYSTEM id
(requirements) COMMANDS
(requirements) COMMANDS
COMMANDS
```

**Executes ONE line per call** — random among requirement-satisfied lines (§0.1). Systems can
call other systems (`#other`), including themselves (recursion → loops). Lines may start with
`(requirements)` or directly with commands. This single-random-valid-line rule is the engine's
core control-flow primitive; §6 shows how loops and branches are built from it.

---

## 3. Commands (the right-hand side of any line)

Commands are scanned out of the text-after-the-quote. Order within a line is generally
left-to-right; teleport/character-switch take effect after the line's mutations.

### Inventory
| Cmd | Effect |
|---|---|
| `+item` | Add one. Repeat `+gold +gold` to add several. |
| `-item` | Remove one (removed entirely at 0). |
| `%item` | Remove **all** of that item. |
| `&%` or `%%` | Clear the **entire** inventory. |

### World memory (`@`)
| Cmd | Effect |
|---|---|
| `@+key` | Increment (creates at 1). |
| `@-key` | Decrement. |
| `@%key` | Remove that key. |
| `@%` (no key) | Clear **all** memory. *(Implementation detail: it then seeds `empty:1` so the store is never truly empty.)* |
| `@src_>@dst` | **Copy** all keys with prefix `src_` to prefix `dst` (suffix preserved). `@src_>@` strips the prefix. |
| `@!` | **Upload** all memory to Telegraph (cloud save). |
| `@?` | **Download** all memory from Telegraph (cloud load). |

Only `@!`/`@?` touch the network; all other `@` ops are local.

### Navigation / control
| Cmd | Effect |
|---|---|
| `&locationId` | Teleport to a SCENE. |
| `§characterId` | Switch the current character. |
| `§` (bare) | Clear the current character (back to location view). |
| `#systemId` | Run a SYSTEM (one random valid line of it). |

### Text placeholder
- `[@prefix_]` inside a `"…"` string is replaced at display time by the **suffix of a random
  memory key** that starts with `prefix_` **and has value > 0**. E.g. with `name_Anna:1`,
  `name_Berta:1`, `"Hallo, [@name_]!"` → `"Hallo, Anna!"` or `"Hallo, Berta!"`.

---

## 4. Requirements `( … )`

Comma-separated list, **AND** logic — every term must pass. Used on inhabitants, destinations,
greetings, reactions, and system lines.

| Term | Passes when |
|---|---|
| `item` | inventory count > 0 |
| `%item` | inventory count == 0 (NOT have) |
| `@key` | memory value > 0 (case-sensitive) |
| `@%key` | memory value == 0 / absent |
| `item>N` / `item<N` | count comparison (N integer) |
| `@key>N` / `@key<N` | memory comparison |
| `item, item, item` | **count threshold** — needs ≥3 of `item` (duplicates tallied) |

**Wildcards** (`_` suffix) sum across all matching keys/items in both requirements and
commands: `(gold_>50)` totals every `gold_*` item; `+visited_forest` etc. can be summed via
`@visited_`. `[@prefix_]` and `@src_>@dst` also rely on this prefix convention.

The duplicate-token threshold (`item, item, item`) and the explicit comparison (`item>2`) are
two ways to express the same gate; real games use the duplicate form constantly for prices and
damage (it reads naturally and needs no off-by-one thinking).

---

## 5. Names, images, inheritance

- **Inheritance** (`inherit:true`, default): an object with an underscore id inherits name and
  image from the shorter-prefix object. `sword_iron` inherits from `sword`. Set
  `inherit:false` to require explicit art/names per object (Muriels Wald uses `inherit:false`).
- **`bild:`/`mask:`** keys set the image explicitly; a bare line right after the header does
  the same. Values: emoji, filename (extension optional), `@otherId` (reuse), or `none`.
- Assets (PNGs) ship alongside the `.txt` scripts; on upload they're indexed by filename and
  matched to these references.

---

## 6. Real-world idioms (from *Muriels Wald*)

These patterns recur throughout a real game and are the practical payoff of §0.

### 6.1 Ambient "Vorrunde" rooms
A nameless `PERSON xxx_vorrunde ( )` with **dozens of bare greeting lines** = randomized
atmosphere text for wandering a region. Its `[item]` reactions act as **region-wide item
effects** (eat poison → `&death`; apply salve → heal by removing condition symbols; drink
potion → teleport). Its `[]` reactions are the "walk on / look around" actions and double as
**foraging** (`[] "A mushroom!" +mushroom`). Because selection is random, the region feels
alive and items can be found repeatedly.

### 6.2 Prices as repeated tokens
Shops gate purchase destinations by repeated currency tokens:
```
> buy_sickle (pfennig, pfennig, pfennig, pfennig, pfennig, pfennig, pfennig, pfennig, pfennig, pfennig, pfennig, pfennig)   // costs 12
> buy_salve  (pfennig, pfennig, pfennig)                                                                                    // costs 3
```
The destination only appears if you can afford it; the purchase scene then `-pfennig …`
the right number of times and `+item`.

### 6.3 Cloud save/load = inventory↔memory bridge
Since only memory persists, saving walks the inventory item-by-item into memory and uploads:
```
SYSTEM save_apple
(apple) -apple @+apple #save_apple        // drain one apple → memory, loop (one valid line!)
(%apple) #save_next                         // when none left, move on
…
SYSTEM save_end
@+loadable @! &save_successful              // mark saved, upload, confirm
```
Loading reverses it (`(@apple) +apple @-apple #load_apple` … `(@%apple) #load_next`). The
recursion works **because a system runs one valid line at a time** (§0.1): exactly one of the
two lines is valid each call, so it loops until the count hits zero, then falls through.

### 6.4 Multi-round combat = weighted random state machine
A combat "round" is a SCENE whose only exit is **itself**, re-rolling each pass:
```
SCENE hunter_round ( )
hunter_regular            // listed 6× → most likely outcome each round
hunter_regular
…(6 total)
hunter_death_pre (%antifire_salve, burn, burn)        // death possible once burns pile up
hunter_death_pre (burn, burn, burn)
hunter_kill_pre  (rage, rage, rage)                   // kill possible once you've dealt enough
> hunter_round
```
- **Damage is accumulating condition symbols**: `+burn` (damage taken), `+rage`/`schadenfreude`
  (damage dealt). Outcome inhabitants are gated by counts of these (duplicate-token thresholds),
  and modifiers like `%antifire_salve` make bad outcomes trigger at lower thresholds.
- **Weighting by repetition** controls the per-round probability of a normal exchange vs. an
  ending.
- **The `_pre` teleport trick**: an inhabitant requirement-check can switch the *character* but
  not the *scene*. So each outcome is a tiny `PERSON xxx_pre` whose single greeting immediately
  `&teleports` to the real outcome `SCENE`. (Documented as a known workaround in the source.)

### 6.5 "Return address" bookmarks
Because teleport targets are static text, the game sets a temp item before combat
(`+lesezeichen_bridge`) to remember where to resume. Outcome scenes offer return destinations
gated by `(lesezeichen_bridge)`, and the resume scene clears them (`%lesezeichen_bridge`).

### 6.6 Condition symbols as status effects
Items like `wound`, `burn`, `curse`, `graueshaar` (grey hair = elapsed time) are carried in
inventory purely as state. They raise death probability in combat, change NPC reactions, or
expire the player's disguise — all read via requirements, healed via `%`/`-` in the right
reactions.

---

## 7. Quick reference card

```
SECTIONS         DEBUG | SCENE id (name) | PERSON id (name) | SYMBOL id (name) | SYSTEM id
INVENTORY        +item   -item   %item(all)   &% or %%(clear all)
MEMORY (@)       @+k  @-k  @%k  @%(all)  @src_>@dst(copy)  @!(upload)  @?(download)
NAV              &scene   §person   §(clear)   #system
TEXT             "spoken text"     [@prefix_](random memory suffix)
REQUIREMENTS ()  item  %item  @key  @%key  item>N  item<N  @key>N  @key<N
                 item,item,item  →  needs ≥3   |   AND across comma list
WILDCARD         trailing _  sums/matches by prefix (items, memory, placeholders, copy)
REACTION         [item]…  |  [](=nichts, "advance")  |  text "."  = auto-skip
NAME MODES       x        → id/inherit
                 x ()     → no name shown
                 x (Name) → explicit
IMAGE            first bare line OR  bild:/mask:  →  emoji | file | @otherId | none
COMMENTS         //line     /* block */            (both stripped pre-parse)
```

### Mental-model reminders
- **System = one random valid line per call.** Multiple commands → one line. Branch/loop →
  multiple lines + requirements + `#self`.
- **Repeated token = count threshold.** **Repeated inhabitant/greeting/reaction = weighted random.**
- **Inventory is local; only memory (`@`) reaches the cloud.** Save = inventory→memory→`@!`.
- **Files are merged** (debug first, then alphabetical); use `&`/`0`/`z` filename prefixes to
  order, and one global id namespace across all files.

---

*Engine source of truth: `src/app/App.tsx` (`parseScript`, `parseRequirements`,
`executeSystem`, greeting/reaction handlers). Bundled prose:
`src/app/SCRIPTING_DOCUMENTATION.txt` — good for syntax, but predates/oversimplifies the
one-random-line system rule and the weighted-random selection behavior documented here.*
