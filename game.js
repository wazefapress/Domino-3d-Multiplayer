// --- 1. الإعدادات العامة والصوتيات ---
const socket = io(); 
let currentRoom = '';
let isMultiplayer = false;

const sounds = {
    placePiece: new Howl({ src: ['place.mp3'] }),
    winRound: new Howl({ src: ['win.mp3'] }),
    loseRound: new Howl({ src: ['lose.mp3'] }),
    shuffle: new Howl({ src: ['shuffle.mp3'] })
};

// --- 2. محرك 3D (Three.js) ---
let scene, camera, renderer, raycaster, mouse;

function init3D() {
    const container = document.getElementById('game-canvas');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e5631); // طاولة خضراء
    
    // إعداد الكاميرا للوضع الأفقي مع ضبط النطاق ليشمل يد اللاعب كاملة
    camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 8.5, 8.8); 
    camera.lookAt(0, 0, 0.5); // تركيز الكاميرا ليشمل الأسفل تماماً
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
    
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    window.addEventListener('resize', updateCanvasSize);
    window.addEventListener('orientationchange', () => {
        setTimeout(updateCanvasSize, 300);
    });

    window.addEventListener('click', onPlayerInput);
    window.addEventListener('touchstart', (e) => { 
        e.clientX = e.touches[0].clientX; 
        e.clientY = e.touches[0].clientY; 
        onPlayerInput(e); 
    }, { passive: false });

    animate3D();
}

function updateCanvasSize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate3D() {
    requestAnimationFrame(animate3D);
    renderer.render(scene, camera);
}

// --- 3. رسم قطع الدومينو الواقعية (الخط الفاصل والنقاط) ---
function createDominoTexture(val1, val2) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; 
    canvas.height = 256; 
    const ctx = canvas.getContext('2d');

    // الخلفية البيضاء
    ctx.fillStyle = '#fdfdfd';
    ctx.fillRect(0, 0, 128, 256);

    // الحدود الخارجية
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, 128, 256);

    // الخط الأسود الفاصل في المنتصف
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 124, 128, 8);

    const dotPositions = {
        1: [[64, 64]],
        2: [[32, 32], [96, 96]],
        3: [[32, 32], [64, 64], [96, 96]],
        4: [[32, 32], [96, 32], [32, 96], [96, 96]],
        5: [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]],
        6: [[32, 32], [96, 32], [32, 64], [96, 64], [32, 96], [96, 96]]
    };

    function drawDots(dots, yOffset) {
        if (dots > 0 && dotPositions[dots]) {
            dotPositions[dots].forEach(pos => {
                ctx.beginPath();
                ctx.arc(pos[0], pos[1] * 0.85 + yOffset, 10, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }

    drawDots(val1, 10);
    drawDots(val2, 138);

    return new THREE.CanvasTexture(canvas);
}

function createDominoMesh(val1, val2) {
    const geometry = new THREE.BoxGeometry(1, 0.2, 2);
    const texture = createDominoTexture(val1, val2);
    
    const materials = [
        new THREE.MeshStandardMaterial({ color: 0xffffff }),
        new THREE.MeshStandardMaterial({ color: 0xffffff }),
        new THREE.MeshStandardMaterial({ map: texture }), // الوجه العلوي يحمل النقاط والخط الفاصل
        new THREE.MeshStandardMaterial({ color: 0xdddddd }),
        new THREE.MeshStandardMaterial({ color: 0xffffff }),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
    ];

    return new THREE.Mesh(geometry, materials);
}

function renderHand3D() {
    scene.children = scene.children.filter(c => !c.userData.inHand);
    
    // حساب بداية صف القطع بناءً على عددها
    const startX = -((playerHand.length - 1) * 1.2) / 2;
    playerHand.forEach((piece, index) => {
        const mesh = createDominoMesh(piece.val1, piece.val2);
        // Z=4.8 تجعل القطع تظهر كاملة فوق الحافة السفلية دون أي اقتصاص
        mesh.position.set(startX + (index * 1.2), 0.4, 4.8); 
        mesh.rotation.x = Math.PI / 6;
        
        mesh.userData = { ...piece, inHand: true, isPlayerPiece: true };
        scene.add(mesh);
    });
}

// --- 4. محرك اللعبة ومسافات الطاولة ---
let gameDeck = [], playerHand = [], opponentHand = [];
let boardEnds = { left: null, right: null };
let currentPlayer = ''; 
let passCount = 0;
let playerTotalScore = 0, opponentTotalScore = 0;

// مسافة الخطوة للطاولة الأفقية
const stepSize = 1.05;
let layoutLeftX = -stepSize, layoutRightX = stepSize;

function startGame(vsComputer = true) {
    const roomControls = document.getElementById('room-controls');
    if(roomControls) roomControls.classList.add('d-none');
    
    const mainMenu = document.getElementById('main-menu');
    if(mainMenu) mainMenu.style.display = 'none';
    
    const gameContainer = document.getElementById('game-container');
    if(gameContainer) gameContainer.style.display = 'block';

    isMultiplayer = !vsComputer;
    updateCanvasSize();
    initRound();
}

const btnVsAi = document.getElementById('btn-vs-ai');
if(btnVsAi) {
    btnVsAi.addEventListener('click', () => {
        startGame(true);
    });
}

function initRound() {
    scene.children = scene.children.filter(c => !c.userData.onBoard);
    boardEnds = { left: null, right: null };
    layoutLeftX = -stepSize; 
    layoutRightX = stepSize;
    passCount = 0;

    gameDeck = [];
    for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) {
            gameDeck.push({ val1: i, val2: j, isDouble: i === j });
        }
    }
    for (let i = gameDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gameDeck[i], gameDeck[j]] = [gameDeck[j], gameDeck[i]];
    }
    sounds.shuffle.play();

    playerHand = gameDeck.splice(0, 7);
    opponentHand = gameDeck.splice(0, 7);
    
    renderHand3D();

    let pMax = Math.max(...playerHand.filter(p => p.isDouble).map(p => p.val1), -1);
    let oMax = Math.max(...opponentHand.filter(p => p.isDouble).map(p => p.val1), -1);

    currentPlayer = (pMax >= oMax) ? 'player' : 'opponent';
    if (currentPlayer === 'opponent' && !isMultiplayer) setTimeout(playAI, 1500);
    checkPlayerAvailableMoves();
}

function getValidMoves(hand) {
    if (boardEnds.left === null) return hand;
    return hand.filter(p => p.val1 === boardEnds.left || p.val2 === boardEnds.left || p.val1 === boardEnds.right || p.val2 === boardEnds.right);
}

// --- 5. التفاعل والذكاء الاصطناعي ---
function onPlayerInput(event) {
    if (currentPlayer !== 'player') return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    
    const intersects = raycaster.intersectObjects(scene.children);
    if (intersects.length > 0) {
        const mesh = intersects[0].object;
        if (mesh.userData && mesh.userData.isPlayerPiece) {
            let piece = mesh.userData;
            let valid = getValidMoves(playerHand);
            if (valid.some(p => p.val1 === piece.val1 && p.val2 === piece.val2)) {
                let targetEnd = (piece.val1 === boardEnds.left || piece.val2 === boardEnds.left) ? 'left' : 'right';
                if(boardEnds.left === null) targetEnd = 'center';
                
                playerHand = playerHand.filter(p => p.val1 !== piece.val1 || p.val2 !== piece.val2);
                placePieceOnBoard(piece, targetEnd);
                
                if(isMultiplayer) socket.emit('playPiece', { room: currentRoom, piece, targetEnd });
                
                currentPlayer = 'opponent';
                passCount = 0;
                checkRoundEnd();
            }
        }
    }
}

function playAI() {
    if (currentPlayer !== 'opponent' || isMultiplayer) return;
    let valid = getValidMoves(opponentHand);
    if (valid.length > 0) {
        let piece = valid[0];
        let targetEnd = (piece.val1 === boardEnds.left || piece.val2 === boardEnds.left) ? 'left' : 'right';
        if(boardEnds.left === null) targetEnd = 'center';
        
        opponentHand = opponentHand.filter(p => p.val1 !== piece.val1 || p.val2 !== piece.val2);
        placePieceOnBoard(piece, targetEnd);
        
        currentPlayer = 'player';
        passCount = 0;
        checkRoundEnd();
    } else if (gameDeck.length > 0) {
        opponentHand.push(gameDeck.pop());
        setTimeout(playAI, 1000);
    } else {
        passCount++;
        currentPlayer = 'player';
        checkRoundEnd();
    }
}

function placePieceOnBoard(piece, targetEnd) {
    sounds.placePiece.play();
    
    if (boardEnds.left === null) {
        boardEnds.left = piece.val1; boardEnds.right = piece.val2;
    } else {
        if (targetEnd === 'left') boardEnds.left = (piece.val1 === boardEnds.left) ? piece.val2 : piece.val1;
        else boardEnds.right = (piece.val1 === boardEnds.right) ? piece.val2 : piece.val1;
    }

    const mesh = createDominoMesh(piece.val1, piece.val2);
    
    if(targetEnd === 'center') {
        mesh.position.set(0, 0.1, -0.5);
    } else if (targetEnd === 'left') {
        mesh.position.set(layoutLeftX, 0.1, -0.5);
        layoutLeftX -= stepSize;
    } else {
        mesh.position.set(layoutRightX, 0.1, -0.5);
        layoutRightX += stepSize;
    }
    
    mesh.rotation.y = piece.isDouble ? Math.PI/2 : 0;
    mesh.userData = { onBoard: true };
    scene.add(mesh);
    renderHand3D();
}

function playerDrawOrPass() {
    if (gameDeck.length > 0) {
        playerHand.push(gameDeck.pop());
        renderHand3D();
        checkPlayerAvailableMoves();
    } else {
        passCount++;
        const actionBtns = document.getElementById('action-buttons');
        if(actionBtns) actionBtns.classList.add('d-none');
        
        currentPlayer = 'opponent';
        if(isMultiplayer) socket.emit('playerPassed', { room: currentRoom });
        checkRoundEnd();
    }
}

function checkPlayerAvailableMoves() {
    const actionBtns = document.getElementById('action-buttons');
    const actionText = document.getElementById('action-text');
    if(!actionBtns || !actionText) return;

    if (currentPlayer !== 'player') {
        actionBtns.classList.add('d-none');
        return;
    }
    
    if (getValidMoves(playerHand).length === 0) {
        actionBtns.classList.remove('d-none');
        actionText.innerText = gameDeck.length > 0 ? `اسحب (${gameDeck.length})` : "مرر دورك (Pass)";
    } else {
        actionBtns.classList.add('d-none');
    }
}

function checkRoundEnd() {
    let roundEnded = false, winner = null, points = 0;
    let pScore = playerHand.reduce((s, p) => s + p.val1 + p.val2, 0);
    let oScore = opponentHand.reduce((s, p) => s + p.val1 + p.val2, 0);

    if (playerHand.length === 0) { roundEnded = true; winner = 'player'; points = oScore; }
    else if (opponentHand.length === 0) { roundEnded = true; winner = 'opponent'; points = pScore; }
    else if (passCount >= 2 && gameDeck.length === 0) {
        roundEnded = true;
        if (pScore < oScore) { winner = 'player'; points = oScore; }
        else if (oScore < pScore) { winner = 'opponent'; points = pScore; }
    }

    if (roundEnded) {
        if (winner === 'player') {
            playerTotalScore += points;
            sounds.winRound.play();
            showModal('لقد فزت!', `حصلت على ${points} نقطة.`);
        } else if (winner === 'opponent') {
            opponentTotalScore += points;
            sounds.loseRound.play();
            showModal('انتهت الجولة', `فاز الخصم بـ ${points} نقطة.`);
        } else {
            showModal('تعادل (قفلة)', `لا نقاط لأحد.`);
        }
        
        const pScoreEl = document.getElementById('score-player');
        const oScoreEl = document.getElementById('score-opponent');
        if(pScoreEl) pScoreEl.innerText = playerTotalScore;
        if(oScoreEl) oScoreEl.innerText = opponentTotalScore;
        
        if (playerTotalScore >= 100) alert("مبروك فزت باللعبة كاملة!");
        if (opponentTotalScore >= 100) alert("حظاً أوفر، فاز الخصم باللعبة.");
    } else {
        if (currentPlayer === 'opponent' && !isMultiplayer) setTimeout(playAI, 1500);
        checkPlayerAvailableMoves();
    }
}

function showModal(title, msg) {
    const mTitle = document.getElementById('modal-title');
    const mMsg = document.getElementById('modal-msg');
    const modalEl = document.getElementById('gameOverModal');
    
    if(mTitle) mTitle.innerText = title;
    if(mMsg) mMsg.innerText = msg;
    if(modalEl) new bootstrap.Modal(modalEl).show();
}

function nextRound() {
    const modalEl = document.getElementById('gameOverModal');
    if(modalEl) bootstrap.Modal.getInstance(modalEl).hide();
    initRound();
}

// --- 6. غرف اللعب والدردشة (Socket.io) ---
const btnCreateRoom = document.getElementById('btn-create-room');
if (btnCreateRoom) {
    btnCreateRoom.addEventListener('click', () => {
        currentRoom = Math.random().toString(36).substring(2, 7).toUpperCase();
        isMultiplayer = true;
        socket.emit('createRoom', currentRoom);
        
        const mainMenu = document.getElementById('main-menu');
        if(mainMenu) mainMenu.style.display = 'none';
        
        alert(`تم إنشاء الغرفة! كود الغرفة الخاص بك هو: ${currentRoom}`);
        
        const chatBox = document.getElementById('chat-box');
        if(chatBox) chatBox.classList.remove('d-none');
    });
}

function joinRoom() {
    const roomInput = document.getElementById('room-input');
    if(!roomInput) return;
    
    let code = roomInput.value.trim().toUpperCase();
    if(code) {
        socket.emit('joinRoom', code);
        currentRoom = code;
    }
}

socket.on('gameReady', () => {
    isMultiplayer = true;
    
    const roomControls = document.getElementById('room-controls');
    const mainMenu = document.getElementById('main-menu');
    const chatBox = document.getElementById('chat-box');
    const gameContainer = document.getElementById('game-container');
    
    if(roomControls) roomControls.classList.add('d-none');
    if(mainMenu) mainMenu.style.display = 'none';
    if(chatBox) chatBox.classList.remove('d-none');
    if(gameContainer) gameContainer.style.display = 'block';
    
    updateCanvasSize();
    initRound();
});

socket.on('piecePlayed', (data) => {
    opponentHand.pop();
    placePieceOnBoard(data.piece, data.targetEnd);
    currentPlayer = 'player';
    passCount = 0;
    checkRoundEnd();
});

socket.on('opponentPassed', () => {
    passCount++;
    currentPlayer = 'player';
    checkRoundEnd();
});

socket.on('receiveMessage', (data) => {
    const msgs = document.getElementById('chat-messages');
    if(msgs) {
        msgs.innerHTML += `<div><strong class="text-danger">الخصم:</strong> ${data.message}</div>`;
        msgs.scrollTop = msgs.scrollHeight; 
    }
});

function toggleChat() {
    let chat = document.getElementById('chat-box');
    let icon = document.getElementById('chat-icon');
    if(chat && icon) {
        chat.classList.toggle('chat-minimized');
        icon.className = chat.classList.contains('chat-minimized') ? "fas fa-chevron-up" : "fas fa-chevron-down";
    }
}

function handleChatEnter(e) {
    if (e.key === 'Enter' && e.target.value.trim()) {
        let msg = e.target.value.trim();
        socket.emit('sendMessage', { room: currentRoom, message: msg });
        
        const msgs = document.getElementById('chat-messages');
        if(msgs) {
            msgs.innerHTML += `<div><strong class="text-primary">أنت:</strong> ${msg}</div>`;
            msgs.scrollTop = msgs.scrollHeight;
        }
        e.target.value = '';
    }
}

window.onload = init3D;