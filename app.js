const CONFIG = {
    CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSd38yd9rKqhhtcr-np09wmsa2VsS2wV4cQqPjqQbzV7bUhZJTWwrXqO-4aPAHK9g/pub?output=csv',
    CACHE_KEY: 'eqs-data-cache',
    CACHE_TTL: 5 * 60 * 1000, // 5 minutes
    DEBOUNCE_DELAY: 300,
    FETCH_TIMEOUT: 6000
};

// Fallback data
const OFFLINE_DATA = [
    { "c": "00358519", "t": "TEMGBHO0027", "l": "EMG0010", "f": "2026-05-31", "o": "Carta encaminhada ao local. Problemas de acesso, acionar o NOC TBSA." },
    { "c": "00358516", "t": "TEMGBHO0004", "l": "EMG0135", "f": "2026-05-31", "o": "Necessário retirar a chave na Claro." },
    { "c": "00358565", "t": "TEMGDIV0002", "l": "EMG0349", "f": "2026-05-31", "o": "Direcionar os técnicos com a carta de liberação em mãos." },
    { "c": "00358008", "t": "TCMGACA0001", "l": "MGACA01", "f": "2026-05-30", "o": "Apresentação apenas do chamado na Central da Claro." },
    { "c": "00358009", "t": "TCMGACA0002", "l": "MGACAR1", "f": "2026-05-30", "o": "Uso do APP MASTER LOCK VAULT ENTERPRISE." }
];

let dataStore = [];

const Elements = {
    input: document.getElementById('search-input'),
    btn: document.getElementById('search-btn'),
    resultsList: document.getElementById('results-list'),
    statusSync: document.getElementById('status-sync'),
    statusSearch: document.getElementById('status-search'),
    spinnerContainer: document.getElementById('loading-spinner-container'),
    loadingText: document.getElementById('loading-text'),
    themeCheck: document.getElementById('theme-check'),
    dashboardPanel: document.getElementById('dashboard-panel'),
    filtersPanel: document.getElementById('filters-panel'),
    statTotal: document.getElementById('stat-total'),
    statOk: document.getElementById('stat-ok'),
    statBad: document.getElementById('stat-bad'),
    filterChips: document.querySelectorAll('.filter-chip')
};

let currentFilter = 'all';

// === Utilities ===
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function showToast(message, duration = 2500) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

// === Local Cache ===
function getCachedData() {
    try {
        const cached = JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY));
        // Check if cache is valid and contains the NEW 's' variable (STATUS)
        // This is a migration fix to invalidate very old caches
        if (cached && Date.now() - cached.timestamp < CONFIG.CACHE_TTL && cached.data.length > 0 && 's' in cached.data[0]) {
            return cached.data;
        }
    } catch (e) { }
    return null;
}

function setCachedData(data) {
    try {
        localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) { console.warn('Cache write failed:', e); }
}

// === Fetch Data ===
async function fetchData() {
    const cached = getCachedData();
    if (cached) {
        dataStore = cached;
        Elements.statusSync.innerHTML = '<span class="status-sync-ok">● Dados carregados do cache</span>';
        fetchRemoteData(true); // silent background fetch
        return;
    }
    showInitialLoading();
    await fetchRemoteData(false);
}

function showInitialLoading() {
    Elements.spinnerContainer.style.display = 'flex';
    Elements.loadingText.style.display = 'block';
    Elements.statusSync.innerHTML = '';
    // Show glass skeletons
    Elements.spinnerContainer.innerHTML = '';
    for(let i=0; i<3; i++) {
        const skel = document.createElement('div');
        skel.className = 'glass card skeleton-glass';
        Elements.spinnerContainer.appendChild(skel);
    }
}

async function fetchRemoteData(silent) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT);

    try {
        let response;
        try {
            response = await fetch(CONFIG.CSV_URL, { signal: controller.signal });
        } catch (e) {
            console.warn('Tentando via corsproxy.io...');
            try {
                response = await fetch(`https://corsproxy.io/?${encodeURIComponent(CONFIG.CSV_URL)}`, { signal: controller.signal });
            } catch (e2) {
                console.warn('Tentando via allorigins...');
                response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(CONFIG.CSV_URL)}`);
            }
        }

        if (!response || !response.ok) throw new Error('Falha no download');

        const text = await response.text();
        const remoteData = parseCSV(text);

        dataStore = remoteData.map(item => ({
            c: item['CHAMADO'] || '',
            t: item['ID TBSA'] || '',
            l: item['ID CLARO'] || '',
            f: item['FIM ACESSO'] || '',
            s: item['STATUS'] || '',
            o: item['OBSERVAÇÕES'] || ''
        }));

        setCachedData(dataStore);
        Elements.statusSync.innerHTML = '<span class="status-sync-ok">● Conectado à Planilha (Sincronizado)</span>';
        clearTimeout(timeoutId);
    } catch (error) {
        clearTimeout(timeoutId);
        if (!silent) {
            dataStore = OFFLINE_DATA;
            Elements.statusSync.innerHTML = `
                <div class="status-sync-fail">
                    <strong>Sincronização Indisponível</strong><br>
                    Os servidores de proxy falharam.<br>
                    <small>Exibindo amostra de sites de backup offline.</small>
                </div>
            `;
        }
    } finally {
        if (!silent) {
            Elements.spinnerContainer.style.display = 'none';
            Elements.loadingText.style.display = 'none';
        }
    }
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return [];
    const headers = parseCSVLine(lines[0]);
    return lines.slice(1).map(line => {
        const values = parseCSVLine(line);
        const obj = {};
        headers.forEach((header, i) => {
            obj[header.trim()] = values[i] ? values[i].trim() : '';
        });
        return obj;
    });
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else { inQuotes = !inQuotes; }
        } else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
        else { current += char; }
    }
    result.push(current);
    return result;
}

// Remove accents for fuzzy search
function removeAccents(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// === Search & Render ===
function handleSearch() {
    const query = removeAccents(Elements.input.value.trim().toLowerCase());
    Elements.resultsList.innerHTML = '';
    document.getElementById('main-container').classList.add('has-results');

    if (dataStore.length === 0) {
        Elements.statusSearch.textContent = 'Aguarde o carregamento inicial da base...';
        Elements.dashboardPanel.style.display = 'none';
        Elements.filtersPanel.style.display = 'none';
        return;
    }

    if (!query) {
        Elements.statusSearch.textContent = 'Digite algo para buscar.';
        Elements.dashboardPanel.style.display = 'none';
        Elements.filtersPanel.style.display = 'none';
        return;
    }

    // Fuzzy-like Search (including accent removal) — ignora linhas sem chamado numérico válido
    const filtered = dataStore.filter(item => {
        if (!/^\d{5,}$/.test((item.c || '').trim())) return false;
        const tDesc = removeAccents((item.t || '').toLowerCase());
        const lDesc = removeAccents((item.l || '').toLowerCase());
        const cDesc = removeAccents((item.c || '').toLowerCase());
        return tDesc.includes(query) || lDesc.includes(query) || cDesc.includes(query);
    });

    if (filtered.length === 0) {
        Elements.statusSearch.innerHTML = `
            <div class="status-error">
                Nenhum resultado encontrado. Tente buscar por parte do nome, ID da detentora ou chamado.
            </div>
        `;
        Elements.dashboardPanel.style.display = 'none';
        Elements.filtersPanel.style.display = 'none';
        return;
    }

    // Calculate Dashboard Stats
    let countOk = 0;
    let countBad = 0;

    filtered.forEach(item => {
        const isOverdue = checkIfOverdue(item.f);
        const status = (item.s || '').trim().toLowerCase();
        const isApproved = status === 'aprovado' || status === '';
        if (isOverdue || !isApproved) {
            countBad++;
        } else {
            countOk++;
        }
    });

    Elements.statTotal.textContent = filtered.length;
    Elements.statOk.textContent = countOk;
    Elements.statBad.textContent = countBad;

    Elements.statusSearch.textContent = '';
    Elements.dashboardPanel.style.display = 'flex';
    Elements.filtersPanel.style.display = 'flex';

    // Apply Quick Filters
    let finalResults = [];
    if (currentFilter === 'all') {
        finalResults = filtered;
    } else if (currentFilter === 'approved') {
        finalResults = filtered.filter(item => {
            const isOverdue = checkIfOverdue(item.f);
            const status = (item.s || '').trim().toLowerCase();
            const isApproved = status === 'aprovado' || status === '';
            return !isOverdue && isApproved;
        });
    } else if (currentFilter === 'blocked') {
        finalResults = filtered.filter(item => {
            const isOverdue = checkIfOverdue(item.f);
            const status = (item.s || '').trim().toLowerCase();
            const isApproved = status === 'aprovado' || status === '';
            return isOverdue || !isApproved;
        });
    }

    if (finalResults.length === 0) {
         Elements.statusSearch.innerHTML = `<div style="padding:10px;color:var(--text-secondary);">Nenhum chamado nesta categoria de filtro.</div>`;
         return;
    }

    finalResults.forEach((item, index) => {
        const card = createCard(item);
        card.classList.add('card-animate');
        card.style.animationDelay = `${index * 0.05}s`;
        Elements.resultsList.appendChild(card);
    });
}

function createCard(item) {
    const card = document.createElement('div');
    card.className = 'glass card';
    const isOverdue = checkIfOverdue(item.f);
    const dateDisplay = formatDisplayDate(item.f);
    const status = (item.s || '').trim().toLowerCase();
    const isApproved = status === 'aprovado' || status === '';
    const isBlocked = isOverdue || !isApproved;
    const blockLabel = !isApproved ? `🚫 ${escapeHTML(item.s).toUpperCase()}` : '🚫 REPROVADO';

    const itemJson = JSON.stringify(item).replace(/'/g, "&#39;");

    card.innerHTML = `
        <div class="card-header">
            <div class="card-titles">
                <div class="ticket-id">CHAMADO #${escapeHTML(item.c)}</div>
                <div class="main-id">${escapeHTML(item.t)}<br><span style="font-size: 16px; font-weight: 600; opacity: 0.8;">${escapeHTML(item.l)}</span></div>
            </div>
            <div class="badge ${isBlocked ? 'badge-overdue' : 'badge-valid'}">
                ${escapeHTML(dateDisplay)}
            </div>
        </div>
        ${item.o ? `<div class="obs">${escapeHTML(item.o)}</div>` : ''}
        ${isBlocked
            ? `<button class="copy-btn blocked" disabled>${blockLabel}</button>`
            : `<button class="detail-btn" data-detail='${itemJson}'>DETALHES</button>`
        }
    `;
    return card;
}

// Navigate to Detail Page
document.addEventListener('click', function (e) {
    const btn = e.target.closest('.detail-btn');
    if (!btn) return;
    try {
        const data = JSON.parse(btn.dataset.detail);
        sessionStorage.setItem('eqs-detail', JSON.stringify(data));
        window.location.href = 'detail.html?data=' + encodeURIComponent(JSON.stringify(data));
    } catch (err) { console.error('Nav error:', err); }
});

function checkIfOverdue(dateStr) {
    if (!dateStr) return false;
    const scheduledDate = new Date(dateStr + 'T23:59:59');
    return scheduledDate < new Date();
}

function formatDisplayDate(dateStr) {
    if (!dateStr) return '--/--/----';
    try {
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    } catch (e) { return dateStr; }
}

// === Initialization ===
Elements.themeCheck.addEventListener('change', () => {
    document.body.classList.toggle('dark-mode', Elements.themeCheck.checked);
    localStorage.setItem('eqs-theme', Elements.themeCheck.checked ? 'dark' : 'light');
});

if (localStorage.getItem('eqs-theme') === 'dark') {
    document.body.classList.add('dark-mode');
    Elements.themeCheck.checked = true;
}

const debouncedSearch = debounce(handleSearch, CONFIG.DEBOUNCE_DELAY);
Elements.input.addEventListener('input', debouncedSearch);

Elements.input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});

Elements.btn.addEventListener('click', handleSearch);

// Filter chips logic
Elements.filterChips.forEach(chip => {
    chip.addEventListener('click', (e) => {
        Elements.filterChips.forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.dataset.filter;
        handleSearch();
    });
});

window.addEventListener('load', fetchData);

// PWA Service Worker — Force update
if ('serviceWorker' in navigator) {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
        setTimeout(() => navigator.serviceWorker.register('sw.js'), 500);
    });
}

// ===== PWA Install Prompt Logic =====
let deferredPrompt;
const pwaBanner = document.getElementById('pwa-install-banner');
const pwaInstallBtn = document.getElementById('pwa-install');
const pwaCloseBtn = document.getElementById('pwa-close');

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent default mini-infobar on mobile and stash it
    e.preventDefault();
    deferredPrompt = e;
    
    // Check if user has dismissed it before to avoid aggressive prompts
    if (localStorage.getItem('pwa-dismissed') !== 'true') {
        setTimeout(() => {
            if (pwaBanner) pwaBanner.style.display = 'flex';
        }, 3000); // 3 seconds delay so it enters smoothly after content loads
    }
});

if (pwaCloseBtn && pwaInstallBtn) {
    pwaCloseBtn.addEventListener('click', () => {
        if (pwaBanner) pwaBanner.style.display = 'none';
        localStorage.setItem('pwa-dismissed', 'true'); // Hide forever
    });

    pwaInstallBtn.addEventListener('click', async () => {
        if (pwaBanner) pwaBanner.style.display = 'none';
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            deferredPrompt = null;
        }
    });
}
