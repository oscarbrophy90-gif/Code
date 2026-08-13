/**
 * What a season is *about*.
 *
 * Season names are generated from two halves — "Concrete Break", "Frost Line",
 * "Onyx District" — and the first half is the theme. This file gives each of
 * those twenty-four words a vocabulary, so the ranked path can be named after
 * the season it belongs to rather than handing out the same nine items forever.
 *
 * Every field answers one question the path asks, in the same order the ladder
 * climbs: what you play on down the bottom, what the whole place is called at
 * the top, what the quiet mid-tier reward is called, and what the words for
 * royalty are once you are past Diamond. A season is the theme plus a seeded
 * pick from the pools below, which is what makes Season 14's Emerald reward a
 * different thing to chase from Season 12's rather than the same one renamed.
 *
 * Words are not reused *inside* a theme — "Cracked Blacktop" and "Rim Shatter"
 * come out of different fields on purpose, and two fields landing on the same
 * word would collapse two rewards into one name. Across themes they may repeat;
 * two seasons twenty days apart are allowed to both have a King.
 */
export interface SeasonTheme {
  /** the season-name first word this belongs to */
  key: string;
  /** the surface underfoot — lower-tier kit is named off this */
  ground: string;
  /** what the whole court is called, used at the top of the ladder */
  arena: string;
  /** the street-level word, for the things a local would own */
  street: string;
  /** the mid-tier "hard to see coming" word */
  edge: string;
  /** its quieter partner, for the release that goes with it */
  ghost: string;
  /** the marksman */
  hunter: string;
  /** the one who finishes it */
  assassin: string;
  /** the adjective for a court that has taken a beating */
  broken: string;
  /** the buried court */
  under: string;
  /** the one nobody is allowed on */
  forbidden: string;
  /** the Grand Champion dunk */
  apex: string;
  /** the Grand Champion release */
  storm: string;
  /** the Grand Champion shoes, as a plural */
  gods: string;
  /** the Diamond dunk — something the floor feels */
  quake: string;
  /** what a Sapphire dunk does to the rim */
  shatter: string;
  /** what a Champion dunk does to it */
  destroy: string;
  /** the word for someone who has been around: Diamond kit */
  legend: string;
  /** the ruler: Champion kit */
  king: string;
  /** the ruler's adjective */
  royal: string;
  /** what sits on the ruler's head: Grand Champion kit */
  crown: string;
  /** what the ruler sits on, for the Champion win celebration */
  throne: string;
  /**
   * Hand-authored performance names, when a theme has been written out rather
   * than left to the pools. Optional precisely because most themes have not
   * been — the pools exist so a season is never short of one.
   */
  emotes?: string[];
  threes?: string[];
  wins?: string[];
  shots?: string[];
  accessories?: string[];
}

export const SEASON_THEMES: SeasonTheme[] = [
  {
    key: 'Concrete',
    ground: 'Asphalt', arena: 'Blacktop', street: 'Street',
    edge: 'Phantom', ghost: 'Ghost', hunter: 'Sniper', assassin: 'Assassin',
    broken: 'Cracked', under: 'Underground', forbidden: 'Forbidden',
    apex: 'Meteor', storm: 'Perfect Storm', gods: 'Gods',
    quake: 'Earthquake', shatter: 'Shatter', destroy: 'Destroyer',
    legend: 'Legend', king: 'King', royal: 'Royal', crown: 'Crown', throne: 'Throne',
    // Written out rather than drawn from the pools, so this season's path is
    // exactly the one it was specified as.
    emotes: ['Ball Bounce', 'Ball Roll', 'Ankle Breaker', 'Disappear', 'Too Cold', "You Can't Guard Me", 'Unstoppable'],
    threes: ['Finger Point', 'Cold Shoulder'],
    wins: ['Walk Away', 'No Look Back', 'Walk Of Fame'],
    shots: ['Quick Flick', 'Deadeye'],
    accessories: ['Wrist Tape'],
  },
  {
    key: 'Neon',
    ground: 'Circuit', arena: 'Gridline', street: 'Strip',
    edge: 'Flicker', ghost: 'Afterglow', hunter: 'Tracer', assassin: 'Nightrunner',
    broken: 'Burnt', under: 'Basement', forbidden: 'Blacklisted',
    apex: 'Supernova', storm: 'Voltage Storm', gods: 'Icons',
    quake: 'Blackout', shatter: 'Overload', destroy: 'Meltdown',
    legend: 'Icon', king: 'Emperor', royal: 'Imperial', crown: 'Halo', throne: 'High Seat',
  },
  {
    key: 'Salt',
    ground: 'Boardwalk', arena: 'Shoreline', street: 'Pier',
    edge: 'Driftwood', ghost: 'Undertow', hunter: 'Harpoon', assassin: 'Corsair',
    broken: 'Weathered', under: 'Tidepool', forbidden: 'Drowned',
    apex: 'Tsunami', storm: 'Salt Storm', gods: 'Titans',
    quake: 'Tidal Break', shatter: 'Wipeout', destroy: 'Breaker',
    legend: 'Myth', king: 'Captain', royal: 'Admiral', crown: 'Wreath', throne: 'Helm',
  },
  {
    key: 'Skyline',
    ground: 'Rooftop', arena: 'Highrise', street: 'Terrace',
    edge: 'Vertigo', ghost: 'Updraft', hunter: 'Falcon', assassin: 'Nightjar',
    broken: 'Windblown', under: 'Stairwell', forbidden: 'Sealed',
    apex: 'Freefall', storm: 'Jetstream', gods: 'Giants',
    quake: 'Skyquake', shatter: 'Skyfall', destroy: 'Wrecker',
    legend: 'Legend', king: 'Monarch', royal: 'Regal', crown: 'Spire', throne: 'Summit',
  },
  {
    key: 'Iron',
    ground: 'Foundry', arena: 'Ironworks', street: 'Yard',
    edge: 'Anvil', ghost: 'Coldforge', hunter: 'Marksman', assassin: 'Ironsight',
    broken: 'Rusted', under: 'Boiler Room', forbidden: 'Condemned',
    apex: 'Sledgehammer', storm: 'Iron Storm', gods: 'Titans',
    quake: 'Groundbreak', shatter: 'Buckle', destroy: 'Wrecker',
    legend: 'Veteran', king: 'Warden', royal: 'Master', crown: 'Helm', throne: 'Forge',
  },
  {
    key: 'Midnight',
    ground: 'Nightcourt', arena: 'Darkside', street: 'Alley',
    edge: 'Shade', ghost: 'Wraith', hunter: 'Stalker', assassin: 'Nightblade',
    broken: 'Faded', under: 'Catacomb', forbidden: 'Sealed',
    apex: 'Eclipse', storm: 'Night Storm', gods: 'Wraiths',
    quake: 'Blackout', shatter: 'Fracture', destroy: 'Reaper',
    legend: 'Myth', king: 'Nightking', royal: 'Noble', crown: 'Halo', throne: 'Dark Seat',
  },
  {
    key: 'Chrome',
    ground: 'Steelplate', arena: 'Mirrorcourt', street: 'Boulevard',
    edge: 'Silverline', ghost: 'Reflection', hunter: 'Scope', assassin: 'Razor',
    broken: 'Scratched', under: 'Undercarriage', forbidden: 'Restricted',
    apex: 'Comet', storm: 'Mirror Storm', gods: 'Machines',
    quake: 'Shockwave', shatter: 'Splinter', destroy: 'Crusher',
    legend: 'Prototype', king: 'Sovereign', royal: 'Sterling', crown: 'Circlet', throne: 'Seat',
  },
  {
    key: 'Ember',
    ground: 'Cinders', arena: 'Firepit', street: 'Backlot',
    edge: 'Smoke', ghost: 'Smoulder', hunter: 'Torchbearer', assassin: 'Firebrand',
    broken: 'Scorched', under: 'Furnace Floor', forbidden: 'Burned Out',
    apex: 'Wildfire', storm: 'Ember Storm', gods: 'Phoenixes',
    quake: 'Eruption', shatter: 'Burnout', destroy: 'Incinerator',
    legend: 'Legend', king: 'Blazeking', royal: 'Radiant', crown: 'Corona', throne: 'Pyre',
  },
  {
    key: 'Static',
    ground: 'Signal', arena: 'Broadcast', street: 'Frequency',
    edge: 'Interference', ghost: 'Whitenoise', hunter: 'Scanner', assassin: 'Jammer',
    broken: 'Glitched', under: 'Dead Channel', forbidden: 'Censored',
    apex: 'Feedback', storm: 'Signal Storm', gods: 'Machines',
    quake: 'Surge', shatter: 'Cutout', destroy: 'Killswitch',
    legend: 'Original', king: 'Sovereign', royal: 'Prime', crown: 'Halo', throne: 'Booth',
  },
  {
    key: 'Glass',
    ground: 'Pane', arena: 'Glasshouse', street: 'Atrium',
    edge: 'Prism', ghost: 'Refraction', hunter: 'Sightline', assassin: 'Shard',
    broken: 'Cracked', under: 'Cellar', forbidden: 'Sealed',
    apex: 'Shatterpoint', storm: 'Crystal Storm', gods: 'Idols',
    quake: 'Collapse', shatter: 'Break', destroy: 'Smasher',
    legend: 'Relic', king: 'Monarch', royal: 'Crystal', crown: 'Tiara', throne: 'Dais',
  },
  {
    key: 'Cobalt',
    ground: 'Deepblue', arena: 'Cobalt Yard', street: 'Quarter',
    edge: 'Indigo', ghost: 'Nocturne', hunter: 'Deadshot', assassin: 'Saboteur',
    broken: 'Chipped', under: 'Deep End', forbidden: 'Off Limits',
    apex: 'Deep Impact', storm: 'Blue Storm', gods: 'Sentinels',
    quake: 'Tremor', shatter: 'Fracture', destroy: 'Breaker',
    legend: 'Legend', king: 'Sovereign', royal: 'Royal', crown: 'Coronet', throne: 'Throne',
  },
  {
    key: 'Rust',
    ground: 'Scrapyard', arena: 'Junkfield', street: 'Backstreet',
    edge: 'Corrosion', ghost: 'Hollow', hunter: 'Scavenger', assassin: 'Ripper',
    broken: 'Rusted', under: 'Undercroft', forbidden: 'Abandoned',
    apex: 'Collapse', storm: 'Rust Storm', gods: 'Titans',
    quake: 'Cave-In', shatter: 'Snap', destroy: 'Wrecker',
    legend: 'Survivor', king: 'Baron', royal: 'Noble', crown: 'Crown', throne: 'Scrap Throne',
  },
  {
    key: 'Velvet',
    ground: 'Lounge', arena: 'Velvet Room', street: 'Boulevard',
    edge: 'Whisper', ghost: 'Silhouette', hunter: 'Duelist', assassin: 'Nightingale',
    broken: 'Frayed', under: 'Speakeasy', forbidden: 'Private',
    apex: 'Crescendo', storm: 'Velvet Storm', gods: 'Maestros',
    quake: 'Downbeat', shatter: 'Snap', destroy: 'Finisher',
    legend: 'Maestro', king: 'Duke', royal: 'Regal', crown: 'Coronet', throne: 'Throne',
  },
  {
    key: 'Frost',
    ground: 'Icefield', arena: 'Glacier', street: 'Frostline',
    edge: 'Whiteout', ghost: 'Flurry', hunter: 'Icepick', assassin: 'Frostbite',
    broken: 'Frozen', under: 'Crevasse', forbidden: 'Forbidden',
    apex: 'Avalanche', storm: 'Blizzard', gods: 'Titans',
    quake: 'Icequake', shatter: 'Shatter', destroy: 'Crusher',
    legend: 'Legend', king: 'Tsar', royal: 'Regal', crown: 'Diadem', throne: 'Ice Throne',
  },
  {
    key: 'Amber',
    ground: 'Sandlot', arena: 'Goldfield', street: 'Mainstreet',
    edge: 'Haze', ghost: 'Mirage', hunter: 'Prospector', assassin: 'Outlaw',
    broken: 'Weathered', under: 'Mineshaft', forbidden: 'Claimed',
    apex: 'Sunburst', storm: 'Amber Storm', gods: 'Idols',
    quake: 'Landslide', shatter: 'Crack', destroy: 'Breaker',
    legend: 'Legend', king: 'Baron', royal: 'Golden', crown: 'Crown', throne: 'Throne',
  },
  {
    key: 'Crimson',
    ground: 'Redcourt', arena: 'Redzone', street: 'Boulevard',
    edge: 'Scarlet', ghost: 'Vanish', hunter: 'Hunter', assassin: 'Reaper',
    broken: 'Bruised', under: 'Undercard', forbidden: 'Forbidden',
    apex: 'Bloodmoon', storm: 'Crimson Storm', gods: 'Warlords',
    quake: 'Rupture', shatter: 'Split', destroy: 'Executioner',
    legend: 'Legend', king: 'Warlord', royal: 'Crimson', crown: 'Crown', throne: 'Throne',
  },
  {
    key: 'Shadow',
    ground: 'Umbra', arena: 'Shadowcourt', street: 'Backalley',
    edge: 'Silhouette', ghost: 'Phantom', hunter: 'Nightstalker', assassin: 'Assassin',
    broken: 'Faded', under: 'Undercity', forbidden: 'Hidden',
    apex: 'Total Eclipse', storm: 'Shadow Storm', gods: 'Shades',
    quake: 'Blackfall', shatter: 'Sever', destroy: 'Reaper',
    legend: 'Myth', king: 'Shadowking', royal: 'Noble', crown: 'Veil', throne: 'Dark Throne',
  },
  {
    key: 'Solar',
    ground: 'Sunfield', arena: 'Solarcourt', street: 'Promenade',
    edge: 'Corona', ghost: 'Sunspot', hunter: 'Marksman', assassin: 'Lancer',
    broken: 'Sunbleached', under: 'Eclipse Yard', forbidden: 'Restricted',
    apex: 'Solar Flare', storm: 'Sun Storm', gods: 'Suns',
    quake: 'Groundburn', shatter: 'Scorch', destroy: 'Annihilator',
    legend: 'Legend', king: 'Sun King', royal: 'Radiant', crown: 'Halo', throne: 'Sun Throne',
  },
  {
    key: 'Marble',
    ground: 'Stonecourt', arena: 'Colonnade', street: 'Avenue',
    edge: 'Statue', ghost: 'Alabaster', hunter: 'Sentinel', assassin: 'Gladiator',
    broken: 'Chipped', under: 'Crypt', forbidden: 'Sanctum',
    apex: 'Colossus', storm: 'Marble Storm', gods: 'Gods',
    quake: 'Ruin', shatter: 'Fracture', destroy: 'Destroyer',
    legend: 'Immortal', king: 'Caesar', royal: 'Imperial', crown: 'Laurel', throne: 'Throne',
  },
  {
    key: 'Onyx',
    ground: 'Blackstone', arena: 'Onyx Court', street: 'Quarter',
    edge: 'Obsidian', ghost: 'Void', hunter: 'Sharpshot', assassin: 'Nightfall',
    broken: 'Chipped', under: 'Deepvault', forbidden: 'Forbidden',
    apex: 'Singularity', storm: 'Void Storm', gods: 'Idols',
    quake: 'Collapse', shatter: 'Fracture', destroy: 'Annihilator',
    legend: 'Relic', king: 'Overlord', royal: 'Noble', crown: 'Circlet', throne: 'Black Throne',
  },
  {
    key: 'Copper',
    ground: 'Patina', arena: 'Copperworks', street: 'Trade Street',
    edge: 'Verdigris', ghost: 'Oxide', hunter: 'Marksman', assassin: 'Bandit',
    broken: 'Tarnished', under: 'Undermine', forbidden: 'Sealed',
    apex: 'Thunderclap', storm: 'Copper Storm', gods: 'Machines',
    quake: 'Groundshock', shatter: 'Buckle', destroy: 'Breaker',
    legend: 'Artisan', king: 'Baron', royal: 'Regal', crown: 'Circlet', throne: 'Forge Throne',
  },
  {
    key: 'Violet',
    ground: 'Amethyst', arena: 'Violet Court', street: 'Parkway',
    edge: 'Dusk', ghost: 'Twilight', hunter: 'Oracle', assassin: 'Nightshade',
    broken: 'Bruised', under: 'Underlight', forbidden: 'Arcane',
    apex: 'Nebula', storm: 'Violet Storm', gods: 'Oracles',
    quake: 'Rift', shatter: 'Splinter', destroy: 'Devourer',
    legend: 'Mystic', king: 'Archon', royal: 'Regal', crown: 'Halo', throne: 'Sanctum',
  },
  {
    key: 'Storm',
    ground: 'Stormfield', arena: 'Thunder Court', street: 'Gale Street',
    edge: 'Squall', ghost: 'Mist', hunter: 'Skyhunter', assassin: 'Cyclone',
    broken: 'Battered', under: 'Stormdrain', forbidden: 'Off Limits',
    apex: 'Hurricane', storm: 'Eye Of The Storm', gods: 'Titans',
    quake: 'Thunderclap', shatter: 'Rupture', destroy: 'Devastator',
    legend: 'Legend', king: 'Stormking', royal: 'Regal', crown: 'Crown', throne: 'Throne',
  },
  {
    key: 'Ash',
    ground: 'Ashfield', arena: 'Cinder Court', street: 'Grey Street',
    edge: 'Soot', ghost: 'Drift', hunter: 'Tracker', assassin: 'Nomad',
    broken: 'Burnt', under: 'Ashpit', forbidden: 'Forsaken',
    apex: 'Fallout', storm: 'Ash Storm', gods: 'Remnants',
    quake: 'Collapse', shatter: 'Crumble', destroy: 'Ruiner',
    legend: 'Survivor', king: 'Ashking', royal: 'Grey', crown: 'Wreath', throne: 'Ashen Throne',
  },
];

export const THEME_BY_KEY: Record<string, SeasonTheme> = Object.fromEntries(
  SEASON_THEMES.map((t) => [t.key, t]),
);

/**
 * The performance pools.
 *
 * Emotes and celebrations do not take a theme word well — "Copperworks Bounce"
 * is not a move anybody wants to pull. So the ones the vocabulary cannot name
 * are drawn from these instead, seeded off the season, which is what stops two
 * consecutive seasons handing out the same seven emotes.
 *
 * They are big enough that a season picking seven emotes has a real choice.
 * A name that comes up again eight seasons later is a different item with a
 * different id — the collision is in the word, never in what you own.
 */
export const EMOTE_POOL = [
  'Ball Bounce', 'Ball Roll', 'Ball Spin', 'Quick Bounce', 'Low Dribble', 'Shoulder Roll',
  'Ankle Breaker', 'Crossover Stare', 'Step Back Freeze', 'Handle Check', 'Slow Walk Up',
  'Disappear', 'Blackout', 'Fade Away', 'Gone', 'Vanishing Act', 'Lights Out',
  'Too Cold', 'Ice Hands', 'Frozen Stare', 'Cold Blooded', 'No Sweat',
  "You Can't Guard Me", 'Nobody Home', 'Locked Out', 'Not Today', 'Try It Again',
  'Unstoppable', 'Untouchable', 'Different Breed', 'Built Different', 'Level Up',
  'Crowd Silencer', 'Bench Clear', 'Rewind', 'Slow Motion', 'Reload', 'Deep Breath',
  'Heartbeat', 'Chalk Toss', 'Shoe Check', 'Two Hands Down', 'Take Notes',
];

export const THREE_POOL = [
  'Finger Point', 'Cold Shoulder', 'Range Check', 'From The Logo', 'Hands Down',
  'Wrist Flick Hold', 'Three To The Bench', 'Count It', 'Long Distance', 'Water Sign',
  'Splash Hands', 'Backpedal Three', 'Point To The Line', 'No Look Away', 'Deep Range',
  'Say Less', 'Ice Wrist', 'Sky Point', 'Left It Short', 'Called It',
];

export const WIN_POOL = [
  'Walk Away', 'No Look Back', 'Walk Of Fame', 'Lights Down', 'Slow Exit',
  'Hands In Pockets', 'Bow Out', 'Kiss The Floor', 'Last Word', 'Signature Sign-Off',
  'Turn The Page', 'Book Closed', 'Curtain Call', 'Chalk Line', 'Head Held High',
  'Take A Lap', 'Silence The Room', 'Standing Ovation', 'One Finger Up', 'Nothing To Say',
];

export const SHOT_POOL = [
  'Quick Flick', 'Deadeye', 'Snap Release', 'Slow Hand', 'High Hold',
  'Feather Touch', 'Long Wind', 'Set And Go', 'Half Beat', 'Late Release',
  'Wrist Only', 'One Motion', 'Straight Up', 'Held Follow', 'Compact Rise',
  'Slingshot', 'Hair Trigger', 'Dead Wrist', 'Level Eyes', 'Rooftop Arc',
];

export const ACCESSORY_POOL = [
  'Wrist Tape', 'Finger Tape', 'Ankle Wrap', 'Elbow Pad', 'Palm Grip',
  'Thumb Guard', 'Wristband Stack', 'Taped Knuckles', 'Split Sleeve', 'Grip Chalk',
  'Cut Wristband', 'Half Sleeve',
];
