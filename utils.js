// --- UTILS.JS ---

// MÁSCARAS E FORMATADORES
export const formatCurrency = (value) => `R$ ${parseFloat(value || 0).toFixed(2).replace('.', ',')}`;

export const calculateItemsValue = (items) => {
    // Garante que 'items' seja um array antes de usar reduce
    if (!Array.isArray(items)) {
        console.warn("[calculateItemsValue] Input is not an array:", items);
        return 0;
    }
    return items.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0); // Garante que price seja número
};

export const formatElapsedTime = (timestamp) => {
    if (!timestamp) return null;

    const timeMs = typeof timestamp.toMillis === 'function' ? timestamp.toMillis() : timestamp;
    const now = Date.now();
    const diffMs = now - timeMs;
    const minutes = Math.floor((diffMs / 1000) / 60);

    if (minutes < 0) return `agora`; // Evita tempos negativos se houver dessincronia
    if (minutes >= 60) {
         const hours = Math.floor(minutes / 60);
         return `${hours}h`;
    } else if (minutes > 0) {
        return `${minutes} min`;
    } else {
        return `agora`;
    }
};

export const getNumericValueFromCurrency = (currencyString) => {
    if (typeof currencyString !== 'string') return 0;
    return parseFloat(currencyString.replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0;
};

// --- FUNÇÃO RESTAURADA ---
// Atualiza o texto de um elemento pelo ID, com verificação
export const updateText = (elementId, value) => {
    const el = document.getElementById(elementId);
    // console.log(`[updateText] Trying to update ${elementId} with value: ${value}`); // Debug
    if (el) {
        el.textContent = value;
    } else {
        // É normal alguns IDs não existirem se a tela não estiver totalmente visível/inicializada
        // console.warn(`[updateText] Element with ID ${elementId} not found.`);
    }
};
// --- FIM DA FUNÇÃO RESTAURADA ---
