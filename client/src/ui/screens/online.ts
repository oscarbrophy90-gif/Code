import { formatHeight, grandChampLabel, onlineRank, type LadderRival } from '@hoops/shared';

import { store } from '../../state/store.ts';
import {
  acceptIncoming,
  allUsers,
  declineIncoming,
  findQuickMatch,
  isOnline,
  markNoticesRead,
  noticeLine,
  rivalConfig,
  rivalDifficulty,
  sendFriendRequest,
  tickSocial,
  unreadCount,
  userById,
} from '../../state/social.ts';
import { inParty, invite, leaveParty, partyState, onPartyChange } from '../../state/party.ts';
import { navigate, type RouteParams } from '../../main.ts';
import { el, overlay, panel, toast } from '../dom.ts';
import { startMatch } from '../session.ts';
import { buildPreviewCard, drawFigure } from '../walkout.ts';
import { drawRankBadge } from '../rankbadge.ts';

/**
 * The Online hub: your player, the modes, your friends, and the party lobby.
 *
 * Same world as the leaderboard — the people here are the ladder's rivals,
 * with real builds behind their names. Quick Match finds whoever is playing
 * near your standing; friends are added by username, answer in their own
 * time, and can be invited to a party. A party narrows the game to the lobby:
 * Store, Locker, Settings and Controls stay open, and everything else asks
 * you to leave the lobby first.
 */

type FriendTab = 'friends' | 'add' | 'notices';
let tab: FriendTab = 'friends';
let searchText = '';

export function renderOnline(_params: RouteParams): HTMLElement {
  // Test rig, same gate as the match screen's: lets an automated browser
  // fast-forward the social clock instead of waiting out real replies.
  if (new URLSearchParams(window.location.search).has('dunkdebug')) {
    (window as unknown as { __socialDebug?: unknown }).__socialDebug = {
      fastForward() {
        store.update((p) => {
          for (const r of p.social.outgoing) r.resolvesAt = Date.now() - 1;
        });
        tickSocial();
      },
    };
  }
  tickSocial();
  const root = el('div', { class: 'wrap' });
  const profile = store.profile;
  const social = profile.social;

  root.append(
    el('h1', { class: 'page' }, 'Online'),
    el(
      'p',
      { class: 'page-sub' },
      'Play the people on the ladder. Quick Match finds somebody at your level; friends can be invited to a party and played head to head.',
    ),
  );

  // Re-render when the party answers an invite, and keep the clock ticking
  // while the screen is open so request answers land without a refresh.
  const release = onPartyChange(() => {
    if (root.isConnected) navigate('online');
  });
  const timer = window.setInterval(() => {
    if (!root.isConnected) {
      window.clearInterval(timer);
      release();
      return;
    }
    const before = unreadCount();
    tickSocial();
    if (unreadCount() !== before) navigate('online');
  }, 4000);

  // ------------------------------------------------------------- your player
  const me = store.simConfig();
  const rank = onlineRank(profile.online.rp);
  const played = profile.online.wins + profile.online.losses > 0;
  const figure = el('canvas', { class: 'walkout-figure' }) as HTMLCanvasElement;
  drawFigure(figure, me, 150);
  const badge = el('canvas', { style: 'width:56px;height:64px' }) as HTMLCanvasElement;
  requestAnimationFrame(() => drawRankBadge(badge, profile.online.rp, store.position()));

  const left = el(
    'div',
    { style: 'display:grid;gap:14px' },
    panel(
      'Your player',
      el(
        'div',
        { class: 'online-me' },
        figure,
        el(
          'div',
          { class: 'online-me-info' },
          el('div', { class: 'online-me-name' }, profile.username),
          el('div', { class: 'faint' }, `${me.name} · ${me.position ?? '—'} · ${formatHeight(me.heightIn)}`),
          el(
            'div',
            { class: 'online-me-rank' },
            badge,
            el(
              'div',
              {},
              el('b', { style: `color:${rank.tier.color}` }, played ? (rank.grandChamp ? grandChampLabel(store.position()) : rank.label) : 'Unranked'),
              el('div', { class: 'faint', style: 'font-size:11px' }, `${profile.online.wins}W – ${profile.online.losses}L online`),
            ),
          ),
        ),
      ),
    ),

    panel(
      'Game modes',
      inParty()
        ? el('p', { class: 'hint', style: 'margin:0' }, 'You are in a party — the game starts from the lobby.')
        : el(
            'div',
            { class: 'online-modes' },
            el(
              'button',
              { class: 'mode-card', onclick: () => quickMatch() },
              el('div', { class: 'mode-count' }, '1v1'),
              el('div', { class: 'mode-title' }, 'Quick Match'),
              el('div', { class: 'mode-blurb' }, 'Finds somebody playing online near your rank and puts you on a court.'),
            ),
          ),
    ),

    partyPanel(),
  );

  // ---------------------------------------------------------------- friends
  const unread = unreadCount();
  const tabs = el(
    'div',
    { class: 'online-tabs' },
    tabButton('friends', `Friends (${social.friends.length})`),
    tabButton('add', 'Add Friends'),
    tabButton('notices', unread > 0 ? `Notifications (${unread})` : 'Notifications'),
  );

  const right = el('div', { style: 'display:grid;gap:14px' }, panel('Friends', tabs, tabBody()));

  root.append(el('div', { class: 'split' }, left, right));
  return root;

  // ------------------------------------------------------------------ pieces

  function tabButton(id: FriendTab, label: string): HTMLElement {
    return el(
      'button',
      {
        class: `btn sm ${tab === id ? 'primary' : ''}`,
        onclick: () => {
          tab = id;
          if (id === 'notices') markNoticesRead();
          navigate('online');
        },
      },
      label,
    );
  }

  function tabBody(): HTMLElement {
    if (tab === 'add') return addFriends();
    if (tab === 'notices') return notices();
    return friendList();
  }

  function friendList(): HTMLElement {
    if (social.friends.length === 0) {
      return el('p', { class: 'hint', style: 'margin:12px 0 0' }, 'Nobody yet. Find people under Add Friends — everyone on the leaderboard is out there.');
    }
    return el(
      'div',
      { style: 'display:grid;gap:8px;margin-top:12px' },
      ...social.friends.map((f) => {
        const rival = userById(f.id);
        const online = rival ? isOnline(rival) : false;
        const theirRank = rival ? onlineRank(rival.points) : null;
        return el(
          'div',
          { class: 'kv friend-row' },
          el(
            'span',
            { class: 'k' },
            el('span', { class: `presence ${online ? 'on' : ''}` }),
            el('b', {}, f.name),
            theirRank
              ? el('span', { class: 'faint', style: `margin-left:8px;color:${theirRank.tier.color}` }, theirRank.label)
              : null,
          ),
          online && rival
            ? inParty()
              ? el('span', { class: 'pill' }, partyState()?.member.id === f.id ? 'In your party' : 'In lobby')
              : el('button', { class: 'btn sm', onclick: () => sendInvite(rival) }, 'Invite to party')
            : el('span', { class: 'pill' }, 'Offline'),
        );
      }),
    );
  }

  function addFriends(): HTMLElement {
    const input = el('input', {
      class: 'text-input',
      placeholder: 'Search username…',
      value: searchText,
      oninput: (e: Event) => {
        searchText = (e.target as HTMLInputElement).value;
        results.replaceChildren(...resultRows());
      },
    }) as HTMLInputElement;

    const results = el('div', { style: 'display:grid;gap:8px;margin-top:10px' }, ...resultRows());

    function resultRows(): HTMLElement[] {
      const q = searchText.trim().toLowerCase();
      if (q.length < 2) {
        return [el('p', { class: 'hint', style: 'margin:2px 0 0' }, 'Type at least two letters. The names on the leaderboard are the names you can add.')];
      }
      const known = new Set([...social.friends.map((f) => f.id), ...social.outgoing.map((r) => r.id)]);
      const hits = allUsers().filter((r) => r.name.toLowerCase().includes(q)).slice(0, 8);
      if (hits.length === 0) return [el('p', { class: 'hint', style: 'margin:2px 0 0' }, 'No player by that name.')];
      return hits.map((r) => {
        const theirRank = onlineRank(r.points);
        const pending = social.outgoing.some((o) => o.id === r.id);
        return el(
          'div',
          { class: 'kv friend-row' },
          el(
            'span',
            { class: 'k' },
            el('b', {}, r.name),
            el('span', { class: 'faint', style: `margin-left:8px;color:${theirRank.tier.color}` }, theirRank.label),
          ),
          known.has(r.id)
            ? el('span', { class: 'pill' }, pending ? 'Request sent' : 'Friends')
            : el(
                'button',
                {
                  class: 'btn sm',
                  onclick: () => {
                    const result = sendFriendRequest(r.name);
                    toast(
                      result === 'sent'
                        ? `Friend request sent to ${r.name}`
                        : result === 'already-pending'
                          ? 'Request already out'
                          : result === 'already-friends'
                            ? 'Already friends'
                            : 'No player by that name',
                      result === 'sent' ? 'good' : 'info',
                    );
                    navigate('online', { keepTab: 1 });
                  },
                },
                'Send request',
              ),
        );
      });
    }

    return el('div', { style: 'margin-top:12px' }, input, results);
  }

  function notices(): HTMLElement {
    const rows: HTMLElement[] = [];
    for (const req of social.incoming) {
      rows.push(
        el(
          'div',
          { class: 'kv friend-row' },
          el('span', { class: 'k' }, el('b', {}, req.name), el('span', { class: 'faint', style: 'margin-left:8px' }, 'sent you a friend request')),
          el(
            'span',
            { style: 'display:flex;gap:6px' },
            el(
              'button',
              {
                class: 'btn sm primary',
                onclick: () => {
                  acceptIncoming(req.id);
                  toast(`You and ${req.name} are now friends`, 'good');
                  navigate('online');
                },
              },
              'Accept',
            ),
            el(
              'button',
              {
                class: 'btn sm',
                onclick: () => {
                  declineIncoming(req.id);
                  navigate('online');
                },
              },
              'Decline',
            ),
          ),
        ),
      );
    }
    for (const n of social.notices) {
      rows.push(
        el(
          'div',
          { class: `kv friend-row ${n.read ? 'read' : ''}` },
          el('span', { class: 'k' }, noticeLine(n)),
          el('span', { class: 'faint', style: 'font-size:11px' }, timeAgo(n.at)),
        ),
      );
    }
    if (rows.length === 0) {
      rows.push(el('p', { class: 'hint', style: 'margin:12px 0 0' }, 'Nothing yet. Friend requests and their answers land here.'));
    }
    return el('div', { style: 'display:grid;gap:8px;margin-top:12px' }, ...rows);
  }

  function partyPanel(): HTMLElement | null {
    const party = partyState();
    if (!party) return null;

    if (party.status === 'invited') {
      return panel(
        'Party lobby',
        el('p', { class: 'hint', style: 'margin:0 0 10px' }, `Invite sent — waiting for ${party.member.name} to join…`),
        el('button', { class: 'btn sm', onclick: () => leaveParty() }, 'Cancel invite'),
      );
    }

    const friendCfg = rivalConfig(party.member);
    const theirRank = onlineRank(party.member.points);
    return panel(
      'Party lobby',
      el(
        'div',
        { class: 'lobby-members' },
        lobbyCard(profile.username, me, played ? rank.label : 'Unranked', () => previewBuild(me, 'Your build')),
        el('div', { class: 'lobby-vs' }, 'VS'),
        lobbyCard(party.member.name, friendCfg, theirRank.label, () => previewBuild(friendCfg, `${party.member.name}'s build`)),
      ),
      el(
        'div',
        { class: 'row', style: 'margin-top:14px' },
        el('button', { class: 'btn primary xl', onclick: () => playParty() }, 'Play 1v1'),
        el('button', { class: 'btn', onclick: () => leaveParty() }, 'Leave lobby'),
      ),
      el(
        'p',
        { class: 'hint', style: 'margin:10px 0 0' },
        'While you are in the lobby only the Store, Locker, Settings and Controls are open. The walkout will only show your opponent — Preview Build is how you scout in here.',
      ),
    );
  }

  function lobbyCard(name: string, cfg: ReturnType<typeof store.simConfig>, rankLabel: string, preview: () => void): HTMLElement {
    const fig = el('canvas', { class: 'walkout-figure' }) as HTMLCanvasElement;
    drawFigure(fig, cfg, 110);
    return el(
      'div',
      { class: 'lobby-card' },
      fig,
      el('b', {}, name),
      el('div', { class: 'faint', style: 'font-size:11px' }, rankLabel),
      el('button', { class: 'btn sm', onclick: preview }, 'Preview build'),
    );
  }

  function previewBuild(cfg: ReturnType<typeof store.simConfig>, kicker: string): void {
    overlay((close) =>
      el(
        'div',
        { class: 'box preview-box' },
        buildPreviewCard(cfg, kicker),
        el('div', { class: 'row', style: 'justify-content:center;margin-top:10px' }, el('button', { class: 'btn', onclick: close }, 'Close')),
      ),
    );
  }

  function sendInvite(rival: LadderRival): void {
    invite(rival);
    toast(`Party invite sent to ${rival.name}`, 'good');
    navigate('online');
  }

  function quickMatch(): void {
    const rival = findQuickMatch();
    overlay((close) => {
      const box = el(
        'div',
        { class: 'box', style: 'max-width:380px;text-align:center' },
        el('h2', { style: 'margin:0 0 6px;font-size:20px;font-weight:900' }, 'Quick Match'),
        el('p', { class: 'dim searching' }, 'Searching for players near your rank…'),
      );
      window.setTimeout(() => {
        if (!box.isConnected) return;
        const line = box.querySelector('.searching');
        if (line) line.textContent = `Found ${rival.name} — ${onlineRank(rival.points).label}`;
        window.setTimeout(() => {
          close();
          startVs(rival);
        }, 1100);
      }, 2400);
      return box;
    });
  }

  function playParty(): void {
    const party = partyState();
    if (!party) return;
    const rival = party.member;
    leaveParty();
    startVs(rival, 'Party 1v1');
  }

  function startVs(rival: LadderRival, label = 'Online 1v1'): void {
    startMatch({
      opponent: rivalConfig(rival),
      difficulty: rivalDifficulty(rival),
      parkId: 'downtown',
      playlist: 'casual',
      eventName: label,
      opponentOnlyWalkout: true,
    });
  }
}

function timeAgo(at: number): string {
  const s = Math.max(1, Math.round((Date.now() - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
