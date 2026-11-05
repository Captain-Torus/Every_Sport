import {
  LEAGUES,
  fetchLeagueGames,
  fetchAllLeaguesRecent,
  fetchGameSummary,
  fetchStandingsOrRankings
} from './api.js';
import { SportsReelPlayer } from './player.js';

class SportsCenterApp {
  constructor() {
    this.activeTab = 'nba'; // 'my-teams' | 'nba' | 'nfl' | 'nhl' | 'cfb'
    this.subView = 'games'; // 'games' | 'standings'
    this.searchQuery = '';
    this.customDate = '';
    this.spoilerFree = false;
    this.gamesByLeague = { nba: [], nfl: [], nhl: [], cfb: [] };
    this.followedTeams = this.loadFollowedTeams();

    this.currentGame = null;
    this.currentSummary = null;
    this.activeStatsTab = 'team-stats'; // 'team-stats' | 'boxscore' | 'plays'

    // DOM Elements
    this.gridEl = document.getElementById('vault-grid');
    this.standingsContainerEl = document.getElementById('standings-container');
    this.sectionTitleEl = document.getElementById('section-title');
    this.sectionSubtitleEl = document.getElementById('section-subtitle');
    this.followedBarEl = document.getElementById('followed-teams-bar');
    this.searchInput = document.getElementById('search-input');
    this.dateInput = document.getElementById('date-picker-input');
    this.resetDateBtn = document.getElementById('reset-date-btn');
    this.spoilerBtn = document.getElementById('spoiler-toggle-btn');
    this.viewSubButtons = Array.from(document.querySelectorAll('.subview-btn'));
    this.tabButtons = Array.from(document.querySelectorAll('.nav-tab'));

    // Game Center Modal Elements
    this.modalEl = document.getElementById('player-modal');
    this.closeModalBtn = document.getElementById('player-close-btn');
    this.modalTitleEl = document.getElementById('player-title');
    this.linescoreWrapEl = document.getElementById('linescore-wrap');
    this.statsPanelContentEl = document.getElementById('stats-panel-content');
    this.statsTabButtons = Array.from(document.querySelectorAll('.stats-tab-btn'));

    this.player = new SportsReelPlayer();
    this.init();
  }

  loadFollowedTeams() {
    const saved = localStorage.getItem('sc_followed_teams');
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch (_) {}
    }
    // Starter followed teams from earlier testing
    const defaults = ['nba:ATL', 'nba:IND'];
    localStorage.setItem('sc_followed_teams', JSON.stringify(defaults));
    return new Set(defaults);
  }

  saveFollowedTeams() {
    localStorage.setItem('sc_followed_teams', JSON.stringify(Array.from(this.followedTeams)));
    this.renderFollowedChips();
  }

  toggleFollowTeam(teamUid) {
    if (this.followedTeams.has(teamUid)) {
      this.followedTeams.delete(teamUid);
    } else {
      this.followedTeams.add(teamUid);
    }
    this.saveFollowedTeams();
    this.render();
  }

  async init() {
    this.bindEvents();
    this.renderFollowedChips();
    this.gridEl.innerHTML = `<div class="loading-state">⚡ Loading live Scoreboards & HD Game Reels across NBA, NFL, NHL & College Football...</div>`;

    this.gamesByLeague = await fetchAllLeaguesRecent();
    this.render();
  }

  bindEvents() {
    this.tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
        if (this.activeTab === 'my-teams' && this.subView === 'standings') {
          this.setSubView('games');
        }
        this.render();
      });
    });

    this.viewSubButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setSubView(btn.dataset.subview);
      });
    });

    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.render();
    });

    window.addEventListener('keydown', (e) => {
      if (this.modalEl.classList.contains('open')) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.closeGameCenter();
        }
        return;
      }
      if (
        (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')
      ) {
        e.preventDefault();
        this.searchInput.focus();
        this.searchInput.select();
      }
    });

    this.dateInput.addEventListener('change', async (e) => {
      this.customDate = e.target.value;
      this.resetDateBtn.style.display = this.customDate ? 'inline-flex' : 'none';
      if (this.customDate && this.activeTab !== 'my-teams') {
        this.gridEl.innerHTML = `<div class="loading-state">Loading ${this.activeTab.toUpperCase()} games for ${this.customDate}...</div>`;
        this.gamesByLeague[this.activeTab] = await fetchLeagueGames(this.activeTab, this.customDate);
      }
      this.render();
    });

    this.resetDateBtn.addEventListener('click', async () => {
      this.customDate = '';
      this.dateInput.value = '';
      this.resetDateBtn.style.display = 'none';
      if (this.activeTab !== 'my-teams') {
        this.gamesByLeague[this.activeTab] = await fetchLeagueGames(this.activeTab, '');
      }
      this.render();
    });

    this.spoilerBtn.addEventListener('click', () => {
      this.spoilerFree = !this.spoilerFree;
      this.spoilerBtn.classList.toggle('spoiler-active', this.spoilerFree);
      this.spoilerBtn.textContent = this.spoilerFree
        ? '🛡️ Spoiler-Free: ON'
        : '👁️ Scores: Visible';
      this.render();
    });

    this.closeModalBtn.addEventListener('click', () => this.closeGameCenter());

    this.statsTabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeStatsTab = btn.dataset.statstab;
        this.statsTabButtons.forEach((b) => b.classList.toggle('active', b === btn));
        this.renderStatsPanel();
      });
    });
  }

  setSubView(view) {
    this.subView = view;
    this.viewSubButtons.forEach((b) => b.classList.toggle('active', b.dataset.subview === view));
    this.render();
  }

  renderFollowedChips() {
    const list = Array.from(this.followedTeams);
    if (!list.length) {
      this.followedBarEl.innerHTML = `<span class="followed-label">★ Followed Teams: None yet — click ★ next to any team to pin them!</span>`;
      return;
    }

    this.followedBarEl.innerHTML = `
      <span class="followed-label">★ Following:</span>
      ${list
        .map((uid) => {
          const [lg, abbr] = uid.split(':');
          return `<button class="team-chip" data-uid="${uid}" title="Click to filter or unfollow">${lg.toUpperCase()}: ${abbr} <span>×</span></button>`;
        })
        .join('')}
    `;

    Array.from(this.followedBarEl.querySelectorAll('.team-chip')).forEach((chip) => {
      chip.addEventListener('click', () => {
        this.toggleFollowTeam(chip.dataset.uid);
      });
    });
  }

  async render() {
    if (this.subView === 'standings' && this.activeTab !== 'my-teams') {
      this.gridEl.style.display = 'none';
      this.standingsContainerEl.style.display = 'block';
      await this.renderStandings(this.activeTab);
      return;
    }

    this.gridEl.style.display = 'grid';
    this.standingsContainerEl.style.display = 'none';

    let games = [];
    if (this.activeTab === 'my-teams') {
      this.sectionTitleEl.textContent = '★ My Teams • Personal SportsCenter Feed';
      this.sectionSubtitleEl.textContent =
        'All recent matchups & extended highlight reels for your followed teams across NBA, NFL, NHL & CFB';
      const allGames = [
        ...(this.gamesByLeague.nba || []),
        ...(this.gamesByLeague.nfl || []),
        ...(this.gamesByLeague.nhl || []),
        ...(this.gamesByLeague.cfb || [])
      ];
      games = allGames.filter(
        (g) => this.followedTeams.has(g.away.uid) || this.followedTeams.has(g.home.uid)
      );
    } else {
      const cfg = LEAGUES[this.activeTab];
      this.sectionTitleEl.textContent = `${cfg.icon} ${cfg.fullName} • Scoreboard & Reels`;
      this.sectionSubtitleEl.textContent =
        'Click any matchup for the ~7-Minute Continuous Game Reel, Box Score, and Team Stats • Press M in player for 8-Bit/ASCII';
      games = this.gamesByLeague[this.activeTab] || [];
    }

    if (this.searchQuery) {
      const q = this.searchQuery;
      const pool =
        this.activeTab === 'my-teams'
          ? [
              ...(this.gamesByLeague.nba || []),
              ...(this.gamesByLeague.nfl || []),
              ...(this.gamesByLeague.nhl || []),
              ...(this.gamesByLeague.cfb || [])
            ]
          : games;
      games = pool.filter((g) => {
        const hay = `${g.away.displayName} ${g.away.abbr} ${g.home.displayName} ${g.home.abbr} ${g.leagueName} ${g.dateLabel} ${g.venue}`.toLowerCase();
        return hay.includes(q);
      });
    }

    if (!games.length) {
      this.gridEl.innerHTML = `
        <div class="empty-state">
          <h3>No games found</h3>
          <p>${
            this.activeTab === 'my-teams'
              ? 'Follow teams using the ★ button on any NBA, NFL, NHL, or College Football game card!'
              : 'Try clearing your search filter or selecting another date.'
          }</p>
        </div>
      `;
      return;
    }

    this.gridEl.innerHTML = '';
    games.forEach((game) => {
      const awayFollowed = this.followedTeams.has(game.away.uid);
      const homeFollowed = this.followedTeams.has(game.home.uid);

      const awayScoreText = this.spoilerFree ? '•••' : game.away.score;
      const homeScoreText = this.spoilerFree ? '•••' : game.home.score;
      const scoreClass = this.spoilerFree ? 'team-score masked' : 'team-score';

      const card = document.createElement('article');
      card.className = 'card game-card';
      card.innerHTML = `
        <div class="card-banner" style="background: linear-gradient(135deg, ${game.away.color}38, ${game.home.color}38, #0d121d);">
          <div class="banner-top">
            <span class="badge">${game.leagueIcon} ${game.leagueName} • ${game.dateLabel}</span>
            <span class="badge status-badge">${game.statusDetail}</span>
          </div>

          <div class="nba-matchup">
            <div class="nba-team ${game.away.winner && !this.spoilerFree ? 'winner-team' : ''}">
              <div class="team-header-row">
                ${game.away.logo ? `<img src="${game.away.logo}" alt="${game.away.abbr}" class="team-logo" />` : ''}
                <button class="star-btn ${awayFollowed ? 'starred' : ''}" data-follow="${game.away.uid}" title="Follow ${game.away.displayName}">★</button>
              </div>
              <span class="team-abbr">${game.away.rank ? `<small class="rank-num">#${game.away.rank}</small> ` : ''}${game.away.abbr}</span>
              <span class="team-name">${game.away.name} ${game.away.record ? `(${game.away.record})` : ''}</span>
              <span class="${scoreClass}">${awayScoreText}</span>
            </div>

            <span class="vs-divider">@</span>

            <div class="nba-team ${game.home.winner && !this.spoilerFree ? 'winner-team' : ''}">
              <div class="team-header-row">
                ${game.home.logo ? `<img src="${game.home.logo}" alt="${game.home.abbr}" class="team-logo" />` : ''}
                <button class="star-btn ${homeFollowed ? 'starred' : ''}" data-follow="${game.home.uid}" title="Follow ${game.home.displayName}">★</button>
              </div>
              <span class="team-abbr">${game.home.rank ? `<small class="rank-num">#${game.home.rank}</small> ` : ''}${game.home.abbr}</span>
              <span class="team-name">${game.home.name} ${game.home.record ? `(${game.home.record})` : ''}</span>
              <span class="${scoreClass}">${homeScoreText}</span>
            </div>
          </div>
        </div>

        <div class="card-body">
          ${
            !this.spoilerFree && game.quickLeaders?.length
              ? `<div class="leaders-strip">
                  ${game.quickLeaders
                    .map((l) => `<span class="leader-pill"><strong>${l.category}:</strong> ${l.name} (${l.value})</span>`)
                    .join('')}
                </div>`
              : `<div class="meta-row"><span class="meta-tag">📍 ${game.venue || 'Broadcast Center'}</span></div>`
          }

          <p class="card-desc">
            ${
              game.highlights?.[0]?.headline && !this.spoilerFree
                ? game.highlights[0].headline
                : `${game.away.displayName} vs. ${game.home.displayName} • Extended Game Reel & Full Box Score`
            }
          </p>

          <div class="card-actions">
            <button class="btn-play" data-action="open-center">▶ Watch ~7m Game Reel & Stats</button>
          </div>
        </div>
      `;

      Array.from(card.querySelectorAll('[data-follow]')).forEach((starBtn) => {
        starBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleFollowTeam(starBtn.dataset.follow);
        });
      });

      card.querySelector('[data-action="open-center"]').addEventListener('click', () => {
        this.openGameCenter(game);
      });

      this.gridEl.appendChild(card);
    });
  }

  async openGameCenter(game) {
    this.currentGame = game;
    this.modalTitleEl.textContent = `${game.away.displayName} @ ${game.home.displayName} (${game.dateLabel})`;
    this.modalEl.classList.add('open');

    this.linescoreWrapEl.innerHTML = `<div class="empty-note">Loading Game Center & Building ~7-Minute Video Reel...</div>`;
    this.statsPanelContentEl.innerHTML = `<div class="empty-note">Fetching Box Score & Team Stats...</div>`;

    const pool = this.gamesByLeague[game.leagueKey] || [];
    this.currentSummary = await fetchGameSummary(game, pool);

    // Start the continuous ~7-minute multi-clip reel
    this.player.loadReel(this.currentSummary.reelClips);

    this.renderLinescore();
    this.renderStatsPanel();
  }

  closeGameCenter() {
    this.modalEl.classList.remove('open');
    this.player.stop();
  }

  renderLinescore() {
    if (!this.currentGame || !this.currentSummary) return;
    const g = this.currentGame;
    const s = this.currentSummary;
    const periods = Math.max(s.awayLines.length, s.homeLines.length, 4);
    const headers = [];
    for (let i = 1; i <= periods; i++) {
      headers.push(i <= 4 ? `${i}` : `OT${i - 4}`);
    }

    const mask = this.spoilerFree;

    this.linescoreWrapEl.innerHTML = `
      <table class="linescore-table">
        <thead>
          <tr>
            <th>TEAM</th>
            ${headers.map((h) => `<th>${h}</th>`).join('')}
            <th class="total-col">FINAL</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="team-cell">
              ${g.away.logo ? `<img src="${g.away.logo}" class="tiny-logo" alt="" />` : ''}
              <strong>${g.away.abbr}</strong>
            </td>
            ${headers.map((_, idx) => `<td>${mask ? '•' : s.awayLines[idx] ?? '-'}</td>`).join('')}
            <td class="total-col">${mask ? '•••' : g.away.score}</td>
          </tr>
          <tr>
            <td class="team-cell">
              ${g.home.logo ? `<img src="${g.home.logo}" class="tiny-logo" alt="" />` : ''}
              <strong>${g.home.abbr}</strong>
            </td>
            ${headers.map((_, idx) => `<td>${mask ? '•' : s.homeLines[idx] ?? '-'}</td>`).join('')}
            <td class="total-col">${mask ? '•••' : g.home.score}</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  renderStatsPanel() {
    if (!this.currentSummary || !this.currentGame) return;
    const g = this.currentGame;
    const s = this.currentSummary;

    if (this.activeStatsTab === 'team-stats') {
      if (!s.teamStats.length) {
        this.statsPanelContentEl.innerHTML = `<div class="empty-note">Team comparison stats unavailable for this matchup.</div>`;
        return;
      }

      this.statsPanelContentEl.innerHTML = `
        <div class="stat-bars-list">
          <div class="stat-bar-header">
            <span>${g.away.abbr} (${g.away.name})</span>
            <span>TEAM COMPARISON</span>
            <span>${g.home.abbr} (${g.home.name})</span>
          </div>
          ${s.teamStats
            .slice(0, 14)
            .map((st) => {
              const nA = parseFloat(String(st.awayVal).replace(/[^0-9.]/g, '')) || 1;
              const nH = parseFloat(String(st.homeVal).replace(/[^0-9.]/g, '')) || 1;
              const pctA = Math.round((nA / (nA + nH)) * 100);
              return `
                <div class="stat-comp-row">
                  <div class="stat-comp-vals">
                    <strong>${st.awayVal}</strong>
                    <span class="stat-comp-label">${st.label}</span>
                    <strong>${st.homeVal}</strong>
                  </div>
                  <div class="stat-comp-track">
                    <div class="stat-comp-fill-a" style="width: ${pctA}%; background: ${g.away.color};"></div>
                    <div class="stat-comp-fill-h" style="width: ${100 - pctA}%; background: ${g.home.color};"></div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      `;
    } else if (this.activeStatsTab === 'boxscore') {
      if (!s.playerGroups.length) {
        this.statsPanelContentEl.innerHTML = `<div class="empty-note">Player box score not available yet.</div>`;
        return;
      }

      this.statsPanelContentEl.innerHTML = s.playerGroups
        .map(
          (pg) => `
          <div class="boxscore-team-block">
            <h4 class="boxscore-team-title">
              ${pg.teamLogo ? `<img src="${pg.teamLogo}" class="tiny-logo" alt="" />` : ''}
              ${pg.teamName} Box Score
            </h4>
            ${pg.categories
              .slice(0, 4)
              .map(
                (cat) => `
                <div class="boxscore-table-scroll">
                  <table class="boxscore-table">
                    <thead>
                      <tr>
                        <th>${cat.title}</th>
                        ${cat.labels.slice(0, 8).map((l) => `<th>${l}</th>`).join('')}
                      </tr>
                    </thead>
                    <tbody>
                      ${cat.athletes
                        .slice(0, 12)
                        .map(
                          (ath) => `
                          <tr>
                            <td class="player-name-cell">
                              <strong>${ath.name}</strong> <small>${ath.pos}</small>
                            </td>
                            ${ath.stats.slice(0, 8).map((val) => `<td>${val}</td>`).join('')}
                          </tr>
                        `
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
              `
              )
              .join('')}
          </div>
        `
        )
        .join('');
    } else if (this.activeStatsTab === 'plays') {
      const articleHtml = s.article
        ? `<div class="recap-article"><h4>${s.article.headline}</h4><p>${s.article.story}</p></div>`
        : '';

      const playsHtml = s.scoringPlays.length
        ? s.scoringPlays
            .map(
              (sp) => `
              <div class="scoring-play-item">
                <div class="sp-meta">
                  <span class="sp-badge">${sp.team}</span>
                  <span>${sp.period} • ${sp.clock}</span>
                  <span class="sp-score">${sp.awayScore} - ${sp.homeScore}</span>
                </div>
                <div class="sp-text">${sp.text}</div>
              </div>
            `
            )
            .join('')
        : `<div class="empty-note">No scoring play log recorded for this game.</div>`;

      this.statsPanelContentEl.innerHTML = `${articleHtml}<div class="scoring-plays-list">${playsHtml}</div>`;
    }
  }

  async renderStandings(leagueKey) {
    this.sectionTitleEl.textContent = `${LEAGUES[leagueKey].icon} ${LEAGUES[leagueKey].fullName} • Standings & Rankings`;
    this.sectionSubtitleEl.textContent = 'Latest conference standings, records, and Top 25 rankings • Click ★ to follow any team';
    this.standingsContainerEl.innerHTML = `<div class="loading-state">Loading latest ${LEAGUES[leagueKey].name} standings...</div>`;

    const data = await fetchStandingsOrRankings(leagueKey);
    if (!data) {
      this.standingsContainerEl.innerHTML = `<div class="empty-state">Unable to load standings right now.</div>`;
      return;
    }

    if (data.type === 'rankings') {
      this.standingsContainerEl.innerHTML = `
        <div class="standings-card">
          <h3 class="standings-group-title">${data.title}</h3>
          <table class="boxscore-table">
            <thead>
              <tr>
                <th>RANK</th>
                <th>TEAM</th>
                <th>RECORD</th>
                <th>PTS</th>
                <th>FOLLOW</th>
              </tr>
            </thead>
            <tbody>
              ${data.ranks
                .map((r) => {
                  const uid = `cfb:${r.teamAbbr}`;
                  const starred = this.followedTeams.has(uid);
                  return `
                    <tr>
                      <td><strong>#${r.rank}</strong></td>
                      <td class="team-cell">
                        ${r.logo ? `<img src="${r.logo}" class="tiny-logo" alt="" />` : ''}
                        <strong>${r.teamName}</strong> <small>(${r.teamAbbr})</small>
                      </td>
                      <td>${r.record}</td>
                      <td>${r.points}</td>
                      <td><button class="star-btn ${starred ? 'starred' : ''}" data-follow="${uid}">★</button></td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      this.standingsContainerEl.innerHTML = `
        <div class="standings-grid">
          ${data.groups
            .map(
              (grp) => `
              <div class="standings-card">
                <h3 class="standings-group-title">${grp.name}</h3>
                <table class="boxscore-table">
                  <thead>
                    <tr>
                      <th>TEAM</th>
                      <th>W</th>
                      <th>L</th>
                      <th>PCT/PTS</th>
                      <th>STRK</th>
                      <th>★</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${grp.teams
                      .map((t) => {
                        const uid = `${leagueKey}:${t.teamAbbr}`;
                        const starred = this.followedTeams.has(uid);
                        return `
                          <tr>
                            <td class="team-cell">
                              ${t.logo ? `<img src="${t.logo}" class="tiny-logo" alt="" />` : ''}
                              <strong>${t.teamName}</strong>
                            </td>
                            <td>${t.w}</td>
                            <td>${t.l}</td>
                            <td>${t.pct}</td>
                            <td>${t.strk}</td>
                            <td><button class="star-btn ${starred ? 'starred' : ''}" data-follow="${uid}">★</button></td>
                          </tr>
                        `;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
            )
            .join('')}
        </div>
      `;
    }

    Array.from(this.standingsContainerEl.querySelectorAll('[data-follow]')).forEach((btn) => {
      btn.addEventListener('click', () => {
        this.toggleFollowTeam(btn.dataset.follow);
      });
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new SportsCenterApp();
});
