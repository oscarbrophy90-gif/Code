/* ============================================================
   Acendri OS — Social Hub: a positive feed where people flex
   real goals. Feed + Friends + Groups + Paths tabs, all local.
   The demo community is simulated; the user's posts are real.
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;

  /* ---------------- module state ---------------- */

  var TAB = 'feed';           // 'feed' | 'friends' | 'groups' | 'paths'
  var openComments = {};      // postId -> true (inline comment area open)
  var draft = '';             // composer text preserved across re-renders
  var curEl = null;           // current screen element (for manual re-render)
  var curCtx = null;

  var KIND_TAGS = {
    update: '✨ Update',
    achievement: '🏅 Achievement',
    goal: '🎯 Goal',
    streak: '🔥 Streak',
    pr: '🏋️ PR',
    path: '🧭 Path'
  };

  var GENERIC_STEPS = [
    'Write the goal down and decide why it matters',
    'Break it into small weekly actions',
    'Show up every day until it’s done'
  ];

  /* ---------------- helpers ---------------- */

  function safeAccent(name, fallback) {
    return A.ui.ACCENT_NAMES.indexOf(name) >= 0 ? name : (fallback || 'pink');
  }

  function findById(arr, id) {
    arr = arr || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  function socialOf(s) {
    return s.social || { friends: [], requests: [], suggestions: [], feed: [], groups: [], paths: [] };
  }

  function ensureSocial(st) {
    if (!st.social) st.social = { friends: [], requests: [], suggestions: [], feed: [], groups: [], paths: [] };
    st.social.friends = st.social.friends || [];
    st.social.requests = st.social.requests || [];
    st.social.suggestions = st.social.suggestions || [];
    st.social.feed = st.social.feed || [];
    st.social.groups = st.social.groups || [];
    st.social.paths = st.social.paths || [];
    return st.social;
  }

  function myName(s) { return (s.profile && s.profile.name) || 'You'; }
  function myAvatar(s) { return (s.profile && s.profile.avatar) || '🙂'; }

  function rerender() { if (curEl) renderSocial(curEl, curCtx); }

  function pathDoneCount(p) {
    var n = 0;
    (p.steps || []).forEach(function (_, i) { if (p.done && p.done[i]) n++; });
    return n;
  }

  function pathPct(p) {
    var total = (p.steps || []).length;
    return total ? Math.round(100 * pathDoneCount(p) / total) : 0;
  }

  /* ================= FEED ================= */

  function composerHTML(s) {
    var esc = A.ui.esc;
    return '<div class="card acc acc-cyan">' +
      '<div class="row" style="align-items:flex-start">' +
        '<span class="avatar">' + esc(myAvatar(s)) + '</span>' +
        '<div class="li-main">' +
          '<textarea class="textarea" data-ctext maxlength="400" placeholder="Share a win, a streak, a milestone…">' + esc(draft) + '</textarea>' +
          '<div class="row" style="justify-content:flex-end;margin-top:10px">' +
            '<button class="btn btn-primary" data-share>' + A.ui.icon('send', 'sm') + ' Share</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function postHTML(p) {
    var esc = A.ui.esc;
    var accCls = (p.kind === 'achievement' || p.kind === 'goal') ? ' acc acc-' + safeAccent(p.accent) : '';
    var open = !!openComments[p.id];
    var comments = p.comments || [];
    var kindTag = KIND_TAGS[p.kind] || ('✨ ' + esc(p.kind || 'update'));

    var h = '<div class="post' + accCls + '">';
    // header
    h += '<div class="spread">' +
      '<div class="row" style="min-width:0">' +
        '<span class="avatar">' + esc(p.avatar || '🙂') + '</span>' +
        '<div class="li-main">' +
          '<div class="row wrap" style="gap:8px"><span class="bold">' + esc(p.author) + '</span>' +
            (p.me ? '<span class="pill acc-cyan">You</span>' : '') + '</div>' +
          '<div class="row wrap" style="gap:8px"><span class="li-sub">' + esc(A.ui.timeAgo(p.time || Date.now())) + '</span>' +
            '<span class="tag">' + kindTag + '</span></div>' +
        '</div>' +
      '</div>' +
      (p.me
        ? '<button class="icon-btn danger" data-delpost="' + esc(p.id) + '" title="Delete post" aria-label="Delete post">' + A.ui.icon('trash', 'sm') + '</button>'
        : '') +
    '</div>';
    // body
    h += '<p style="margin:10px 0 12px;font-size:.93rem;color:var(--body)">' + esc(p.text) + '</p>';
    // actions
    h += '<div class="row wrap">' +
      '<button class="react-btn' + (p.liked ? ' on' : '') + '" data-like="' + esc(p.id) + '" title="' + (p.liked ? 'Unlike' : 'Like') + '">❤️ ' + (p.likes || 0) + '</button>' +
      '<button class="react-btn' + (open ? ' on' : '') + '" data-cbtn="' + esc(p.id) + '" title="Comments">💬 ' + comments.length + '</button>' +
    '</div>';
    // inline comments
    if (open) {
      h += '<hr class="sep"><div class="col" style="gap:8px">';
      comments.forEach(function (c) {
        h += '<div class="row" style="align-items:flex-start">' +
          '<span class="avatar sm">' + esc(c.avatar || '🙂') + '</span>' +
          '<div class="small" style="padding-top:5px"><span class="bold">' + esc(c.author) + '</span> ' +
          '<span class="muted">' + esc(c.text) + '</span></div></div>';
      });
      if (!comments.length) h += '<div class="small dim">No replies yet — be the first.</div>';
      h += '<div class="row">' +
        '<input class="input" data-cin="' + esc(p.id) + '" maxlength="240" placeholder="Write a reply…">' +
        '<button class="btn btn-sm btn-acc acc-cyan" data-crep="' + esc(p.id) + '">Reply</button>' +
      '</div></div>';
    }
    h += '</div>';
    return h;
  }

  function feedHTML(s) {
    var feed = socialOf(s).feed || [];
    var h = composerHTML(s);
    if (!feed.length) {
      h += '<div class="empty section-gap"><div class="e-emoji">🌤️</div>' +
        '<p>The feed is quiet. Post a win — even a tiny one — and set the tone.</p>' +
        '<button class="btn btn-acc acc-cyan" data-focus-composer>✍️ Share your first win</button></div>';
    } else {
      h += '<div class="col section-gap" style="gap:14px">' +
        feed.map(postHTML).join('') + '</div>';
    }
    return h;
  }

  function postReply(postId) {
    if (!curEl) return;
    var input = curEl.querySelector('[data-cin="' + postId + '"]');
    if (!input) return;
    var text = input.value.trim();
    if (!text) { A.ui.toast('Write a reply first', '💬'); return; }
    var s = A.S.get();
    var name = myName(s), av = myAvatar(s);
    openComments[postId] = true;
    A.S.update(function (st) {
      var p = findById(ensureSocial(st).feed, postId);
      if (!p) return;
      if (!p.comments) p.comments = [];
      p.comments.push({ author: name, avatar: av, text: text });
    });
  }

  function wireFeed(el) {
    var ta = el.querySelector('[data-ctext]');
    if (ta) ta.addEventListener('input', function () { draft = ta.value; });

    var share = el.querySelector('[data-share]');
    if (share) share.addEventListener('click', function () {
      var text = (ta ? ta.value : '').trim();
      if (!text) { A.ui.toast('Write something first — even a tiny win counts', '✍️'); return; }
      var s = A.S.get();
      var name = myName(s), av = myAvatar(s);
      draft = '';
      A.S.update(function (st) {
        ensureSocial(st).feed.unshift({
          id: A.ui.uid(), author: name, avatar: av, me: true, accent: 'cyan',
          kind: 'update', time: Date.now(), text: text, likes: 0, liked: false, comments: []
        });
      });
      A.S.addXp(5, 'Shared an update');
    });

    var focusBtn = el.querySelector('[data-focus-composer]');
    if (focusBtn) focusBtn.addEventListener('click', function () {
      if (ta) { ta.focus(); ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    });

    el.querySelectorAll('[data-like]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-like');
        A.S.update(function (st) {
          var p = findById(ensureSocial(st).feed, id);
          if (!p) return;
          p.liked = !p.liked;
          p.likes = Math.max(0, (p.likes || 0) + (p.liked ? 1 : -1));
        });
      });
    });

    el.querySelectorAll('[data-cbtn]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-cbtn');
        openComments[id] = !openComments[id];
        rerender();
      });
    });

    el.querySelectorAll('[data-crep]').forEach(function (b) {
      b.addEventListener('click', function () { postReply(b.getAttribute('data-crep')); });
    });
    el.querySelectorAll('[data-cin]').forEach(function (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); postReply(inp.getAttribute('data-cin')); }
      });
    });

    el.querySelectorAll('[data-delpost]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-delpost');
        A.ui.confirm('Delete this post? It will disappear from the feed forever.', function () {
          delete openComments[id];
          A.S.update(function (st) {
            var so = ensureSocial(st);
            so.feed = so.feed.filter(function (p) { return p.id !== id; });
          });
          A.ui.toast('Post deleted', '🗑️');
        }, { title: 'Delete post', yesLabel: 'Delete' });
      });
    });
  }

  /* ================= FRIENDS ================= */

  function friendsHTML(s) {
    var esc = A.ui.esc;
    var so = socialOf(s);
    var requests = so.requests || [];
    var friends = so.friends || [];
    var suggestions = so.suggestions || [];
    var h = '';

    if (requests.length) {
      h += '<div class="card acc acc-pink">' +
        '<div class="card-title">💌 Friend requests</div><div class="list">' +
        requests.map(function (r) {
          return '<div class="list-item">' +
            '<span class="avatar">' + esc(r.avatar || '🙂') + '</span>' +
            '<div class="li-main"><div class="li-title">' + esc(r.name) + '</div>' +
            '<div class="li-sub">' + esc(r.role || '') + '</div></div>' +
            '<button class="btn btn-sm btn-acc acc-pink" data-accept="' + esc(r.id) + '">Accept</button>' +
            '<button class="btn btn-sm btn-ghost" data-decline="' + esc(r.id) + '">Decline</button>' +
          '</div>';
        }).join('') + '</div></div>';
    }

    h += '<div class="card' + (requests.length ? ' section-gap' : '') + '">' +
      '<div class="card-title">' + A.ui.icon('users') + ' Your friends <span class="muted" style="font-weight:400">(' + friends.length + ')</span></div>';
    if (!friends.length) {
      h += '<div class="empty"><div class="e-emoji">🫂</div>' +
        '<p>No friends yet — accept a request or add someone from the suggestions below.</p>' +
        '<button class="btn btn-acc acc-pink" data-goto-feed>🌍 Meet the community</button></div>';
    } else {
      h += '<div class="list">' + friends.map(function (f) {
        return '<div class="list-item">' +
          '<span class="avatar">' + esc(f.avatar || '🙂') + '</span>' +
          '<div class="li-main">' +
            '<div class="li-title row" style="gap:7px">' + esc(f.name) +
              (f.online ? '<span class="badge-dot acc-green" title="Online"></span>' : '') + '</div>' +
            '<div class="li-sub">' + esc(f.role || '') + '</div>' +
          '</div>' +
          '<span class="pill acc-blue">LV ' + (f.level || 1) + '</span>' +
          '<span class="tag">🔥 ' + (f.streak || 0) + '</span>' +
          '<button class="btn btn-sm btn-acc acc-pink" data-wave="' + esc(f.id) + '" title="Send some hype">👋 Wave</button>' +
        '</div>';
      }).join('') + '</div>';
    }
    h += '</div>';

    h += '<div class="card section-gap"><div class="card-title">✨ People you may know</div>';
    if (!suggestions.length) {
      h += '<div class="small muted">🎉 No more suggestions — you already know everyone around here.</div>';
    } else {
      h += '<div class="list">' + suggestions.map(function (p) {
        return '<div class="list-item">' +
          '<span class="avatar">' + esc(p.avatar || '🙂') + '</span>' +
          '<div class="li-main"><div class="li-title">' + esc(p.name) + '</div>' +
          '<div class="li-sub">' + esc(p.role || '') + '</div></div>' +
          '<button class="btn btn-sm btn-acc acc-pink" data-addfriend="' + esc(p.id) + '">+ Add friend</button>' +
        '</div>';
      }).join('') + '</div>';
    }
    h += '</div>';
    return h;
  }

  function wireFriends(el) {
    el.querySelectorAll('[data-accept]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-accept');
        var name = '';
        A.S.update(function (st) {
          var so = ensureSocial(st);
          var r = findById(so.requests, id);
          if (!r) return;
          name = r.name;
          so.requests = so.requests.filter(function (x) { return x.id !== id; });
          so.friends.push({ id: r.id, name: r.name, avatar: r.avatar, role: r.role, level: 3, streak: 1, online: true });
        });
        if (name) A.ui.toast('You and ' + name + ' are now friends 🎉', '🫂');
      });
    });

    el.querySelectorAll('[data-decline]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-decline');
        A.S.update(function (st) {
          var so = ensureSocial(st);
          so.requests = so.requests.filter(function (x) { return x.id !== id; });
        });
        A.ui.toast('Request declined — no hard feelings', '👌');
      });
    });

    el.querySelectorAll('[data-addfriend]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-addfriend');
        var name = '';
        A.S.update(function (st) {
          var so = ensureSocial(st);
          var idx = -1;
          for (var i = 0; i < so.suggestions.length; i++) if (so.suggestions[i].id === id) idx = i;
          if (idx < 0) return;
          var p = so.suggestions[idx];
          name = p.name;
          so.suggestions.splice(idx, 1);
          so.friends.push({
            id: p.id, name: p.name, avatar: p.avatar, role: p.role,
            level: 2 + (idx % 4), streak: 1 + idx * 2, online: idx % 2 === 0
          });
        });
        if (name) A.ui.toast('You and ' + name + ' are now friends 🎉', '🫂');
      });
    });

    el.querySelectorAll('[data-wave]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-wave');
        var s = A.S.get();
        var f = findById(socialOf(s).friends, id);
        if (!f) return;
        // If the user has a post, the friend hypes it up in the comments.
        var myPost = null;
        (socialOf(s).feed || []).forEach(function (p) { if (!myPost && p.me) myPost = p; });
        if (myPost) {
          var postId = myPost.id;
          openComments[postId] = true;
          A.S.update(function (st) {
            var p = findById(ensureSocial(st).feed, postId);
            if (!p) return;
            if (!p.comments) p.comments = [];
            p.comments.push({ author: f.name, avatar: f.avatar, text: '👋 Wave received — keep crushing it!' });
          });
        }
        A.ui.toast('You waved at ' + f.name + ' — they’ll feel the hype!', '👋');
      });
    });

    var goFeed = el.querySelector('[data-goto-feed]');
    if (goFeed) goFeed.addEventListener('click', function () { TAB = 'feed'; rerender(); });
  }

  /* ================= GROUPS ================= */

  function groupsHTML(s) {
    var esc = A.ui.esc;
    var groups = socialOf(s).groups || [];
    if (!groups.length) {
      return '<div class="empty"><div class="e-emoji">👥</div>' +
        '<p>No groups around right now — hang out in the feed while the community grows.</p>' +
        '<button class="btn btn-acc acc-pink" data-goto-feed>🌍 Back to the feed</button></div>';
    }
    return '<div class="grid2">' + groups.map(function (g) {
      var acc = safeAccent(g.accent, 'teal');
      return '<div class="card acc acc-' + acc + '">' +
        '<div class="row">' +
          '<span class="avatar lg">' + esc(g.emoji || '👥') + '</span>' +
          '<div class="li-main">' +
            '<div class="bold">' + esc(g.name) + '</div>' +
            '<div class="muted small">' + (g.members || 0) + ' members</div>' +
          '</div>' +
          (g.joined ? '<span class="pill">✓ Joined</span>' : '') +
        '</div>' +
        '<p class="muted small" style="margin:10px 0 12px">' + esc(g.desc || '') + '</p>' +
        '<div class="row wrap">' +
          (g.joined
            ? '<button class="btn btn-sm btn-ghost" data-leave="' + esc(g.id) + '">Leave</button>'
            : '<button class="btn btn-sm btn-acc" data-join="' + esc(g.id) + '">Join</button>') +
          '<button class="btn btn-sm" data-lb="' + esc(g.id) + '">🏆 Leaderboard</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function openLeaderboard(groupId) {
    var esc = A.ui.esc;
    var s = A.S.get();
    var g = findById(socialOf(s).groups, groupId);
    if (!g) return;
    var rows = (g.leaderboard || []).map(function (r) {
      return { name: r.name, avatar: r.avatar, xp: r.xp || 0, me: false };
    });
    if (g.joined) {
      rows.push({ name: myName(s), avatar: myAvatar(s), xp: (s.profile && s.profile.xp) || 0, me: true });
    }
    rows.sort(function (a, b) { return b.xp - a.xp; });
    var body = '<table class="tbl"><thead><tr><th>#</th><th>Member</th><th class="num" style="text-align:right">XP</th></tr></thead><tbody>' +
      rows.map(function (r, i) {
        var cls = r.me ? ' class="bold h-acc"' : '';
        return '<tr>' +
          '<td' + cls + '>' + (i + 1) + '</td>' +
          '<td' + cls + '><span style="margin-right:6px">' + esc(r.avatar || '🙂') + '</span>' + esc(r.name) + (r.me ? ' <span class="pill">You</span>' : '') + '</td>' +
          '<td class="num' + (r.me ? ' bold h-acc' : '') + '" style="text-align:right">' + r.xp + '</td>' +
        '</tr>';
      }).join('') + '</tbody></table>' +
      (g.joined ? '' : '<div class="small muted" style="margin-top:12px">Join the group to see your name on the board.</div>');
    A.ui.modal({
      title: esc(g.emoji || '👥') + ' ' + esc(g.name) + ' — Leaderboard',
      accent: safeAccent(g.accent, 'teal'),
      body: body,
      actions: [{ label: 'Close', cls: 'btn-ghost' }]
    });
  }

  function wireGroups(el) {
    el.querySelectorAll('[data-join]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-join');
        var name = '';
        A.S.update(function (st) {
          var g = findById(ensureSocial(st).groups, id);
          if (!g || g.joined) return;
          g.joined = true;
          g.members = (g.members || 0) + 1;
          name = g.name;
        });
        if (name) A.ui.toast('Welcome to ' + name + '!', '🎉');
      });
    });

    el.querySelectorAll('[data-leave]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-leave');
        var g = findById(socialOf(A.S.get()).groups, id);
        if (!g) return;
        A.ui.confirm('Leave "' + g.name + '"? You can rejoin any time, but you’ll drop off the leaderboard.', function () {
          A.S.update(function (st) {
            var gg = findById(ensureSocial(st).groups, id);
            if (!gg || !gg.joined) return;
            gg.joined = false;
            gg.members = Math.max(0, (gg.members || 1) - 1);
          });
          A.ui.toast('You left ' + g.name, '👋');
        }, { title: 'Leave group', yesLabel: 'Leave' });
      });
    });

    el.querySelectorAll('[data-lb]').forEach(function (b) {
      b.addEventListener('click', function () { openLeaderboard(b.getAttribute('data-lb')); });
    });

    var goFeed = el.querySelector('[data-goto-feed]');
    if (goFeed) goFeed.addEventListener('click', function () { TAB = 'feed'; rerender(); });
  }

  /* ================= PATHS ================= */

  function pathCardHTML(p) {
    var esc = A.ui.esc;
    var acc = safeAccent(p.accent, 'indigo');
    var total = (p.steps || []).length;
    var done = pathDoneCount(p);
    var pct = pathPct(p);
    var h = '<div class="card acc acc-' + acc + '">' +
      '<div class="row">' +
        '<span class="avatar lg">' + esc(p.emoji || '🧭') + '</span>' +
        '<div class="li-main">' +
          '<div class="bold">' + esc(p.title) + '</div>' +
          '<div class="li-sub">by ' + esc(p.author) + ' · ' + (p.followers || 0) + ' followers · ' + total + ' steps</div>' +
        '</div>' +
      '</div>';
    if (p.following) {
      h += '<div style="margin-top:12px">' +
        '<div class="bar"><span class="bar-fill" style="width:' + pct + '%"></span></div>' +
        '<div class="small muted" style="margin-top:5px">' + done + ' of ' + total + ' steps done · ' + pct + '%' +
          (total && done === total ? ' — completed 🎉' : '') + '</div>' +
      '</div>';
    }
    h += '<div class="row wrap" style="margin-top:12px">' +
      (p.following
        ? '<button class="btn btn-sm btn-ghost" data-unfollow="' + esc(p.id) + '">Unfollow</button>'
        : '<button class="btn btn-sm btn-acc" data-follow="' + esc(p.id) + '">Follow</button>') +
      '<button class="btn btn-sm" data-open-path="' + esc(p.id) + '">🧭 Open</button>' +
    '</div></div>';
    return h;
  }

  function createPathCardHTML(s) {
    var esc = A.ui.esc;
    var doneGoals = (s.goals || []).filter(function (g) { return g.status === 'done'; });
    var h = '<div class="card acc acc-pink section-gap">' +
      '<div class="card-title">🌟 Create your own Path</div>';
    if (!doneGoals.length) {
      h += '<div class="muted small">Complete a goal to turn your journey into a Path others can follow.</div>' +
        '<button class="btn btn-sm btn-acc acc-pink" data-goto-goals style="margin-top:10px">🎯 Go to Goals</button>';
    } else {
      h += '<div class="muted small" style="margin-bottom:10px">You did it — now show others the way, step by step.</div>' +
        '<div class="row wrap">' +
          '<select class="select" data-pubsel style="flex:1;min-width:200px">' +
            doneGoals.map(function (g) {
              return '<option value="' + esc(g.id) + '">' + esc(g.title) + '</option>';
            }).join('') +
          '</select>' +
          '<button class="btn btn-primary" data-publish>🚀 Publish my Path</button>' +
        '</div>';
    }
    h += '</div>';
    return h;
  }

  function pathsHTML(s) {
    var paths = socialOf(s).paths || [];
    var h = '<div class="muted small" style="margin-bottom:14px">Paths are real journeys from real people — follow them step-by-step.</div>';
    if (!paths.length) {
      h += '<div class="empty"><div class="e-emoji">🧭</div>' +
        '<p>No Paths to follow yet — complete a goal and publish the very first one.</p>' +
        '<button class="btn btn-acc acc-pink" data-goto-goals>🎯 Go to Goals</button></div>';
    } else {
      h += '<div class="grid2">' + paths.map(pathCardHTML).join('') + '</div>';
    }
    h += createPathCardHTML(s);
    return h;
  }

  function openPathModal(pathId) {
    var esc = A.ui.esc;

    function getPath() { return findById(socialOf(A.S.get()).paths, pathId); }

    function bodyHTML() {
      var p = getPath();
      if (!p) return '<div class="muted">This Path is gone.</div>';
      var total = (p.steps || []).length;
      var done = pathDoneCount(p);
      var pct = pathPct(p);
      var h = '<div class="spread" style="margin-bottom:6px">' +
        '<span class="small muted">by ' + esc(p.author) + ' · ' + done + ' of ' + total + ' steps</span>' +
        '<span class="small bold h-acc">' + pct + '%</span></div>' +
        '<div class="bar lg"><span class="bar-fill" style="width:' + pct + '%"></span></div>';
      if (!p.following) {
        h += '<div class="small muted" style="margin-top:8px">👀 You’re previewing — follow this Path to start ticking steps.</div>';
      }
      h += '<div class="list" style="margin-top:14px">' +
        (p.steps || []).map(function (stp, i) {
          var on = !!(p.done && p.done[i]);
          return '<div class="list-item' + (on ? ' done' : '') + '">' +
            '<button class="check' + (on ? ' on' : '') + '" data-step="' + i + '" title="' + (p.following ? (on ? 'Untick step' : 'Tick step') : 'Follow to unlock') + '" aria-label="Toggle step ' + (i + 1) + '">' + A.ui.icon('check', 'sm') + '</button>' +
            '<div class="li-main"><div class="li-title" style="font-weight:500">' + esc(stp) + '</div>' +
            '<div class="li-sub">Step ' + (i + 1) + ' of ' + total + '</div></div>' +
          '</div>';
        }).join('') + '</div>';
      return h;
    }

    var p0 = getPath();
    if (!p0) return;

    var handle = A.ui.modal({
      title: esc(p0.emoji || '🧭') + ' ' + esc(p0.title),
      accent: safeAccent(p0.accent, 'indigo'),
      wide: true,
      body: bodyHTML(),
      actions: [{ label: 'Close', cls: 'btn-ghost' }],
      onOpen: function (m) { wire(m); }
    });

    function refresh() {
      var body = handle.el.querySelector('.modal-body');
      if (body) { body.innerHTML = bodyHTML(); wire(handle.el); }
    }

    function wire(m) {
      m.querySelectorAll('[data-step]').forEach(function (b) {
        b.addEventListener('click', function () {
          var idx = +b.getAttribute('data-step');
          var p = getPath();
          if (!p) return;
          if (!p.following) { A.ui.toast('Follow this path to start ticking steps', '🧭'); return; }
          var wasDone = !!(p.done && p.done[idx]);
          var completed = false;
          A.S.update(function (st) {
            var pp = findById(ensureSocial(st).paths, pathId);
            if (!pp) return;
            if (!pp.done) pp.done = {};
            if (wasDone) {
              delete pp.done[idx];
            } else {
              pp.done[idx] = true;
              completed = (pp.steps || []).every(function (_, i) { return !!pp.done[i]; });
            }
          });
          if (!wasDone) {
            A.S.addXp(5, 'Path step done');
            if (completed) { A.ui.confetti(); A.ui.toast('Path completed 🎉', '🏆'); }
          }
          refresh();
        });
      });
    }
  }

  function publishPath(el) {
    var sel = el.querySelector('[data-pubsel]');
    if (!sel || !sel.value) { A.ui.toast('Pick a completed goal first', '🎯'); return; }
    var s = A.S.get();
    var goal = findById(s.goals || [], sel.value);
    if (!goal || goal.status !== 'done') { A.ui.toast('Pick a completed goal first', '🎯'); return; }
    var title = 'How I ' + String(goal.title || '').toLowerCase();
    var already = false;
    (socialOf(s).paths || []).forEach(function (p) {
      if (p.author === myName(s) && p.title === title) already = true;
    });
    if (already) { A.ui.toast('You already published that journey as a Path', '🌟'); return; }
    var steps = (goal.milestones && goal.milestones.length)
      ? goal.milestones.map(function (m) { return m.title; })
      : GENERIC_STEPS.slice();
    var done = {};
    steps.forEach(function (_, i) { done[i] = true; });
    var name = myName(s), av = myAvatar(s);
    A.S.update(function (st) {
      ensureSocial(st).paths.unshift({
        id: A.ui.uid(), title: title, author: name, avatar: av,
        accent: safeAccent(goal.accent, 'pink'), emoji: '🌟',
        followers: 0, following: true, done: done, steps: steps
      });
    });
    A.ui.toast('Path published — inspire someone 🚀', '🌟');
  }

  function wirePaths(el) {
    el.querySelectorAll('[data-follow]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-follow');
        A.S.update(function (st) {
          var p = findById(ensureSocial(st).paths, id);
          if (!p || p.following) return;
          p.following = true;
          p.followers = (p.followers || 0) + 1;
        });
        A.ui.toast('Following — step 1 awaits!', '🧭');
      });
    });

    el.querySelectorAll('[data-unfollow]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-unfollow');
        var p = findById(socialOf(A.S.get()).paths, id);
        if (!p) return;
        A.ui.confirm('Unfollow "' + p.title + '"? Your ticked steps are kept in case you come back.', function () {
          A.S.update(function (st) {
            var pp = findById(ensureSocial(st).paths, id);
            if (!pp || !pp.following) return;
            pp.following = false;
            pp.followers = Math.max(0, (pp.followers || 1) - 1);
          });
          A.ui.toast('Unfollowed — your progress is saved', '👌');
        }, { title: 'Unfollow path', yesLabel: 'Unfollow' });
      });
    });

    el.querySelectorAll('[data-open-path]').forEach(function (b) {
      b.addEventListener('click', function () { openPathModal(b.getAttribute('data-open-path')); });
    });

    var pub = el.querySelector('[data-publish]');
    if (pub) pub.addEventListener('click', function () { publishPath(el); });

    el.querySelectorAll('[data-goto-goals]').forEach(function (b) {
      b.addEventListener('click', function () { if (curCtx) curCtx.nav('app/goals'); else A.nav('app/goals'); });
    });
  }

  /* ================= SCREEN ================= */

  function tabsHTML(s) {
    var so = socialOf(s);
    var reqCount = (so.requests || []).length;
    var defs = [
      { id: 'feed', label: '📣 Feed' },
      { id: 'friends', label: '🫂 Friends' + (reqCount ? ' <span class="pill acc-pink">' + reqCount + '</span>' : '') },
      { id: 'groups', label: '👥 Groups' },
      { id: 'paths', label: '🧭 Paths' }
    ];
    return '<div class="row wrap" style="margin-bottom:20px">' +
      defs.map(function (d) {
        return '<button class="btn' + (TAB === d.id ? ' btn-acc acc-pink' : '') + '" data-tab="' + d.id + '">' + d.label + '</button>';
      }).join('') + '</div>';
  }

  function renderSocial(el, ctx) {
    curEl = el;
    curCtx = ctx;
    var s = A.S.get();

    var body;
    if (TAB === 'friends') body = friendsHTML(s);
    else if (TAB === 'groups') body = groupsHTML(s);
    else if (TAB === 'paths') body = pathsHTML(s);
    else { TAB = 'feed'; body = feedHTML(s); }

    el.innerHTML =
      '<div class="screen-head">' +
        '<h1>Social Hub</h1>' +
        '<div class="sub">A positive feed where people flex real goals, not selfies.</div>' +
        '<div style="margin-top:10px"><span class="tag">🧪 Demo community — simulated friends show how the hub works. Your posts are real (and stay on this device).</span></div>' +
      '</div>' +
      tabsHTML(s) +
      body;

    el.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        TAB = b.getAttribute('data-tab');
        rerender();
      });
    });

    if (TAB === 'feed') wireFeed(el);
    else if (TAB === 'friends') wireFriends(el);
    else if (TAB === 'groups') wireGroups(el);
    else if (TAB === 'paths') wirePaths(el);
  }

  A.registerScreen('app/social', {
    title: 'Social Hub',
    icon: 'users',
    accent: 'pink',
    inShell: true,
    order: 7,
    render: renderSocial
  });
})();
