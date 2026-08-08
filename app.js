const CONFIG = {
    CSV_URL: './chamados.csv',
    CACHE_KEY: 'eqs-data-cache-v4',
    CACHE_TTL: 5 * 60 * 1000,
    DEBOUNCE_DELAY: 300,
    FETCH_TIMEOUT: 6000,
    MAX_RESULTS: 100
};

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
    filterChips: document.querySelectorAll('.filter-chip'),
    baseTotal: document.getElementById('base-total'),
    resultsTitle: document.getElementById('results-title'),
    resultsSummary: document.getElementById('results-summary')
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
    date: document.getElementById('detail-date'),
    supervisor: document.getElementById('detail-supervisor'),
    obs: document.getElementById('detail-obs'),
    obsSection: document.getElementById('detail-obs-section'),
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

function updateBaseSummary() {
    if (!Elements.baseTotal) return;
    Elements.baseTotal.textContent = dataStore.length ? String(dataStore.length) : 'Nenhum';
}

function updateResultsHeading(title, summary) {
    if (Elements.resultsTitle) Elements.resultsTitle.textContent = title;
    if (Elements.resultsSummary) Elements.resultsSummary.textContent = summary;
}

function toIsoDate(dateStr) {
    const value = String(dateStr || '').trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        const [day, month, year] = value.split('/');
        return `${year}-${month}-${day}`;
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function formatDate(dateStr) {
    const isoDate = toIsoDate(dateStr);
    if (!isoDate) return dateStr || '--/--/----';
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
}

function checkIfOverdue(dateStr) {
    const isoDate = toIsoDate(dateStr);
    return isoDate ? new Date(`${isoDate}T23:59:59`) < new Date() : false;
}

function formatDisplayDate(dateStr) {
    return formatDate(dateStr);
}

function normalizeStatus(status) {
    const value = String(status || '').trim();
    const normalized = removeAccents(value).toLowerCase();
    if (normalized === 'liberado' || normalized === 'aprovado') return 'Liberado';
    if (normalized === 'reprovado') return 'Reprovado';
    if (normalized === 'aguardando aprovacao') return 'Aguardando Aprovação';
    return value;
}

function isApprovedStatus(status) {
    return normalizeStatus(status) === 'Liberado';
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
    const isApproved = isApprovedStatus(data.s);
    const isBlocked = isOverdue || !isApproved;
    const statusLabel = isOverdue ? 'Vencido' : (isApproved ? 'Liberado' : (data.s || 'Bloqueado'));

    DetailEls.siteCode.textContent = data.t || '--';
    DetailEls.location.textContent = data.l || '--';
    DetailEls.accessType.textContent = data.cluster || 'Não informado';
    if (DetailEls.date) DetailEls.date.textContent = formatDate(data.f);
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
    if (DetailEls.supervisor) DetailEls.supervisor.textContent = data.supervisor || 'Não informado';

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
            document.title = 'Consulta TBSA | Portal de acessos';
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
        updateBaseSummary();
        Elements.spinnerContainer.style.display = 'none';
        Elements.loadingText.style.display = 'none';
        Elements.statusSync.innerHTML = '<span class="status-sync-ok">Dados carregados do dispositivo</span>';
        fetchRemoteData(true);
        return;
    }
    showInitialLoading();
    await fetchRemoteData(false);
}

function showInitialLoading() {
    Elements.spinnerContainer.style.display = 'grid';
    Elements.loadingText.style.display = 'block';
    Elements.statusSync.innerHTML = '';
    Elements.statusSearch.innerHTML = '';
    updateResultsHeading('Carregando base', 'Preparando os dados publicados neste portal.');
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
        const response = await fetch(CONFIG.CSV_URL, { signal: controller.signal, cache: 'no-store' });

        if (!response || !response.ok) throw new Error('Falha no download');

        const text = await response.text();
        const remoteData = parseCSV(text);

        dataStore = remoteData.map(item => ({
            c: item['CHAMADO'] || '',
            t: item['ID DETENTORA'] || '',
            l: item['SITE'] || '',
            f: item['VALIDADE'] || '',
            s: normalizeStatus(item['STATUS']),
            o: item['OBSERVAÇÕES'] || '',
            e: item['ENDEREÇO'] || item['ENDERECO'] || '',
            cluster: item['CLUSTER'] || '',
            supervisor: item['SUPERVISOR'] || ''
        }));

        setCachedData(dataStore);
        updateBaseSummary();
        Elements.statusSync.innerHTML = '<span class="status-sync-ok">Base operacional atualizada</span>';
        if (!Elements.input.value.trim()) {
            updateResultsHeading('Pronto para consultar', 'Informe um identificador para localizar o acesso.');
            Elements.statusSearch.innerHTML = `
                <div class="empty-state">
                    <strong>Consulta direta e segura</strong>
                    <span>Os dados são lidos do arquivo publicado neste portal.</span>
                </div>
            `;
        }
        clearTimeout(timeoutId);
    } catch (error) {
        clearTimeout(timeoutId);
        if (!silent) {
            dataStore = [];
            updateBaseSummary();
            updateResultsHeading('Base indisponível', 'Não foi possível ler o arquivo de chamados.');
            Elements.statusSync.innerHTML = `
                <div class="status-sync-fail">
                    <strong>Base de chamados indisponível</strong><br>
                    Não foi possível carregar o arquivo de dados publicado.<br>
                    <small>Tente novamente em alguns instantes.</small>
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
    const rawQuery = Elements.input.value.trim();
    Elements.resultsList.innerHTML = '';
    document.getElementById('main-container').classList.add('has-results');

    if (dataStore.length === 0) {
        Elements.statusSearch.textContent = 'Aguarde o carregamento inicial da base...';
        updateResultsHeading('Carregando base', 'A consulta será liberada assim que os dados estiverem prontos.');
        Elements.dashboardPanel.style.display = 'none';
        Elements.filtersPanel.style.display = 'none';
        return;
    }

    if (!query) {
        updateResultsHeading('Pronto para consultar', 'Informe um identificador para localizar o acesso.');
        Elements.statusSearch.innerHTML = `
            <div class="empty-state">
                <strong>Digite um termo de busca</strong>
                <span>Use o número do chamado, o site ou o ID da detentora.</span>
            </div>
        `;
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
        updateResultsHeading('Nenhum chamado encontrado', `Busca por “${rawQuery}”.`);
        Elements.statusSearch.innerHTML = `
            <div class="status-error">
                <strong>Revise o identificador informado</strong>
                <span>Tente parte do chamado, do site ou do ID da detentora.</span>
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
        const isApproved = isApprovedStatus(item.s);
        if (isOverdue || !isApproved) {
            countBad++;
        } else {
            countOk++;
        }
    });

    Elements.statTotal.textContent = filtered.length;
    Elements.statOk.textContent = countOk;
    Elements.statBad.textContent = countBad;

    const resultLabel = filtered.length === 1 ? '1 chamado encontrado' : `${filtered.length} chamados encontrados`;
    updateResultsHeading(resultLabel, `Busca por “${rawQuery}”.`);
    Elements.statusSearch.textContent = '';
    Elements.dashboardPanel.style.display = 'grid';
    Elements.filtersPanel.style.display = 'flex';

    let finalResults = [];
    if (currentFilter === 'all') {
        finalResults = filtered;
    } else if (currentFilter === 'approved') {
        finalResults = filtered.filter(item => {
            const isOverdue = checkIfOverdue(item.f);
            const isApproved = isApprovedStatus(item.s);
            return !isOverdue && isApproved;
        });
    } else if (currentFilter === 'blocked') {
        finalResults = filtered.filter(item => {
            const isOverdue = checkIfOverdue(item.f);
            const isApproved = isApprovedStatus(item.s);
            return isOverdue || !isApproved;
        });
    }

    if (finalResults.length === 0) {
        Elements.statusSearch.innerHTML = `
            <div class="empty-state">
                <strong>Nenhum chamado neste filtro</strong>
                <span>Selecione outra situação para conferir os resultados.</span>
            </div>
        `;
        return;
    }

    const visibleResults = finalResults.slice(0, CONFIG.MAX_RESULTS);
    if (finalResults.length > visibleResults.length) {
        Elements.statusSearch.innerHTML = `
            <div class="result-limit">
                Exibindo ${visibleResults.length} de ${finalResults.length} resultados. Refine a busca para localizar um acesso específico.
            </div>
        `;
    }

    visibleResults.forEach((item, index) => {
        const card = createModernCard(item);
        card.classList.add('card-animate');
        card.style.animationDelay = `${Math.min(index, 6) * 0.04}s`;
        Elements.resultsList.appendChild(card);
    });
}

function createModernCard(item) {
    const card = document.createElement('article');
    const isOverdue = checkIfOverdue(item.f);
    const dateDisplay = formatDisplayDate(item.f);
    const isApproved = isApprovedStatus(item.s);
    const isBlocked = isOverdue || !isApproved;
    const statusLabel = isOverdue ? 'Vencido' : (isApproved ? 'Liberado' : (item.s || 'Pendente'));
    const itemJson = JSON.stringify(item).replace(/'/g, "&#39;");
    card.className = `result-card${isBlocked ? ' is-blocked' : ''}`;

    card.innerHTML = `
        <div class="result-card__identity">
            <span class="result-card__ticket">Chamado #${escapeHTML(item.c)}</span>
            <h3>${escapeHTML(item.t)}</h3>
            <p>Site ${escapeHTML(item.l)}</p>
        </div>
        <div class="result-card__meta">
            <span><small>Validade</small><strong>${escapeHTML(dateDisplay)}</strong></span>
            <span><small>Cluster</small><strong>${escapeHTML(item.cluster || 'Não informado')}</strong></span>
        </div>
        <span class="result-status ${isBlocked ? 'is-blocked' : 'is-approved'}">${escapeHTML(statusLabel)}</span>
        <button class="detail-btn ${isBlocked ? 'is-blocked' : ''}" data-detail='${itemJson}' type="button">Ver detalhes</button>
        ${item.o ? `<p class="result-card__note">${escapeHTML(item.o)}</p>` : ''}
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
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((error) => {
            console.warn('Service worker registration failed:', error);
        });
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
