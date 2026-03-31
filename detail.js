// ===== Detail Page Logic =====

// Lê os dados do chamado a partir da URL (?data=...) ou sessionStorage
function getTicketData() {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('data');
    if (encoded) {
        try {
            return JSON.parse(decodeURIComponent(encoded));
        } catch (e) { }
    }
    // Fallback: sessionStorage
    try {
        const stored = sessionStorage.getItem('eqs-detail');
        if (stored) return JSON.parse(stored);
    } catch (e) { }
    // Demo fallback
    return {
        c: '00358519',
        t: 'TEMGBHO0027',
        l: 'EMG0010',
        f: '2026-05-31',
        s: 'Aprovado',
        o: 'Carta encaminhada ao local. Problemas de acesso, acionar o NOC TBSA.'
    };
}

function formatDate(dateStr) {
    if (!dateStr) return '--/--/----';
    try {
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    } catch (e) { return dateStr; }
}

function checkIfOverdue(dateStr) {
    if (!dateStr) return false;
    const scheduledDate = new Date(dateStr + 'T23:59:59');
    return scheduledDate < new Date();
}

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message, duration = 2500) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

// ===== Populate page =====
function populatePage(data) {
    const isOverdue = checkIfOverdue(data.f);
    const status = (data.s || '').trim().toLowerCase();
    const isApproved = status === 'aprovado' || status === '';
    const isBlocked = isOverdue || !isApproved;
    const dateDisplay = formatDate(data.f);

    // Site name / title
    document.getElementById('detail-site-name').textContent = data.t || 'Site';
    document.getElementById('detail-location').textContent = `Estação ${escapeHTML(data.l)}`;

    // Access type
    document.getElementById('detail-access-type').textContent = 'MANUTENÇÃO';
    document.getElementById('detail-detentora').textContent = 'TBSA';

    // Date & Status
    document.getElementById('detail-date').textContent = dateDisplay;
    const dotEl = document.getElementById('detail-status-dot');
    const statusTextEl = document.getElementById('detail-status');

    if (isBlocked) {
        dotEl.classList.add('blocked');
        statusTextEl.classList.add('blocked');
        statusTextEl.textContent = isOverdue ? 'Vencido' : (data.s || 'Bloqueado');
    } else {
        statusTextEl.textContent = 'Aprovado';
    }

    // Chamado
    document.getElementById('detail-chamado').textContent = `#${data.c}`;

    // Observações
    const obsSection = document.getElementById('detail-obs-section');
    if (data.o) {
        document.getElementById('detail-obs').textContent = data.o;
    } else {
        obsSection.style.display = 'none';
    }

    // IDs
    document.getElementById('detail-id-tbsa').textContent = data.t || '--';
    document.getElementById('detail-id-claro').textContent = data.l || '--';

    // Action button state
    const actionBtn = document.getElementById('copy-all-btn');
    if (isBlocked) {
        actionBtn.classList.add('blocked-btn');
        actionBtn.innerHTML = `
            <span class="material-symbols-outlined">block</span>
            ${!isApproved ? escapeHTML(data.s).toUpperCase() : 'CHAMADO VENCIDO'}
        `;
        actionBtn.disabled = true;
    }

    // Store data for copy
    window._ticketData = data;
    window._dateDisplay = dateDisplay;
}

// ===== Ticket tear animation (brief open → auto close) =====
let tearBusy = false;
const wrapper = document.getElementById('ticket-wrapper');

function playTearAnimation() {
    if (tearBusy) return;
    tearBusy = true;

    // Open
    wrapper.classList.remove('ticket-closing');
    wrapper.classList.add('ticket-open');

    // Auto-close after a short pause
    setTimeout(() => {
        wrapper.classList.remove('ticket-open');
        wrapper.classList.add('ticket-closing');

        // Cleanup after close animation finishes
        setTimeout(() => {
            wrapper.classList.remove('ticket-closing');
            tearBusy = false;
        }, 350);
    }, 600);
}

// ===== Copy actions =====
document.getElementById('copy-chamado-btn').addEventListener('click', () => {
    const data = window._ticketData;
    if (!data) return;

    playTearAnimation();

    navigator.clipboard.writeText(data.c).then(() => {
        showToast('Chamado copiado!');
    }).catch(() => showToast('Erro ao copiar.'));
});

document.getElementById('copy-all-btn').addEventListener('click', () => {
    const data = window._ticketData;
    if (!data || document.getElementById('copy-all-btn').disabled) return;
    const text = `CHAMADO #${data.c} | Site: ${data.t} | Estação: ${data.l} | VÁLIDO ATÉ ${window._dateDisplay} | OBS: ${data.o || 'Sem observações.'}`;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Dados copiados com sucesso!');
    }).catch(() => showToast('Erro ao copiar dados.'));
});

// ===== Theme =====
const themeCheck = document.getElementById('theme-check');

themeCheck.addEventListener('change', () => {
    document.body.classList.toggle('dark-mode', themeCheck.checked);
    localStorage.setItem('eqs-theme', themeCheck.checked ? 'dark' : 'light');
});

if (localStorage.getItem('eqs-theme') === 'dark') {
    document.body.classList.add('dark-mode');
    themeCheck.checked = true;
}

// ===== Init =====
const ticketData = getTicketData();
populatePage(ticketData);
