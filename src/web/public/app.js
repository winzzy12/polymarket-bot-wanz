const socket = io();

let btcSettings = {};
let copySettings = {};

// Connection status
socket.on('connect', () => {
    document.getElementById('connection-status').textContent = 'Connected ✅';
    document.getElementById('connection-status').style.color = '#10b981';
    loadStatus();
});

socket.on('disconnect', () => {
    document.getElementById('connection-status').textContent = 'Disconnected ❌';
    document.getElementById('connection-status').style.color = '#ef4444';
});

// Real-time updates
socket.on('status', (status) => {
    updateBTCStatus(status.btcStrategy);
    updateCopyStatus(status.copyTrader);
});

socket.on('tradeExecuted', (data) => {
    addLog(`Trade executed on ${data.strategy}: ${JSON.stringify(data.trade)}`, 'info');
    loadStatus();
});

socket.on('tradeClosed', (data) => {
    addLog(`Trade closed on ${data.strategy}: ${JSON.stringify(data.trade)}`, 'info');
    loadStatus();
});

socket.on('settingsChanged', (data) => {
    addLog(`Settings changed for ${data.strategy}`, 'info');
});

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`${tab}-tab`).classList.add('active');
    });
});

// Load initial status
async function loadStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        updateBTCStatus(data.btcStrategy);
        updateCopyStatus(data.copyTrader);
        
        // Load settings
        const btcSettingsRes = await fetch('/api/settings/btc');
        btcSettings = await btcSettingsRes.json();
        loadBTCSettings();
        
        const copySettingsRes = await fetch('/api/settings/copy');
        copySettings = await copySettingsRes.json();
        loadCopySettings();
    } catch (error) {
        console.error('Failed to load status:', error);
    }
}

function updateBTCStatus(status) {
    document.getElementById('btc-status').textContent = status.isRunning ? 'Running' : 'Stopped';
    document.getElementById('btc-active-trades').textContent = status.activeTrades;
    document.getElementById('btc-pnl').textContent = `$${status.totalPnL?.toFixed(2) || '0.00'}`;
    document.getElementById('btc-mode').textContent = status.mode === 'live' ? 'Live' : 'Simulation';
    
    // Update mode buttons
    document.querySelectorAll('#btc-tab .mode-btn').forEach(btn => {
        if (btn.dataset.mode === status.mode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function updateCopyStatus(status) {
    document.getElementById('copy-status').textContent = status.isRunning ? 'Running' : 'Stopped';
    document.getElementById('copy-trades-count').textContent = status.copiedTrades;
    document.getElementById('copy-target').textContent = status.targetAddress ? 
        `${status.targetAddress.slice(0, 6)}...${status.targetAddress.slice(-4)}` : 'Not set';
    document.getElementById('copy-mode').textContent = status.mode === 'live' ? 'Live' : 'Simulation';
    
    // Update mode buttons
    document.querySelectorAll('#copy-tab .mode-btn').forEach(btn => {
        if (btn.dataset.mode === status.mode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function loadBTCSettings() {
    document.getElementById('btc-duration').value = btcSettings.duration;
    document.getElementById('btc-direction').value = btcSettings.direction;
    document.getElementById('btc-trade-size').value = btcSettings.tradeSize;
    document.getElementById('btc-max-position').value = btcSettings.maxPositionSize;
    document.getElementById('btc-stop-loss').value = btcSettings.stopLoss * 100;
    document.getElementById('btc-take-profit').value = btcSettings.takeProfit * 100;
    document.getElementById('btc-max-trades').value = btcSettings.maxConcurrentTrades;
}

function loadCopySettings() {
    document.getElementById('copy-target-address').value = copySettings.targetAddress;
    document.getElementById('copy-size-mode').value = copySettings.sizeMode;
    document.getElementById('copy-size-percent').value = copySettings.sizePercent;
    document.getElementById('copy-min-trade').value = copySettings.minTradeSize;
    document.getElementById('copy-max-position').value = copySettings.maxPositionSize;
    document.getElementById('copy-auto-sell').checked = copySettings.autoSellEnabled;
    document.getElementById('copy-profit-percent').value = copySettings.autoSellProfitPercent;
    document.getElementById('copy-sell-mode').value = copySettings.sellMode;
}

// Bitcoin Strategy Controls
document.getElementById('start-btc').addEventListener('click', async () => {
    await fetch('/api/btc/start', { method: 'POST' });
    addLog('Bitcoin strategy started', 'info');
    loadStatus();
});

document.getElementById('stop-btc').addEventListener('click', async () => {
    await fetch('/api/btc/stop', { method: 'POST' });
    addLog('Bitcoin strategy stopped', 'info');
    loadStatus();
});

document.getElementById('save-btc-settings').addEventListener('click', async () => {
    const settings = {
        duration: document.getElementById('btc-duration').value,
        direction: document.getElementById('btc-direction').value,
        tradeSize: parseFloat(document.getElementById('btc-trade-size').value),
        maxPositionSize: parseFloat(document.getElementById('btc-max-position').value),
        stopLoss: parseFloat(document.getElementById('btc-stop-loss').value) / 100,
        takeProfit: parseFloat(document.getElementById('btc-take-profit').value) / 100,
        maxConcurrentTrades: parseInt(document.getElementById('btc-max-trades').value),
    };
    
    await fetch('/api/settings/btc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
    });
    
    addLog('Bitcoin strategy settings saved', 'info');
});

// Copy Trader Controls
document.getElementById('start-copy').addEventListener('click', async () => {
    await fetch('/api/copy/start', { method: 'POST' });
    addLog('Copy trader started', 'info');
    loadStatus();
});

document.getElementById('stop-copy').addEventListener('click', async () => {
    await fetch('/api/copy/stop', { method: 'POST' });
    addLog('Copy trader stopped', 'info');
    loadStatus();
});

document.getElementById('save-copy-settings').addEventListener('click', async () => {
    const settings = {
        targetAddress: document.getElementById('copy-target-address').value,
        sizeMode: document.getElementById('copy-size-mode').value,
        sizePercent: parseFloat(document.getElementById('copy-size-percent').value),
        minTradeSize: parseFloat(document.getElementById('copy-min-trade').value),
        maxPositionSize: parseFloat(document.getElementById('copy-max-position').value),
        autoSellEnabled: document.getElementById('copy-auto-sell').checked,
        autoSellProfitPercent: parseFloat(document.getElementById('copy-profit-percent').value),
        sellMode: document.getElementById('copy-sell-mode').value,
    };
    
    await fetch('/api/settings/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
    });
    
    addLog('Copy trader settings saved', 'info');
});

// Mode switching
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const mode = btn.dataset.mode;
        const tab = btn.closest('.tab-content').id;
        const endpoint = tab === 'btc-tab' ? '/api/btc/mode' : '/api/copy/mode';
        
        await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode }),
        });
        
        addLog(`Switched to ${mode} mode on ${tab}`, 'info');
        loadStatus();
    });
});

// Logging
function addLog(message, level = 'info') {
    const logsContainer = document.getElementById('logs-list');
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    const time = new Date().toLocaleTimeString();
    logEntry.innerHTML = `
        <span class="log-time">[${time}]</span>
        <span class="log-level-${level}">[${level.toUpperCase()}]</span>
        <span>${message}</span>
    `;
    
    logsContainer.insertBefore(logEntry, logsContainer.firstChild);
    
    // Keep only last 100 logs
    while (logsContainer.children.length > 100) {
        logsContainer.removeChild(logsContainer.lastChild);
    }
}

document.getElementById('clear-logs').addEventListener('click', () => {
    document.getElementById('logs-list').innerHTML = '';
    addLog('Logs cleared', 'info');
});

// Initial load
loadStatus();
addLog('Dashboard initialized', 'info');
