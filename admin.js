const elements = {
    authenticationPanel: document.getElementById('authentication-panel'),
    uploadPanel: document.getElementById('upload-panel'),
    loginForm: document.getElementById('login-form'),
    code: document.getElementById('access-code'),
    codeError: document.getElementById('access-code-error'),
    toggleCode: document.getElementById('toggle-code'),
    loginButton: document.getElementById('login-button'),
    uploadForm: document.getElementById('upload-form'),
    file: document.getElementById('spreadsheet-file'),
    selectedFile: document.getElementById('selected-file'),
    fileError: document.getElementById('spreadsheet-error'),
    uploadButton: document.getElementById('upload-button'),
    processingProgress: document.getElementById('processing-progress'),
    processingProgressTitle: document.getElementById('processing-progress-title'),
    processingProgressValue: document.getElementById('processing-progress-value'),
    processingProgressFill: document.getElementById('processing-progress-fill'),
    processingProgressTrack: document.getElementById('processing-progress-track'),
    processingProgressDetail: document.getElementById('processing-progress-detail'),
    dossierFileName: document.getElementById('dossier-file-name'),
    dossierRows: [...document.querySelectorAll('.dossier-row')],
    dossierCount: document.getElementById('dossier-count'),
    result: document.getElementById('import-result'),
    consultUpdatedBase: document.getElementById('consult-updated-base'),
    successDialog: document.getElementById('publish-success-dialog'),
    successDialogClose: document.getElementById('success-dialog-close'),
    successDialogConsult: document.getElementById('success-dialog-consult'),
    logoutButton: document.getElementById('logout-button'),
};

const adminThemeControl = document.getElementById('theme-check-admin');
function applyAdminTheme(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
    adminThemeControl.checked = isDark;
    adminThemeControl.setAttribute('aria-label', isDark ? 'Ativar modo claro' : 'Ativar modo escuro');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#081525' : '#f5f8fc');
}
adminThemeControl.addEventListener('change', () => {
    applyAdminTheme(adminThemeControl.checked);
    localStorage.setItem('eqs-theme', adminThemeControl.checked ? 'dark' : 'light');
});
applyAdminTheme(localStorage.getItem('eqs-theme') === 'dark');

const SUPABASE = window.TBSA_SUPABASE_CONFIG || null;
const IS_LOCAL_PORTAL = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
const MAX_SPREADSHEET_BYTES = 25 * 1024 * 1024;
let activeUpdateCode = '';
let currentProgress = 0;
let progressDriftTimer = null;

function prepareSoftDouble() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return null;
    try {
        const context = new AudioContextConstructor();
        if (context.state === 'suspended') context.resume().catch(() => {});
        return context;
    } catch { return null; }
}

function playSoftDouble(context) {
    if (!context || context.state === 'closed') return;
    try {
        const start = context.currentTime + .04;
        [[587, 0, .25, .034], [784, .14, .32, .027]].forEach(([frequency, delay, duration, peak]) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const noteStart = start + delay;
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, noteStart);
            gain.gain.setValueAtTime(.0001, noteStart);
            gain.gain.exponentialRampToValueAtTime(peak, noteStart + .018);
            gain.gain.exponentialRampToValueAtTime(.0001, noteStart + duration);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start(noteStart);
            oscillator.stop(noteStart + duration + .01);
        });
        window.setTimeout(() => context.close().catch(() => {}), 700);
    } catch { context.close().catch(() => {}); }
}

function usesSupabase() {
    return Boolean(SUPABASE && !IS_LOCAL_PORTAL);
}

function setError(element, message) {
    element.textContent = message || '';
    element.hidden = !message;
}

function setLoading(button, isLoading, label) {
    button.disabled = isLoading;
    button.textContent = isLoading ? label : button.dataset.defaultLabel;
}

function setProcessingProgress(value, title, detail) {
    currentProgress = Math.max(0, Math.min(100, Math.round(value)));
    elements.processingProgress.hidden = false;
    elements.processingProgress.classList.toggle('is-complete', currentProgress >= 100);
    elements.processingProgressTitle.textContent = title;
    elements.processingProgressValue.textContent = `${currentProgress}%`;
    elements.processingProgressFill.style.width = `${currentProgress}%`;
    elements.processingProgressTrack.setAttribute('aria-valuenow', String(currentProgress));
    elements.processingProgressDetail.textContent = detail;
}

function renderDossierPreview(records, checked, total) {
    const visibleRecords = records.slice(-elements.dossierRows.length);
    const firstVisibleIndex = elements.dossierRows.length - visibleRecords.length;
    elements.dossierRows.forEach((row, index) => {
        const record = visibleRecords[index - firstVisibleIndex];
        const protocol = row.querySelector('[data-dossier="protocol"]');
        const site = row.querySelector('[data-dossier="site"]');
        const status = row.querySelector('[data-dossier="status"]');
        row.classList.remove('is-current', 'is-done', 'is-pending', 'is-blocked');
        if (!record) {
            protocol.textContent = '—';
            site.textContent = '—';
            status.textContent = '—';
            return;
        }
        protocol.textContent = record.chamado;
        site.textContent = record.site;
        status.textContent = record.status.toUpperCase();
        const isCurrent = index === firstVisibleIndex + visibleRecords.length - 1;
        if (isCurrent) row.classList.add('is-current');
        else row.classList.add('is-done');
        if (record.status === 'Pendente') row.classList.add('is-pending');
        if (record.status === 'Bloqueado') row.classList.add('is-blocked');
    });
    elements.dossierCount.textContent = `${checked.toLocaleString('pt-BR')} / ${total.toLocaleString('pt-BR')}`;
}

function stopProgressDrift() {
    window.clearInterval(progressDriftTimer);
    progressDriftTimer = null;
}

function startProgressDrift(startValue, title, detail) {
    stopProgressDrift();
    let value = startValue;
    setProcessingProgress(value, title, detail);
    progressDriftTimer = window.setInterval(() => {
        value = Math.min(92, value + Math.max(.35, (92 - value) * .045));
        setProcessingProgress(value, title, detail);
        if (value >= 91.5) stopProgressDrift();
    }, 280);
}

async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a solicitação.');
    return payload;
}

function requestWithUploadProgress(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let waitingForServer = false;
        xhr.open('POST', url);
        xhr.withCredentials = true;
        xhr.timeout = 180000;
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const fraction = event.total ? event.loaded / event.total : 0;
                onProgress(14 + fraction * 66, 'Enviando planilha', 'Transferindo o arquivo para validação e classificação.');
                if (fraction >= 1 && !waitingForServer) {
                    waitingForServer = true;
                    startProgressDrift(81, 'Validando e classificando acessos', 'Conferindo os registros antes de publicar a base.');
                }
            }
        });
        xhr.addEventListener('load', () => {
            stopProgressDrift();
            let payload = {};
            try { payload = JSON.parse(xhr.responseText || '{}'); } catch { /* use the standard request error */ }
            if (xhr.status < 200 || xhr.status >= 300) {
                reject(new Error(payload.error || 'Não foi possível concluir a solicitação.'));
                return;
            }
            onProgress(96, 'Conferindo publicação', 'Recebemos a confirmação do servidor.');
            resolve(payload);
        });
        xhr.addEventListener('error', () => {
            stopProgressDrift();
            reject(new Error('Não foi possível conectar ao servidor de atualização.'));
        });
        xhr.addEventListener('timeout', () => {
            stopProgressDrift();
            reject(new Error('O envio excedeu o tempo limite. Tente novamente.'));
        });
        xhr.send(formData);
    });
}

async function supabaseRpc(functionName, requestPayload) {
    const response = await fetch(`${SUPABASE.url}/rest/v1/rpc/${functionName}`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE.publishableKey,
            Authorization: `Bearer ${SUPABASE.publishableKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (response.status === 401 || response.status === 403 || payload.code === '28000') {
            throw new Error('Código inválido ou sessão expirada. Informe o código novamente.');
        }
        throw new Error(payload.message || payload.error || 'Não foi possível concluir a solicitação.');
    }
    return payload;
}

function validateImportConfirmation(result) {
    const rows = Number(result?.rows);
    const approved = Number(result?.approved);
    if (!Number.isSafeInteger(rows) || rows < 1 || !Number.isSafeInteger(approved) || approved < 0 || approved > rows) {
        throw new Error('O servidor não confirmou a quantidade de dados publicada. Confira a base antes de tentar novamente.');
    }
    return { rows, approved };
}

async function authorizeUpdate(code) {
    if (!usesSupabase()) {
        return request('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
        });
    }
    const isValid = await supabaseRpc('validar_codigo_atualizacao', { p_codigo: code });
    if (!isValid) throw new Error('Código inválido. Confira e tente novamente.');
    activeUpdateCode = code;
    return { authenticated: true };
}

async function publishSpreadsheet(file, formData, onProgress = () => {}) {
    if (!usesSupabase()) {
        onProgress(6, 'Preparando envio', 'Preparando a planilha para validação.');
        return requestWithUploadProgress('/api/import', formData, onProgress);
    }
    if (!activeUpdateCode) throw new Error('Informe o código novamente para atualizar a base.');
    const accesses = await parseSpreadsheet(file, onProgress);
    startProgressDrift(78, 'Publicando acessos', `Gravando e conferindo ${accesses.length} registros.`);
    try {
        const result = await supabaseRpc('importar_portal_acessos', { p_codigo: activeUpdateCode, p_acessos: accesses });
        stopProgressDrift();
        onProgress(96, 'Conferindo publicação', 'O banco confirmou a atualização da base.');
        return result;
    } catch (error) {
        stopProgressDrift();
        throw error;
    }
}

function normalize(value) {
    return String(value ?? '').trim();
}

function normalizedHeader(value) {
    return normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function portalStatus(value) {
    const status = normalizedHeader(value);
    if (['APROBADO', 'APROVADO', 'LIBERADO'].includes(status)) return 'Liberado';
    if (['PENDENTE', 'PENDING', 'EM ANALISE'].includes(status)) return 'Pendente';
    if (['BLOQUEADO', 'REPROVADO', 'NEGADO'].includes(status)) return 'Bloqueado';
    throw new Error(`STATUS inválido: ${normalize(value)}.`);
}

function validity(value) {
    return window.normalizePortalValidity(value);
}

async function parseSpreadsheet(file, onProgress = () => {}) {
    if (!window.XLSX) throw new Error('Não foi possível carregar o leitor de planilhas. Tente novamente.');
    onProgress(3, 'Lendo planilha', 'Abrindo o arquivo selecionado.');
    const fileBuffer = await file.arrayBuffer();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    onProgress(9, 'Lendo planilha', 'Localizando a aba de acessos e as colunas.');
    const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets.Acessos;
    if (!sheet) throw new Error('A planilha precisa conter a aba Acessos.');
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    const required = ['PROTOCOLO', 'STATUS', 'LOCAL'];
    const headerIndex = rows.findIndex((row) => {
        const headers = new Set(row.map(normalizedHeader));
        return required.every((name) => headers.has(name));
    });
    if (headerIndex < 0) throw new Error('A aba Acessos não tem as colunas obrigatórias esperadas.');
    const headers = new Map(rows[headerIndex].map((value, index) => [normalizedHeader(value), index]));
    const read = (row, name) => normalize(row[headers.get(name) ?? -1]);
    const records = [];
    const protocols = new Set();
    const locals = new Set();

    const sourceRows = rows.slice(headerIndex + 1);
    renderDossierPreview(records, 0, sourceRows.length);
    for (let offset = 0; offset < sourceRows.length; offset++) {
        const row = sourceRows[offset];
        const chamado = read(row, 'PROTOCOLO');
        const id_detentora = read(row, 'LOCAL');
        if (!chamado && !id_detentora) continue;
        const line = headerIndex + offset + 2;
        if (!chamado || !id_detentora) throw new Error(`Linha ${line} sem PROTOCOLO ou LOCAL.`);
        const site = read(row, 'SITE');
        if (!site || site === '#N/A') throw new Error(`Linha ${line} sem SITE.`);
        if (protocols.has(chamado) || locals.has(id_detentora.toUpperCase())) throw new Error(`Linha ${line} contém PROTOCOLO ou LOCAL duplicado.`);
        protocols.add(chamado);
        locals.add(id_detentora.toUpperCase());
        records.push({
            chamado,
            id_detentora,
            site,
            status: portalStatus(read(row, 'STATUS')),
            validade: validity(read(row, 'DATA DE TERMINO')),
            endereco: '',
            cluster: read(row, 'REGIAO'),
            supervisor: read(row, 'REVISADO POR'),
            observacoes: read(row, 'OBSERVACOES')
        });
        if (offset % 40 === 0 || offset === sourceRows.length - 1) {
            const percent = 14 + Math.round(((offset + 1) / Math.max(1, sourceRows.length)) * 60);
            const stage = percent < 50 ? 'Validando registros' : 'Classificando acessos';
            renderDossierPreview(records, offset + 1, sourceRows.length);
            onProgress(percent, stage, `Conferindo linha ${offset + 1} de ${sourceRows.length}.`);
            await new Promise((resolve) => requestAnimationFrame(() => window.setTimeout(resolve, 0)));
        }
    }
    if (!records.length) throw new Error('Nenhum acesso válido foi encontrado na aba Acessos.');
    onProgress(76, 'Planilha validada', `${records.length} acessos preparados para publicação.`);
    return records;
}

function showAuthenticated() {
    elements.authenticationPanel.hidden = true;
    elements.uploadPanel.hidden = false;
    elements.file.focus();
}

function showUnauthenticated() {
    elements.uploadPanel.hidden = true;
    elements.authenticationPanel.hidden = false;
    elements.loginForm.reset();
    elements.code.type = 'password';
    elements.toggleCode.textContent = 'Mostrar';
    elements.toggleCode.setAttribute('aria-pressed', 'false');
    elements.code.focus();
}

for (const button of [elements.loginButton, elements.uploadButton]) {
    button.dataset.defaultLabel = button.textContent;
}

elements.toggleCode.addEventListener('click', () => {
    const isVisible = elements.code.type === 'text';
    elements.code.type = isVisible ? 'password' : 'text';
    elements.toggleCode.textContent = isVisible ? 'Mostrar' : 'Ocultar';
    elements.toggleCode.setAttribute('aria-pressed', String(!isVisible));
    elements.code.focus();
});

elements.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError(elements.codeError, '');
    const code = elements.code.value;
    if (code.length < 8) {
        setError(elements.codeError, 'Informe um código com pelo menos 8 caracteres.');
        elements.code.focus();
        return;
    }
    setLoading(elements.loginButton, true, 'Validando código...');
    try {
        await authorizeUpdate(code);
        showAuthenticated();
    } catch (error) {
        setError(elements.codeError, error.message);
        elements.code.focus();
    } finally {
        setLoading(elements.loginButton, false);
    }
});

elements.file.addEventListener('change', () => {
    setError(elements.fileError, '');
    const file = elements.file.files[0];
    elements.selectedFile.textContent = file ? file.name : 'Nenhum arquivo selecionado';
    if (file && !file.name.toLowerCase().endsWith('.xlsx')) {
        setError(elements.fileError, 'Selecione uma planilha no formato .xlsx.');
    } else if (file && file.size > MAX_SPREADSHEET_BYTES) {
        setError(elements.fileError, 'O arquivo deve ter até 25 MB.');
    }
});

elements.uploadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError(elements.fileError, '');
    elements.result.hidden = true;
    elements.consultUpdatedBase.hidden = true;
    const file = elements.file.files[0];
    if (!file) {
        setError(elements.fileError, 'Selecione a planilha que será importada.');
        elements.file.focus();
        return;
    }
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
        setError(elements.fileError, 'Selecione uma planilha no formato .xlsx.');
        elements.file.focus();
        return;
    }
    if (file.size > MAX_SPREADSHEET_BYTES) {
        setError(elements.fileError, 'O arquivo deve ter até 25 MB.');
        elements.file.focus();
        return;
    }
    const soundContext = prepareSoftDouble();
    elements.processingProgress.classList.remove('is-error');
    elements.dossierFileName.textContent = file.name;
    renderDossierPreview([], 0, 0);
    setProcessingProgress(2, 'Preparando planilha', 'A atualização vai iniciar em instantes.');
    setLoading(elements.uploadButton, true, 'Processando planilha...');
    try {
        const formData = new FormData();
        formData.append('planilha', file, file.name);
        const result = await publishSpreadsheet(file, formData, setProcessingProgress);
        const summary = validateImportConfirmation(result);
        stopProgressDrift();
        setProcessingProgress(100, 'Publicação concluída', 'Os dados já estão disponíveis para consulta.');
        elements.result.textContent = `Base atualizada: ${summary.rows} acesso(s) publicado(s), ${summary.approved} liberado(s). Os dados já estão disponíveis para consulta.`;
        elements.result.hidden = false;
        elements.consultUpdatedBase.href = `index.html?atualizado=${Date.now()}`;
        elements.consultUpdatedBase.hidden = false;
        elements.successDialogConsult.href = elements.consultUpdatedBase.href;
        elements.uploadForm.reset();
        elements.selectedFile.textContent = 'Nenhum arquivo selecionado';
        if (!elements.successDialog.open) elements.successDialog.showModal();
        playSoftDouble(soundContext);
    } catch (error) {
        stopProgressDrift();
        if (soundContext && soundContext.state !== 'closed') soundContext.close().catch(() => {});
        elements.processingProgress.classList.add('is-error');
        setProcessingProgress(currentProgress, 'Envio não concluído', 'Revise a mensagem acima e tente novamente.');
        setError(elements.fileError, error.message);
    } finally {
        setLoading(elements.uploadButton, false);
    }
});

elements.successDialogClose.addEventListener('click', () => elements.successDialog.close());
elements.successDialog.addEventListener('close', () => elements.uploadButton.focus());

elements.logoutButton.addEventListener('click', async () => {
    if (usesSupabase()) activeUpdateCode = '';
    else await request('/api/logout', { method: 'POST' }).catch(() => {});
    showUnauthenticated();
});

if (usesSupabase()) {
    showUnauthenticated();
} else {
    request('/api/session')
        .then((session) => session.authenticated ? showAuthenticated() : showUnauthenticated())
        .catch(showUnauthenticated);
}
