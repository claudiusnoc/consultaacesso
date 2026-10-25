(function attachValidityNormalizer(root, factory) {
    const normalize = factory();
    if (typeof module === 'object' && module.exports) module.exports = normalize;
    else root.normalizePortalValidity = normalize;
}(typeof globalThis === 'object' ? globalThis : this, function createValidityNormalizer() {
    function invalid(value) {
        throw new Error(`DATA DE TERMINO inválida: ${value}.`);
    }

    function formatDate(year, month, day, value) {
        const date = new Date(0);
        date.setUTCHours(0, 0, 0, 0);
        date.setUTCFullYear(year, month - 1, day);
        if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) invalid(value);
        return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    }

    return function normalizePortalValidity(value) {
        const raw = String(value ?? '').trim();
        if (!raw || /^N\/?D$/i.test(raw)) return '';

        const brazilian = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(raw);
        if (brazilian) {
            const [, day, month, year, hour, minute, second] = brazilian;
            if (hour !== undefined && (+hour > 23 || +minute > 59 || +(second || 0) > 59)) invalid(raw);
            return formatDate(+year, +month, +day, raw);
        }

        const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(raw);
        if (iso) return formatDate(+iso[1], +iso[2], +iso[3], raw);

        if (/^\d+(?:\.\d+)?$/.test(raw)) {
            const serial = Number(raw);
            if (serial >= 60 && serial < 2958466) {
                const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
                return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), raw);
            }
            invalid(raw);
        }

        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) invalid(raw);
        return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), raw);
    };
}));
