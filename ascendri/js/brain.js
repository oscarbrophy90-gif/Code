/* Acendri OS — the brain (js/brain.js)
   Local, deterministic NLU + response generation for the assistant.
   Loads right after core.js. Only reads A.S / A.ui / A.engine lazily inside
   functions (never at load time). No network, no frameworks. */
(function () {
  'use strict';
  var A = window.Ascendri;

  /* ============================== intents ============================== */
  var INTENTS = [
    'goal_management', 'schedule_management', 'productivity_support',
    'habit_management', 'finance_management', 'study_management',
    'training_management', 'wellbeing_support', 'personal_development',
    'progress_tracking', 'social_management', 'general_assistant',
    'reminder_management', 'life_planning', 'career_planning',
    'event_planning', 'purchase_budgeting', 'app_navigation',
    'troubleshooting', 'general_conversation'
  ];

  /* Tie-break: on equal score the more specific intent (earlier here) wins. */
  var SPECIFICITY = [
    'troubleshooting', 'app_navigation', 'reminder_management',
    'habit_management', 'training_management', 'study_management',
    'purchase_budgeting', 'event_planning', 'career_planning',
    'finance_management', 'social_management', 'progress_tracking',
    'wellbeing_support', 'personal_development', 'life_planning',
    'schedule_management', 'goal_management', 'productivity_support',
    'general_assistant', 'general_conversation'
  ];

  /* ============================ normalization ========================== */
  function norm(text) {
    var s = String(text == null ? '' : text).toLowerCase();
    s = s.replace(/[‘’“”]/g, ' ');
    s = s.replace(/[^a-z0-9$ ]+/g, ' ');
    s = s.replace(/\s+/g, ' ').replace(/^ | $/g, '');
    return s;
  }

  /* Strip trailing politeness so slot extraction sees the real tail. */
  function stripPoliteness(s) {
    var re = /( please| pls| thanks| thank you| can you help( me)?| can you do that| i need help with this| when you can| right now| asap| for me)+$/;
    var prev = null;
    while (prev !== s) { prev = s; s = s.replace(re, ''); }
    return s;
  }

  /* ============================ vocab lists ============================ */
  var SPORTS = ['basketball', 'tennis', 'swimming', 'football', 'netball',
    'soccer', 'rugby', 'cricket', 'athletics', 'running', 'gym', 'volleyball',
    'hockey', 'badminton', 'surfing', 'boxing', 'dance', 'dancing'];
  var SUBJECTS = ['maths', 'math', 'mathematics', 'science', 'english',
    'history', 'geography', 'physics', 'chemistry', 'biology', 'french',
    'japanese', 'economics', 'art', 'music', 'coding', 'programming'];
  var SPORT_RE = new RegExp('\\b(' + SPORTS.join('|') + ')\\b');
  var SUBJECT_RE = new RegExp('\\b(' + SUBJECTS.join('|') + ')\\b');

  /* =========================== phrase tables ===========================
     intent -> [pattern, weight] pairs. Patterns are matched against the
     normalized text; all matching weights for an intent are summed. */
  var RULES = {
    goal_management: [
      [/\bset (a|another|my|new) goal\b/, 7], [/\bhelp me set a goal\b/, 3],
      [/\bset (me |up )?(a |another |my |new )?goal\b/, 12],
      [/\b(give|make) me a goal\b/, 12], [/\ba goal for\b/, 8],
      [/\b(create|make|start|add) (a |another |my |new )?goal\b/, 7],
      [/\bi want to improve at\b/, 6], [/\bi want to (be|get) better at\b/, 6],
      [/\bgoal into (smaller|small) (steps|pieces|chunks)\b/, 8],
      [/\bbreak (my|this|the|down)\b.*\bgoal\b/, 6],
      [/\btrack my progress toward/, 9],
      [/\bmake me a realistic plan for\b/, 8],
      [/\bnext milestone for\b/, 10],
      [/\bi feel stuck\b/, 6], [/\bhelp me make progress\b/, 4],
      [/\binto a (proper|real) goal\b/, 9], [/\bturn my idea about\b/, 6],
      [/\bstay consistent with my\b.*\bgoal\b/, 8],
      [/\breview my\b.*\bgoal\b/, 8],
      [/\bmy ambition\b/, 5], [/\bi dream of\b/, 5], [/\bi want to make the\b/, 6],
      [/\bgoal progress\b/, 6], [/\bhow (is|are) my goal/, 6],
      [/\bmake (it|this|that) (a|into a) goal\b/, 9], [/\bturn (it|this|that) into a goal\b/, 9],
      [/\bgoals?\b/, 1.5]
    ],
    schedule_management: [
      [/\bmake me a timetable\b/, 6], [/\b(build|create|generate) (me )?a timetable\b/, 6],
      [/\bplan my (schedule|day|days)\b/, 7],
      [/\borganize my week\b/, 8], [/\borganise my week\b/, 8], [/\bplan my week\b/, 7],
      [/\bwhat should i do first\b/, 10],
      [/\b(hour|hours|minutes|min) free\b/, 8], [/\bfree (hour|time slot)\b/, 6],
      [/\brearrange my (timetable|schedule)\b/, 9],
      [/\bschedule more balanced\b/, 8], [/\bmake my schedule\b/, 4],
      [/\bwhat does my (schedule|day|week) look like\b/, 9],
      [/\bfit training into my (schedule|day|week)\b/, 12],
      [/\badd training to my routine\b/, 12],
      [/\bfit (my )?\w+( \w+)? into my (schedule|day)\b/, 5],
      [/\badd (my )?\w+( \w+)? to my routine\b/, 4],
      [/\btimetable\b/, 1.5], [/\bschedule\b/, 1.5], [/\bmy week\b/, 2]
    ],
    productivity_support: [
      [/\bfocus on right now\b/, 9], [/\bwhat should i focus on\b/, 3],
      [/\bhelp me get organized\b/, 8], [/\bhelp me get organised\b/, 8],
      [/\btoo much to do\b/, 8], [/\bwhere do i (start|begin)\b/, 8],
      [/\btop (three|3) priorities\b/, 9],
      [/\bstop procrastinat/, 9], [/\bprocrastinat/, 5],
      [/\bpriority list\b/, 8], [/\bturn my tasks into\b/, 6],
      [/\bfinish everything\b/, 9],
      [/\bmost important (thing|task)\b/, 8], [/\bon my list\b/, 3],
      [/\bmake this task easier\b/, 9],
      [/\bproductive (afternoon|morning|evening|day)\b/, 9],
      [/\banything i can work on\b/, 9], [/\bsomething i can work on\b/, 9],
      [/\bwhat can i work on\b/, 8], [/\bwhat should i work on today\b/, 8],
      [/\bbe more productive\b/, 6], [/\bget more done\b/, 6]
    ],
    habit_management: [
      [/\bbuild a\b.*\bhabit\b/, 10], [/\b(start|create|make|track) a\b.*\bhabit\b/, 9],
      [/\bremind me to (studying|study|drinking water|drink water|planning my day|plan my day|exercise|stretch|meditate|journal|read before bed)\b/, 11],
      [/\bhow can i become more consistent\b/, 10],
      [/\btrack my\b.*\bstreak\b/, 10], [/\bstreak\b/, 4],
      [/\bmorning routine\b/, 10], [/\bevening routine\b/, 10], [/\bnight routine\b/, 10],
      [/\bmissing my habits\b/, 10], [/\bkeep missing\b/, 5],
      [/\broutine simpler\b/, 10], [/\bsimplify my routine\b/, 9],
      [/\bwhat habits should i\b/, 11],
      [/\bhow my habits are going\b/, 11], [/\bhabits are going\b/, 8],
      [/\bevery day\b/, 2], [/\bdaily habit\b/, 8],
      [/\bhabits?\b/, 3]
    ],
    finance_management: [
      [/\bmake a budget\b/, 8], [/\b(set|create|build) (up )?a budget\b/, 8],
      [/\bhow much should i save\b/, 10],
      [/\btrack my spending\b/, 10], [/\bmy spending\b/, 3],
      [/\bhow much have i spent\b/, 10],
      [/\borganize my expenses\b/, 10], [/\borganise my expenses\b/, 10],
      [/\bi want to save \$?\d/, 9], [/\bsave \$\s?\d/, 7],
      [/\bcut (unnecessary |back on )?spending\b/, 10],
      [/\bspending categor/, 9],
      [/\bsavings goal\b/, 8], [/\bset a savings\b/, 4],
      [/\bexplain my budget\b/, 10],
      [/\bincome\b/, 4], [/\bexpenses\b/, 2], [/\bsave each (week|month)\b/, 8],
      [/\bbudget\b/, 2], [/\bsalary\b|\bpocket money\b/, 4]
    ],
    study_management: [
      [/\bstudy timetable\b/, 10], [/\bplan my study\b/, 10], [/\bstudy time\b/, 7],
      [/\bstudy plan\b/, 9], [/\bassignment\b/, 6],
      [/\bwhat should i study\b/, 10],
      [/\bschool tasks\b/, 10],
      [/\brevision plan\b/, 10], [/\brevision\b/, 5], [/\btest coming up\b/, 8],
      [/\bhomework\b/, 8],
      [/\bstudy more effectively\b/, 10], [/\bstudy (better|smarter)\b/, 8],
      [/\bexams?\b/, 5], [/\bschool\b/, 2], [/\bstudy\b/, 3],
      [new RegExp('\\b(' + SUBJECTS.join('|') + ')\\b'), 2]
    ],
    training_management: [
      [/\btraining plan\b/, 10],
      [/\bschedule my training\b/, 10], [/\bplan my training\b/, 10],
      [/\bhow can i improve at\b/, 7], [/\bget better at\b.*\b(sport|training)\b/, 6],
      [/\btrack my training\b/, 10], [/\btraining progress\b/, 10],
      [/\badd training to my timetable\b/, 14],
      [/\bcompetition\b/, 7], [/\btournament\b/, 7], [/\btryouts?\b/, 8],
      [/\bfocus on during training\b/, 11], [/\bduring training\b/, 6],
      [/\bweekly\b.*\broutine\b/, 6],
      [/\bbalance training\b/, 11],
      [/\bcoach\b/, 4], [/\bdrills\b/, 6], [/\bfitness\b/, 4], [/\btraining\b/, 3],
      [new RegExp('\\b(' + SPORTS.join('|') + ')\\b'), 2]
    ],
    wellbeing_support: [
      [/\bhealthier routine\b/, 11], [/\bhealthy routine\b/, 10],
      [/\bremind me to take breaks\b/, 13], [/\btake (more )?breaks\b/, 8],
      [/\bimprove my daily routine\b/, 11], [/\bdaily routine\b/, 6],
      [/\bbalanced day\b/, 11],
      [/\boverwhelmed\b/, 9], [/\bburn(ed|t)? out\b/, 9], [/\bstressed\b/, 7],
      [/\bregular breaks\b/, 11], [/\bbreaks\b/, 3],
      [/\bless stressful\b/, 10], [/\bstress\b/, 4],
      [/\bbetter daily habits\b/, 11],
      [/\bchange about my routine\b/, 11],
      [/\brest and hobbies\b/, 11], [/\btime for rest\b/, 8],
      [/\bsleep (better|more|earlier)\b/, 8], [/\bwellbeing\b/, 6],
      [/\bmental health\b/, 8], [/\bself care\b/, 8], [/\bfeel (better|healthier)\b/, 6]
    ],
    personal_development: [
      [/\bbecome more disciplined\b/, 10], [/\bdisciplined?\b/, 5],
      [/\bbuild confidence\b/, 10], [/\bconfiden(ce|t)\b/, 5],
      [/\bwhat skill should i learn\b/, 11], [/\bskill should i learn\b/, 8],
      [/\bpersonal development\b/, 10], [/\bself improvement\b/, 9],
      [/\bbecome more organized\b/, 10], [/\bbecome more organised\b/, 10],
      [/\btime management\b/, 9],
      [/\bstay motivated\b/, 9],
      [/\bwhat should i work on this month\b/, 9],
      [/\bhelp me become more consistent\b/, 10],
      [/\bways to improve myself\b/, 11], [/\bimprove myself\b/, 8],
      [/\bbetter version of (myself|me)\b/, 8], [/\bgrow as a person\b/, 8]
    ],
    progress_tracking: [
      [/\bshow me my achievements\b/, 10], [/\bmy achievements\b/, 3],
      [/\bwhat have i accomplished\b/, 11], [/\baccomplished\b/, 5],
      [/\bprogress have i made\b/, 10], [/\bhow much progress\b/, 8],
      [/\brecent milestones\b/, 11], [/\bmilestones?\b/, 3],
      [/\bgoals have i completed\b/, 11], [/\bhave i completed\b/, 7],
      [/\bcompared (with|to) last (month|week)\b/, 11], [/\bhow am i doing\b/, 8],
      [/\bprogress report\b/, 11],
      [/\bwhat am i improving at\b/, 11],
      [/\bwhat should my next milestone be\b/, 9],
      [/\bcelebrate my progress\b/, 11], [/\bmy progress\b/, 2],
      [/\bmy level\b/, 6], [/\bhow much xp\b/, 8], [/\bmy xp\b/, 6],
      [/\bhow far have i come\b/, 9]
    ],
    social_management: [
      [/\bshow me my friends\b/, 11], [/\bfriends?\b/, 4],
      [/\bcreate a group\b/, 10], [/\bgroups?\b/, 4],
      [/\badd a friend\b/, 10], [/\bfriend request\b/, 9],
      [/\bshow me my groups\b/, 11],
      [/\bgroup goal\b/, 10],
      [/\bfriends see my\b/, 10],
      [/\binvite someone\b/, 10], [/\binvite (my )?friends?\b/, 9],
      [/\bgroup ?s progress\b/, 9], [/\bgroup progress\b/, 9],
      [/\bchallenge for my friends\b/, 11],
      [/\bshare this achievement\b/, 11], [/\bshare\b/, 3],
      [/\bleaderboard\b/, 8], [/\bfollow(ing)? (a )?path\b/, 8]
    ],
    general_assistant: [
      [/\bwhat can you help\b/, 10], [/\bwhat can you do\b/, 9],
      [/\bwhat is ascendri\b/, 11], [/\bwhat is acendri\b/, 11], [/\bascendri os\b/, 8],
      [/\bai assistant\b/, 8], [/\bhow does\b.*\bwork\b/, 4],
      [/\bwhat can you track\b/, 11],
      [/\bwhat should i do today\b/, 8],
      [/\bplan my life\b/, 10],
      [/\bcan you remember\b/, 8], [/\bwhat information can you\b/, 10],
      [/\borganize everything\b/, 10], [/\borganise everything\b/, 10],
      [/\bwhat are my priorities\b/, 10],
      [/\boverview of my day\b/, 10], [/\bquick overview\b/, 7],
      [/\bwhat features\b/, 9], [/\bhow do i use\b/, 7], [/\bwhat can this app\b/, 10]
    ],
    reminder_management: [
      [/\bwhen is my next reminder\b/, 11], [/\breminders?\b/, 4],
      [/\bshow me my reminders\b/, 11],
      [/\bmove my reminder\b/, 11],
      [/\bwhat reminders do i have\b/, 11],
      [/\bremind me before\b/, 11],
      [/\bset a reminder\b/, 11],
      [/\bcancel my reminder\b/, 12], [/\bdelete my reminder\b/, 12],
      [/\bremind me every\b/, 10], [/\brecurring reminder\b/, 11],
      [/\bremind me to\b/, 6], [/\bremind me\b/, 3],
      [/\bdon t let me forget\b/, 9], [/\bnotification\b/, 4],
      // an explicit time word makes it a one-off reminder, whatever the topic
      [/\bremind me\b.*\b(today|tomorrow|tonight|at \d{1,2}|this (morning|afternoon|evening|week)|next week|later)\b/, 20]
    ],
    life_planning: [
      [/\bplan my year\b/, 11], [/\bplan my month\b/, 9],
      [/\bwhat should i focus on this (month|year)\b/, 10],
      [/\blong term plan\b/, 11], [/\blong term goals\b/, 8],
      [/\borganize my priorities\b/, 11], [/\borganise my priorities\b/, 11],
      [/\bsix months\b/, 9], [/\b6 months\b/, 9], [/\bwhere should i be in\b/, 8],
      [/\broadmap\b/, 10],
      [/\bbalance everything\b/, 11],
      [/\bwork toward next\b/, 11], [/\bwhat should i work towards?\b/, 8],
      [/\bgoals work together\b/, 11],
      [/\bnext 30 days\b/, 11], [/\bnext thirty days\b/, 11],
      [/\bbig picture\b/, 8], [/\bthe next chapter\b/, 7]
    ],
    career_planning: [
      [/\bplan my future\b/, 11], [/\bfuture\b/, 4],
      [/\bcareer paths?\b/, 10], [/\bcareer\b/, 6],
      [/\bskills for my future\b/, 11],
      [/\bcareer development\b/, 10],
      [/\bbefore i leave school\b/, 11], [/\bafter school\b/, 6],
      [/\bfuture career goals\b/, 11],
      [/\bprepare for my future\b/, 11],
      [/\bwhat skills should i develop\b/, 11], [/\bskills should i develop\b/, 8],
      [/\bfive year plan\b/, 11], [/\b5 year plan\b/, 11],
      [/\bprioritize for my future\b/, 11], [/\bprioritise for my future\b/, 11],
      [/\buniversity\b/, 6], [/\bapprenticeship\b/, 7], [/\bdream job\b/, 8],
      [/\bwork experience\b/, 7], [/\bresume\b|\bcv\b/, 7]
    ],
    event_planning: [
      [/\bplan an event\b/, 11], [/\bevents?\b/, 5],
      [/\badd my event\b/, 11],
      [/\bchecklist for my event\b/, 11], [/\bchecklist\b/, 4],
      [/\btravel plans\b/, 11], [/\btravel\b/, 6],
      [/\bbefore my trip\b/, 11], [/\btrip\b/, 6],
      [/\bfit my event\b/, 11],
      [/\bupcoming events?\b/, 9],
      [/\bdays around my event\b/, 11],
      [/\bprepare for my trip\b/, 11],
      [/\bparty\b/, 6], [/\bholiday\b/, 5], [/\bconcert\b/, 6], [/\bformal\b/, 5]
    ],
    purchase_budgeting: [
      [/\bplan a purchase\b/, 11], [/\bpurchases?\b/, 6],
      [/\bfit this purchase\b/, 11],
      [/\bplanned spending\b/, 11],
      [/\badd this purchase\b/, 11],
      [/\bmoney can i allocate\b/, 11], [/\ballocate\b/, 6],
      [/\bwhat i need to buy\b/, 11], [/\bneed to buy\b/, 7], [/\bbuy\b/, 4],
      [/\btrack this expense\b/, 11],
      [/\brecent purchases\b/, 11],
      [/\bsave for this\b/, 9],
      [/\bmonthly budget\b/, 9], [/\bshould i include this\b/, 7],
      [/\bcan i afford\b/, 10], [/\bafford\b/, 7], [/\bworth buying\b/, 10],
      [/\bhow much (does|is|would)\b.*\bcost\b/, 7], [/\bshould i buy\b/, 10]
    ],
    app_navigation: [
      [/\bopen my dashboard\b/, 11], [/\bopen (my|the)\b/, 5],
      [/\bshow my (goals?|timetable|schedule|finances?|habits?|achievements?|reminders?|progress|tasks?|dashboard|friends|profile|settings)\b/, 10],
      [/\bopen (my |the )?(goals?|timetable|schedule|finances?|habits?|achievements?|reminders?|tasks?|dashboard|settings|profile|assistant)\b/, 10],
      [/\bweekly overview\b/, 9],
      [/\bgo to (my |the )?\w+/, 8], [/\btake me to\b/, 9], [/\bnavigate to\b/, 9],
      [/\bopen my profile\b/, 11]
    ],
    troubleshooting: [
      [/\bnot (updating|working|loading|syncing|saving|showing|appearing|responding)\b/, 11],
      [/\b(is|are|keeps?) (broken|frozen|stuck|glitch\w*|crash\w*)\b/, 10],
      [/\bdid not appear\b/, 11], [/\bdidn t appear\b/, 11], [/\bnever appeared\b/, 10],
      [/\bdisappeared\b/, 11], [/\bvanished\b/, 10],
      [/\blooks (incorrect|wrong|off|weird)\b/, 10], [/\bincorrect\b/, 6],
      [/\bwhy did my (schedule|timetable|data|dashboard|goal|streak) change\b/, 11],
      [/\bis missing\b/, 10], [/\bwent missing\b/, 10],
      [/\bnot sync/, 11], [/\bwon t (load|save|update|sync|open)\b/, 11],
      [/\bsomething is (not working|wrong|off)\b/, 11],
      [/\bbug\b/, 8], [/\berror\b/, 8], [/\bglitch\b/, 8], [/\breset itself\b/, 9],
      [/\blost my (data|progress|goal|streak)\b/, 10]
    ],
    general_conversation: [
      [/\bgood (morning|afternoon|evening|night)\b/, 10],
      [/^(hi|hiya|hello|hey|yo|sup|howdy|gday|g day)\b/, 7],
      [/\bhey ascendri\b/, 10], [/\bhi ascendri\b/, 10],
      [/\bwhat is up\b/, 8], [/\bwhats up\b/, 8], [/\bwhat s up\b/, 8],
      [/\bgive me some motivation\b/, 11], [/\bmotivation\b/, 5], [/\bmotivate me\b/, 9],
      [/\btell me something\b/, 10],
      [/\bhelp deciding what to do\b/, 11], [/\bi need help deciding\b/, 10],
      [/\bproductivity tip\b/, 12],
      [/\bbored\b/, 10],
      [/\bchallenge for today\b/, 11], [/\bdaily challenge\b/, 9],
      [/\bstart my day\b/, 9],
      [/\blife tip\b/, 11], [/\bquick tip\b/, 9], [/\btip\b/, 4],
      [/\bthank(s| you)\b/, 6], [/\bbye\b/, 7], [/\bgoodbye\b/, 8],
      [/\bhow are you\b/, 9], [/\blol\b|\bhaha\b/, 4], [/\bjoke\b/, 8],
      [/\bwho are you\b/, 7]
    ]
  };

  /* ============================== slots =============================== */
  var MONEY_CONTEXT = /\b(save|sav(e|ing)s?|spend|spent|spending|budget|cost|costs|buy|buying|purchase|afford|price|dollars?|money|pay|owe)\b|\$/;

  function extractWhen(n) {
    if (/\btomorrow\b/.test(n)) return 'tomorrow';
    if (/\btoday\b|\btonight\b|\bthis (morning|afternoon|evening)\b/.test(n)) return 'today';
    if (/\bweek\b|\bweekly\b/.test(n)) return 'week';
    return null;
  }

  function extractAmount(n) {
    var m = n.match(/\$\s?(\d[\d, ]*(?:\.\d+)?)/);
    if (m) { var v = parseFloat(m[1].replace(/[ ,]/g, '')); return isNaN(v) ? null : v; }
    if (MONEY_CONTEXT.test(n)) {
      m = n.match(/\b(\d{1,7}(?:\.\d+)?)\b/);
      if (m) { var v2 = parseFloat(m[1]); return isNaN(v2) ? null : v2; }
    }
    return null;
  }

  function extractTopic(n) {
    var m = n.match(SPORT_RE);
    if (m) return m[1];
    m = n.match(SUBJECT_RE);
    if (m) return m[1];
    var s = stripPoliteness(n);
    m = s.match(/\bremind me to (.{2,60})$/);
    if (m) return m[1].replace(/^(my |the |a |an )/, '');
    m = s.match(/\b(?:for|about|on|toward|towards|at|of)\s+((?:my |the |a |an )?[a-z][a-z0-9 ]{1,40})$/);
    if (m) {
      var t = m[1].replace(/^(my |the |a |an )/, '').replace(/\b(goal|plan|habit|reminder)\b\s*$/, '').replace(/\s+$/, '');
      if (t.length > 1) return t;
    }
    return null;
  }

  /* ============================= classify ============================= */
  function classify(text) {
    var n, best, bestScore, scores, i, intent, rules, j, r;
    try {
      n = norm(text);
    } catch (e) { n = ''; }
    scores = {};
    for (i = 0; i < INTENTS.length; i++) {
      intent = INTENTS[i];
      rules = RULES[intent] || [];
      var sc = 0;
      for (j = 0; j < rules.length; j++) {
        r = rules[j];
        try { if (r[0].test(n)) sc += r[1]; } catch (e2) { /* never throw */ }
      }
      scores[intent] = sc;
    }
    best = 'general_conversation'; bestScore = 0;
    for (i = 0; i < SPECIFICITY.length; i++) {
      intent = SPECIFICITY[i];
      if (scores[intent] > bestScore) { best = intent; bestScore = scores[intent]; }
    }
    if (bestScore < 2) { best = 'general_conversation'; bestScore = scores.general_conversation || 0; }
    var slots = { topic: null, when: null, amount: null };
    try {
      slots.topic = extractTopic(n);
      slots.when = extractWhen(n);
      slots.amount = extractAmount(n);
    } catch (e3) { /* keep defaults */ }
    return { intent: best, score: bestScore, slots: slots };
  }

  /* ====================== category / domain helpers ==================== */
  var CATEGORY_ACCENTS = { Sport: 'green', Study: 'blue', Finance: 'yellow', Career: 'purple', Health: 'orange', Personal: 'cyan' };

  function detectCategory(n) {
    if (SPORT_RE.test(n) || /\btraining\b|\bfitness\b|\bteam\b|\bcompetition\b|\btryouts?\b|\bcoach\b/.test(n)) return 'Sport';
    if (SUBJECT_RE.test(n) || /\bstudy\b|\bstudying\b|\bgrades?\b|\bschool\b|\bexams?\b|\bhomework\b|\bassignment\b|\breading\b|\bread\b/.test(n)) return 'Study';
    if (/\$|\bsave\b|\bsaving\b|\bsavings\b|\bmoney\b|\bbudget\b|\bspending\b|\bfund\b/.test(n)) return 'Finance';
    if (/\bcareer\b|\bjob\b|\bfuture\b|\buniversity\b|\bwork experience\b|\bapprenticeship\b|\binternship\b/.test(n)) return 'Career';
    if (/\bhealth\w*\b|\bfit\b|\bfitter\b|\bsleep\b|\bwater\b|\beat\w*\b|\brun\w*\b|\bwellbeing\b|\bstress\b|\bmeditat|\bexercise\b|\bwalk\w*\b/.test(n)) return 'Health';
    return 'Personal';
  }

  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  function firstWords(n, k) {
    var w = n.split(' ').filter(function (x) { return x; });
    return w.slice(0, k).join(' ');
  }

  /* =========================== goalFromText =========================== */
  function goalFromText(text) {
    var n, s, c, topic, amount, title, why, ms, accent;
    try { n = norm(text); } catch (e) { n = ''; }
    s = stripPoliteness(n);
    c = classify(text);
    topic = c.slots.topic;
    amount = c.slots.amount;
    var category = detectCategory(s || 'personal growth');
    accent = CATEGORY_ACCENTS[category];
    var t = topic || null;

    // Title: clean imperative.
    var core = s
      .replace(/^(please |hey |hi |ok |okay |so )+/, '')
      .replace(/^(can you |could you |will you |would you )+/, '')
      .replace(/^(help me to |help me |i want to |i would like to |i wanna |i need to |my goal is to |i m going to |i am going to )+/, '')
      .replace(/^(set|create|make|add|start) (a |another |my |new )?goal (for|to|about|of)? ?/, '')
      .replace(/^(turn my idea about )/, '')
      .replace(/( into a proper goal| into a goal)$/, '')
      .replace(/\s+/g, ' ').replace(/^ | $/g, '');
    if (category === 'Sport' && t) title = 'Make the ' + t + ' A team';
    else if (category === 'Study' && SUBJECT_RE.test(s)) title = 'Get top marks in ' + (s.match(SUBJECT_RE) || [t])[0];
    else if (category === 'Study' && /\bgrades?\b/.test(s)) title = 'Lift my grades this term';
    else if (category === 'Finance' && amount) title = 'Save $' + amount;
    else if (category === 'Finance') title = 'Save ' + (t ? 'for ' + t : 'money consistently');
    else if (core && core.length > 2 && core.length < 70) title = cap(core);
    else if (t) title = 'Improve at ' + t;
    else title = 'Level up my personal growth';

    // Why: short motivating line derived from the text.
    var whyByCat = {
      Sport: 'Because I want to compete at my best' + (t ? ' in ' + t : '') + ' and earn my spot.',
      Study: 'Because strong results' + (t ? ' in ' + t : '') + ' keep every door open for me.',
      Finance: 'Because money set aside' + (amount ? ' ($' + amount + ')' : '') + ' means freedom and less stress.',
      Career: 'Because the future I want is built by what I do now.',
      Health: 'Because feeling strong and rested makes everything else easier.',
      Personal: 'Because becoming a better me is the goal behind every other goal.'
    };
    why = whyByCat[category];

    // Milestones: rich per-domain templates with the topic substituted in.
    var tt;
    if (category === 'Sport') {
      tt = t || 'my sport';
      ms = [
        'Nail the ' + tt + ' fundamentals with 3 practice sessions a week',
        'Run focused ' + tt + ' drills twice a week for a month',
        'Ask the coach for one piece of feedback and work on it',
        'Play a full scrimmage or practice match every week',
        'Perform with confidence at the next ' + tt + ' tryout or trial'
      ];
    } else if (category === 'Study') {
      tt = (s.match(SUBJECT_RE) || [])[0] || t || 'my subjects';
      ms = [
        'Set up a weekly ' + tt + ' study block and stick to it',
        'Summarise each ' + tt + ' topic into one page of notes',
        'Do one past paper or practice test for ' + tt + ' each fortnight',
        'Ask the teacher about anything I scored below 70% on',
        'Walk into the next ' + tt + ' assessment fully prepared'
      ];
    } else if (category === 'Finance') {
      var target = amount || 500;
      var q = Math.max(1, Math.round(target / 4));
      ms = [
        'Track every dollar in and out for two weeks',
        'Reach the first $' + q + ' saved',
        'Hit the halfway mark: $' + Math.round(target / 2) + ' saved',
        'Reach $' + Math.round(target * 0.75) + ' by trimming one spending category',
        'Celebrate the full $' + target + ' in savings'
      ];
    } else if (category === 'Career') {
      tt = t || 'my field';
      ms = [
        'Write down what a great future in ' + tt + ' looks like',
        'Talk to two people who already do what I want to do',
        'Pick one skill for ' + tt + ' and practise it weekly',
        'Finish a small project or work experience that proves it',
        'Review the plan each month and adjust the next step'
      ];
    } else if (category === 'Health') {
      tt = t || 'my health';
      ms = [
        'Lock in a consistent sleep and wake time for a week',
        'Move for 30 minutes a day, five days a week',
        'Build one small daily habit that supports ' + tt,
        'Two full weeks without breaking the streak',
        'Feel the difference — review energy and mood after a month'
      ];
    } else {
      tt = t || 'this goal';
      ms = [
        'Write down exactly what success with ' + tt + ' looks like',
        'Break ' + tt + ' into weekly actions and do the first one',
        'Show up for it three times a week for two weeks',
        'Review what worked and double down on it',
        'Reach the finish line and set the next challenge'
      ];
    }
    return { title: title, category: category, accent: accent, why: why, milestones: ms };
  }

  /* =========================== tasksFromText ========================== */
  function tasksFromText(text) {
    var ui = window.Ascendri.ui;
    var n; try { n = norm(text); } catch (e) { n = ''; }
    var s = stripPoliteness(n);
    var c = classify(text);
    var topic = c.slots.topic;
    var category = detectCategory(s || 'general');
    var today = ui.todayISO();
    function due(i) { return ui.addDaysISO(today, 1 + (i % 5)); }
    var defs;
    if (category === 'Study') {
      var subj = (s.match(SUBJECT_RE) || [])[0] || topic || 'key topics';
      defs = [
        ['Revise ' + subj + ' notes', 3, 45],
        ['Practice paper: ' + subj, 3, 90],
        ['Make flashcards for ' + subj, 2, 30],
        ['Review tricky ' + subj + ' questions', 2, 40],
        ['Plan next week of ' + subj + ' study', 1, 20]
      ];
    } else if (category === 'Sport') {
      var sp = topic || 'training';
      defs = [
        [cap(sp) + ' drills session', 3, 60],
        ['Conditioning: sprints and core', 2, 45],
        ['Video review of last ' + sp + ' game', 2, 30],
        ['Stretch and recovery session', 1, 25],
        ['Skills practice: weakest ' + sp + ' area', 3, 60]
      ];
    } else if (category === 'Finance') {
      var amt = c.slots.amount;
      defs = [
        ['Review this month’s budget', 3, 30],
        ['Log all spending from this week', 2, 20],
        ['Transfer ' + (amt ? '$' + Math.max(5, Math.round(amt / 4)) : 'a set amount') + ' to savings', 3, 20],
        ['Cut one subscription or impulse buy', 2, 25],
        ['Set next month’s category limits', 1, 30]
      ];
    } else {
      var tt = topic || firstWords(s, 4) || 'my plan';
      defs = [
        ['Define what done looks like for ' + tt, 3, 30],
        ['First concrete step on ' + tt, 3, 45],
        ['Deep work block: ' + tt, 2, 60],
        ['Review progress on ' + tt, 1, 20]
      ];
    }
    var out = [];
    for (var i = 0; i < defs.length && i < 6; i++) {
      out.push({ title: defs[i][0], priority: defs[i][1], due: due(i), duration: Math.min(90, Math.max(20, defs[i][2])) });
    }
    return out;
  }

  /* =========================== planFromText =========================== */
  var COUNT_WORDS = { once: 1, twice: 2, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

  function parseCountNear(s, idx, fallback) {
    // look for "3x", "x3", "3 times", "three times" anywhere (applies to nearest activity — keep simple: first pattern found after idx, else anywhere)
    var seg = s.slice(idx);
    var m = seg.match(/\b(\d)\s?x\b/) || seg.match(/\bx\s?(\d)\b/) || seg.match(/\b(\d) times\b/) ||
      seg.match(/\b(once|twice|one|two|three|four|five|six|seven) times\b/) || seg.match(/\b(once|twice)\b/);
    if (!m) return fallback;
    var v = COUNT_WORDS[m[1]] !== undefined ? COUNT_WORDS[m[1]] : parseInt(m[1], 10);
    return (v >= 1 && v <= 7) ? v : fallback;
  }

  function parseDuration(s) {
    var m = s.match(/\b(\d{1,3})\s?(min|mins|minutes)\b/);
    if (m) return Math.min(180, Math.max(15, parseInt(m[1], 10)));
    m = s.match(/\b(\d{1,2})\s?(hour|hours|hr|hrs)\b/);
    if (m) return Math.min(180, Math.max(30, parseInt(m[1], 10) * 60));
    if (/\ban hour\b/.test(s)) return 60;
    if (/\bhalf an hour\b/.test(s)) return 30;
    return 60;
  }

  function planFromText(text) {
    var n; try { n = norm(text); } catch (e) { n = ''; }
    var s = stripPoliteness(n);
    var duration = parseDuration(s);
    var sessions = [];
    var seen = {};
    // sports
    var sm = s.match(new RegExp(SPORT_RE.source, 'g')) || [];
    for (var i = 0; i < sm.length; i++) {
      if (seen[sm[i]]) continue;
      seen[sm[i]] = true;
      sessions.push({ title: cap(sm[i]) + ' training', count: parseCountNear(s, s.indexOf(sm[i]), 3), duration: duration, accent: 'green' });
    }
    if (!sm.length && /\btraining\b|\bworkout\b|\bexercise\b|\bconditioning\b/.test(s)) {
      sessions.push({ title: 'Training session', count: parseCountNear(s, s.search(/\btraining\b|\bworkout\b|\bexercise\b|\bconditioning\b/), 3), duration: duration, accent: 'green' });
    }
    // study
    var subj = s.match(new RegExp(SUBJECT_RE.source, 'g')) || [];
    for (var j = 0; j < subj.length; j++) {
      if (seen[subj[j]]) continue;
      seen[subj[j]] = true;
      sessions.push({ title: cap(subj[j]) + ' study', count: parseCountNear(s, s.indexOf(subj[j]), 2), duration: duration, accent: 'blue' });
    }
    if (!subj.length && /\bstudy\b|\bstudying\b|\brevision\b|\brevise\b|\bexams?\b|\bhomework\b|\bassignment\b/.test(s)) {
      sessions.push({ title: 'Study session', count: parseCountNear(s, s.search(/\bstudy\b|\brevision\b|\bexam\b/), sessions.length ? 2 : 3), duration: duration, accent: 'blue' });
    }
    if (/\bbudget\b|\bfinance\b|\bsavings?\b/.test(s)) {
      sessions.push({ title: 'Finance check-in', count: 1, duration: Math.min(duration, 30), accent: 'yellow' });
    }
    if (/\bread\b|\breading\b/.test(s) && !seen.reading) {
      sessions.push({ title: 'Reading time', count: parseCountNear(s, s.indexOf('read'), 3), duration: Math.min(duration, 45), accent: 'purple' });
    }
    if (!sessions.length) {
      var c = classify(text);
      var topic = c.slots.topic || firstWords(s, 3) || 'the week';
      sessions.push({ title: 'Focus session: ' + topic, count: 3, duration: duration, accent: 'cyan' });
    }
    var parts = sessions.map(function (x) { return x.title + ' ' + x.count + 'x (' + x.duration + ' min)'; });
    var summary = 'I’ll plan ' + parts.join(', ') + ' across your week.';
    return { sessions: sessions, summary: summary };
  }

  /* ========================= respond() helpers ======================== */
  function act(label, screen) { return { label: label, screen: screen }; }

  function reply(text, actions) { return { text: text, actions: actions || [] }; }

  function activeGoals(st) { return (st.goals || []).filter(function (g) { return g.status !== 'done'; }); }
  function activeHabits(st) { return (st.habits || []).filter(function (h) { return !h.archived; }); }

  function createGoalFromDraft(draft) {
    var Aw = window.Ascendri;
    Aw.S.update(function (s) {
      s.goals = s.goals || [];
      s.goals.push({
        id: Aw.ui.uid(), title: draft.title, category: draft.category,
        accent: draft.accent, why: draft.why, targetDate: null, status: 'active',
        milestones: draft.milestones.map(function (m) { return { id: Aw.ui.uid(), title: m, done: false }; }),
        createdAt: Date.now()
      });
      if (Aw.S.log) { } // silent; log happens via activity below
    }, { silent: true });
    if (Aw.S.log) Aw.S.log('Assistant created goal "' + draft.title + '"', '🎯');
  }

  function scheduleFromPlan(plan) {
    var Aw = window.Ascendri;
    var created = 0;
    var newIds = {};
    Aw.S.update(function (s) {
      s.tasks = s.tasks || [];
      var today = Aw.ui.todayISO();
      var dayCursor = 0;
      plan.sessions.forEach(function (sess) {
        for (var i = 0; i < sess.count; i++) {
          var id = Aw.ui.uid();
          newIds[id] = true;
          s.tasks.push({
            id: id,
            title: sess.title + ' (' + (i + 1) + '/' + sess.count + ')',
            priority: 2, due: Aw.ui.addDaysISO(today, 1 + (dayCursor % 6)),
            duration: sess.duration, done: false, createdAt: Date.now()
          });
          dayCursor += Math.max(1, Math.floor(6 / Math.max(1, sess.count)));
          created++;
        }
      });
      Aw.engine.generateTimetable(s);
    }, { silent: true });
    var st = Aw.S.get();
    var placed = 0;
    if (st.timetable && st.timetable.days) {
      Object.keys(st.timetable.days).forEach(function (d) {
        st.timetable.days[d].forEach(function (b) { if (b.type === 'task' && newIds[b.refId]) placed++; });
      });
    }
    return { created: created, placed: placed, unplaced: (st.timetable && st.timetable.unplaced || []).length };
  }

  var QUOTES = [
    '“Success is the sum of small efforts repeated day in and day out.”',
    '“You don’t have to be great to start, but you have to start to be great.”',
    '“Discipline is choosing between what you want now and what you want most.”',
    '“The secret of getting ahead is getting started.”',
    '“Little by little, a little becomes a lot.”'
  ];

  var NAV_MAP = [
    [/dashboard|home|overview/, 'app/dashboard', 'dashboard'],
    [/goals?/, 'app/goals', 'goals'],
    [/tasks?|to ?do/, 'app/tasks', 'tasks'],
    [/timetable|schedule|calendar/, 'app/schedule', 'timetable'],
    [/habits?|routine/, 'app/habits', 'habits'],
    [/finances?|money|budget|wallet|spending/, 'app/finance', 'finance'],
    [/social|friends?|groups?|feed|paths?/, 'app/social', 'social hub'],
    [/achievements?|progress|trophies|badges|level/, 'app/achievements', 'achievements'],
    [/settings?|profile|preferences/, 'app/settings', 'settings'],
    [/reminders?|bell|notifications?/, 'app/dashboard', 'reminders (under the bell on your dashboard)'],
    [/assistant|chat/, 'app/assistant', 'assistant']
  ];

  /* ============================== respond ============================= */
  function respond(text) {
    try {
      return respondInner(text);
    } catch (e) {
      return reply('Hmm, I tripped over that one — but I’m still here. Try asking me about your goals, tasks, timetable, habits or money.', [act('Open dashboard', 'app/dashboard')]);
    }
  }

  function respondInner(text) {
    var Aw = window.Ascendri;
    var ui = Aw.ui, E = Aw.engine;
    var c = classify(text);
    var slots = c.slots;
    var n = norm(text);
    var s2 = stripPoliteness(n);
    var st = Aw.S.get();
    var intent = c.intent;
    var i;

    /* ---------------- goal_management ---------------- */
    if (intent === 'goal_management') {
      var wantsCreate = /\b(set|create|make|add|start|new)\b.*\bgoal\b|\bgoal\b.*\b(for|about)\b|\bi want to\b|\binto a (proper|real) goal\b|\bturn my idea\b|\bhelp me (achieve|reach)\b/.test(s2);
      var asksProgress = /\btrack my progress\b|\bhow (is|are|am)\b|\breview\b|\bnext milestone\b|\bstay consistent\b|\bstuck\b|\bsmaller steps\b/.test(s2);
      var followUpYes = /\bmake (it|this|that) (a|into a) goal\b|\bturn (it|this|that) into a goal\b/.test(s2);
      if (followUpYes) {
        // "make it a goal" — build the goal from the previous user message when we have one.
        var hist = (st.assistant && st.assistant.history) || [];
        var prevUser = null;
        for (i = hist.length - 1; i >= 0; i--) {
          if (hist[i].role === 'user' && norm(hist[i].text) !== s2) { prevUser = hist[i].text; break; }
        }
        var dFollow = goalFromText(prevUser || text);
        createGoalFromDraft(dFollow);
        return reply('Done — created goal “' + dFollow.title + '” (' + dFollow.category + ') with ' + dFollow.milestones.length + ' milestones ready to tick off.', [act('Open goals', 'app/goals')]);
      }
      if (wantsCreate && !asksProgress) {
        var draft = goalFromText(text);
        createGoalFromDraft(draft);
        var steps = draft.milestones.map(function (m, ix) { return (ix + 1) + '. ' + m; }).join('\n');
        return reply('Created goal “' + draft.title + '” (' + draft.category + ') with these steps:\n' + steps + '\n\nWhy it matters: ' + draft.why, [act('Open goals', 'app/goals')]);
      }
      var ag = activeGoals(st);
      if (!ag.length) {
        var d2 = goalFromText(text);
        return reply('You don’t have any active goals yet. Want one? I’d suggest “' + d2.title + '” — say “set a goal for ' + (slots.topic || 'it') + '” and I’ll build it with milestones.', [act('Open goals', 'app/goals')]);
      }
      var lines = ag.map(function (g) {
        var p = E.goalProgress(g);
        var next = (g.milestones || []).filter(function (m) { return !m.done; })[0];
        return '• ' + g.title + ': ' + p + '% done' + (next ? ' — next: ' + next.title : ' — all milestones ticked!');
      });
      return reply('Here’s where your ' + ag.length + ' active goal' + (ag.length > 1 ? 's' : '') + ' stand:\n' + lines.join('\n') + '\n\nSmall steps, every week — that’s how goals fall.', [act('Open goals', 'app/goals')]);
    }

    /* ------- schedule / study / training: timetable building ------- */
    if (intent === 'schedule_management' || intent === 'study_management' || intent === 'training_management') {
      var wantsPlan = /\b(make|create|build|generate|plan|organize|organise|rearrange|fit|add|schedule)\b/.test(s2) && !/\bhow can i\b|\bhow do i\b|\bwhat should i\b|\bwhat does\b|\bshow me\b|\btrack my\b/.test(s2);
      if (wantsPlan) {
        var plan = planFromText(text);
        var res = scheduleFromPlan(plan);
        return reply(plan.summary + '\n\nDone — I created ' + res.created + ' session' + (res.created !== 1 ? 's' : '') + ' and placed ' + res.placed + ' block' + (res.placed !== 1 ? 's' : '') + ' on your timetable over the coming days' + (res.unplaced ? ' (' + res.unplaced + ' couldn’t fit and stayed on your task list)' : '') + '.', [act('Open timetable', 'app/schedule'), act('Open tasks', 'app/tasks')]);
      }
      // advice-only questions
      if (intent === 'training_management') {
        var sport = slots.topic || 'your sport';
        return reply('Here’s a simple week to get sharper at ' + sport + ':\n1. Two focused drill sessions (60 min) on your weakest skill.\n2. One conditioning session — intervals and core.\n3. One video review of your last game or session.\n4. Rest properly: sleep is training too.\n\nSay “make me a training plan for ' + sport + '” and I’ll put it straight on your timetable.', [act('See timetable', 'app/schedule')]);
      }
      if (intent === 'study_management') {
        var subj2 = slots.topic || 'your subjects';
        var studyTasks = (st.tasks || []).filter(function (t) { return !t.done; }).length;
        return reply('For ' + subj2 + ', this works: 45-minute focused blocks, notes summarised into one page per topic, and one practice paper a week. You have ' + studyTasks + ' open task' + (studyTasks !== 1 ? 's' : '') + ' right now.\n\nSay “make me a study timetable” and I’ll schedule the blocks for you.', [act('See timetable', 'app/schedule'), act('Open tasks', 'app/tasks')]);
      }
      // schedule questions: what does my day look like
      var today3 = ui.todayISO();
      var dayBlocks = (st.timetable && st.timetable.days && st.timetable.days[today3]) || [];
      if (dayBlocks.length) {
        var bl = dayBlocks.slice(0, 6).map(function (b) { return '• ' + ui.fmtTime(b.start) + ' — ' + b.title; });
        return reply('Today has ' + dayBlocks.length + ' block' + (dayBlocks.length !== 1 ? 's' : '') + ':\n' + bl.join('\n'), [act('Open timetable', 'app/schedule')]);
      }
      return reply('Your timetable is empty for today. Say “plan my week” or add tasks and I’ll generate one — I’ll fit your work around your commitments automatically.', [act('Open timetable', 'app/schedule')]);
    }

    /* ---------------- productivity_support ---------------- */
    if (intent === 'productivity_support') {
      var sugg = E.focusSuggestions(4) || [];
      if (!sugg.length) {
        return reply('Nothing urgent on the radar — nice. A good move now: pick tomorrow’s top task tonight, or add one small task so momentum never stops.', [act('Open tasks', 'app/tasks'), act('See timetable', 'app/schedule')]);
      }
      var list = sugg.map(function (x, ix) { return (ix + 1) + '. ' + x.text; });
      return reply('Here’s what matters most right now:\n' + list.join('\n'), [act('Open tasks', 'app/tasks'), act('See timetable', 'app/schedule')]);
    }

    /* ---------------- habit_management ---------------- */
    if (intent === 'habit_management') {
      var wantsHabit = /\b(build|create|start|make|add|begin)\b.*\bhabit\b|\bhelp me (build|create|start)\b|\bremind me to\b|\broutine\b.*\b(create|build|make)\b|\bmorning routine\b|\bevening routine\b/.test(s2);
      if (wantsHabit) {
        var raw = s2.match(/\bbuild an? (.{2,40}?) habit\b/) || s2.match(/\bremind me to (.{2,40})$/) || s2.match(/\b(create|make) an? (morning|evening|night) routine\b/);
        var htitle = slots.topic || (raw && (raw[2] ? raw[2] + ' routine' : raw[1])) || 'daily habit';
        htitle = cap(htitle.replace(/^(a |an |the |my )/, ''));
        var emoji = '✅';
        if (/water|drink/.test(htitle.toLowerCase())) emoji = '💧';
        else if (/study|read|book/.test(htitle.toLowerCase())) emoji = '📚';
        else if (/gym|exercise|run|train|stretch/.test(htitle.toLowerCase())) emoji = '💪';
        else if (/sleep|bed/.test(htitle.toLowerCase())) emoji = '😴';
        else if (/meditat|breath|journal/.test(htitle.toLowerCase())) emoji = '🧘';
        else if (/morning/.test(htitle.toLowerCase())) emoji = '🌅';
        else if (/evening|night/.test(htitle.toLowerCase())) emoji = '🌙';
        else if (/plan/.test(htitle.toLowerCase())) emoji = '📝';
        Aw.S.update(function (s) {
          s.habits = s.habits || [];
          s.habits.push({ id: ui.uid(), title: htitle, emoji: emoji, accent: 'teal', targetPerWeek: 7, log: {}, createdAt: Date.now() });
        }, { silent: true });
        return reply('New habit “' + htitle + '” ' + emoji + ' is live — aim for 7 days a week and tick it daily to grow your streak. Heads up: habits untouched for ' + E.HABIT_FADE_DAYS + ' days quietly fade to the archive, so keep it warm!', [act('Open habits', 'app/habits')]);
      }
      var hs = activeHabits(st);
      if (!hs.length) {
        return reply('No active habits yet. Habits are the engine of every goal — say “help me build a drinking water habit” (or anything else) and I’ll set it up.', [act('Open habits', 'app/habits')]);
      }
      var hl = hs.map(function (h) {
        var stk = E.habitStreak(h), wk = E.habitWeekCount(h), quiet = E.daysSinceLastTick(h);
        var lineTxt = '• ' + (h.emoji || '') + ' ' + h.title + ': ' + stk + '-day streak, ' + wk + '/' + (h.targetPerWeek || 7) + ' this week';
        if (quiet >= 4) lineTxt += ' — quiet for ' + quiet + ' days (it fades to the archive after ' + E.HABIT_FADE_DAYS + ')';
        return lineTxt;
      });
      return reply('Habit check-in:\n' + hl.join('\n') + '\n\nConsistency beats intensity — one tick today keeps every streak alive.', [act('Open habits', 'app/habits')]);
    }

    /* ---------------- finance_management ---------------- */
    if (intent === 'finance_management') {
      var f = E.financeSummary();
      var topCat = null, topVal = 0;
      Object.keys(f.byCat || {}).forEach(function (k) { if (f.byCat[k] > topVal) { topVal = f.byCat[k]; topCat = k; } });
      var fl = ['This month: ' + ui.fmtMoney(f.income) + ' in, ' + ui.fmtMoney(f.expenses) + ' out — net ' + ui.fmtMoney(f.net) + '.'];
      if (topCat) fl.push('Biggest spending category: ' + topCat + ' (' + ui.fmtMoney(topVal) + ').');
      if ((f.overBudget || []).length) {
        fl.push('Over budget: ' + f.overBudget.map(function (o) { return o.cat + ' (' + ui.fmtMoney(o.spent) + ' of ' + ui.fmtMoney(o.limit) + ')'; }).join(', ') + ' — worth easing off.');
      } else {
        fl.push('All budgets are within their limits — nice control.');
      }
      fl.push('Total saved toward savings goals: ' + ui.fmtMoney(f.savings || 0) + '.');
      if (/\bhow much should i save\b/.test(s2) && f.net > 0) fl.push('A solid rule: save 20% of what comes in — for you that’s about ' + ui.fmtMoney(Math.round(f.net * 0.2)) + ' this month.');
      return reply(fl.join('\n'), [act('Open finance', 'app/finance')]);
    }

    /* ---------------- purchase_budgeting ---------------- */
    if (intent === 'purchase_budgeting') {
      var f2 = E.financeSummary();
      var price = slots.amount;
      var head = 'This month you’re netting ' + ui.fmtMoney(f2.net) + ' with ' + ui.fmtMoney(f2.savings || 0) + ' in savings.';
      if (price != null) {
        var roomP = (f2.net || 0) + (f2.savings || 0);
        var verdict;
        if (price <= (f2.net || 0)) verdict = ui.fmtMoney(price) + ' fits inside this month’s net — you can afford it without touching savings.';
        else if (price <= roomP) verdict = ui.fmtMoney(price) + ' is more than this month’s net, but doable if you dip into savings. Maybe wait a week and see if you still want it.';
        else verdict = ui.fmtMoney(price) + ' is beyond your net plus savings right now — better to save toward it. Put aside ' + ui.fmtMoney(Math.max(5, Math.ceil(price / 8))) + ' a week and it’s yours in about ' + Math.max(1, Math.ceil(price / Math.max(5, Math.ceil(price / 8)))) + ' weeks.';
        return reply(head + '\n' + verdict, [act('Open finance', 'app/finance')]);
      }
      return reply(head + '\nBefore any purchase: 1) sleep on it, 2) check it against your budget categories, 3) if it’s big, make it a savings goal so it doesn’t ambush your month. Tell me the price and I’ll give you a straight verdict.', [act('Open finance', 'app/finance')]);
    }

    /* ---------------- reminder_management ---------------- */
    if (intent === 'reminder_management') {
      var rems = st.reminders || [];
      var pend = rems.filter(function (r) { return !r.done; });
      var mset = s2.match(/\bremind me to (.{2,80})$/) || s2.match(/\bset a reminder (?:for|to) (.{2,80})$/) || s2.match(/\badd (.{2,60}) as a recurring reminder\b/) || s2.match(/\bremind me every \w+ to (.{2,60})$/);
      if (/\bcancel|delete|remove\b/.test(s2)) {
        if (!pend.length) return reply('You have no pending reminders to cancel — the bell is all clear.', [act('Open dashboard', 'app/dashboard')]);
        return reply('You have ' + pend.length + ' pending reminder' + (pend.length !== 1 ? 's' : '') + ': ' + pend.map(function (r) { return '“' + r.text + '”'; }).join(', ') + '. Open the bell on your dashboard to tick off or remove the one you meant.', [act('Open dashboard', 'app/dashboard')]);
      }
      if (mset && !/\bshow\b|\bwhat reminders\b|\bwhen is\b|\bmove my\b/.test(s2)) {
        var rtext = cap(mset[1].replace(/\s+(today|tomorrow|this week)\s*$/, ''));
        var due3 = slots.when === 'today' ? ui.todayISO() : slots.when === 'tomorrow' ? ui.addDaysISO(ui.todayISO(), 1) : null;
        Aw.S.update(function (s) {
          s.reminders = s.reminders || [];
          s.reminders.push({ id: ui.uid(), text: rtext, due: due3, done: false, createdAt: Date.now() });
        }, { silent: true });
        return reply('Reminder set: “' + rtext + '”' + (due3 ? ' for ' + ui.fmtDate(due3) : '') + '. It lives under the bell on your dashboard — I’ll keep it in your focus feed too.', [act('Open dashboard', 'app/dashboard')]);
      }
      if (/\bmove my reminder\b/.test(s2) && pend.length) {
        var tgt = slots.when === 'today' ? ui.todayISO() : ui.addDaysISO(ui.todayISO(), 1);
        Aw.S.update(function (s) {
          var p2 = (s.reminders || []).filter(function (r) { return !r.done; });
          if (p2.length) p2[0].due = tgt;
        }, { silent: true });
        return reply('Moved “' + pend[0].text + '” to ' + ui.fmtDate(tgt) + '. Check the bell on your dashboard any time.', [act('Open dashboard', 'app/dashboard')]);
      }
      if (!pend.length) return reply('No pending reminders — the bell is quiet. Say “remind me to bring my kit tomorrow” and I’ll set one up.', [act('Open dashboard', 'app/dashboard')]);
      var rl = pend.slice(0, 6).map(function (r) { return '• ' + r.text + (r.due ? ' (' + ui.fmtDate(r.due) + ')' : ''); });
      return reply('You have ' + pend.length + ' pending reminder' + (pend.length !== 1 ? 's' : '') + ':\n' + rl.join('\n') + '\n\nThey all live under the bell on your dashboard.', [act('Open dashboard', 'app/dashboard')]);
    }

    /* ---------------- progress_tracking ---------------- */
    if (intent === 'progress_tracking') {
      var unlocked = Object.keys(st.achievements || {}).length;
      var totalAch = (E.ACHIEVEMENTS || []).length;
      var lp = ui.levelProgress((st.profile && st.profile.xp) || 0);
      var doneTasks = (st.tasks || []).filter(function (t) { return t.done; }).length;
      var bestStreak = 0;
      activeHabits(st).forEach(function (h) { var v = E.habitStreak(h); if (v > bestStreak) bestStreak = v; });
      var doneGoals = (st.goals || []).filter(function (g) { return g.status === 'done'; }).length;
      return reply('Your scoreboard:\n• Level ' + lp.level + ' — ' + lp.into + '/' + lp.span + ' XP into this level (' + lp.pct + '%)\n• ' + unlocked + (totalAch ? ' of ' + totalAch : '') + ' achievements unlocked\n• ' + doneTasks + ' tasks completed, ' + doneGoals + ' goal' + (doneGoals !== 1 ? 's' : '') + ' finished\n• Best habit streak: ' + bestStreak + ' day' + (bestStreak !== 1 ? 's' : '') + '\n\nKeep stacking wins — the next level is closer than it looks.', [act('Open achievements', 'app/achievements')]);
    }

    /* ---------------- app_navigation ---------------- */
    if (intent === 'app_navigation') {
      for (i = 0; i < NAV_MAP.length; i++) {
        if (NAV_MAP[i][0].test(s2)) {
          return reply('Taking you to your ' + NAV_MAP[i][2] + ' — tap below.', [act('Open ' + NAV_MAP[i][2].split(' ')[0], NAV_MAP[i][1])]);
        }
      }
      return reply('I can take you anywhere: dashboard, goals, tasks, timetable, habits, finance, social, achievements or settings. Which one?', [act('Open dashboard', 'app/dashboard')]);
    }

    /* ---------------- troubleshooting ---------------- */
    if (intent === 'troubleshooting') {
      if (/timetable|schedule/.test(s2)) {
        var openTasks = (st.tasks || []).filter(function (t) { return !t.done; }).length;
        var cause;
        if (!st.timetable) cause = 'it looks like a timetable hasn’t been generated yet — hit Generate on the timetable screen and I’ll lay your week out.';
        else if (!openTasks) cause = 'all your tasks are done, so there’s nothing new to place — add tasks and hit Regenerate.';
        else cause = 'it only refreshes when you regenerate it — hit Regenerate on the timetable screen and your ' + openTasks + ' open task' + (openTasks !== 1 ? 's' : '') + ' will be re-placed.';
        return reply('Sorry about that — ' + cause, [act('Open timetable', 'app/schedule')]);
      }
      if (/goal/.test(s2)) {
        var dg = (st.goals || []).filter(function (g) { return g.status === 'done'; }).length;
        return reply('Don’t worry — goals never vanish. Completed goals move to the Completed section at the bottom of the goals screen' + (dg ? ' (you have ' + dg + ' there)' : '') + '. If you deleted one by accident it’s gone for good, but I can help you rebuild it in seconds.', [act('Open goals', 'app/goals')]);
      }
      if (/reminder|notification/.test(s2)) {
        var pcount = (st.reminders || []).filter(function (r) { return !r.done; }).length;
        return reply('Reminders live under the bell in the top bar — you currently have ' + pcount + ' pending. If one is missing, it may have been ticked off; say “remind me to …” and I’ll recreate it instantly.', [act('Open dashboard', 'app/dashboard')]);
      }
      if (/achievement/.test(s2)) {
        return reply('Achievements unlock the moment their condition is met and are re-checked on every change. If one looks missing, open the achievements screen — locked cards show exactly what’s left to do.', [act('Open achievements', 'app/achievements')]);
      }
      if (/habit|streak/.test(s2)) {
        return reply('Streaks count consecutive ticked days (today doesn’t break it until it’s over). Also: habits quiet for ' + E.HABIT_FADE_DAYS + ' days auto-archive — check the archive section on the habits screen and restore with one tap.', [act('Open habits', 'app/habits')]);
      }
      if (/sync|account|loading|data/.test(s2)) {
        return reply('Everything in Acendri lives locally on this device — there’s no server to lose sync with. If something looks stale, switching screens re-renders fresh data, and Settings has export/import if you want a backup.', [act('Open settings', 'app/settings')]);
      }
      return reply('Sorry it’s misbehaving! Most gremlins are fixed by re-opening the screen (everything re-renders from saved data). If it persists, export a backup in Settings, then tell me exactly what you clicked and I’ll pin it down.', [act('Open settings', 'app/settings')]);
    }

    /* ---------------- social_management ---------------- */
    if (intent === 'social_management') {
      var soc = st.social || {};
      var nf = (soc.friends || []).length;
      var ng = (soc.groups || []).filter(function (g) { return g.joined; }).length;
      var ngAll = (soc.groups || []).length;
      var np = (soc.paths || []).length;
      var nr = (soc.requests || []).length;
      return reply('Your circle: ' + nf + ' friend' + (nf !== 1 ? 's' : '') + ', ' + ng + ' of ' + ngAll + ' groups joined, and ' + np + ' shared path' + (np !== 1 ? 's' : '') + ' to explore' + (nr ? ' — plus ' + nr + ' friend request' + (nr !== 1 ? 's' : '') + ' waiting for you' : '') + '. Groups have leaderboards, and your achievements can auto-share to the feed.', [act('Open social hub', 'app/social')]);
    }

    /* ------ wellbeing / personal dev / life / career / event ------ */
    if (intent === 'wellbeing_support' || intent === 'personal_development' || intent === 'life_planning' || intent === 'career_planning' || intent === 'event_planning') {
      var saysYes = /\b(yes|yep|yeah|sure|ok(ay)?|do it|go ahead|make it|create (it|one|the goal)|turn (it|this|these) into a goal)\b/.test(s2);
      if (saysYes) {
        var d3 = goalFromText(text);
        createGoalFromDraft(d3);
        return reply('Done — created goal “' + d3.title + '” with ' + d3.milestones.length + ' milestones to walk you there.', [act('Open goals', 'app/goals')]);
      }
      var stepsTxt, actn;
      var ag2 = activeGoals(st);
      if (intent === 'wellbeing_support') {
        var hcount = activeHabits(st).length;
        stepsTxt = 'A calmer, healthier week in 4 moves:\n1. Anchor your day — same wake and sleep time (yours are in Settings).\n2. One 10-minute break every 90 minutes of work; put them on the timetable.\n3. One small daily habit (water, a walk, journaling) — you have ' + hcount + ' habit' + (hcount !== 1 ? 's' : '') + ' running now.\n4. Protect one evening a week for rest and hobbies, no tasks allowed.';
        actn = act('Open habits', 'app/habits');
      } else if (intent === 'personal_development') {
        stepsTxt = 'Growth plan, straightforward:\n1. Pick ONE skill or trait for this month — not five.\n2. Attach it to a daily habit so it happens on autopilot.\n3. Track the streak — consistency is the whole game.\n4. Review at month’s end and raise the bar slightly.';
        actn = act('Open habits', 'app/habits');
      } else if (intent === 'life_planning') {
        var gl = ag2.slice(0, 3).map(function (g) { return '“' + g.title + '”'; }).join(', ');
        stepsTxt = 'Zooming out' + (ag2.length ? ' — you’re already working toward ' + gl : '') + ':\n1. Choose your top 3 priorities for the next 30 days.\n2. Give each a goal with milestones' + (ag2.length ? ' (align them with your ' + ag2.length + ' active goal' + (ag2.length !== 1 ? 's' : '') + ')' : '') + '.\n3. Let the timetable balance study, training and rest each week.\n4. Do a 10-minute Sunday review — adjust, don’t abandon.';
        actn = act('Open goals', 'app/goals');
      } else if (intent === 'career_planning') {
        stepsTxt = 'Future-building, one step at a time:\n1. Write down 2-3 fields that genuinely interest you.\n2. Pick the skills they share (communication, coding, fitness…) and practise one weekly.\n3. Get proof: a project, a team, work experience.\n4. Revisit the plan every term — direction beats speed.';
        actn = act('Open goals', 'app/goals');
      } else {
        stepsTxt = 'Event prep without the panic:\n1. Lock the date and work backwards.\n2. List every to-do as a task with a due date.\n3. Let the timetable spread the prep across your free days.\n4. Set a reminder for the day before as a final check.';
        actn = act('Open tasks', 'app/tasks');
      }
      return reply(stepsTxt + '\n\nWant me to turn this into a goal with milestones? Just say “make it a goal”.', [actn]);
    }

    /* ---------------- general_assistant ---------------- */
    if (intent === 'general_assistant') {
      var counts = (st.goals || []).filter(function (g) { return g.status !== 'done'; }).length + ' goals, ' + (st.tasks || []).filter(function (t) { return !t.done; }).length + ' open tasks, ' + activeHabits(st).length + ' habits';
      return reply('I’m your Acendri copilot. I can:\n• Build goals with milestones (“set a goal for basketball”)\n• Plan your week onto a real timetable (“make me a study timetable”)\n• Track habits and streaks, and set reminders under the bell\n• Watch your money — budgets, spending, savings goals\n• Tell you exactly what to focus on right now\n• Show progress, XP and achievements, plus your social hub\n\nYou’re currently running ' + counts + '. Ask me anything about them.', [act('Open dashboard', 'app/dashboard')]);
    }

    /* ---------------- general_conversation ---------------- */
    var histLen = ((st.assistant && st.assistant.history) || []).length;
    if (/\bthank(s| you)\b/.test(s2)) {
      return reply(['Any time! That’s what I’m here for.', 'You’re welcome — go smash it.', 'No worries at all. Onwards!'][histLen % 3], []);
    }
    if (/\bbye\b|\bgoodbye\b|\bgood night\b/.test(s2)) {
      return reply(['Catch you later — I’ll keep everything ready for you.', 'Bye for now! Your streaks will be waiting.', 'Good night — tomorrow’s a fresh page.'][histLen % 3], []);
    }
    if (/\bmotivation\b|\bmotivate me\b|\bquote\b/.test(s2)) {
      return reply(QUOTES[histLen % QUOTES.length] + '\n\nNow — one small step. Which task gets it?', [act('Open tasks', 'app/tasks')]);
    }
    if (/\btip\b|\btell me something\b/.test(s2)) {
      return reply(['Tip: the 2-minute rule — if it takes under two minutes, do it now.', 'Tip: plan tomorrow’s top task before you sleep; mornings become effortless.', 'Tip: streaks beat bursts. Five minutes daily outruns two hours once a week.'][histLen % 3], [act('Open tasks', 'app/tasks')]);
    }
    if (/\bbored\b|\bchallenge\b|\bdeciding\b|\bstart my day\b/.test(s2)) {
      var sugg2 = E.focusSuggestions(1) || [];
      if (sugg2.length) return reply('Perfect timing — here’s a worthy move: ' + sugg2[0].text, [act('Open tasks', 'app/tasks')]);
      return reply('Challenge accepted: pick one goal, do a 20-minute focused block on its next milestone, then tick a habit. Small, sharp, done.', [act('Open goals', 'app/goals')]);
    }
    var hour = new Date().getHours();
    var greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    var name = (st.profile && st.profile.name) ? ', ' + st.profile.name : '';
    return reply(greet + name + '! ' + ['Ready when you are — goals, plans, money or just a chat.', 'What are we conquering today?', 'The dashboard’s warm and your streaks are watching. What’s first?'][histLen % 3], [act('Open dashboard', 'app/dashboard')]);
  }

  /* =============================== export ============================= */
  A.brain = {
    INTENTS: INTENTS,
    classify: classify,
    goalFromText: goalFromText,
    tasksFromText: tasksFromText,
    planFromText: planFromText,
    respond: respond
  };
})();
