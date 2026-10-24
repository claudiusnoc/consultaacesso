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
    result: document.getElementById('import-result'),
    consultUpdatedBase: document.getElementById('consult-updated-base'),
    logoutButton: document.getElementById('logout-button'),
};

const SUPABASE = window.TBSA_SUPABASE_CONFIG || null;
const IS_LOCAL_PORTAL = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
let activeUpdateCode = '';

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

async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a solicitação.');
    return payload;
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
    if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a solicitação.');
    return payload;
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

async function publishSpreadsheet(file, formData) {
    if (!usesSupabase()) return request('/api/import', { method: 'POST', body: formData });
    if (!activeUpdateCode) throw new Error('Informe o código novamente para atualizar a base.');
    const accesses = await parseSpreadsheet(file);
    return supabaseRpc('importar_portal_acessos', { p_codigo: activeUpdateCode, p_acessos: accesses });
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
    const raw = normalize(value);
    if (!raw || /^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new Error(`DATA DE TERMINO inválida: ${raw}.`);
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
}

async function parseSpreadsheet(file) {
    if (!window.XLSX) throw new Error('Não foi possível carregar o leitor de planilhas. Tente novamente.');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
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

    rows.slice(headerIndex + 1).forEach((row, offset) => {
        const chamado = read(row, 'PROTOCOLO');
        const id_detentora = read(row, 'LOCAL');
        if (!chamado && !id_detentora) return;
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
    });
    if (!records.length) throw new Error('Nenhum acesso válido foi encontrado na aba Acessos.');
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
    setLoading(elements.uploadButton, true, 'Validando planilha...');
    try {
        const formData = new FormData();
        formData.append('planilha', file, file.name);
        const result = await publishSpreadsheet(file, formData);
        elements.result.textContent = `${result.message} ${result.rows} acesso(s) validado(s); ${result.approved} liberado(s).`;
        elements.result.hidden = false;
        elements.consultUpdatedBase.href = `index.html?atualizado=${Date.now()}`;
        elements.consultUpdatedBase.hidden = false;
        elements.uploadForm.reset();
        elements.selectedFile.textContent = 'Nenhum arquivo selecionado';
    } catch (error) {
        setError(elements.fileError, error.message);
    } finally {
        setLoading(elements.uploadButton, false);
    }
});

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
