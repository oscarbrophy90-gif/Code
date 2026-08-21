/* Are the new species and rods actually reachable, or just present in the data?
   Rolls a large sample at the far end and reports which of them turn up. */
const { load } = require('./headless');
const VF = load(['js/core/util.js','js/core/rng.js','js/core/bus.js','js/core/state.js','js/core/save.js',
 'js/data/rarities.js','js/data/traits.js','js/data/fish.js','js/data/rods.js','js/data/bait.js',
 'js/data/locations.js','js/data/weather.js','js/data/charms.js','js/data/conditions.js',
 'js/systems/time.js','js/systems/weather.js','js/systems/progression.js','js/systems/build.js',
 'js/systems/conditions.js','js/systems/economy.js','js/systems/loot.js']);

const NEW = ['reed_dace','button_crab','chalk_sole','kettle_perch','sew_eel','tin_shoal',
  'cold_marlin','bell_jelly','grave_carp','lamp_ray','stitch_bream','ash_ray','root_pike',
  'coin_king','tally_fish','salt_widow','folded_letter','mirror_twin','sunken_column',
  'spiral_saint','the_absence','the_census','the_understudy','the_long_now',
  'g_swarm','g_price','g_cursor','g_recursion','g_zero','g_gardener','g_reader',
  'g_trench','g_secondmoon','g_prayed','g_unshoal','g_firstwater',
  // third catalogue
  'pin_bream','mud_gudgeon','paper_ray','kelp_perch','coin_minnow','ribbon_smelt',
  'knot_loach','chip_crab','lamp_fry',
  'wire_pike','moth_ray','salt_jelly','char_eel','twinned_perch','thorn_bream','ink_sole',
  'glass_shrimp','nine_gill','dust_carp',
  'lattice_eel','anvil_ray','ember_pike','chorus_smelt','hollow_carp','crown_jelly','nail_eel',
  'archive_sole','tide_crab','still_marlin',
  'brass_whale','prism_serpent','quiet_ray','thousand_smelt','gilt_crustacean',
  'kept_promise','iron_pike','nested_bream',
  'deep_hold','longest_night','lamp_keeper','bell_of_hours','long_hand',
  'unlit_lantern','weight_of_it',
  'the_argument','the_inheritance','the_low_note','the_shed_skin','the_open_hand',
  'the_first_dark','the_kindness',
  'the_remainder','the_witness','the_second_water','the_returned','the_quiet_part','the_hour_after',
  'g_yourhook','g_door','g_boot','g_bulb','g_clock','g_key','g_sign','g_ladder','g_bench',
  'g_tv','g_window','g_umbrella','g_cage','g_bucket','g_lamp','g_tea','g_stairs'];

const d = VF.state.data;
d.level = 99;
const seen = Object.create(null);
const N = 400000;
// sample across every spot and both ends of the gear ladder
const spots = VF.locations.list.map(l => l.id);
for (let i = 0; i < N; i++) {
  d.location = spots[i % spots.length];
  d.rod = i % 3 === 0 ? 'wood' : (i % 3 === 1 ? 'deepwater' : 'unknown');
  d.bait = i % 4 === 0 ? 'worm' : (i % 4 === 1 ? 'deep' : (i % 4 === 2 ? 'void' : 'null'));
  const c = VF.loot.roll();
  if (c && c.id) seen[c.id] = (seen[c.id] | 0) + 1;
}
const missing = NEW.filter(id => !seen[id]);
console.log('sampled: ' + N.toLocaleString() + ' casts across all spots');
console.log('new species that turned up: ' + (NEW.length - missing.length) + ' / ' + NEW.length);
if (missing.length) console.log('never seen: ' + missing.join(', '));
console.log('\nrarest new ones and how often:');
NEW.map(id => [id, seen[id] | 0]).sort((a, b) => a[1] - b[1]).slice(0, 8)
  .forEach(([id, n]) => console.log('  ' + id.padEnd(18) + String(n).padStart(6) +
    '   1 in ' + (n ? Math.round(N / n).toLocaleString() : '—')));
const total = VF.fish.list.filter(f => seen[f.id]).length;
console.log('\nspecies reachable overall: ' + total + ' / ' + VF.fish.count);
/* Event and strict species are gated on something this sample never does — a
   running skyfall, an armed trial, water above the cloud. They are listed with
   the reason so an unreachable count is a fact rather than a mystery. */
const gated = VF.fish.list.filter(f => !seen[f.id]).map(function (f) {
  const why = f.event ? 'only during ' + f.event
            : f.strict ? 'only at ' + f.locs.join('/')
            : 'no reason found — CHECK';
  return '  ' + f.id.padEnd(22) + why;
});
if (gated.length) console.log('gated, not missing:\n' + gated.join('\n'));
