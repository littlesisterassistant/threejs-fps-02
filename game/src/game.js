// The match state, in one place: rounds, phases, money, the bomb. No DOM,
// no rendering here — main.js reads this and pushes numbers to the HUD.
export const WIN_ROUNDS = 5;
const BUY_SECONDS = 12;
const ROUND_SECONDS = 100;
const END_SECONDS = 4;
const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 5;
const FUSE_SECONDS = 45;

export function createGame() {
  const state = {
    phase: 'buy', // 'buy' | 'live' | 'end'
    round: 1,
    score: { ally: 0, foe: 0 },
    money: 800,
    timer: BUY_SECONDS,
    bomb: {
      carriedBy: 'player', // 'player' | 'dropped' | null
      planted: false,
      site: null, // 'A' | 'B'
      x: 0,
      z: 0,
      fuse: FUSE_SECONDS,
      plantProgress: 0,
      defuseProgress: 0,
    },
    winner: null, // 'ally' | 'foe' | null (round winner)
    matchWinner: null,
    reason: '',
    kills: 0,
  };

  function startRound() {
    state.phase = 'buy';
    state.timer = BUY_SECONDS;
    state.winner = null;
    state.reason = '';
    state.bomb.carriedBy = 'player';
    state.bomb.planted = false;
    state.bomb.site = null;
    state.bomb.fuse = FUSE_SECONDS;
    state.bomb.plantProgress = 0;
    state.bomb.defuseProgress = 0;
  }

  function endRound(winner, reason) {
    if (state.phase === 'end') return;
    state.phase = 'end';
    state.timer = END_SECONDS;
    state.winner = winner;
    state.reason = reason;
    state.score[winner] += 1;
    state.money += winner === 'ally' ? 325 : 1400;
    if (state.score[winner] >= WIN_ROUNDS) state.matchWinner = winner;
  }

  function tick(dt, alive) {
    // alive: { ally: n, foe: n } — counts include the player on ally side.
    if (state.phase === 'buy') {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND_SECONDS;
      }
      return;
    }
    if (state.phase === 'live') {
      state.timer -= dt;
      if (state.bomb.planted) {
        state.bomb.fuse -= dt;
        if (state.bomb.fuse <= 0) {
          endRound('ally', 'The bomb detonated');
          return;
        }
      }
      if (alive.foe === 0) {
        endRound('ally', state.bomb.planted ? 'Site cleared' : 'Enemy team eliminated');
        return;
      }
      if (alive.ally === 0) {
        if (state.bomb.planted) {
          // Attackers all dead but the bomb still ticks: the round is
          // decided at the fuse, so keep playing it out.
        } else {
          endRound('foe', 'Your team was eliminated');
          return;
        }
      }
      if (state.timer <= 0 && !state.bomb.planted) {
        endRound('foe', 'Time expired — the bomb was never planted');
      }
      return;
    }
    // 'end'
    state.timer -= dt;
    if (state.timer <= 0) {
      if (state.matchWinner) return; // match over; main.js shows the match overlay
      state.round += 1;
      startRound();
    }
  }

  return {
    state,
    startRound,
    endRound,
    tick,
    plantSeconds: PLANT_SECONDS,
    defuseSeconds: DEFUSE_SECONDS,
    buySeconds: BUY_SECONDS,
    roundSeconds: ROUND_SECONDS,
  };
}
