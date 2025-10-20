// --- UTILS.JS ---

// MÁSCARAS E FORMATADORES
export const formatCurrency = (value) => `R$ ${parseFloat(value || 0).toFixed(2).replace('.', ',')}`;

export const calculateItemsValue = (items) => {
    return items.reduce((sum, item) => sum + (item.price || 0), 0);
};

export const formatElapsedTime = (timestamp) => {
    if (!timestamp) return null; 
    const timeMs = typeof timestamp.toMillis === 'function' ? timestamp.toMillis() : timestamp;
    const now = Date.now();
    const diffMs = now - timeMs;
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);

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
    return parseFloat(currencyString.replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0;
};
