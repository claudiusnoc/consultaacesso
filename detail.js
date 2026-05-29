// Detail page logic

const els = {
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
    toast: document.getElementById('toast'),
    themeCheck: document.getElementById('theme-check'),
    ticketWrapper: document.getElementById('ticket-wrapper'),
};

const obsBlock = els.obs ? els.obs.closest('.obs-block') : null;

function getTicketData() {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('data');

    if (encoded) {
        try {
            return JSON.parse(decodeURIComponent(encoded));
        } catch (e) { }
    }

    try {
        const stored = sessionStorage.getItem('eqs-detail');
        if (stored) return JSON.parse(stored);
    } catch (e) { }

    return {
        c: '00358519',
        t: 'TEMGBHO0027',
        l: 'EMG0010',
        f: '2026-05-31',
        s: 'Aprovado',
        o: 'Carta encaminhada ao local. Problemas de acesso, acionar o NOC TBSA.',
        e: 'Rua exemplo, bairro exemplo - Belo Horizonte/MG'
    };
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

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message, duration = 2400) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => els.toast.classList.remove('show'), duration);
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

function populatePage(data) {
    const isOverdue = checkIfOverdue(data.f);
    const status = (data.s || '').trim().toLowerCase();
    const isApproved = status === 'aprovado' || status === '';
    const isBlocked = isOverdue || !isApproved;
    const statusLabel = isOverdue ? 'Vencido' : (isApproved ? 'Aprovado' : (data.s || 'Bloqueado'));

    els.siteCode.textContent = data.t || '--';
    els.location.textContent = data.l || '--';
    els.accessType.textContent = 'Manutenção';
    els.status.textContent = statusLabel;
    const address = data.e || 'Não informado';
    els.address.textContent = address;

    if (hasValidAddress(address)) {
        els.address.href = buildMapsSearchUrl(address);
        els.address.target = '_blank';
        els.address.rel = 'noopener noreferrer';
        els.address.removeAttribute('aria-disabled');
        els.address.tabIndex = 0;
    } else {
        els.address.removeAttribute('href');
        els.address.removeAttribute('target');
        els.address.removeAttribute('rel');
        els.address.setAttribute('aria-disabled', 'true');
        els.address.tabIndex = -1;
    }

    els.statusDot.classList.toggle('is-blocked', isBlocked);
    els.chamado.textContent = `#${data.c || '--'}`;
    els.idTbsa.textContent = data.t || '--';
    els.idClaro.textContent = data.l || '--';

    if (data.o) {
        els.obs.textContent = data.o;
        if (obsBlock) obsBlock.hidden = false;
    } else if (obsBlock) {
        obsBlock.hidden = true;
    }

    if (els.copyAll) {
        els.copyAll.disabled = isBlocked;
        els.copyAll.setAttribute('aria-disabled', String(isBlocked));
        els.copyAll.title = isBlocked ? 'Chamado bloqueado' : 'Copiar todos os dados';
    }

    window._ticketData = data;
    window._dateDisplay = formatDate(data.f);
    window._statusLabel = statusLabel;
    window._isBlocked = isBlocked;
}

function buildCopyAllText(data) {
    return `CHAMADO #${data.c || '--'} | TBSA: ${data.t || '--'} | CLARO: ${data.l || '--'} | ENDERECO: ${data.e || 'Não informado'} | VÁLIDO ATÉ ${window._dateDisplay || '--/--/----'} | STATUS: ${window._statusLabel || '--'} | OBS: ${data.o || 'Sem observações.'}`;
}

function playTicketCopyAnimation() {
    if (!els.ticketWrapper) return;
    els.ticketWrapper.classList.remove('ticket-copy-feedback');
    void els.ticketWrapper.offsetWidth;
    els.ticketWrapper.classList.add('ticket-copy-feedback');
    clearTimeout(playTicketCopyAnimation._timer);
    playTicketCopyAnimation._timer = setTimeout(() => {
        els.ticketWrapper.classList.remove('ticket-copy-feedback');
    }, 660);
}

if (els.copyChamado) {
    els.copyChamado.addEventListener('click', () => {
        const data = window._ticketData;
        if (!data) return;
        playTicketCopyAnimation();
        copyText(String(data.c || ''), 'Chamado copiado!', 'Erro ao copiar.');
    });
}

if (els.copyAll) {
    els.copyAll.addEventListener('click', () => {
        const data = window._ticketData;
        if (!data || els.copyAll.disabled) return;
        playTicketCopyAnimation();
        copyText(buildCopyAllText(data), 'Dados copiados com sucesso!', 'Erro ao copiar dados.');
    });
}

if (els.themeCheck) {
    els.themeCheck.addEventListener('change', () => {
        document.body.classList.toggle('dark-mode', els.themeCheck.checked);
        localStorage.setItem('eqs-theme', els.themeCheck.checked ? 'dark' : 'light');
    });

    if (localStorage.getItem('eqs-theme') === 'dark') {
        document.body.classList.add('dark-mode');
        els.themeCheck.checked = true;
    }
}

populatePage(getTicketData());
