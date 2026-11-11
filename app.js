// ==========================================
// 1. INDEXEDDB ENGINE
// ==========================================
const DB_NAME = 'ApitorRobotKidsDB';
const DB_VERSION = 2;
let dbInstance = null;

const defaultConfig = {
    apiKey: '',
    protocolMode: 'LUA',
    serviceUuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    charUuid: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    portLeft: 'PORT1',
    portRight: 'PORT2',
    header1: 'AA',
    header2: '55',
    invertRightMotor: false
};

let appConfig = JSON.parse(JSON.stringify(defaultConfig));

function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('programs')) {
                db.createObjectStore('programs', { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = (e) => {
            dbInstance = e.target.result;
            resolve(dbInstance);
        };
        req.onerror = (e) => reject(e.target.error);
    });
}

async function loadConfigFromDB() {
    if (!dbInstance) return;
    const tx = dbInstance.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const req = store.get('mainConfig');
    req.onsuccess = () => {
        if (req.result && req.result.data) {
            appConfig = { ...defaultConfig, ...req.result.data };
        }
    };
}

async function saveConfigToDB() {
    appConfig.apiKey = document.getElementById('cfgApiKey').value.trim();
    appConfig.protocolMode = document.getElementById('modeHex').checked ? 'HEX' : 'LUA';
    appConfig.serviceUuid = document.getElementById('cfgServiceUuid').value.trim().toLowerCase();
    appConfig.charUuid = document.getElementById('cfgCharUuid').value.trim().toLowerCase();
    appConfig.portLeft = document.getElementById('cfgPortLeft').value;
    appConfig.portRight = document.getElementById('cfgPortRight').value;
    appConfig.invertRightMotor = document.getElementById('cfgInvertMotor').checked;

    const tx = dbInstance.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ id: 'mainConfig', data: appConfig });
    tx.oncomplete = () => {
        appendLog('[ตั้งค่า] บันทึกข้อมูลและโปรโตคอลลง IndexedDB เรียบร้อย');
        closeSettingsModal();
    };
}

// ==========================================
// 2. TUDAO PROTOCOL BUILDER (LUA & HEX)
// ==========================================
/**
 * สร้างคำสั่งตามสถาปัตยกรรม Apitor TUDAO
 * รองรับทั้งข้อความ Lua Script (ค่าเริ่มต้น) และชุด Binary Packet
 */
function buildTudaoCommand(action, speedPercent = 70) {
    const spd = Math.max(0, Math.min(100, Math.round(speedPercent)));
    const pL = appConfig.portLeft || 'PORT1';
    const pR = appConfig.portRight || 'PORT2';

    if (appConfig.protocolMode === 'LUA') {
        // โหมด Lua Script ส่งตรงเข้าบอร์ด Nordic_TUDAO
        let script = "";
        let cwR = appConfig.invertRightMotor ? 'ANTICLOCKWISE' : 'CLOCKWISE';
        let ccwR = appConfig.invertRightMotor ? 'CLOCKWISE' : 'ANTICLOCKWISE';

        if (action === 'FORWARD') {
            script = `Tudao_motorAction('${pL}',${spd},'CLOCKWISE')\nTudao_motorAction('${pR}',${spd},'${cwR}')\n`;
        } else if (action === 'BACKWARD') {
            script = `Tudao_motorAction('${pL}',${spd},'ANTICLOCKWISE')\nTudao_motorAction('${pR}',${spd},'${ccwR}')\n`;
        } else if (action === 'LEFT') {
            script = `Tudao_motorAction('${pL}',${spd},'ANTICLOCKWISE')\nTudao_motorAction('${pR}',${spd},'${cwR}')\n`;
        } else if (action === 'RIGHT') {
            script = `Tudao_motorAction('${pL}',${spd},'CLOCKWISE')\nTudao_motorAction('${pR}',${spd},'${ccwR}')\n`;
        } else if (action === 'STOP') {
            script = `Tudao_motorStop('ALL')\n`;
        } else if (action === 'LED_RED') {
            script = `Tudao_led('ALL','COLOR1')\n`;
        } else if (action === 'LED_GREEN') {
            script = `Tudao_led('ALL','COLOR4')\n`;
        } else if (action === 'LED_BLUE') {
            script = `Tudao_led('ALL','COLOR6')\n`;
        } else if (action === 'BEEP') {
            script = `Tudao_playSound('SOUND_1')\n`;
        }

        const encoder = new TextEncoder();
        const bytes = encoder.encode(script);
        return { isText: true, text: script, bytes, display: script.trim() };
    } else {
        // โหมด Binary Packet พร้อมคำนวณ Checksum
        const h1 = parseInt(appConfig.header1 || 'AA', 16);
        const h2 = parseInt(appConfig.header2 || '55', 16);
        let payload = [];

        if (action === 'FORWARD') {
            let dR = appConfig.invertRightMotor ? 0x02 : 0x01;
            payload = [0x08, 0x01, 0x01, spd, dR, spd, 0x00, 0x00];
        } else if (action === 'BACKWARD') {
            let dR = appConfig.invertRightMotor ? 0x01 : 0x02;
            payload = [0x08, 0x01, 0x02, spd, dR, spd, 0x00, 0x00];
        } else if (action === 'LEFT') {
            let dR = appConfig.invertRightMotor ? 0x02 : 0x01;
            payload = [0x08, 0x01, 0x02, spd, dR, spd, 0x00, 0x00];
        } else if (action === 'RIGHT') {
            let dR = appConfig.invertRightMotor ? 0x01 : 0x02;
            payload = [0x08, 0x01, 0x01, spd, dR, spd, 0x00, 0x00];
        } else if (action === 'STOP') {
            payload = [0x08, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        } else if (action === 'LED_RED') {
            payload = [0x05, 0x02, 0x01, 0x00, 0x00];
        } else if (action === 'LED_GREEN') {
            payload = [0x05, 0x02, 0x00, 0x04, 0x00];
        } else if (action === 'LED_BLUE') {
            payload = [0x05, 0x02, 0x00, 0x00, 0x06];
        } else if (action === 'BEEP') {
            payload = [0x04, 0x03, 0x01, 0x64];
        } else {
            payload = [0x08, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        }

        let checksum = 0;
        for (let i = 0; i < payload.length; i++) checksum ^= payload[i];

        const bytes = new Uint8Array([h1, h2, ...payload, checksum]);
        const hexStr = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        return { isText: false, bytes, display: hexStr };
    }
}

// ==========================================
// 3. WEB BLUETOOTH ENGINE
// ==========================================
let bleDevice = null;
let bleServer = null;
let writeCharacteristic = null;
let isSimulationMode = true;

const KNOWN_SERVICES = [
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service
    '0000ffe0-0000-1000-8000-00805f9b34fb', // Standard Serial BLE
    '0000fff0-0000-1000-8000-00805f9b34fb',
    '0000ae00-0000-1000-8000-00805f9b34fb'
];

async function connectBluetooth() {
    if (!navigator.bluetooth) {
        alert('อุปกรณ์นี้ยังไม่รองรับ Web Bluetooth ค่ะ กรุณาเปิดผ่าน Google Chrome บน Android หรือคอมพิวเตอร์นะคะ');
        return;
    }

    try {
        appendLog('[BLE] กำลังมองหาหุ่นยนต์...');
        const optionalServices = [...KNOWN_SERVICES];
        if (appConfig.serviceUuid && !optionalServices.includes(appConfig.serviceUuid)) {
            optionalServices.push(appConfig.serviceUuid);
        }

        bleDevice = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: optionalServices
        });

        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);
        appendLog(`[BLE] เจอน้องหุ่นแล้ว: ${bleDevice.name || 'Apitor Robot'}`);

        bleServer = await bleDevice.gatt.connect();
        const services = await bleServer.getPrimaryServices();
        writeCharacteristic = null;

        for (const s of services) {
            const chars = await s.getCharacteristics();
            for (const c of chars) {
                const props = [];
                if (c.properties.write) props.push('WRITE');
                if (c.properties.writeWithoutResponse) props.push('WRITE_NO_RESP');
                if (c.properties.notify) props.push('NOTIFY');

                appendLog(`  └─ Char: ${c.uuid} [${props.join(', ')}]`);

                if (c.properties.notify) {
                    try {
                        await c.startNotifications();
                        c.addEventListener('characteristicvaluechanged', (event) => {
                            const val = new Uint8Array(event.target.value.buffer);
                            const hexStr = Array.from(val).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
                            appendLog(`[รับค่าตอบกลับ] <- ${hexStr}`);
                        });
                    } catch (e) {}
                }

                if (!writeCharacteristic && (c.properties.write || c.properties.writeWithoutResponse)) {
                    if (!appConfig.charUuid || c.uuid.toLowerCase().includes(appConfig.charUuid)) {
                        writeCharacteristic = c;
                    }
                }
            }
        }

        if (writeCharacteristic) {
            updateBleBadge(true, bleDevice.name || 'Nordic_TUDAO');
            appendLog(`[BLE] พร้อมส่งคำสั่งผ่าน Characteristic: ${writeCharacteristic.uuid}`);
        } else {
            updateBleBadge(true, 'เชื่อมต่อแล้ว (Read-Only)');
            appendLog('[BLE] เชื่อมต่อสำเร็จแต่ไม่พบ Characteristic ที่เปิดสิทธิ์เขียน');
        }
    } catch (err) {
        appendLog(`[BLE Error] ${err.message}`);
    }
}

function onDisconnected() {
    writeCharacteristic = null;
    updateBleBadge(false);
    appendLog('[BLE] หุ่นยนต์ตัดการเชื่อมต่อแล้ว');
}

function updateBleBadge(connected, name = '') {
    const badge = document.getElementById('bleStatusBadge');
    if (connected) {
        badge.className = 'text-xs px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 font-bold';
        badge.innerHTML = `<i class="fa-solid fa-circle text-[8px] mr-1"></i>เชื่อมหุ่นแล้ว: ${name}`;
    } else {
        badge.className = 'text-xs px-3 py-1 rounded-full bg-rose-100 text-rose-600 border border-rose-300 font-bold';
        badge.innerHTML = `<i class="fa-solid fa-circle text-[8px] mr-1"></i>ยังไม่เชื่อมหุ่น`;
    }
}

async function sendBleActionPacket(action, speed = 70) {
    const cmd = buildTudaoCommand(action, speed);
    if (writeCharacteristic) {
        try {
            if (writeCharacteristic.properties.writeWithoutResponse) {
                await writeCharacteristic.writeValueWithoutResponse(cmd.bytes);
            } else {
                await writeCharacteristic.writeValue(cmd.bytes);
            }
            appendLog(`[ส่งคำสั่ง BLE] -> ${cmd.display}`);
        } catch (e) {
            appendLog(`[ส่งไม่ผ่าน] ${e.message}`);
        }
    } else {
        appendLog(`[จำลองส่ง] -> ${cmd.display}`);
    }
}

// ==========================================
// 4. RAW TESTER FUNCTIONS
// ==========================================
function setRawPreset(text) {
    document.getElementById('rawCmdInput').value = text;
}

async function sendRawCustomInput() {
    const raw = document.getElementById('rawCmdInput').value.trim();
    if (!raw) return;

    let bytes;
    let isHex = /^[0-9A-Fa-f\s,]+$/.test(raw) && raw.includes(' ');

    if (isHex) {
        const cleanTokens = raw.split(/[\s,]+/).filter(Boolean);
        bytes = new Uint8Array(cleanTokens.length);
        for (let i = 0; i < cleanTokens.length; i++) {
            bytes[i] = parseInt(cleanTokens[i], 16) || 0;
        }
    } else {
        // ถ้าเป็น Text / Lua String ให้แปลง Escape sequence \n
        const unescaped = raw.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
        const encoder = new TextEncoder();
        bytes = encoder.encode(unescaped);
    }

    if (writeCharacteristic) {
        try {
            if (writeCharacteristic.properties.writeWithoutResponse) {
                await writeCharacteristic.writeValueWithoutResponse(bytes);
            } else {
                await writeCharacteristic.writeValue(bytes);
            }
            appendLog(`[ส่งคำสั่งดิบ] -> ${raw}`);
            playCuteSound(700, 'triangle', 0.15);
        } catch (err) {
            appendLog(`[ส่งคำสั่งดิบล้มเหลว] ${err.message}`);
        }
    } else {
        appendLog(`[จำลองส่งดิบ] -> ${raw}`);
        playCuteSound(700, 'triangle', 0.15);
    }
}

function toggleSimMode() {
    isSimulationMode = !isSimulationMode;
    const btn = document.getElementById('btnSimMode');
    if (isSimulationMode) {
        btn.className = 'btn-chubby px-4 py-2.5 rounded-2xl text-xs font-bold bg-amber-100 text-amber-700 border-2 border-amber-300';
        btn.innerHTML = '🧪 โหมดจำลอง: เปิด';
    } else {
        btn.className = 'btn-chubby px-4 py-2.5 rounded-2xl text-xs font-bold bg-slate-100 text-slate-500 border-2 border-slate-300';
        btn.innerHTML = '🧪 โหมดจำลอง: ปิด';
    }
}

// ==========================================
// 5. ROBOT SIMULATION & PLAYFUL SOUND
// ==========================================
const canvas = document.getElementById('robotCanvas');
const ctx = canvas.getContext('2d');
let robotState = { x: 210, y: 115, angle: -90, ledColor: '#10B981', trail: [] };

function drawRobotCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Playful grid dots
    ctx.fillStyle = '#334155';
    for (let x = 15; x < canvas.width; x += 30) {
        for (let y = 15; y < canvas.height; y += 30) {
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Path Trail
    if (robotState.trail.length > 1) {
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(robotState.trail[0].x, robotState.trail[0].y);
        for (let p of robotState.trail) ctx.lineTo(p.x, p.y);
        ctx.stroke();
    }

    // Robot Body
    ctx.save();
    ctx.translate(robotState.x, robotState.y);
    ctx.rotate((robotState.angle * Math.PI) / 180);

    // Wheels
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(-18, -20, 36, 6);
    ctx.fillRect(-18, 14, 36, 6);

    // Cute Chassis
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.roundRect(-20, -15, 40, 30, 10);
    ctx.fill();

    // Eyes / Face
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(10, -6, 4, 0, Math.PI * 2);
    ctx.arc(10, 6, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(11, -6, 2, 0, Math.PI * 2);
    ctx.arc(11, 6, 2, 0, Math.PI * 2);
    ctx.fill();

    // Core Light
    ctx.fillStyle = robotState.ledColor;
    ctx.beginPath();
    ctx.arc(-4, 0, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function resetCanvas() {
    robotState = { x: 210, y: 115, angle: -90, ledColor: '#10B981', trail: [{ x: 210, y: 115 }] };
    drawRobotCanvas();
}

function playCuteSound(freq = 880, type = 'sine', duration = 0.15) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
}

function animateVirtualRobot(action, speed, durationSec) {
    if (!isSimulationMode) return;
    const steps = Math.max(1, Math.round(durationSec * 20));
    const stepTime = (durationSec * 1000) / steps;
    let count = 0;

    if (action === 'LED_RED') { robotState.ledColor = '#F43F5E'; setLedIndicator('#F43F5E'); drawRobotCanvas(); playCuteSound(520, 'triangle'); return; }
    if (action === 'LED_GREEN') { robotState.ledColor = '#10B981'; setLedIndicator('#10B981'); drawRobotCanvas(); playCuteSound(650, 'triangle'); return; }
    if (action === 'LED_BLUE') { robotState.ledColor = '#3B82F6'; setLedIndicator('#3B82F6'); drawRobotCanvas(); playCuteSound(780, 'triangle'); return; }
    if (action === 'BEEP') { playCuteSound(880, 'square', 0.25); return; }

    const timer = setInterval(() => {
        count++;
        const moveDist = (speed / 100) * 2.4;
        const rad = (robotState.angle * Math.PI) / 180;

        if (action === 'FORWARD') {
            robotState.x = Math.max(25, Math.min(canvas.width - 25, robotState.x + Math.cos(rad) * moveDist));
            robotState.y = Math.max(25, Math.min(canvas.height - 25, robotState.y + Math.sin(rad) * moveDist));
            robotState.trail.push({ x: robotState.x, y: robotState.y });
        } else if (action === 'BACKWARD') {
            robotState.x = Math.max(25, Math.min(canvas.width - 25, robotState.x - Math.cos(rad) * moveDist));
            robotState.y = Math.max(25, Math.min(canvas.height - 25, robotState.y - Math.sin(rad) * moveDist));
            robotState.trail.push({ x: robotState.x, y: robotState.y });
        } else if (action === 'LEFT') {
            robotState.angle -= (speed / 100) * 6;
        } else if (action === 'RIGHT') {
            robotState.angle += (speed / 100) * 6;
        }
        drawRobotCanvas();
        if (count >= steps) clearInterval(timer);
    }, stepTime);
}

function setLedIndicator(color) {
    const dot = document.getElementById('ledDot');
    dot.style.backgroundColor = color;
    dot.style.boxShadow = `0 0 10px ${color}`;
}

// ==========================================
// 6. MANUAL CONTROLLER
// ==========================================
let manualInterval = null;

document.getElementById('manualSpeed').addEventListener('input', (e) => {
    document.getElementById('manualSpeedVal').textContent = `${e.target.value}%`;
});

function manualHold(action) {
    if (manualInterval) clearInterval(manualInterval);
    const spd = parseInt(document.getElementById('manualSpeed').value, 10) || 70;
    executeSingleCommand(action, spd, 0.25);
    playCuteSound(440, 'sine', 0.1);
    manualInterval = setInterval(() => {
        executeSingleCommand(action, spd, 0.25);
    }, 250);
}

function manualRelease() {
    if (manualInterval) {
        clearInterval(manualInterval);
        manualInterval = null;
        executeSingleCommand('STOP', 0, 0.1);
    }
}

async function executeSingleCommand(action, speed = 70, duration = 0.5) {
    document.getElementById('activeActionText').textContent = `${action} (${speed}%)`;
    await sendBleActionPacket(action, speed);
    animateVirtualRobot(action, speed, duration);
}

// ==========================================
// 7. VISUAL CODING SEQUENCER
// ==========================================
let commandSequence = [
    { id: 1, action: 'FORWARD', speed: 70, duration: 1.5 },
    { id: 2, action: 'RIGHT', speed: 60, duration: 0.8 },
    { id: 3, action: 'FORWARD', speed: 70, duration: 1.5 },
    { id: 4, action: 'LED_GREEN', speed: 100, duration: 0.5 },
    { id: 5, action: 'BEEP', speed: 100, duration: 0.5 }
];
let isRunningSequence = false;

const ACTION_LABELS = {
    FORWARD: { name: 'เดินหน้า', icon: 'fa-arrow-up', color: 'bg-sky-500' },
    BACKWARD: { name: 'ถอยหลัง', icon: 'fa-arrow-down', color: 'bg-sky-500' },
    LEFT: { name: 'เลี้ยวซ้าย', icon: 'fa-rotate-left', color: 'bg-teal-500' },
    RIGHT: { name: 'เลี้ยวขวา', icon: 'fa-rotate-right', color: 'bg-teal-500' },
    WAIT: { name: 'รอเวลา', icon: 'fa-hourglass-half', color: 'bg-indigo-500' },
    LED_RED: { name: 'เปิดไฟสีแดง', icon: 'fa-lightbulb', color: 'bg-rose-500' },
    LED_GREEN: { name: 'เปิดไฟสีเขียว', icon: 'fa-lightbulb', color: 'bg-emerald-500' },
    LED_BLUE: { name: 'เปิดไฟสีน้ำเงิน', icon: 'fa-lightbulb', color: 'bg-blue-500' },
    BEEP: { name: 'ส่งเสียงแตร', icon: 'fa-music', color: 'bg-amber-500' }
};

function renderSequence() {
    const container = document.getElementById('sequenceContainer');
    if (commandSequence.length === 0) {
        container.innerHTML = `<div class="text-center py-8 text-xs font-bold text-slate-400 border-4 border-dashed border-slate-200 rounded-2xl">ยังไม่มีคำสั่งเลยค่ะ กดปุ่มสีด้านบนเพื่อเริ่มเขียนได้เลย!</div>`;
        return;
    }

    container.innerHTML = commandSequence.map((item, idx) => {
        const meta = ACTION_LABELS[item.action] || { name: item.action, icon: 'fa-cube', color: 'bg-slate-500' };
        const showSpeed = ['FORWARD', 'BACKWARD', 'LEFT', 'RIGHT'].includes(item.action);
        return `
        <div id="seq-step-${idx}" class="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-white border-2 border-slate-200 shadow-sm transition">
            <div class="flex items-center gap-3">
                <span class="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-xs font-black flex items-center justify-center">${idx + 1}</span>
                <div class="w-8 h-8 rounded-xl ${meta.color} text-white flex items-center justify-center shadow">
                    <i class="fa-solid ${meta.icon}"></i>
                </div>
                <span class="text-xs font-extrabold text-slate-800">${meta.name}</span>
            </div>
            <div class="flex items-center gap-2">
                ${showSpeed ? `
                <div class="flex items-center gap-1 text-xs font-bold bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200">
                    <span class="text-slate-400">แรง:</span>
                    <input type="number" min="10" max="100" value="${item.speed}" onchange="updateStep(${idx}, 'speed', this.value)" class="w-12 bg-transparent text-center font-black text-sky-600 focus:outline-none">
                    <span class="text-slate-400">%</span>
                </div>` : ''}
                <div class="flex items-center gap-1 text-xs font-bold bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200">
                    <span class="text-slate-400">เวลา:</span>
                    <input type="number" step="0.1" min="0.1" max="30" value="${item.duration}" onchange="updateStep(${idx}, 'duration', this.value)" class="w-12 bg-transparent text-center font-black text-amber-600 focus:outline-none">
                    <span class="text-slate-400">วิ</span>
                </div>
                <button onclick="removeStep(${idx})" class="w-7 h-7 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white flex items-center justify-center transition">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>`;
    }).join('');
}

function addStep(action, speed = 70, duration = 1.0) {
    commandSequence.push({ id: Date.now() + Math.random(), action, speed, duration });
    renderSequence();
    playCuteSound(580, 'sine', 0.1);
}

function updateStep(idx, field, val) {
    if (!commandSequence[idx]) return;
    commandSequence[idx][field] = parseFloat(val) || 0.5;
}

function removeStep(idx) {
    commandSequence.splice(idx, 1);
    renderSequence();
    playCuteSound(300, 'triangle', 0.1);
}

function clearSequence() {
    if (isRunningSequence) stopSequence();
    commandSequence = [];
    renderSequence();
}

async function runSequence() {
    if (isRunningSequence || commandSequence.length === 0) return;
    isRunningSequence = true;
    appendLog(`[เริ่มรัน] รันคำสั่งทั้งหมด ${commandSequence.length} ขั้นตอน`);

    for (let i = 0; i < commandSequence.length; i++) {
        if (!isRunningSequence) break;
        document.querySelectorAll('[id^="seq-step-"]').forEach(el => el.classList.remove('step-active'));
        const stepEl = document.getElementById(`seq-step-${i}`);
        if (stepEl) {
            stepEl.classList.add('step-active');
            stepEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        const step = commandSequence[i];
        if (step.action !== 'WAIT') {
            await executeSingleCommand(step.action, step.speed, step.duration);
        } else {
            document.getElementById('activeActionText').textContent = `รอแป๊บนะ (${step.duration}s)`;
        }

        await new Promise(r => setTimeout(r, step.duration * 1000));

        if (['FORWARD', 'BACKWARD', 'LEFT', 'RIGHT'].includes(step.action) && isRunningSequence) {
            await sendBleActionPacket('STOP', 0);
        }
    }

    stopSequence();
}

async function stopSequence() {
    isRunningSequence = false;
    document.querySelectorAll('[id^="seq-step-"]').forEach(el => el.classList.remove('step-active'));
    await sendBleActionPacket('STOP', 0);
    document.getElementById('activeActionText').textContent = 'พร้อมซิ่งแล้ว!';
    appendLog('[โปรแกรม] หยุดการทำงานเรียบร้อย');
}

// ==========================================
// 8. SAVED PROJECTS IN INDEXEDDB
// ==========================================
function saveCurrentProgramToDB() {
    const nameInput = document.getElementById('programNameInput');
    const title = nameInput.value.trim() || `ภารกิจสุดเจ๋ง #${new Date().toLocaleTimeString('th-TH')}`;
    if (commandSequence.length === 0) {
        alert('เขียนคำสั่งอย่างน้อย 1 ขั้นตอนก่อนบันทึกนะคะ/ครับ');
        return;
    }

    const tx = dbInstance.transaction('programs', 'readwrite');
    tx.objectStore('programs').add({
        title: title,
        steps: JSON.parse(JSON.stringify(commandSequence)),
        updatedAt: new Date().toLocaleDateString('th-TH')
    });
    tx.oncomplete = () => {
        nameInput.value = '';
        appendLog(`[บันทึก] บันทึกผลงาน "${title}" เรียบร้อยแล้ว`);
        loadSavedProgramsFromDB();
        playCuteSound(880, 'sine', 0.2);
    };
}

function loadSavedProgramsFromDB() {
    if (!dbInstance) return;
    const tx = dbInstance.transaction('programs', 'readonly');
    const req = tx.objectStore('programs').getAll();
    req.onsuccess = () => {
        const list = req.result || [];
        document.getElementById('savedCountBadge').textContent = `${list.length} เรื่อง`;
        const container = document.getElementById('savedProgramsList');
        if (list.length === 0) {
            container.innerHTML = `<div class="col-span-2 text-xs font-bold text-slate-400 py-4 text-center">ยังไม่มีผลงานที่บันทึกไว้เลย</div>`;
            return;
        }
        container.innerHTML = list.map(prog => `
            <div class="p-3.5 rounded-2xl bg-purple-50 border-2 border-purple-200 flex items-center justify-between gap-2">
                <div>
                    <div class="text-xs font-black text-purple-900">${prog.title}</div>
                    <div class="text-[11px] font-bold text-purple-600">${prog.steps.length} ขั้นตอน • ${prog.updatedAt}</div>
                </div>
                <div class="flex items-center gap-1.5">
                    <button onclick='loadProgramIntoWorkspace(${JSON.stringify(prog.steps)})' class="btn-chubby px-3 py-1.5 rounded-xl bg-purple-500 text-white text-xs font-bold shadow">
                        เล่น
                    </button>
                    <button onclick="deleteProgramFromDB(${prog.id})" class="p-1.5 text-slate-400 hover:text-rose-500">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>
            </div>
        `).join('');
    };
}

function loadProgramIntoWorkspace(steps) {
    commandSequence = steps;
    renderSequence();
    appendLog(`[โหลด] โหลด ${steps.length} ขั้นตอนขึ้นกระดานแล้ว`);
    playCuteSound(660, 'sine', 0.15);
}

function deleteProgramFromDB(id) {
    const tx = dbInstance.transaction('programs', 'readwrite');
    tx.objectStore('programs').delete(id);
    tx.oncomplete = () => loadSavedProgramsFromDB();
}

// ==========================================
// 9. GEMINI AI (gemini-3.5-flash-lite)
// ==========================================
function quickAiPrompt(text) {
    document.getElementById('aiPromptInput').value = text;
    generateCodeWithAI();
}

async function generateCodeWithAI() {
    const promptText = document.getElementById('aiPromptInput').value.trim();
    if (!promptText) return;

    if (!appConfig.apiKey) {
        alert('คุณพ่อคุณแม่ยังไม่ได้ใส่ Gemini API Key ค่ะ รบกวนกดปุ่มรูปฟันเฟืองมุมบนขวาเพื่อใส่คีย์ก่อนนะคะ');
        requestParentAccess();
        return;
    }

    const btn = document.getElementById('btnAiGenerate');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังคิดท่าเต้น...';

    const systemInstruction = `แปลงคำสั่งของผู้ใช้ให้เป็น JSON Array สำหรับควบคุมหุ่นยนต์ Apitor
แต่ละ Object มีโครงสร้าง: {"action": "FORWARD"|"BACKWARD"|"LEFT"|"RIGHT"|"WAIT"|"LED_RED"|"LED_GREEN"|"LED_BLUE"|"BEEP", "speed": 10-100, "duration": 0.2-10.0}
ตอบกลับเฉพาะ JSON Array เท่านั้น ห้ามมี Markdown หรือคำอธิบายอื่น`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${appConfig.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `${systemInstruction}\n\nคำสั่งผู้ใช้: ${promptText}` }] }]
            })
        });

        const data = await res.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        const cleanedJson = rawText.replace(/```json|```/g, '').trim();
        const steps = JSON.parse(cleanedJson);

        if (Array.isArray(steps) && steps.length > 0) {
            commandSequence = steps.map((s, i) => ({
                id: Date.now() + i,
                action: s.action || 'FORWARD',
                speed: Number(s.speed) || 70,
                duration: Number(s.duration) || 1.0
            }));
            renderSequence();
            appendLog(`[AI] สร้างท่าเต้น ${commandSequence.length} ขั้นตอนเสร็จแล้วจ้า!`);
            playCuteSound(880, 'sine', 0.25);
        }
    } catch (err) {
        appendLog(`[AI Error] ขออภัยจ้า ลองใหม่อีกครั้งนะคะ: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> สร้างโค้ดให้หนูที!';
    }
}

// ==========================================
// 10. PARENTAL GATE & MODAL HELPERS
// ==========================================
let currentQuizAnswer = 0;

function requestParentAccess() {
    const num1 = Math.floor(Math.random() * 8) + 3;
    const num2 = Math.floor(Math.random() * 8) + 2;
    currentQuizAnswer = num1 + num2;
    document.getElementById('mathQuizQuestion').textContent = `${num1} + ${num2} = ?`;
    document.getElementById('mathQuizAnswer').value = '';
    document.getElementById('parentalModal').classList.remove('hidden');
}

function closeParentalModal() {
    document.getElementById('parentalModal').classList.add('hidden');
}

function verifyParentalAccess() {
    const userAns = parseInt(document.getElementById('mathQuizAnswer').value, 10);
    if (userAns === currentQuizAnswer) {
        closeParentalModal();
        openSettingsModal();
    } else {
        alert('คำตอบยังไม่ถูกต้องนะคะ/ครับ');
        requestParentAccess();
    }
}

function openSettingsModal() {
    document.getElementById('cfgApiKey').value = appConfig.apiKey || '';
    if (appConfig.protocolMode === 'HEX') {
        document.getElementById('modeHex').checked = true;
    } else {
        document.getElementById('modeLua').checked = true;
    }
    document.getElementById('cfgServiceUuid').value = appConfig.serviceUuid || '';
    document.getElementById('cfgCharUuid').value = appConfig.charUuid || '';
    document.getElementById('cfgPortLeft').value = appConfig.portLeft || 'PORT1';
    document.getElementById('cfgPortRight').value = appConfig.portRight || 'PORT2';
    document.getElementById('cfgInvertMotor').checked = !!appConfig.invertRightMotor;
    document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
}

function appendLog(msg) {
    const box = document.getElementById('bleLogBox');
    const time = new Date().toLocaleTimeString('th-TH');
    const line = document.createElement('div');
    line.textContent = `[${time}] ${msg}`;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
}

window.addEventListener('DOMContentLoaded', async () => {
    resetCanvas();
    renderSequence();
    await initIndexedDB();
    await loadConfigFromDB();
    loadSavedProgramsFromDB();
});
