(() => {
  const modelNames = {
    ring: 'Anel gradiente', scan: 'Leitura do dossiê', flow: 'Rota de classificação',
    stack: 'Conferência de campos', steps: 'Selo de publicação'
  };
  const variantNames = {
    double: 'Arco duplo', orbit: 'Ponto orbital', segments: 'Segmentos',
    gradient: 'Gradiente leve', center: 'Percentual'
  };
  const phases = [
    { label: 'Preparando arquivo', percent: 12 },
    { label: 'Lendo planilha', percent: 34 },
    { label: 'Validando registros', percent: 59 },
    { label: 'Classificando acessos', percent: 82 },
    { label: 'Conferindo publicação', percent: 96 },
    { label: 'Publicação concluída', percent: 100 }
  ];
  const sounds = {
    crystal: { name: 'Cristal claro', wave: 'sine', notes: [[880, 0, .2, .045], [1320, .09, .27, .038]] },
    soft: { name: 'Duplo macio', wave: 'sine', notes: [[587, 0, .25, .034], [784, .14, .32, .027]] },
    rise: { name: 'Ascendente', wave: 'triangle', notes: [[523, 0, .17, .029], [784, .08, .17, .032], [1046, .16, .25, .036]] },
    trio: { name: 'Três notas leves', wave: 'sine', notes: [[659, 0, .17, .027], [784, .11, .17, .03], [988, .22, .23, .032]] },
    bright: { name: 'Brilho agudo', wave: 'triangle', notes: [[1175, 0, .17, .026], [1568, .075, .24, .022]] },
    drop: { name: 'Gota suave', wave: 'sine', notes: [[1320, 0, .16, .031], [880, .12, .3, .024]] },
    amber: { name: 'Sinal âmbar', wave: 'sine', notes: [[587, 0, .21, .03], [784, .1, .22, .03], [1046, .2, .3, .032]] },
    bell: { name: 'Sino pontual', wave: 'sine', notes: [[1046, 0, .4, .027], [2093, .012, .22, .008]] },
    joy: { name: 'Toque alegre', wave: 'triangle', notes: [[659, 0, .15, .025], [880, .07, .16, .028], [1175, .14, .24, .03]] },
    quiet: { name: 'Plim discreto', wave: 'sine', notes: [[740, 0, .19, .019]] }
  };
  const scenes = [...document.querySelectorAll('.scene')];
  const modelButtons = [...document.querySelectorAll('.model-option')];
  const variantButtons = [...document.querySelectorAll('.variant-option')];
  const phraseButtons = [...document.querySelectorAll('.phrase-option')];
  const soundButtons = [...document.querySelectorAll('.sound-option')];
  const stateText = document.getElementById('process-state');
  const sceneTitle = document.getElementById('scene-title');
  const scenePercent = document.getElementById('scene-percent');
  const ringWrap = document.getElementById('ring-wrap');
  const ringVariants = document.getElementById('ring-variants');
  const ringPercent = document.getElementById('ring-percent');
  const ledgerCount = document.getElementById('ledger-count');
  const stage = document.querySelector('.stage');
  const sourceInput = document.getElementById('demo-spreadsheet');
  const sourceStatus = document.getElementById('demo-source-status');
  const approvedCount = document.getElementById('demo-approved-count');
  const pendingCount = document.getElementById('demo-pending-count');
  const blockedCount = document.getElementById('demo-blocked-count');
  const totalCount = document.getElementById('demo-total-count');
  const auditCount = document.getElementById('demo-audit-count');
  const soundCurrent = document.getElementById('sound-current');
  const demoProgressFill = document.getElementById('demo-progress-fill');
  const demoProgressLabel = document.getElementById('demo-progress-label');
  const demoProgressValue = document.getElementById('demo-progress-value');
  const demoProgressTrack = document.querySelector('.demo-progress__track');
  const toggleButton = document.getElementById('toggle-preview');
  const toggleLabel = document.getElementById('toggle-label');
  const toggleIcon = document.getElementById('toggle-icon');
  const selectedPhrase = document.getElementById('selected-phrase');
  let selectedModel = 'ring';
  let phaseIndex = 0;
  let interval = null;
  let isPlaying = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let importedRecords = null;

  function updateCaption() {
    sceneTitle.textContent = selectedModel === 'ring'
      ? `Anel · ${variantNames[ringWrap.dataset.ringStyle]}`
      : modelNames[selectedModel];
  }
  function updatePhase() {
    const phase = phases[phaseIndex];
    stage.dataset.phase = String(phaseIndex);
    stage.style.setProperty('--progress-ratio', String(phase.percent / 100));
    stateText.textContent = phase.label;
    scenePercent.textContent = `${phase.label} · ${phase.percent}%`;
    ringWrap.style.setProperty('--progress', `${phase.percent}%`);
    ringWrap.style.setProperty('--ring-turn', `${phase.percent * 3.6}deg`);
    ringWrap.style.setProperty('--gradient-stop-one', `${Math.round(phase.percent * 3.6 * .34)}deg`);
    ringWrap.style.setProperty('--gradient-stop-two', `${Math.round(phase.percent * 3.6 * .72)}deg`);
    ringPercent.textContent = `${phase.percent}%`;
    const total = importedRecords ? importedRecords.length : 520;
    ledgerCount.textContent = `${String(Math.round(total * phase.percent / 100)).padStart(3, '0')} / ${total}`;
    demoProgressLabel.textContent = phase.label;
    demoProgressValue.textContent = `${phase.percent}%`;
    demoProgressFill.style.transform = `scaleX(${phase.percent / 100})`;
    demoProgressTrack.setAttribute('aria-valuenow', String(phase.percent));
    phaseIndex = (phaseIndex + 1) % phases.length;
  }
  function setPlaying(playing) {
    isPlaying = playing;
    document.body.classList.toggle('paused', !playing);
    toggleButton.setAttribute('aria-pressed', String(playing));
    toggleLabel.textContent = playing ? 'Pausar prévia' : 'Reproduzir prévia';
    toggleIcon.innerHTML = playing
      ? '<path d="M5.2 4.8h3.4v10.4H5.2zM11.4 4.8h3.4v10.4h-3.4z"/>'
      : '<path d="M6 4.8c0-.7.76-1.12 1.35-.75l7.12 4.45a.9.9 0 0 1 0 1.5l-7.12 4.45A.9.9 0 0 1 6 13.7z"/>';
    window.clearInterval(interval);
    if (playing) interval = window.setInterval(updatePhase, 1750);
  }
  modelButtons.forEach((button) => button.addEventListener('click', () => {
    selectedModel = button.dataset.model;
    modelButtons.forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
    scenes.forEach((scene) => scene.classList.toggle('active', scene.dataset.scene === selectedModel));
    ringVariants.hidden = selectedModel !== 'ring';
    updateCaption();
    phaseIndex = 0;
    updatePhase();
    setPlaying(isPlaying);
  }));

  function normalizeHeader(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
  }
  function cellText(row, headers, name) {
    return String(row[headers.get(normalizeHeader(name)) ?? -1] ?? '').trim();
  }
  function realStatus(value) {
    const status = normalizeHeader(value);
    if (['APROBADO', 'APROVADO', 'LIBERADO', 'LIBERADA'].includes(status)) return 'Liberado';
    if (['PENDENTE', 'PENDING', 'EM ANALISE', 'AGUARDANDO'].includes(status)) return 'Pendente';
    return 'Bloqueado';
  }
  function setAuditStatus(cell, status) {
    cell.classList.remove('audit-cell--valid', 'audit-cell--pending', 'audit-cell--blocked');
    cell.classList.add(status === 'Liberado' ? 'audit-cell--valid' : status === 'Pendente' ? 'audit-cell--pending' : 'audit-cell--blocked');
    const indicator = document.createElement('i');
    indicator.textContent = status === 'Liberado' ? '✓' : status === 'Pendente' ? '!' : '×';
    cell.replaceChildren(indicator, document.createTextNode(status.toUpperCase()));
  }
  function renderRealRecords(records) {
    importedRecords = records;
    const counts = records.reduce((total, record) => {
      total[record.status] += 1;
      return total;
    }, { Liberado: 0, Pendente: 0, Bloqueado: 0 });
    approvedCount.textContent = String(counts.Liberado);
    pendingCount.textContent = String(counts.Pendente);
    blockedCount.textContent = String(counts.Bloqueado);
    totalCount.textContent = String(records.length);

    [...document.querySelectorAll('.ledger-row')].forEach((row, index) => {
      const record = records[index];
      row.hidden = !record;
      if (!record) return;
      const [protocol, site, badge] = row.children;
      protocol.textContent = record.protocol || '—';
      protocol.title = record.protocol || '';
      site.textContent = record.site || '—';
      site.title = record.site || '';
      badge.textContent = record.status === 'Liberado' ? 'LIB' : record.status === 'Pendente' ? 'PEND' : 'BLOQ';
      row.classList.toggle('is-done', record.status === 'Liberado');
      row.classList.toggle('is-current', index === 0);
    });

    const auditCells = [...document.querySelectorAll('.audit-grid .audit-cell:not(.audit-cell--head)')];
    for (let index = 0; index < 3; index += 1) {
      const record = records[index];
      const cells = auditCells.slice(index * 3, index * 3 + 3);
      cells.forEach((cell) => { cell.hidden = !record; });
      if (!record) continue;
      cells[0].textContent = record.local || '—';
      cells[0].title = record.local || '';
      cells[1].textContent = record.protocol ? `#${record.protocol}` : '—';
      cells[1].title = record.protocol || '';
      setAuditStatus(cells[2], record.status);
    }
    const shown = Math.min(3, records.length);
    auditCount.innerHTML = `${String(shown).padStart(2, '0')} <i>/ ${records.length}</i>`;
    phaseIndex = 0;
    updatePhase();
    setPlaying(isPlaying);
  }
  async function readLocalWorkbook(file) {
    if (!window.XLSX) throw new Error('O leitor de Excel não carregou. Confira sua conexão e tente novamente.');
    if (file.size > 25 * 1024 * 1024) throw new Error('A planilha excede o limite de 25 MB desta prévia.');
    sourceStatus.textContent = 'Lendo e organizando os registros no navegador…';
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheet = workbook.Sheets.Acessos;
    if (!sheet) throw new Error('Não encontrei a aba “Acessos” nesta planilha.');
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    const requiredHeaders = ['PROTOCOLO', 'STATUS', 'LOCAL'];
    const headerIndex = rows.findIndex((row) => requiredHeaders.every((header) => row.some((value) => normalizeHeader(value) === header)));
    if (headerIndex < 0) throw new Error('A aba Acessos não contém os cabeçalhos PROTOCOLO, STATUS e LOCAL.');
    const headers = new Map(rows[headerIndex].map((value, index) => [normalizeHeader(value), index]));
    const records = rows.slice(headerIndex + 1).map((row) => {
      const protocol = cellText(row, headers, 'PROTOCOLO');
      const local = cellText(row, headers, 'LOCAL');
      if (!protocol && !local) return null;
      const site = cellText(row, headers, 'SITE');
      return { protocol, local, site, status: realStatus(cellText(row, headers, 'STATUS')) };
    }).filter(Boolean);
    if (!records.length) throw new Error('Não encontrei registros para mostrar nesta planilha.');
    renderRealRecords(records);
    sourceStatus.textContent = `${file.name} · ${records.length} registros · lidos apenas neste navegador; nada foi enviado ou publicado.`;
  }
  sourceInput.addEventListener('change', async () => {
    const file = sourceInput.files?.[0];
    if (!file) return;
    try {
      await readLocalWorkbook(file);
    } catch (error) {
      sourceStatus.textContent = error.message;
    } finally {
      sourceInput.value = '';
    }
  });

  variantButtons.forEach((button) => button.addEventListener('click', () => {
    ringWrap.dataset.ringStyle = button.dataset.ringStyle;
    variantButtons.forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
    updateCaption();
  }));
  phraseButtons.forEach((button) => button.addEventListener('click', () => {
    phraseButtons.forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
    selectedPhrase.textContent = button.querySelector('.phrase-text').textContent;
  }));
  toggleButton.addEventListener('click', () => setPlaying(!isPlaying));

  async function playSound(soundKey) {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      soundCurrent.textContent = 'A prévia de áudio não está disponível neste navegador.';
      return;
    }
    const profile = sounds[soundKey];
    const context = new AudioContextConstructor();
    try {
      await context.resume();
      let closeAfter = 0;
      profile.notes.forEach(([frequency, delay, duration, peak]) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + delay;
        oscillator.type = profile.wave;
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + .018);
        gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + .01);
        closeAfter = Math.max(closeAfter, delay + duration);
      });
      window.setTimeout(() => context.close().catch(() => {}), (closeAfter + .12) * 1000);
    } catch { context.close().catch(() => {}); }
  }
  soundButtons.forEach((button) => button.addEventListener('click', () => {
    const profile = sounds[button.dataset.sound];
    soundButtons.forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
    soundCurrent.textContent = `Prévia selecionada: ${profile.name}`;
    playSound(button.dataset.sound);
  }));

  updateCaption();
  updatePhase();
  setPlaying(isPlaying);
    })();
