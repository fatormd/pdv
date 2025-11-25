// --- utils.js (VERSÃO DEFINITIVA) ---

// Formata um valor numérico para BRL
export const formatCurrency = (value) => {
    if (typeof value !== 'number') value = parseFloat(value) || 0;
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// Formata um timestamp para tempo decorrido (ex: "5 min")
export const formatElapsedTime = (timestamp) => {
    const now = Date.now();
    const seconds = Math.floor((now - timestamp) / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
};

export const getNumericValueFromCurrency = (currencyString) => {
    if (!currencyString) return 0;
    const cleanedValue = String(currencyString)
        .replace(/[^0-9,-]/g, '')
        .replace(',', '.');
    return parseFloat(cleanedValue) || 0;
};

export const maskPhoneNumber = (phone) => {
    if (!phone) return null;
    const cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.length === 11) {
        const ddd = cleaned.substring(0, 2);
        const lastFour = cleaned.substring(7);
        return `(${ddd}) *****-${lastFour}`;
    }
    if (cleaned.length === 10) {
        const ddd = cleaned.substring(0, 2);
        const lastFour = cleaned.substring(6);
        return `(${ddd}) ****-${lastFour}`;
    }
    if (cleaned.length > 4) {
        const lastFour = cleaned.slice(-4);
        return `*****-${lastFour}`;
    }
    return phone;
};

export const calculateItemsValue = (itemsArray) => {
    if (!itemsArray || !Array.isArray(itemsArray)) return 0;
    return itemsArray.reduce((total, item) => {
        const price = parseFloat(item.price) || 0;
        return total + price;
    }, 0);
};

// --- UI HELPERS ---

export const toggleLoading = (btnElement, isLoading, loadingText = 'Aguarde...') => {
    if (!btnElement) return;
    if (isLoading) {
        if (!btnElement.dataset.originalText) {
            btnElement.dataset.originalText = btnElement.innerHTML;
        }
        btnElement.disabled = true;
        btnElement.style.minWidth = btnElement.offsetWidth + 'px';
        btnElement.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText}`;
        btnElement.classList.add('opacity-75', 'cursor-not-allowed');
    } else {
        btnElement.disabled = false;
        btnElement.style.minWidth = '';
        btnElement.innerHTML = btnElement.dataset.originalText || 'Confirmar';
        btnElement.classList.remove('opacity-75', 'cursor-not-allowed');
    }
};

export const showToast = (message, isError = false) => {
    try {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.className = 'fixed bottom-5 right-5 p-4 rounded-lg shadow-lg text-white z-[9999] transition-opacity duration-300 ease-out font-bold flex items-center';
        toast.style.backgroundColor = isError ? '#ef4444' : '#22c55e'; // Red-500 ou Green-500
        toast.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-circle' : 'fa-check-circle'} mr-2"></i> ${message}`;
        
        toast.style.opacity = '0'; 
        document.body.appendChild(toast);
        
        requestAnimationFrame(() => { toast.style.opacity = '1'; });
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300); 
        }, 3000); 
    } catch (e) { console.error("Falha ao mostrar toast:", e); alert(message); }
};