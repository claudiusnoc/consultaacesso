const CONFIG = {
    CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSd38yd9rKqhhtcr-np09wmsa2VsS2wV4cQqPjqQbzV7bUhZJTWwrXqO-4aPAHK9g/pub?output=csv',
    CACHE_KEY: 'eqs-data-cache',
    CACHE_TTL: 5 * 60 * 1000,
    DEBOUNCE_DELAY: 300,
    FETCH_TIMEOUT: 6000
};

const OFFLINE_DATA = [
    { "c": "00358519", "t": "TEMGBHO0027", "l": "EMG0010", "f": "2026-05-31", "o": "Carta encaminhada ao local. Problemas de acesso, acionar o NOC TBSA.", "e": "Rua exemplo, bairro exemplo - Belo Horizonte/MG" },
    { "c": "00358516", "t": "TEMGBHO0004", "l": "EMG0135", "f": "2026-05-31", "o": "Necessário retirar a chave na Claro.", "e": "Não informado" },
    { "c": "00358565", "t": "TEMGDIV0002", "l": "EMG0349", "f": "2026-05-31", "o": "Direcionar os técnicos com a carta de liberação em mãos.", "e": "Rua exemplo, bairro exemplo - Divinópolis/MG" },
    { "c": "00358008", "t": "TCMGACA0001", "l": "MGACA01", "f": "2026-05-30", "o": "Apresentação apenas do chamado na Central da Claro.", "e": "Rua exemplo, bairro exemplo - Acaiaca/MG" },
    { "c": "00358009", "t": "TCMGACA0002", "l": "MGACAR1", "f": "2026-05-30", "o": "Uso do APP MASTER LOCK VAULT ENTERPRISE.", "e": "Rua exemplo, bairro exemplo - Acaiaca/MG" }
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

// === Detail Elements (shared across screens) ===
const DetailEls = {
    siteCode: document.getElementById('ticket-site-code'),
    location: document.getElementById('detail-location'),
    accessType: document.getElementById('detail-access-type'),
    status: document.getElementById('detail-status'),
    statusDot: document.getElementById('detail-status-dot'),
    address: document.getElementById('ticket-address'),
    chamado: document.getElementById('detail-chamado'),
    obs: document.getElementById('detail-obs'),
    obsSection: document.getElementById('detail-obs-section'),
    idTbsa: document.getElementById('detail-id-tbsa'),
    idClaro: document.getElementById('detail-id-claro'),
    copyChamado: document.getElementById('copy-chamado-btn'),
    copyAll: document.getElementById('copy-all-btn'),
    ticketWrapper: document.getElementById('ticket-wrapper'),
};
const obsBlock = DetailEls.obs ? DetailEls.obs.closest('.obs-block') : null;

let currentFilter = 'all';

// ════════════════════════════════════════
// Utilities
// ════════════════════════════════════════

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

function showToast(message, duration) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove('show'), duration || 2500);
}

function formatDate(dateStr) {
    if (!dateStr) return '--/--/----';
    const parts = dateStr.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
}

function checkIfOverdue(dateStr) {
    if (!dateStr) return false;
    return new Date(`${dateStr}T23:59:59`) < new Date();
}

function formatDisplayDate(dateStr) {
    if (!dateStr) return '--/--/----';
    try {
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    } catch (e) { return dateStr; }
}

function hasValidAddress(address) {
    const value = (address || '').trim();
    return value !== '' && value.toLowerCase() !== 'não informado' && value.toLowerCase() !== 'nao informado';
}

function buildMapsSearchUrl(address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

async function copyText(text, successMessage, errorMessage) {
    try {
        await navigator.clipboard.writeText(text);
        showToast(successMessage);
    } catch (err) {
        try {
            const temp = document.createElement('textarea');
            temp.value = text;
            temp.style.position = 'fixed';
            temp.style.opacity = '0';
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            temp.remove();
            showToast(successMessage);
        } catch (e) {
            showToast(errorMessage);
        }
    }
}

function buildCopyAllText(data) {
    return `CHAMADO #${data.c || '--'} | TBSA: ${data.t || '--'} | CLARO: ${data.l || '--'} | ENDERECO: ${data.e || 'Não informado'} | VÁLIDO ATÉ ${window._dateDisplay || '--/--/----'} | STATUS: ${window._statusLabel || '--'} | OBS: ${data.o || 'Sem observações.'}`;
}

function playTicketCopyAnimation() {
    const wrapper = DetailEls.ticketWrapper;
    if (!wrapper) return;
    const finishAnimation = () => {
        wrapper.classList.remove('ticket-copy-feedback');
        wrapper.removeEventListener('animationend', handleAnimationEnd);
    };
    const handleAnimationEnd = (event) => {
        if (event.target === wrapper) finishAnimation();
    };
    wrapper.classList.remove('ticket-copy-feedback');
    void wrapper.offsetWidth;
    wrapper.classList.add('ticket-copy-feedback');
    clearTimeout(playTicketCopyAnimation._timer);
    wrapper.addEventListener('animationend', handleAnimationEnd);
    playTicketCopyAnimation._timer = setTimeout(finishAnimation, 1200);
}

// ════════════════════════════════════════
// Screen Navigation (SPA)
// ════════════════════════════════════════

function populatePage(data) {
    const isOverdue = checkIfOverdue(data.f);
    const status = (data.s || '').trim().toLowerCase();
    const isApproved = status === 'aprovado' || status === '';
    const isBlocked = isOverdue || !isApproved;
    const statusLabel = isOverdue ? 'Vencido' : (isApproved ? 'Aprovado' : (data.s || 'Bloqueado'));

    DetailEls.siteCode.textContent = data.t || '--';
    DetailEls.location.textContent = data.l || '--';
    DetailEls.accessType.textContent = 'Manutenção';
    DetailEls.status.textContent = statusLabel;
    const address = data.e || 'Não informado';
    DetailEls.address.textContent = address;

    if (hasValidAddress(address)) {
        DetailEls.address.href = buildMapsSearchUrl(address);
        DetailEls.address.target = '_blank';
        DetailEls.address.rel = 'noopener noreferrer';
        DetailEls.address.removeAttribute('aria-disabled');
        DetailEls.address.tabIndex = 0;
    } else {
        DetailEls.address.removeAttribute('href');
        DetailEls.address.removeAttribute('target');
        DetailEls.address.removeAttribute('rel');
        DetailEls.address.setAttribute('aria-disabled', 'true');
        DetailEls.address.tabIndex = -1;
    }

    DetailEls.statusDot.classList.toggle('is-blocked', isBlocked);
    DetailEls.chamado.textContent = `#${data.c || '--'}`;
    DetailEls.idTbsa.textContent = data.t || '--';
    DetailEls.idClaro.textContent = data.l || '--';

    if (data.o) {
        DetailEls.obs.textContent = data.o;
        if (obsBlock) obsBlock.hidden = false;
    } else if (obsBlock) {
        obsBlock.hidden = true;
    }

    if (DetailEls.copyAll) {
        DetailEls.copyAll.disabled = isBlocked;
        DetailEls.copyAll.setAttribute('aria-disabled', String(isBlocked));
        DetailEls.copyAll.title = isBlocked ? 'Chamado bloqueado' : 'Copiar todos os dados';
    }

    window._ticketData = data;
    window._dateDisplay = formatDate(data.f);
    window._statusLabel = statusLabel;
    window._isBlocked = isBlocked;
}

function showScreen(screenId, data) {
    const updateDOM = () => {
        if (screenId === 'detail') {
            document.body.classList.add('showing-detail');
            if (data) populatePage(data);
            document.title = `Detalhe: ${data ? (data.t || 'Chamado') : 'Chamado'} - EQS`;
        } else {
            document.body.classList.remove('showing-detail');
            document.title = 'Consulta de Sites - EQS';
        }
    };

    if (document.startViewTransition) {
        document.startViewTransition(updateDOM);
    } else {
        updateDOM();
    }
}

// Get ticket data from URL or sessionStorage
function getTicketData() {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('data');
    if (encoded) {
        try { return JSON.parse(decodeURIComponent(encoded)); } catch (e) {}
    }
    try {
        const stored = sessionStorage.getItem('eqs-detail');
        if (stored) return JSON.parse(stored);
    } catch (e) {}
    return null;
}

// ════════════════════════════════════════
// Data Fetching
// ════════════════════════════════════════

function getCachedData() {
    try {
        const cached = JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY));
        if (cached && Date.now() - cached.timestamp < CONFIG.CACHE_TTL && cached.data.length > 0 && 's' in cached.data[0]) {
            return cached.data;
        }
    } catch (e) {}
    return null;
}

function setCachedData(data) {
    try {
        localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) { console.warn('Cache write failed:', e); }
}

async function fetchData() {
    const cached = getCachedData();
    if (cached) {
        dataStore = cached;
        Elements.statusSync.innerHTML = '<span class="status-sync-ok">● Dados carregados do cache</span>';
        fetchRemoteData(true);
        return;
    }
    showInitialLoading();
    await fetchRemoteData(false);
}

function showInitialLoading() {
    Elements.spinnerContainer.style.display = 'flex';
    Elements.loadingText.style.display = 'block';
    Elements.statusSync.innerHTML = '';
    Elements.spinnerContainer.innerHTML = '';
    for (let i = 0; i < 3; i++) {
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
            o: item['OBSERVAÇÕES'] || '',
            e: item['ENDERECO'] || ''
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

function removeAccents(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ════════════════════════════════════════
// Search & Render
// ════════════════════════════════════════

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
        card.style.animationDelay = `${Math.min(index, 6) * 0.04}s`;
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

// ════════════════════════════════════════
// Event Listeners
// ════════════════════════════════════════

// Card click → show detail screen (SPA)
document.addEventListener('click', function (e) {
    const btn = e.target.closest('.detail-btn');
    if (!btn) return;
    try {
        const data = JSON.parse(btn.dataset.detail);
        sessionStorage.setItem('eqs-detail', JSON.stringify(data));
        showScreen('detail', data);
        history.pushState({ screen: 'detail', data: data }, '', '?site=' + encodeURIComponent(data.t || ''));
    } catch (err) { console.error('Nav error:', err); }
});

// Bottom nav "Consulta" → back to index
document.addEventListener('click', function (e) {
    const navBtn = e.target.closest('#nav-consulta');
    if (!navBtn) return;
    e.preventDefault();
    showScreen('index');
    history.pushState({ screen: 'index' }, '', 'index.html');
});

// Copy chamado button
if (DetailEls.copyChamado) {
    DetailEls.copyChamado.addEventListener('click', () => {
        const data = window._ticketData;
        if (!data) return;
        playTicketCopyAnimation();
        copyText(String(data.c || ''), 'Chamado copiado!', 'Erro ao copiar.');
    });
}

// Copy all button
if (DetailEls.copyAll) {
    DetailEls.copyAll.addEventListener('click', () => {
        const data = window._ticketData;
        if (!data || DetailEls.copyAll.disabled) return;
        playTicketCopyAnimation();
        copyText(buildCopyAllText(data), 'Dados copiados com sucesso!', 'Erro ao copiar dados.');
    });
}

// Theme toggle
Elements.themeCheck.addEventListener('change', () => {
    document.body.classList.toggle('dark-mode', Elements.themeCheck.checked);
    localStorage.setItem('eqs-theme', Elements.themeCheck.checked ? 'dark' : 'light');
});

if (localStorage.getItem('eqs-theme') === 'dark') {
    document.body.classList.add('dark-mode');
    Elements.themeCheck.checked = true;
}

// Search events
const debouncedSearch = debounce(handleSearch, CONFIG.DEBOUNCE_DELAY);
Elements.input.addEventListener('input', debouncedSearch);
Elements.input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});
Elements.btn.addEventListener('click', handleSearch);

// Filter chips
Elements.filterChips.forEach(chip => {
    chip.addEventListener('click', (e) => {
        Elements.filterChips.forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.dataset.filter;
        handleSearch();
    });
});

// Popstate (browser back/forward)
window.addEventListener('popstate', function (e) {
    if (e.state && e.state.screen === 'detail' && e.state.data) {
        showScreen('detail', e.state.data);
    } else {
        showScreen('index');
    }
});

// ════════════════════════════════════════
// Initialization
// ════════════════════════════════════════

// On load: restore detail if coming from sessionStorage (refresh/bookmark)
window.addEventListener('load', function initApp() {
    const initialData = getTicketData();
    if (initialData) {
        // Restore detail screen without transition animation
        document.body.classList.add('showing-detail');
        populatePage(initialData);
        history.replaceState({ screen: 'detail', data: initialData }, '', window.location.href);
        sessionStorage.removeItem('eqs-detail');
    }
});

window.addEventListener('load', fetchData);

// PWA Service Worker
if ('serviceWorker' in navigator) {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
        setTimeout(() => navigator.serviceWorker.register('sw.js'), 500);
    });
}

// PWA Install Prompt
let deferredPrompt;
const pwaBanner = document.getElementById('pwa-install-banner');
const pwaInstallBtn = document.getElementById('pwa-install');
const pwaCloseBtn = document.getElementById('pwa-close');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (localStorage.getItem('pwa-dismissed') !== 'true') {
        setTimeout(() => {
            if (pwaBanner) pwaBanner.style.display = 'flex';
        }, 3000);
    }
});

if (pwaCloseBtn && pwaInstallBtn) {
    pwaCloseBtn.addEventListener('click', () => {
        if (pwaBanner) pwaBanner.style.display = 'none';
        localStorage.setItem('pwa-dismissed', 'true');
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
