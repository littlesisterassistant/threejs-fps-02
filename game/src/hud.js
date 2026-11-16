// The DOM HUD: crosshair, hit marker, health, ammo, timer, score, money,
// kill feed, round banner, bomb status and the buy menu. It never touches
// the simulation; main.js pushes numbers in and reads callbacks out.
const COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'Foundry Yard. Plant the charge at A or B — or drop every Rustjackal. First to 5 rounds takes the yard.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBERLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  down: {
    title: 'You are down',
    copy: 'Your team fights on. Click to watch from here — you are back next round.',
    action: 'Watch',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const ammo = document.getElementById('ammo');
  const scoreValue = document.getElementById('score-value');
  const hitmarker = document.getElementById('hitmarker');
  const crosshair = document.getElementById('crosshair');
  const healthFill = document.getElementById('health-fill');
  const healthValue = document.getElementById('health-value');
  const timerValue = document.getElementById('timer-value');
  const roundsValue = document.getElementById('rounds-value');
  const moneyValue = document.getElementById('money-value');
  const weaponName = document.getElementById('weapon-name');
  const grenadeValue = document.getElementById('grenade-value');
  const killfeed = document.getElementById('killfeed');
  const banner = document.getElementById('banner');
  const bombStatus = document.getElementById('bomb-status');
  const buyMenu = document.getElementById('buymenu');
  const damageFlash = document.getElementById('damage-flash');
  let hitTimer = 0;
  let bannerTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastHealth = -1;
  let lastTimer = '';
  let lastRounds = '';
  let lastMoney = -1;
  let lastWeapon = '';
  let lastGrenades = -1;
  let lastBomb = '';

  function setText(el, value, last) {
    if (value === last) return last;
    el.textContent = value;
    return value;
  }

  return {
    setAmmo(mag, reserve) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(hp) {
      const value = Math.max(0, Math.ceil(hp));
      if (value === lastHealth) return;
      lastHealth = value;
      healthValue.textContent = String(value);
      healthFill.style.width = `${value}%`;
      healthFill.classList.toggle('low', value <= 30);
    },
    setTimer(text) {
      lastTimer = setText(timerValue, text, lastTimer);
    },
    setRounds(text) {
      lastRounds = setText(roundsValue, text, lastRounds);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
    },
    setWeapon(name) {
      lastWeapon = setText(weaponName, name, lastWeapon);
    },
    setGrenades(n) {
      if (n === lastGrenades) return;
      lastGrenades = n;
      grenadeValue.textContent = `Grenades ${n}`;
    },
    setScore(value) {
      scoreValue.textContent = String(value);
    },
    setSpread(gap) {
      crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damage() {
      damageFlash.classList.add('on');
      setTimeout(() => damageFlash.classList.remove('on'), 140);
    },
    killfeed(text) {
      const line = document.createElement('div');
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    banner(text, ms = 2600) {
      banner.textContent = text;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), ms);
    },
    setBomb(text) {
      if (text === lastBomb) return;
      lastBomb = text;
      bombStatus.textContent = text;
      bombStatus.classList.toggle('on', text !== '');
    },
    showBuy(open) {
      buyMenu.hidden = !open;
    },
    buyAfford(can) {
      buyMenu.classList.toggle('poor', !can);
    },
    showOverlay(mode, score) {
      const text = COPY[mode];
      title.textContent = text.title;
      if (mode === 'end') copy.textContent = `${score} — next round starts shortly.`;
      else if (mode === 'match') copy.textContent = score;
      else copy.textContent = text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
