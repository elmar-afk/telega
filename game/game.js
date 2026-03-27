const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Размер канваса под экран
canvas.width = Math.min(window.innerWidth, 480);
canvas.height = Math.min(window.innerHeight, 800);

const W = canvas.width;
const H = canvas.height;

// Состояния игры
const STATE = { MENU: 0, PLAYING: 1, GAMEOVER: 2 };
let gameState = STATE.MENU;

// Игрок
const player = {
    x: W / 2,
    y: H - 80,
    width: 40,
    height: 50,
    speed: 5,
    lives: 3,
    score: 0,
    shootCooldown: 0,
    invincible: 0
};

// Массивы объектов
let bullets = [];
let enemies = [];
let enemyBullets = [];
let particles = [];
let stars = [];
let powerUps = [];

// Управление
let keys = {};
let touchX = null;
let isTouching = false;
let autoShoot = false;

// Волны врагов
let wave = 1;
let enemySpawnTimer = 0;
let enemiesKilled = 0;
let enemiesPerWave = 5;

// Звёзды фона
for (let i = 0; i < 100; i++) {
    stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 2 + 0.5
    });
}

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

// === ФУНКЦИИ ИГРЫ ===

function startGame() {
    gameState = STATE.PLAYING;
    player.x = W / 2;
    player.y = H - 80;
    player.lives = 3;
    player.score = 0;
    player.invincible = 0;
    bullets = [];
    enemies = [];
    enemyBullets = [];
    particles = [];
    powerUps = [];
    wave = 1;
    enemySpawnTimer = 0;
    enemiesKilled = 0;
    enemiesPerWave = 5;
}

function spawnEnemy() {
    const types = ['fighter', 'bomber', 'fast'];
    const type = types[Math.floor(Math.random() * types.length)];

    let enemy = {
        x: Math.random() * (W - 40) + 20,
        y: -40,
        width: 30,
        height: 30,
        type: type,
        hp: 1,
        shootTimer: Math.random() * 100 + 50
    };

    if (type === 'fighter') {
        enemy.speed = 1.5 + wave * 0.2;
        enemy.hp = 1;
        enemy.color = '#ff4444';
    } else if (type === 'bomber') {
        enemy.speed = 0.8 + wave * 0.1;
        enemy.hp = 3;
        enemy.width = 40;
        enemy.height = 40;
        enemy.color = '#ff8800';
    } else {
        enemy.speed = 3 + wave * 0.3;
        enemy.hp = 1;
        enemy.width = 25;
        enemy.height = 25;
        enemy.color = '#ff00ff';
    }

    enemies.push(enemy);
}

function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: 30 + Math.random() * 20,
            color: color,
            size: Math.random() * 3 + 1
        });
    }
}

function shoot() {
    if (player.shootCooldown > 0) return;
    bullets.push({
        x: player.x,
        y: player.y - player.height / 2,
        speed: 8,
        width: 4,
        height: 12
    });
    player.shootCooldown = 12;
}

// === ОТРИСОВКА ===

function drawPlayer() {
    if (player.invincible > 0 && Math.floor(player.invincible / 4) % 2) return;

    ctx.save();
    ctx.translate(player.x, player.y);

    // Корпус корабля
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

    // Кабина
    ctx.fillStyle = '#66ddff';
    ctx.beginPath();
    ctx.moveTo(0, -player.height / 4);
    ctx.lineTo(-6, player.height / 6);
    ctx.lineTo(6, player.height / 6);
    ctx.closePath();
    ctx.fill();

    // Двигатель (огонь)
    ctx.fillStyle = Math.random() > 0.5 ? '#ffaa00' : '#ff4400';
    ctx.beginPath();
    ctx.moveTo(-8, player.height / 2.5);
    ctx.lineTo(0, player.height / 2.5 + 10 + Math.random() * 8);
    ctx.lineTo(8, player.height / 2.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);

    if (e.type === 'fighter') {
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

    // HP бар для bomber
    if (e.type === 'bomber' && e.hp > 0) {
        ctx.fillStyle = '#333';
        ctx.fillRect(-e.width / 2, -e.height / 2 - 8, e.width, 4);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(-e.width / 2, -e.height / 2 - 8, e.width * (e.hp / 3), 4);
    }

    ctx.restore();
}

function drawStars() {
    ctx.fillStyle = '#fff';
    for (let s of stars) {
        ctx.globalAlpha = 0.3 + s.size / 3;
        ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
}

function drawHUD() {
    // Очки
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ОЧКИ: ' + player.score, 10, 30);

    // Волна
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
}

function drawMenu() {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STAR WARS', W / 2, H / 3);

    ctx.font = '20px monospace';
    ctx.fillStyle = '#ffcc00';
    ctx.fillText('SPACE SHOOTER', W / 2, H / 3 + 35);

    ctx.font = '16px monospace';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Нажми чтобы начать', W / 2, H / 2 + 20);

    ctx.font = '12px monospace';
    ctx.fillStyle = '#666';
    ctx.fillText('Стрелки / тач — движение', W / 2, H / 2 + 60);
    ctx.fillText('Пробел / авто — стрельба', W / 2, H / 2 + 80);
}

function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W / 2, H / 3);

    ctx.fillStyle = '#fff';
    ctx.font = '22px monospace';
    ctx.fillText('Очки: ' + player.score, W / 2, H / 3 + 50);
    ctx.fillText('Волна: ' + wave, W / 2, H / 3 + 80);

    ctx.font = '16px monospace';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Нажми чтобы заново', W / 2, H / 2 + 40);
}

// === ОБНОВЛЕНИЕ ===

function update() {
    // Звёзды
    for (let s of stars) {
        s.y += s.speed;
        if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
    }

    if (gameState !== STATE.PLAYING) return;

    // Управление игроком
    if (keys['ArrowLeft'] || keys['a']) player.x -= player.speed;
    if (keys['ArrowRight'] || keys['d']) player.x += player.speed;
    if (keys['ArrowUp'] || keys['w']) player.y -= player.speed;
    if (keys['ArrowDown'] || keys['s']) player.y += player.speed;
    if (keys[' ']) shoot();

    // Тач управление
    if (isTouching && touchX !== null) {
        const dx = touchX - player.x;
        if (Math.abs(dx) > 3) {
            player.x += Math.sign(dx) * player.speed;
        }
    }
    if (autoShoot) shoot();

    // Границы
    player.x = Math.max(player.width / 2, Math.min(W - player.width / 2, player.x));
    player.y = Math.max(player.height / 2, Math.min(H - player.height / 2, player.y));

    // Кулдаун стрельбы
    if (player.shootCooldown > 0) player.shootCooldown--;
    if (player.invincible > 0) player.invincible--;

    // Пули игрока
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].y -= bullets[i].speed;
        if (bullets[i].y < -10) bullets.splice(i, 1);
    }

    // Спавн врагов
    enemySpawnTimer--;
    if (enemySpawnTimer <= 0) {
        spawnEnemy();
        enemySpawnTimer = Math.max(20, 60 - wave * 5);
    }

    // Враги
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        e.y += e.speed;

        // Враг стреляет
        e.shootTimer--;
        if (e.shootTimer <= 0 && e.y > 0 && e.y < H * 0.7) {
            enemyBullets.push({
                x: e.x,
                y: e.y + e.height / 2,
                speed: 3 + wave * 0.3,
                width: 4,
                height: 8
            });
            e.shootTimer = e.type === 'bomber' ? 40 : 80;
        }

        // Ушёл за экран
        if (e.y > H + 50) {
            enemies.splice(i, 1);
            continue;
        }

        // Столкновение с пулями
        for (let j = bullets.length - 1; j >= 0; j--) {
            let b = bullets[j];
            if (Math.abs(b.x - e.x) < e.width / 2 + b.width / 2 &&
                Math.abs(b.y - e.y) < e.height / 2 + b.height / 2) {
                bullets.splice(j, 1);
                e.hp--;
                spawnParticles(b.x, b.y, '#ffaa00', 5);
                if (e.hp <= 0) {
                    spawnParticles(e.x, e.y, e.color, 15);
                    player.score += e.type === 'bomber' ? 30 : e.type === 'fast' ? 20 : 10;
                    enemiesKilled++;
                    enemies.splice(i, 1);

                    // Бонус
                    if (Math.random() < 0.1) {
                        powerUps.push({
                            x: e.x, y: e.y,
                            type: Math.random() > 0.5 ? 'life' : 'points',
                            speed: 1.5
                        });
                    }
                }
                break;
            }
        }

        // Столкновение с игроком
        if (player.invincible <= 0 &&
            Math.abs(player.x - e.x) < (player.width + e.width) / 2 - 5 &&
            Math.abs(player.y - e.y) < (player.height + e.height) / 2 - 5) {
            spawnParticles(e.x, e.y, '#ff4444', 20);
            enemies.splice(i, 1);
            player.lives--;
            player.invincible = 60;
            if (player.lives <= 0) {
                gameState = STATE.GAMEOVER;
                sendScore(player.score);
            }
        }
    }

    // Вражеские пули
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        enemyBullets[i].y += enemyBullets[i].speed;
        if (enemyBullets[i].y > H + 10) {
            enemyBullets.splice(i, 1);
            continue;
        }

        let b = enemyBullets[i];
        if (player.invincible <= 0 &&
            Math.abs(b.x - player.x) < player.width / 2 &&
            Math.abs(b.y - player.y) < player.height / 2) {
            enemyBullets.splice(i, 1);
            spawnParticles(player.x, player.y, '#ff4444', 10);
            player.lives--;
            player.invincible = 60;
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
        if (Math.abs(p.x - player.x) < 20 && Math.abs(p.y - player.y) < 20) {
            if (p.type === 'life' && player.lives < 5) player.lives++;
            if (p.type === 'points') player.score += 50;
            spawnParticles(p.x, p.y, '#00ff00', 10);
            powerUps.splice(i, 1);
        }
    }

    // Частицы
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }

    // Новая волна
    if (enemiesKilled >= enemiesPerWave) {
        wave++;
        enemiesKilled = 0;
        enemiesPerWave = 5 + wave * 2;
    }
}

function render() {
    ctx.clearRect(0, 0, W, H);

    drawStars();

    if (gameState === STATE.MENU) {
        drawMenu();
        return;
    }

    // Пули игрока
    ctx.fillStyle = '#00ff88';
    for (let b of bullets) {
        ctx.fillRect(b.x - b.width / 2, b.y - b.height / 2, b.width, b.height);
        ctx.fillStyle = '#aaffcc';
        ctx.fillRect(b.x - 1, b.y - b.height / 2, 2, b.height);
        ctx.fillStyle = '#00ff88';
    }

    // Вражеские пули
    ctx.fillStyle = '#ff2200';
    for (let b of enemyBullets) {
        ctx.fillRect(b.x - b.width / 2, b.y - b.height / 2, b.width, b.height);
    }

    // Враги
    for (let e of enemies) drawEnemy(e);

    // Бонусы
    for (let p of powerUps) {
        ctx.fillStyle = p.type === 'life' ? '#00ff00' : '#ffff00';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.type === 'life' ? '+' : '$', p.x, p.y + 4);
    }

    // Частицы
    for (let p of particles) {
        ctx.globalAlpha = p.life / 50;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Игрок
    drawPlayer();

    // HUD
    drawHUD();

    if (gameState === STATE.GAMEOVER) drawGameOver();
}

// Отправка очков в Telegram (если открыто через WebApp)
function sendScore(score) {
    try {
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.sendData(JSON.stringify({ score: score, wave: wave }));
        }
    } catch (e) {}
}

// === ГЛАВНЫЙ ЦИКЛ ===

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

gameLoop();
