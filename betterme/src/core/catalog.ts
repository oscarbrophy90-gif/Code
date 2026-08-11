import type { ActivityTarget, ActivityTemplate, AttributeKey, Tier, TierSpec } from './types.ts';

/**
 * The activity catalogue.
 *
 * Everything the generator can put in front of a user lives here as data. A new
 * activity is a new entry — no other file changes. The rules an entry has to
 * follow:
 *
 *  - Every tier is a *concrete instruction*, never a vibe. "Study for 45
 *    minutes, phone in another room" beats "focus on your studies".
 *  - `requires` is a promise: if it lists `gym`, someone without a gym will
 *    never see it, so the plan is never full of things you cannot do.
 *  - `load` is physical strain, and it is what stops the generator stacking
 *    three hard sessions onto one body in one day.
 *  - Health entries are additive only — add water, add vegetables, add
 *    daylight. Nothing here tells anyone to restrict, cut or weigh anything.
 *
 *  - Tiers are listed easiest first and must pay more XP as they get harder.
 *    The generator sorts before picking, but a test enforces the order so the
 *    catalogue stays readable.
 *
 * Text may contain `{sleepTarget}` and `{waterTarget}` tokens, filled per user
 * by the generator.
 */

const T = (tier: Tier, xp: number, title: string, detail: string, target?: ActivityTarget): TierSpec => ({
  tier,
  xp,
  title,
  detail,
  target,
});

const mins = (value: number): ActivityTarget => ({ value, unit: 'min' });
const count = (value: number, unit: string): ActivityTarget => ({ value, unit });

/* ------------------------------------------------------------------ *
 * Fitness
 * ------------------------------------------------------------------ */

const FITNESS: ActivityTemplate[] = [
  {
    id: 'gym-strength',
    label: 'Gym session',
    attribute: 'fitness',
    secondary: 'discipline',
    tags: ['gym', 'strength', 'training'],
    load: 'high',
    cadence: 'few-times-week',
    requires: { minAge: 14, needs: ['gym'], notWith: ['injury', 'low-mobility'] },
    tiers: [
      T('light', 30, 'Show up and lift', 'Just get there. Warm up and do one main lift properly — that counts.', mins(20)),
      T('steady', 60, 'Gym session — 45 minutes', 'Two main lifts, two accessories. Log your weights so next week has a target.', mins(45)),
      T('hard', 105, 'Full session — 60 minutes', 'Beat one number from last time: a rep, a set, or the weight on the bar.', mins(60)),
      T('elite', 165, 'Heavy session — 75 minutes', 'Full programme, every set to a real effort. Warm up properly first.', mins(75)),
    ],
  },
  {
    id: 'home-workout',
    label: 'Home workout',
    attribute: 'fitness',
    tags: ['bodyweight', 'home', 'training'],
    load: 'moderate',
    cadence: 'most-days',
    requires: { notWith: ['low-mobility'] },
    tiers: [
      T('light', 25, 'Quick circuit', '10 push-ups, 15 squats, 20-second plank. Twice through. That is it.', mins(8)),
      T('steady', 55, 'Home workout — 20 minutes', 'Push, pull, legs, core. Three rounds, short rests, no phone between sets.', mins(20)),
      T('hard', 95, 'Home workout — 35 minutes', 'Five rounds. Pick numbers you have to fight for on the last one.', mins(35)),
    ],
  },
  {
    id: 'run',
    label: 'Run',
    attribute: 'fitness',
    secondary: 'mindset',
    tags: ['cardio', 'outdoors', 'impact', 'running'],
    load: 'high',
    cadence: 'few-times-week',
    requires: { needs: ['outdoors'], notWith: ['injury', 'low-mobility'] },
    tiers: [
      T('light', 30, 'Easy 1.5km', 'Slow. Conversational pace. The point is the shoes going on.', count(1.5, 'km')),
      T('steady', 60, 'Run 3km', 'Steady effort the whole way. Walk if you need to, then start running again.', count(3, 'km')),
      T('hard', 110, 'Run 5km', 'Try to hold an even pace. Negative split if you have it in you.', count(5, 'km')),
      T('elite', 170, 'Run 8km', 'Long one. Fuel and hydrate beforehand, and ease off if anything hurts.', count(8, 'km')),
    ],
  },
  {
    id: 'walk',
    label: 'Walk',
    attribute: 'fitness',
    secondary: 'health',
    tags: ['cardio', 'outdoors', 'low-impact', 'recovery'],
    load: 'light',
    cadence: 'daily',
    tiers: [
      T('light', 20, 'Walk for 15 minutes', 'Outside if you can. Leave the headphones in if you want — just go.', mins(15)),
      T('steady', 45, 'Walk 30 minutes', 'Proper pace, not a stroll. Good time to call someone or think something through.', mins(30)),
      T('hard', 80, 'Walk an hour', 'Long walk. New route if you can find one.', mins(60)),
    ],
  },
  {
    id: 'steps',
    label: 'Step target',
    attribute: 'fitness',
    secondary: 'health',
    tags: ['cardio', 'low-impact', 'daily'],
    load: 'light',
    cadence: 'daily',
    tiers: [
      T('light', 25, 'Hit 5,000 steps', 'Stairs instead of the lift, walk the last stop. It adds up fast.', count(5000, 'steps')),
      T('steady', 50, 'Hit 8,000 steps', 'Most of a day of normal moving, plus one deliberate walk.', count(8000, 'steps')),
      T('hard', 90, 'Hit 12,000 steps', 'You will have to plan a walk in for this one.', count(12000, 'steps')),
    ],
  },
  {
    id: 'cycle',
    label: 'Ride',
    attribute: 'fitness',
    tags: ['cardio', 'outdoors', 'low-impact', 'cycling'],
    load: 'moderate',
    cadence: 'few-times-week',
    requires: { needs: ['bike'], notWith: ['low-mobility'] },
    tiers: [
      T('steady', 60, 'Ride 8km', 'Easy gear, steady legs. Helmet on.', count(8, 'km')),
      T('hard', 105, 'Ride 15km', 'Push on the flats, spin the hills.', count(15, 'km')),
      T('elite', 165, 'Ride 30km', 'Long ride. Take water and something to eat.', count(30, 'km')),
    ],
  },
  {
    id: 'swim',
    label: 'Swim',
    attribute: 'fitness',
    secondary: 'health',
    tags: ['cardio', 'low-impact', 'swimming'],
    load: 'moderate',
    cadence: 'few-times-week',
    requires: { needs: ['pool'] },
    tiers: [
      T('light', 35, 'Easy swim — 15 minutes', 'Lengths at your own pace. Rest at the wall whenever you need it.', mins(15)),
      T('steady', 65, 'Swim 30 minutes', 'Mix strokes. Count your lengths so you know what today was worth.', mins(30)),
      T('hard', 110, 'Swim 45 minutes', 'Sets with short rests. Beat last week by one length.', mins(45)),
    ],
  },
  {
    id: 'sport-practice',
    label: 'Sport practice',
    attribute: 'fitness',
    secondary: 'skills',
    tags: ['sport', 'skill', 'training'],
    load: 'high',
    cadence: 'few-times-week',
    requires: { needs: ['sports-team'], notWith: ['injury'] },
    tiers: [
      T('steady', 65, 'Practice session', 'Turn up, work, and do one drill more than the coach asked for.', mins(45)),
      T('hard', 110, 'Full training', 'Full session at full effort, plus 15 minutes of your weakest skill after.', mins(75)),
      T('elite', 170, 'Training + extra work', 'Full session, then stay back and drill the thing you are worst at.', mins(100)),
    ],
  },
  {
    id: 'solo-skill-drill',
    label: 'Solo drills',
    attribute: 'fitness',
    secondary: 'skills',
    tags: ['sport', 'skill', 'outdoors'],
    load: 'moderate',
    cadence: 'most-days',
    requires: { interests: ['team-sport', 'martial-arts'], notWith: ['injury'] },
    tiers: [
      T('light', 30, 'Ten minutes of one skill', 'One skill. Ten minutes. Reps, not games.', mins(10)),
      T('steady', 60, 'Drill your weakest skill', 'Twenty-five minutes on the thing you avoid in games. That is the whole point.', mins(25)),
      T('hard', 100, 'Long skill session', 'Forty-five minutes, three drills, count your reps.', mins(45)),
    ],
  },
  {
    id: 'intervals',
    label: 'Intervals',
    attribute: 'fitness',
    tags: ['cardio', 'impact', 'conditioning'],
    load: 'high',
    cadence: 'weekly',
    requires: { minAge: 16, notWith: ['injury', 'low-mobility'] },
    tiers: [
      T('hard', 110, 'Interval session', 'Warm up 10 minutes. Then 6 × 1 minute hard, 2 minutes easy. Cool down.', mins(30)),
      T('elite', 170, 'Hard intervals', 'Warm up. 10 × 1 minute hard, 90 seconds easy. Stop early if your form goes.', mins(40)),
    ],
  },
  {
    id: 'martial-arts',
    label: 'Martial arts',
    attribute: 'fitness',
    secondary: 'discipline',
    tags: ['sport', 'skill', 'training'],
    load: 'high',
    cadence: 'few-times-week',
    requires: { interests: ['martial-arts'], notWith: ['injury'] },
    tiers: [
      T('steady', 65, 'Training session', 'Get on the mats. Drill the basics like they are new.', mins(45)),
      T('hard', 115, 'Full class + rounds', 'Class, then rounds. Reset your guard every single time.', mins(75)),
    ],
  },
  {
    id: 'mobility',
    label: 'Mobility',
    attribute: 'fitness',
    secondary: 'health',
    tags: ['recovery', 'low-impact', 'mobility'],
    load: 'none',
    cadence: 'daily',
    tiers: [
      T('light', 20, 'Stretch for 8 minutes', 'Hips, hamstrings, shoulders. Breathe out into each one.', mins(8)),
      T('steady', 45, 'Mobility — 20 minutes', 'Full routine, slow. Chase the tight side, not the easy one.', mins(20)),
    ],
  },
  {
    id: 'yoga',
    label: 'Yoga',
    attribute: 'fitness',
    secondary: 'mindset',
    tags: ['recovery', 'low-impact', 'mobility', 'calm'],
    load: 'light',
    cadence: 'few-times-week',
    requires: { interests: ['yoga'] },
    tiers: [
      T('light', 30, 'Short flow — 12 minutes', 'Follow along with anything. Just get on the mat.', mins(12)),
      T('steady', 60, 'Yoga — 30 minutes', 'Full session. Stay in the poses you want to leave.', mins(30)),
    ],
  },
  {
    id: 'core',
    label: 'Core work',
    attribute: 'fitness',
    tags: ['strength', 'home', 'core'],
    load: 'moderate',
    cadence: 'most-days',
    requires: { notWith: ['injury', 'low-mobility'] },
    tiers: [
      T('light', 22, 'Core — 5 minutes', 'Plank, dead bugs, side plank. One round.', mins(5)),
      T('steady', 50, 'Core circuit', 'Three rounds. Slow reps beat fast ones here.', mins(12)),
    ],
  },
  {
    id: 'seated-movement',
    label: 'Gentle movement',
    attribute: 'fitness',
    secondary: 'health',
    tags: ['low-impact', 'accessible', 'recovery'],
    load: 'none',
    cadence: 'daily',
    // The accessible alternative to a workout. Only offered to people who told
    // us they need it — otherwise it crowds out work they could actually do.
    requires: { onlyWith: ['injury', 'low-mobility'] },
    tiers: [
      T('light', 25, 'Gentle movement — 10 minutes', 'Seated or standing, whatever works today. Arms, shoulders, ankles, breathing.', mins(10)),
      T('steady', 45, 'Gentle movement — 20 minutes', 'Full range, easy pace. Stop anywhere it hurts rather than pushing through.', mins(20)),
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Education
 * ------------------------------------------------------------------ */

const EDUCATION: ActivityTemplate[] = [
  {
    id: 'study-block',
    label: 'Study block',
    attribute: 'education',
    secondary: 'productivity',
    tags: ['study', 'focus'],
    cadence: 'daily',
    requires: { student: true },
    tiers: [
      T('light', 30, 'Study for 25 minutes', 'One timer, one subject, phone in another room. Stop when it goes off.', mins(25)),
      T('steady', 60, 'Study for 45 minutes', 'Pick the subject you have been avoiding. That is the one worth points.', mins(45)),
      T('hard', 105, 'Study for 90 minutes', 'Two blocks with a five-minute break. No notifications for either.', mins(90)),
      T('elite', 165, 'Deep study — 2 hours', 'Three blocks. Water on the desk, phone in another room, one subject only.', mins(120)),
    ],
  },
  {
    id: 'homework',
    label: 'Homework',
    attribute: 'education',
    secondary: 'discipline',
    tags: ['study', 'school'],
    cadence: 'daily',
    requires: { student: true },
    tiers: [
      T('light', 30, 'Clear one task', 'The smallest thing on the list. Done is the goal.', count(1, 'task')),
      T('steady', 60, 'Finish today’s homework', 'All of it, before it becomes tomorrow’s problem.', count(1, 'set')),
      T('hard', 100, 'Homework + get ahead', 'Finish what is due, then start what is due next.', count(2, 'sets')),
    ],
  },
  {
    id: 'revision',
    label: 'Revision',
    attribute: 'education',
    tags: ['study', 'memory'],
    cadence: 'most-days',
    requires: { student: true },
    tiers: [
      T('light', 30, 'Review yesterday’s notes', 'Ten minutes re-reading beats an hour of re-learning next month.', mins(10)),
      T('steady', 60, 'Active recall — 30 minutes', 'Cover the page and write what you remember. Then check. That gap is the learning.', mins(30)),
      T('hard', 100, 'Full revision session', 'Flashcards or blurting for 50 minutes on your weakest topic.', mins(50)),
    ],
  },
  {
    id: 'practice-test',
    label: 'Practice test',
    attribute: 'education',
    secondary: 'discipline',
    tags: ['study', 'exam'],
    cadence: 'weekly',
    requires: { student: true },
    tiers: [
      T('hard', 115, 'Sit a past paper', 'Timed. No notes. Mark it honestly afterwards — that is where the points are.', mins(60)),
      T('elite', 175, 'Full paper under exam conditions', 'Real timing, no interruptions, then a full mark-up of every mistake.', mins(120)),
    ],
  },
  {
    id: 'rewrite-notes',
    label: 'Notes',
    attribute: 'education',
    secondary: 'productivity',
    tags: ['study', 'organisation'],
    cadence: 'few-times-week',
    requires: { student: true },
    tiers: [
      T('light', 30, 'Tidy one set of notes', 'One topic. Headings, key points, gaps marked in a different colour.', mins(15)),
      T('steady', 55, 'Rewrite a topic properly', 'Condense a whole topic onto one page. If it does not fit, you do not know it yet.', mins(35)),
    ],
  },
  {
    id: 'teach-back',
    label: 'Teach it back',
    attribute: 'education',
    secondary: 'skills',
    tags: ['study', 'memory'],
    cadence: 'few-times-week',
    tiers: [
      T('steady', 60, 'Explain a topic out loud', 'Ten minutes, no notes, to a person or an empty room. Where you stumble is what to study.', mins(10)),
      T('hard', 95, 'Teach someone properly', 'Actually teach a topic to a friend, sibling or classmate until they get it.', mins(25)),
    ],
  },
  {
    id: 'read-nonfiction',
    label: 'Reading',
    attribute: 'education',
    secondary: 'mindset',
    tags: ['reading', 'learning'],
    cadence: 'daily',
    tiers: [
      T('light', 25, 'Read 10 pages', 'Anything that teaches you something. Ten pages is nothing and it compounds.', count(10, 'pages')),
      T('steady', 55, 'Read for 30 minutes', 'Phone in another room. One chapter, one note about it when you finish.', mins(30)),
      T('hard', 95, 'Read 50 pages', 'A serious sitting. Write three lines on what you took from it.', count(50, 'pages')),
    ],
  },
  {
    id: 'language-study',
    label: 'Language study',
    attribute: 'education',
    secondary: 'skills',
    tags: ['language', 'learning'],
    cadence: 'daily',
    requires: { interests: ['language'] },
    tiers: [
      T('light', 25, 'One lesson', 'Ten minutes of vocab. Daily beats heavy.', mins(10)),
      T('steady', 55, 'Study — 25 minutes', 'Vocab plus one piece of real content: a song, a clip, a page.', mins(25)),
      T('hard', 95, 'Immersion hour', 'An hour in the language. Reading, listening, writing — no English if you can help it.', mins(60)),
    ],
  },
  {
    id: 'problem-sets',
    label: 'Problem practice',
    attribute: 'education',
    tags: ['study', 'maths', 'practice'],
    cadence: 'most-days',
    requires: { student: true },
    tiers: [
      T('light', 30, 'Five practice questions', 'Five. Marked. Corrections written out.', count(5, 'questions')),
      T('steady', 60, 'Fifteen questions', 'Work through them, mark them, then redo every one you got wrong.', count(15, 'questions')),
      T('hard', 100, 'Thirty questions', 'A full set on your weakest topic, marked and corrected.', count(30, 'questions')),
    ],
  },
  {
    id: 'ask-for-help',
    label: 'Ask for help',
    attribute: 'education',
    secondary: 'social',
    tags: ['study', 'courage'],
    cadence: 'weekly',
    requires: { student: true },
    tiers: [
      T('steady', 65, 'Ask about the thing you don’t get', 'Teacher, tutor, classmate, forum. One question, asked out loud. This one is harder than it sounds.', count(1, 'question')),
    ],
  },
  {
    id: 'study-plan',
    label: 'Study plan',
    attribute: 'education',
    secondary: 'productivity',
    tags: ['study', 'planning'],
    cadence: 'weekly',
    requires: { student: true },
    tiers: [
      T('steady', 60, 'Plan your study week', 'Deadlines on a calendar, subjects on days, hardest one earliest.', mins(20)),
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Discipline
 * ------------------------------------------------------------------ */

const DISCIPLINE: ActivityTemplate[] = [
  {
    id: 'wake-on-time',
    label: 'No snooze',
    attribute: 'discipline',
    secondary: 'sleep',
    tags: ['morning', 'routine'],
    cadence: 'daily',
    when: 'morning',
    tiers: [
      T('light', 30, 'Up on the first alarm', 'Feet on the floor before your brain gets a vote.', count(1, 'alarm')),
      T('steady', 55, 'Up on time, no snooze', 'Same time you planned. No negotiating with yourself at 6am.', count(1, 'alarm')),
    ],
  },
  {
    id: 'phone-free-morning',
    label: 'Phone-free morning',
    attribute: 'discipline',
    secondary: 'mindset',
    tags: ['morning', 'screens', 'routine'],
    cadence: 'most-days',
    when: 'morning',
    tiers: [
      T('steady', 60, 'No phone for the first 30 minutes', 'Not one scroll before you are up, dressed and moving.', mins(30)),
      T('hard', 100, 'No phone until the first hour is done', 'Wake, move, eat, start your day. Then the phone.', mins(60)),
    ],
  },
  {
    id: 'hardest-first',
    label: 'Hardest thing first',
    attribute: 'discipline',
    secondary: 'productivity',
    tags: ['focus', 'routine'],
    cadence: 'most-days',
    when: 'morning',
    tiers: [
      T('steady', 65, 'Do the worst task first', 'The one you have been carrying around. Before anything easier.', count(1, 'task')),
      T('hard', 110, 'Clear the two you’ve been avoiding', 'Both of them, before lunch. The rest of the day gets lighter immediately.', count(2, 'tasks')),
    ],
  },
  {
    id: 'cold-shower',
    label: 'Cold finish',
    attribute: 'discipline',
    tags: ['morning', 'routine'],
    cadence: 'most-days',
    requires: { minAge: 16 },
    tiers: [
      T('light', 30, 'Finish your shower cold', 'Last 30 seconds. Breathe slowly instead of bracing. Skip it if you are unwell.', count(30, 'sec')),
      T('steady', 55, 'Two minutes cold', 'Steady breathing the whole way. Get out if you start shivering hard.', mins(2)),
    ],
  },
  {
    id: 'make-bed',
    label: 'Make your bed',
    attribute: 'discipline',
    secondary: 'productivity',
    tags: ['morning', 'routine', 'space'],
    cadence: 'daily',
    when: 'morning',
    tiers: [T('light', 20, 'Make your bed', 'Sixty seconds. First thing won today, and the room already looks different.', mins(1))],
  },
  {
    id: 'screen-cap',
    label: 'Screen limit',
    attribute: 'discipline',
    secondary: 'mindset',
    tags: ['screens', 'focus'],
    cadence: 'most-days',
    tiers: [
      T('steady', 60, 'Stay under 2 hours of scrolling', 'Social apps only. Check the number tonight and be honest about it.', count(2, 'hours')),
      T('hard', 105, 'One hour of social, maximum', 'Set the timer at the start of the day, not after you have blown past it.', count(1, 'hour')),
    ],
  },
  {
    id: 'digital-sunset',
    label: 'Digital sunset',
    attribute: 'discipline',
    secondary: 'sleep',
    tags: ['screens', 'evening', 'routine'],
    cadence: 'most-days',
    when: 'evening',
    tiers: [
      T('steady', 60, 'Phone down 30 minutes before bed', 'Charge it across the room. That single change fixes more sleep than anything else here.', mins(30)),
      T('hard', 100, 'Screens off an hour before bed', 'Book, stretch, plan tomorrow. Anything but a screen.', mins(60)),
    ],
  },
  {
    id: 'keep-promise',
    label: 'Keep your word',
    attribute: 'discipline',
    secondary: 'social',
    tags: ['integrity', 'routine'],
    cadence: 'few-times-week',
    tiers: [
      T('steady', 65, 'Do the thing you said you would', 'The one you promised someone else. Today, not "soon".', count(1, 'promise')),
    ],
  },
  {
    id: 'no-excuses',
    label: 'No-excuse task',
    attribute: 'discipline',
    tags: ['courage', 'focus'],
    cadence: 'few-times-week',
    tiers: [
      T('hard', 110, 'Do the thing you keep putting off', 'The email, the call, the apology, the form. Ten minutes of discomfort, weeks of relief.', count(1, 'task')),
    ],
  },
  {
    id: 'prep-tomorrow',
    label: 'Prep tomorrow',
    attribute: 'discipline',
    secondary: 'productivity',
    tags: ['evening', 'routine', 'planning'],
    cadence: 'daily',
    when: 'evening',
    tiers: [
      T('light', 25, 'Lay tomorrow out', 'Clothes, bag, bottle, keys. Five minutes tonight, twenty saved in the morning.', mins(5)),
      T('steady', 50, 'Plan tomorrow properly', 'Three things that must happen, written down, hardest one first.', mins(10)),
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Health
 * ------------------------------------------------------------------ */

const HEALTH: ActivityTemplate[] = [
  {
    id: 'water',
    label: 'Hydration',
    attribute: 'health',
    tags: ['hydration', 'daily'],
    cadence: 'daily',
    tiers: [
      T('light', 25, 'Drink 4 glasses of water', 'Start with one now. Keep the bottle where you can see it.', count(4, 'glasses')),
      T('steady', 50, 'Hit {waterTarget} glasses of water', 'Spread across the day, not all at 9pm.', count(8, 'glasses')),
    ],
  },
  {
    id: 'vegetables',
    label: 'Real food',
    attribute: 'health',
    tags: ['food', 'daily'],
    cadence: 'daily',
    tiers: [
      T('light', 25, 'Add vegetables or fruit to one meal', 'Add, do not remove. One handful counts.', count(1, 'meal')),
      T('steady', 55, 'Vegetables or fruit at three meals', 'Every meal gets something that grew. That is the whole rule.', count(3, 'meals')),
    ],
  },
  {
    id: 'breakfast',
    label: 'Eat breakfast',
    attribute: 'health',
    secondary: 'productivity',
    tags: ['food', 'morning'],
    cadence: 'daily',
    when: 'morning',
    tiers: [T('light', 25, 'Eat a proper breakfast', 'Something with protein in it. Not a coffee and a promise.', count(1, 'meal'))],
  },
  {
    id: 'sunlight',
    label: 'Daylight',
    attribute: 'health',
    secondary: 'mindset',
    tags: ['outdoors', 'morning', 'energy'],
    cadence: 'daily',
    when: 'morning',
    requires: { notWith: ['no-outdoor-space'] },
    tiers: [
      T('light', 25, 'Get 10 minutes of daylight', 'Ideally within an hour of waking. It sets tonight’s sleep up.', mins(10)),
      T('steady', 50, 'Half an hour outside', 'Walk, sit, eat out there. Just be outside and off the screen.', mins(30)),
    ],
  },
  {
    id: 'movement-breaks',
    label: 'Movement breaks',
    attribute: 'health',
    secondary: 'productivity',
    tags: ['desk', 'daily', 'low-impact'],
    cadence: 'daily',
    tiers: [
      T('light', 25, 'Stand up every hour', 'Three breaks minimum. Two minutes of moving each time.', count(3, 'breaks')),
      T('steady', 50, 'Five movement breaks', 'Every hour you sit, two minutes on your feet. Set a reminder.', count(5, 'breaks')),
    ],
  },
  {
    id: 'swap-drink',
    label: 'Swap one drink',
    attribute: 'health',
    secondary: 'discipline',
    tags: ['hydration', 'food'],
    cadence: 'most-days',
    tiers: [T('light', 30, 'Swap one sugary drink for water', 'One. Not all of them, not forever. Just one, today.', count(1, 'drink'))],
  },
  {
    id: 'hygiene',
    label: 'Look after yourself',
    attribute: 'health',
    secondary: 'discipline',
    tags: ['routine', 'daily'],
    cadence: 'daily',
    tiers: [T('light', 20, 'Full evening routine', 'Brush, floss, shower, clean clothes out for tomorrow. Basic, and it changes how you feel.', mins(10))],
  },
  {
    id: 'recovery-day',
    label: 'Recovery',
    attribute: 'health',
    secondary: 'sleep',
    tags: ['recovery', 'rest', 'low-impact'],
    cadence: 'weekly',
    tiers: [
      T('light', 35, 'Take a real rest day', 'No training. Stretch, hydrate, sleep. Recovery is where the gains actually land.', mins(1)),
    ],
  },
  {
    id: 'cook-meal',
    label: 'Cook a meal',
    attribute: 'health',
    secondary: 'skills',
    tags: ['food', 'cooking', 'skill'],
    cadence: 'few-times-week',
    requires: { needs: ['kitchen'] },
    tiers: [
      T('steady', 60, 'Cook something from scratch', 'Real ingredients, your own hands. Clean as you go.', mins(35)),
      T('hard', 100, 'Cook and prep tomorrow too', 'Make double. Tomorrow’s you gets a free win.', mins(60)),
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Sleep
 * ------------------------------------------------------------------ */

const SLEEP: ActivityTemplate[] = [
  {
    id: 'sleep-hours',
    label: 'Sleep hours',
    attribute: 'sleep',
    secondary: 'health',
    tags: ['sleep', 'nightly'],
    cadence: 'daily',
    when: 'evening',
    tiers: [
      T('light', 30, 'Get 7 hours', 'Count back from your alarm and set a bedtime reminder now.', count(7, 'hours')),
      T('steady', 60, 'Get {sleepTarget} hours', 'The single highest-return thing on this whole card.', count(8, 'hours')),
    ],
  },
  {
    id: 'bed-on-time',
    label: 'Bedtime',
    attribute: 'sleep',
    secondary: 'discipline',
    tags: ['sleep', 'routine', 'evening'],
    cadence: 'daily',
    when: 'evening',
    tiers: [
      T('steady', 55, 'In bed at your target time', 'In bed, lights out, phone away. Not "in bed on your phone".', count(1, 'night')),
      T('hard', 95, 'Same bedtime, lights out early', 'Thirty minutes earlier than usual. Tomorrow will feel like a different day.', count(1, 'night')),
    ],
  },
  {
    id: 'no-screens-bed',
    label: 'Screens off',
    attribute: 'sleep',
    secondary: 'discipline',
    tags: ['sleep', 'screens', 'evening'],
    cadence: 'most-days',
    when: 'evening',
    tiers: [T('steady', 55, 'No screens in bed', 'Phone charges across the room. Read instead if you need something.', mins(30))],
  },
  {
    id: 'consistent-wake',
    label: 'Same wake time',
    attribute: 'sleep',
    secondary: 'discipline',
    tags: ['sleep', 'routine', 'morning'],
    cadence: 'daily',
    when: 'morning',
    tiers: [T('steady', 55, 'Wake at the same time as yesterday', 'Weekends included. Your body clock does not know it is Saturday.', count(1, 'morning'))],
  },
  {
    id: 'winddown',
    label: 'Wind-down',
    attribute: 'sleep',
    secondary: 'mindset',
    tags: ['sleep', 'evening', 'calm'],
    cadence: 'most-days',
    when: 'evening',
    tiers: [
      T('light', 25, 'Ten quiet minutes before bed', 'Lights down, no screen, slow breathing. Signal to your body that the day is over.', mins(10)),
      T('steady', 55, 'Full wind-down routine', 'Twenty minutes: tidy, shower, stretch, read. Same order every night.', mins(20)),
    ],
  },
  {
    id: 'caffeine-curfew',
    label: 'Caffeine curfew',
    attribute: 'sleep',
    secondary: 'discipline',
    tags: ['sleep', 'food'],
    cadence: 'most-days',
    requires: { minAge: 14 },
    tiers: [T('steady', 50, 'No caffeine after 2pm', 'It is still in your system at midnight, whether you feel it or not.', count(1, 'day'))],
  },
];

/* ------------------------------------------------------------------ *
 * Productivity
 * ------------------------------------------------------------------ */

const PRODUCTIVITY: ActivityTemplate[] = [
  {
    id: 'deep-work',
    label: 'Deep work',
    attribute: 'productivity',
    secondary: 'discipline',
    tags: ['focus', 'work'],
    cadence: 'daily',
    tiers: [
      T('light', 30, 'One 25-minute focus block', 'Timer on, phone away, one task. Stop at the beep.', mins(25)),
      T('steady', 60, '50 minutes of deep work', 'One task, no tabs, no phone. Write down what you got done after.', mins(50)),
      T('hard', 105, 'Two deep work blocks', 'Two × 50 minutes with a real break between. Same task both times.', mins(110)),
      T('elite', 165, 'Three-hour work session', 'Three blocks. Phone in another room for all of it.', mins(180)),
    ],
  },
  {
    id: 'clean-room',
    label: 'Clean your space',
    attribute: 'productivity',
    secondary: 'mindset',
    tags: ['space', 'chores'],
    cadence: 'few-times-week',
    tiers: [
      T('light', 25, 'Ten-minute reset', 'Timer on. Floor, surfaces, bin. Stop when it goes off.', mins(10)),
      T('steady', 55, 'Clean your room properly', 'Everything back where it lives, bed made, floor clear, bin out.', mins(30)),
      T('hard', 95, 'Deep clean', 'Full clean plus one drawer, shelf or corner you have been ignoring for months.', mins(60)),
    ],
  },
  {
    id: 'tidy-desk',
    label: 'Clear the desk',
    attribute: 'productivity',
    tags: ['space', 'focus'],
    cadence: 'most-days',
    tiers: [T('light', 20, 'Clear your desk', 'Two minutes. You cannot think straight on a desk you cannot see.', mins(2))],
  },
  {
    id: 'task-list',
    label: 'Clear the list',
    attribute: 'productivity',
    tags: ['planning', 'work'],
    cadence: 'daily',
    tiers: [
      T('light', 30, 'Close out three small tasks', 'The five-minute ones you keep re-reading. Clear all three.', count(3, 'tasks')),
      T('steady', 60, 'Empty your to-do list', 'Do it, schedule it, or delete it. Nothing stays undecided.', count(1, 'list')),
    ],
  },
  {
    id: 'plan-day',
    label: 'Plan the day',
    attribute: 'productivity',
    secondary: 'discipline',
    tags: ['planning', 'morning'],
    cadence: 'daily',
    when: 'morning',
    tiers: [T('light', 25, 'Write your three must-dos', 'Three. Not ten. Ordered hardest first.', mins(5))],
  },
  {
    id: 'chores',
    label: 'Chores',
    attribute: 'productivity',
    secondary: 'social',
    tags: ['home', 'chores'],
    cadence: 'few-times-week',
    tiers: [
      T('light', 25, 'One chore, properly', 'Dishes, washing, bins. The one nobody has done.', count(1, 'chore')),
      T('steady', 55, 'Three chores done', 'Without being asked. Someone will notice, and that counts too.', count(3, 'chores')),
    ],
  },
  {
    id: 'weekly-review',
    label: 'Weekly review',
    attribute: 'productivity',
    secondary: 'mindset',
    tags: ['planning', 'reflection'],
    cadence: 'weekly',
    tiers: [
      T('steady', 70, 'Review the week, plan the next', 'What worked, what did not, what changes. Twenty honest minutes.', mins(20)),
    ],
  },
  {
    id: 'single-task',
    label: 'One thing at a time',
    attribute: 'productivity',
    secondary: 'mindset',
    tags: ['focus'],
    cadence: 'most-days',
    tiers: [T('steady', 55, 'Do one task with nothing else open', 'No second tab, no music with words, no phone face-up. One thing.', mins(30))],
  },
];

/* ------------------------------------------------------------------ *
 * Social
 * ------------------------------------------------------------------ */

const SOCIAL: ActivityTemplate[] = [
  {
    id: 'message-friend',
    label: 'Reach out',
    attribute: 'social',
    tags: ['connection'],
    cadence: 'daily',
    tiers: [
      T('light', 25, 'Message someone you have not spoken to', 'Not a like. An actual message, with a question in it.', count(1, 'person')),
      T('steady', 55, 'Have a real conversation', 'Voice note, call or in person. Ten minutes of actual back and forth.', mins(10)),
    ],
  },
  {
    id: 'call-family',
    label: 'Call family',
    attribute: 'social',
    secondary: 'mindset',
    tags: ['connection', 'family'],
    cadence: 'few-times-week',
    tiers: [T('steady', 60, 'Call a family member', 'Ten minutes. Ask them something you do not already know the answer to.', mins(10))],
  },
  {
    id: 'meet-up',
    label: 'See someone',
    attribute: 'social',
    tags: ['connection', 'outdoors'],
    cadence: 'weekly',
    tiers: [
      T('steady', 65, 'Make a plan and lock it in', 'Actual day, actual time, message sent. Half the battle is the invite.', count(1, 'plan')),
      T('hard', 110, 'See someone in person', 'Make the plan and go. Screens do not count for this one.', mins(60)),
    ],
  },
  {
    id: 'appreciation',
    label: 'Tell someone',
    attribute: 'social',
    secondary: 'mindset',
    tags: ['connection', 'kindness'],
    cadence: 'few-times-week',
    tiers: [T('light', 30, 'Tell someone what they mean to you', 'Specific, not generic. It will make their week and cost you nothing.', count(1, 'person'))],
  },
  {
    id: 'help-someone',
    label: 'Help someone',
    attribute: 'social',
    secondary: 'mindset',
    tags: ['kindness'],
    cadence: 'few-times-week',
    tiers: [
      T('steady', 60, 'Help someone with something', 'Without being asked, and without mentioning it afterwards.', count(1, 'person')),
    ],
  },
  {
    id: 'phone-free-meal',
    label: 'Phone-free meal',
    attribute: 'social',
    secondary: 'discipline',
    tags: ['family', 'screens'],
    cadence: 'most-days',
    tiers: [T('light', 25, 'Eat one meal with no phone', 'Face down, other room, whatever it takes. Talk to whoever is there.', count(1, 'meal'))],
  },
  {
    id: 'new-conversation',
    label: 'Talk to someone new',
    attribute: 'social',
    secondary: 'mindset',
    tags: ['courage', 'connection'],
    cadence: 'weekly',
    tiers: [
      T('hard', 105, 'Start a conversation with someone new', 'Classmate, teammate, colleague. One question is enough to start.', count(1, 'person')),
    ],
  },
  {
    id: 'join-something',
    label: 'Join something',
    attribute: 'social',
    secondary: 'skills',
    tags: ['courage', 'connection'],
    cadence: 'weekly',
    tiers: [
      T('elite', 160, 'Show up to a club, team or group', 'The first time is the hard one. Turn up once and it stops being scary.', count(1, 'session')),
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Skills
 * ------------------------------------------------------------------ */

const SKILLS: ActivityTemplate[] = [
  {
    id: 'instrument',
    label: 'Instrument practice',
    attribute: 'skills',
    secondary: 'discipline',
    tags: ['music', 'practice'],
    cadence: 'daily',
    requires: { needs: ['instrument'] },
    tiers: [
      T('light', 30, 'Play for 15 minutes', 'Scales or a piece. Fifteen minutes daily beats two hours on Sunday.', mins(15)),
      T('steady', 60, 'Practise for 30 minutes', 'Ten minutes technique, twenty on the section you keep fumbling.', mins(30)),
      T('hard', 105, 'Full practice — an hour', 'Warm up, drill the hard bar slowly, then play it up to speed.', mins(60)),
    ],
  },
  {
    id: 'coding',
    label: 'Coding practice',
    attribute: 'skills',
    secondary: 'education',
    tags: ['coding', 'practice'],
    cadence: 'daily',
    requires: { needs: ['computer'], interests: ['coding'] },
    tiers: [
      T('light', 30, 'Solve one problem', 'One exercise, start to finish, even a small one.', count(1, 'problem')),
      T('steady', 60, 'Code for 45 minutes', 'On your project, not on tutorials. Building beats watching.', mins(45)),
      T('hard', 110, 'Ship something', 'Get one feature or fix actually working and committed today.', count(1, 'feature')),
    ],
  },
  {
    id: 'art',
    label: 'Draw / design',
    attribute: 'skills',
    secondary: 'mindset',
    tags: ['art', 'practice', 'creative'],
    cadence: 'most-days',
    requires: { interests: ['art'] },
    tiers: [
      T('light', 30, 'Sketch for 15 minutes', 'Anything in front of you. Bad drawings still count as reps.', mins(15)),
      T('steady', 60, 'Work on a piece — 40 minutes', 'One piece, one sitting. Finish something small rather than starting something big.', mins(40)),
    ],
  },
  {
    id: 'writing',
    label: 'Writing',
    attribute: 'skills',
    secondary: 'mindset',
    tags: ['writing', 'creative', 'practice'],
    cadence: 'most-days',
    requires: { interests: ['writing'] },
    tiers: [
      T('light', 30, 'Write 250 words', 'Anything. Badly is fine. Volume first, quality later.', count(250, 'words')),
      T('steady', 60, 'Write 600 words', 'One sitting, no editing until the end.', count(600, 'words')),
      T('hard', 105, 'Write and edit 1,000 words', 'Draft it, leave it ten minutes, then cut a tenth of it.', count(1000, 'words')),
    ],
  },
  {
    id: 'speak-language',
    label: 'Speak it',
    attribute: 'skills',
    secondary: 'social',
    tags: ['language', 'courage', 'practice'],
    cadence: 'few-times-week',
    requires: { interests: ['language'] },
    tiers: [
      T('steady', 65, 'Speak out loud for 10 minutes', 'To an app, a partner, or a mirror. Reading silently is not learning to speak.', mins(10)),
      T('hard', 110, 'Have a real conversation in it', 'With an actual person. You will be bad at it, and that is the exercise.', mins(15)),
    ],
  },
  {
    id: 'chess',
    label: 'Chess / puzzles',
    attribute: 'skills',
    secondary: 'education',
    tags: ['chess', 'thinking', 'practice'],
    cadence: 'most-days',
    requires: { interests: ['chess'] },
    tiers: [
      T('light', 25, 'Ten puzzles', 'Pattern reps. Do not rush the ones you get wrong.', count(10, 'puzzles')),
      T('steady', 55, 'Play and review one game', 'The review is the part that makes you better, not the game.', mins(30)),
    ],
  },
  {
    id: 'project-push',
    label: 'Project work',
    attribute: 'skills',
    secondary: 'productivity',
    tags: ['creative', 'project'],
    cadence: 'most-days',
    tiers: [
      T('steady', 60, 'Move your project forward 30 minutes', 'Whatever you are building. One concrete step, today.', mins(30)),
      T('hard', 110, 'Big push on your project', 'Ninety minutes. Finish a piece of it you can actually show someone.', mins(90)),
    ],
  },
  {
    id: 'learn-new',
    label: 'Learn something',
    attribute: 'skills',
    secondary: 'education',
    tags: ['learning', 'curiosity'],
    cadence: 'most-days',
    tiers: [
      T('light', 25, 'Learn one new thing', 'Twenty minutes on anything that interests you. Write down one line about it.', mins(20)),
      T('steady', 55, 'One lesson of a course', 'A real lesson, with notes and the exercise done — not a video in the background.', mins(40)),
    ],
  },
  {
    id: 'money-skill',
    label: 'Money & business',
    attribute: 'skills',
    secondary: 'education',
    tags: ['business', 'learning'],
    cadence: 'few-times-week',
    requires: { minAge: 15, interests: ['business'] },
    tiers: [
      T('light', 30, 'Track what you spent', 'Every expense this week, written down. Uncomfortable and useful.', mins(15)),
      T('steady', 60, 'Learn one money or business idea', 'One concept, properly understood, explained back in your own words.', mins(30)),
    ],
  },
  {
    id: 'new-recipe',
    label: 'New recipe',
    attribute: 'skills',
    secondary: 'health',
    tags: ['cooking', 'creative'],
    cadence: 'weekly',
    requires: { needs: ['kitchen'], interests: ['cooking'] },
    tiers: [T('hard', 100, 'Cook something you have never made', 'Pick it, shop for it, make it. Even if it goes wrong.', mins(60))],
  },
];

/* ------------------------------------------------------------------ *
 * Mindset
 * ------------------------------------------------------------------ */

const MINDSET: ActivityTemplate[] = [
  {
    id: 'journal',
    label: 'Journal',
    attribute: 'mindset',
    tags: ['reflection', 'writing'],
    cadence: 'daily',
    when: 'evening',
    tiers: [
      T('light', 25, 'Write three lines about today', 'What happened, how you felt, what you would change. Three lines.', mins(5)),
      T('steady', 55, 'Journal for 15 minutes', 'Unfiltered. Nobody is reading it, so stop editing yourself.', mins(15)),
    ],
  },
  {
    id: 'gratitude',
    label: 'Gratitude',
    attribute: 'mindset',
    secondary: 'social',
    tags: ['reflection'],
    cadence: 'daily',
    tiers: [T('light', 25, 'Write down three good things', 'Specific to today. "My family" does not count; what they did does.', count(3, 'things'))],
  },
  {
    id: 'meditate',
    label: 'Meditate',
    attribute: 'mindset',
    secondary: 'health',
    tags: ['calm', 'focus'],
    cadence: 'daily',
    tiers: [
      T('light', 25, 'Sit still for 5 minutes', 'Eyes closed, follow your breath. Your mind will wander. Bring it back. That is the rep.', mins(5)),
      T('steady', 55, 'Meditate for 15 minutes', 'Guided or silent. Same time each day if you can.', mins(15)),
    ],
  },
  {
    id: 'breathwork',
    label: 'Breathing',
    attribute: 'mindset',
    secondary: 'health',
    tags: ['calm'],
    cadence: 'daily',
    tiers: [T('light', 20, 'Two minutes of slow breathing', 'In for four, hold four, out for six. Ten rounds. Works anywhere.', mins(2))],
  },
  {
    id: 'reflect',
    label: 'Reflect',
    attribute: 'mindset',
    secondary: 'discipline',
    tags: ['reflection', 'evening'],
    cadence: 'most-days',
    when: 'evening',
    tiers: [T('light', 25, 'Rate your day and say why', 'Out of ten, and one sentence on what would have made it one point better.', mins(5))],
  },
  {
    id: 'read-growth',
    label: 'Read something that helps',
    attribute: 'mindset',
    secondary: 'education',
    tags: ['reading', 'reflection'],
    cadence: 'most-days',
    tiers: [T('steady', 55, 'Read 15 minutes of something that makes you think', 'Philosophy, biography, psychology. One idea you can use tomorrow.', mins(15))],
  },
  {
    id: 'detox-hour',
    label: 'Offline hour',
    attribute: 'mindset',
    secondary: 'discipline',
    tags: ['screens', 'calm'],
    cadence: 'few-times-week',
    tiers: [
      T('steady', 65, 'One hour completely offline', 'Phone in a drawer. Notice how many times you reach for it.', mins(60)),
      T('hard', 110, 'Three hours offline', 'Tell people beforehand so you are not tempted to check.', mins(180)),
    ],
  },
  {
    id: 'reframe',
    label: 'Reframe it',
    attribute: 'mindset',
    tags: ['reflection', 'resilience'],
    cadence: 'few-times-week',
    tiers: [
      T('steady', 60, 'Rewrite one setback', 'Write what went wrong, then write what it taught you and what you will do differently. Both halves.', mins(10)),
    ],
  },
  {
    id: 'visualise',
    label: 'Visualise',
    attribute: 'mindset',
    secondary: 'discipline',
    tags: ['focus', 'morning'],
    cadence: 'most-days',
    when: 'morning',
    tiers: [T('light', 25, 'Picture the day going well', 'Five minutes. Specifically: how you handle the part you are dreading.', mins(5))],
  },
  {
    id: 'walk-no-phone',
    label: 'Walk with no phone',
    attribute: 'mindset',
    secondary: 'fitness',
    tags: ['outdoors', 'calm', 'low-impact'],
    cadence: 'few-times-week',
    requires: { notWith: ['no-outdoor-space'] },
    tiers: [
      T('steady', 60, 'Walk 20 minutes with no phone', 'No music, no podcast, no phone at all. Let your head sort itself out.', mins(20)),
    ],
  },
];

export const CATALOG: ActivityTemplate[] = [
  ...FITNESS,
  ...EDUCATION,
  ...DISCIPLINE,
  ...HEALTH,
  ...SLEEP,
  ...PRODUCTIVITY,
  ...SOCIAL,
  ...SKILLS,
  ...MINDSET,
];

export const CATALOG_BY_ID: Record<string, ActivityTemplate> = Object.fromEntries(CATALOG.map((t) => [t.id, t]));

export function templatesForAttribute(attribute: AttributeKey): ActivityTemplate[] {
  return CATALOG.filter((t) => t.attribute === attribute);
}

/** The demanding end of what a template offers, used to size challenges. */
export function topTier(template: ActivityTemplate): TierSpec {
  return template.tiers[template.tiers.length - 1];
}

export function tierSpec(template: ActivityTemplate, tier: Tier): TierSpec | null {
  return template.tiers.find((t) => t.tier === tier) ?? null;
}
