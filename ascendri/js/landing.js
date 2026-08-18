/* ============================================================
   Acendri OS — landing screen (marketing page, faithful to the
   Figma site). Full-page, no shell. Registers id "landing".
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;

  var FEATURES = [
    {
      accent: 'cyan', icon: 'bulb',
      title: 'What Even Is Acendri?',
      body: 'Acendri is basically your personal life-upgrade system. It’s like having an AI best friend who actually helps you get your life together — school, sports, habits, money, everything. You tell it what you want to achieve, and it builds the whole plan for you.'
    },
    {
      accent: 'blue', icon: 'calendar',
      title: 'Your Life, Automatically Organised',
      body: 'One of the coolest parts is that Acendri literally fills your timetable for you. You don’t need to think about “what should I do next?” because Acendri already plans it. Goals become steps, steps become actions, and actions become results.'
    },
    {
      accent: 'orange', icon: 'dollar',
      title: 'Money Doesn’t Have to Be Confusing',
      body: 'Acendri connects to your bank accounts so it can help you manage your money without being boring or confusing. It shows you where your money goes, helps you save, and stops you from wasting cash on stuff you don’t even remember buying.'
    },
    {
      accent: 'green', icon: 'pulse',
      title: 'Real-Time Life Tracking',
      body: 'Acendri watches how you’re doing (not in a creepy way) and adjusts your plans. If you fall behind, it slows things down. If you’re smashing goals, it levels you up. It’s always reacting and reshaping your path so you actually improve.'
    },
    {
      accent: 'purple', icon: 'users',
      title: 'The Acendri Social Hub',
      body: 'This is the part everyone loves. You can post your achievements, show your progress, and see how other people are improving their lives. It’s like a positive social feed where people flex their real goals instead of random selfies.'
    },
    {
      accent: 'pink', icon: 'sparkles',
      title: 'Add Your Friends',
      body: 'You can add friends so you can hype each other up. If your mate hits a new PR at the gym or finishes a study streak, you’ll see it. You can react, comment, and build friendly competition. It makes self-improvement actually fun.'
    },
    {
      accent: 'teal', icon: 'users',
      title: 'Create or Join Groups',
      body: 'Groups are where things get real. You can make groups for your sport, your school squad, hobbies, or even just your close friends. Everyone can share updates, compare progress, and compete on leaderboards. It’s like a team challenge for life.'
    },
    {
      accent: 'indigo', icon: 'route',
      title: 'Follow Real Paths',
      body: 'Acendri has something called Paths — these are journeys people have made, like “How I improved my grades” or “How I saved $1,000.” You can follow them step-by-step or create your own. It helps everyone learn from real experiences, not boring tutorials.'
    },
    {
      accent: 'red', icon: 'target',
      title: 'Built to Actually Change Your Life',
      body: 'Acendri isn’t just a random app. It’s built to make you better. Whether you want to get fitter, smarter, richer, or more organised, Acendri gives you the tools and plans so you don’t feel lost. It keeps you on track without stressing you out.'
    },
    {
      accent: 'yellow', icon: 'bolt',
      title: 'The System for Leveling Up',
      body: 'At the end of the day, Acendri is your all-in-one system for becoming the best version of yourself. It combines AI tools, real planning, and a supportive community. You’re not just using an app — you’re joining a whole platform made for growth.'
    }
  ];

  var TESTIMONIALS = [
    {
      accent: 'blue', emoji: '👩‍⚕️', name: 'Sarah Chen', role: 'Medical Student',
      quote: 'Acendri completely transformed how I manage my studies and clinical rotations. The AI scheduling is a lifesaver!'
    },
    {
      accent: 'green', emoji: '🏃', name: 'Marcus Johnson', role: 'Professional Athlete',
      quote: 'My training schedule, nutrition, and recovery are all synced perfectly. I wish I had this years ago.'
    },
    {
      accent: 'purple', emoji: '💼', name: 'Emily Rodriguez', role: 'Entrepreneur',
      quote: 'Managing multiple businesses used to be chaos. Acendri keeps everything organized and helps me prioritize what matters.'
    },
    {
      accent: 'indigo', emoji: '🎓', name: 'David Kim', role: 'College Student',
      quote: 'I went from barely passing to Dean’s List. Acendri automated my study schedule and kept me accountable every single day.'
    },
    {
      accent: 'orange', emoji: '💪', name: 'Jessica Taylor', role: 'Fitness Coach',
      quote: 'The health tracking integration is incredible. I can see my progress in real-time and adjust my goals automatically.'
    },
    {
      accent: 'teal', emoji: '💻', name: 'Alex Patel', role: 'Software Engineer',
      quote: 'Finally, an app that actually understands my workflow. The AI assistant handles all the boring scheduling stuff for me.'
    }
  ];

  var STARS = '★★★★★';

  A.registerScreen('landing', {
    title: 'Acendri OS',
    icon: 'sparkles',
    accent: 'cyan',
    inShell: false,
    order: 0,
    render: function (el, ctx) {
      var state = ctx.S.get();
      var onboarded = !!(state && state.profile && state.profile.onboarded);

      var html = '';

      /* ---------- A) hero ---------- */
      html += '<div class="landing">';
      html += '<div class="l-hero">';
      html += '<h1 class="h-grad">Acendri OS</h1>';
      html += '<div class="l-sub">Your Life Operating System</div>';
      html += '<p class="l-desc">Stop juggling apps. Start living smarter. Acendri manages your productivity, finances, learning, health, and time through one intelligent platform.</p>';
      if (onboarded) {
        html += '<p style="margin-top:26px"><button class="btn btn-acc acc-cyan" data-open-dash="1">Open my dashboard ' + A.ui.icon('arrow', 'sm') + '</button></p>';
      }
      html += '</div>';

      /* ---------- B) feature cards ---------- */
      html += '<div class="l-features">';
      FEATURES.forEach(function (f, i) {
        html += '<div class="l-card acc-' + f.accent + '">' +
          '<div class="l-card-top">' +
            '<span class="icon-tile">' + A.ui.icon(f.icon) + '</span>' +
            '<span class="pill">#' + (i + 1) + '</span>' +
          '</div>' +
          '<h2>' + A.ui.esc(f.title) + '</h2>' +
          '<p>' + A.ui.esc(f.body) + '</p>' +
        '</div>';
      });
      html += '</div>';

      /* ---------- C) testimonials ---------- */
      html += '<div class="l-testimonials">';
      html += '<h2 class="h-grad">What People Are Saying</h2>';
      html += '<div class="t-sub">Join thousands of people transforming their lives with Acendri</div>';
      html += '<div class="t-grid">';
      TESTIMONIALS.forEach(function (tm) {
        html += '<div class="t-card acc-' + tm.accent + '">' +
          '<div class="t-head">' +
            '<span class="avatar">' + tm.emoji + '</span>' +
            '<div><div class="t-name">' + A.ui.esc(tm.name) + '</div>' +
            '<div class="t-role">' + A.ui.esc(tm.role) + '</div></div>' +
          '</div>' +
          '<div class="t-stars">' + STARS + '</div>' +
          '<p class="t-quote">' + A.ui.esc(tm.quote) + '</p>' +
        '</div>';
      });
      html += '</div></div>';

      /* ---------- D) call to action ---------- */
      html += '<div class="l-cta"><div class="l-cta-inner">';
      html += '<h2 class="h-grad">Ready to Transform Your Life?</h2>';
      html += '<p>Join the future of personal growth. Let Acendri organize, optimize, and elevate every aspect of your life.</p>';
      html += '<button class="l-cta-btn" data-cta="1"><span>🚀</span><span>Start Your Acendri Journey</span>' + A.ui.icon('arrow') + '</button>';
      html += '</div></div>';

      /* ---------- E) footer ---------- */
      html += '<div class="l-foot">Built to help you become the best version of yourself 🚀</div>';
      html += '</div>';

      el.innerHTML = html;

      /* ---------- wire up buttons ---------- */
      var dashBtn = el.querySelector('[data-open-dash]');
      if (dashBtn) {
        dashBtn.addEventListener('click', function () { ctx.nav('app/dashboard'); });
      }
      el.querySelector('[data-cta]').addEventListener('click', function () {
        var s = ctx.S.get();
        if (s && s.profile && s.profile.onboarded) ctx.nav('app/dashboard');
        else ctx.nav('onboarding');
      });

      /* ---------- F) scroll-in animation ---------- */
      var cards = el.querySelectorAll('.l-card');
      if (typeof IntersectionObserver === 'undefined') {
        cards.forEach(function (c) { c.classList.add('vis'); });
        return;
      }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('vis');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });
      var vh = window.innerHeight || document.documentElement.clientHeight;
      cards.forEach(function (c) {
        var r = c.getBoundingClientRect();
        if (r.top < vh && r.bottom > 0) c.classList.add('vis'); // already on screen — no flash
        else io.observe(c);
      });
    }
  });
})();
