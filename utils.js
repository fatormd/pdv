// --- UTILS.JS (CENTRALIZADO & SEGURO) ---

export const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

export const formatElapsedTime = (startTime) => {
    if (!startTime) return '00:00';
    const now = Date.now();
    const diff = now - startTime;
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// Remove caracteres não numéricos de telefone
export const maskPhoneNumber = (phone) => {
    if (!phone) return '';
    return phone.replace(/\D/g, '').replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
};

// Helper para converter string "R$ 10,00" em float 10.00
export const getNumericValueFromCurrency = (currencyString) => {
    if (!currencyString) return 0;
    if (typeof currencyString === 'number') return currencyString;
    return parseFloat(currencyString.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
};

export const calculateItemsValue = (items) => {
    if (!items || !Array.isArray(items)) return 0;
    return items.reduce((sum, item) => sum + (item.price || 0), 0);
};

// --- SHOW TOAST (NOTIFICAÇÃO FLUTUANTE) ---
export const showToast = (message, isError = false) => {
    const existing = document.getElementById('toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.className = `fixed top-5 right-5 px-6 py-4 rounded-lg shadow-2xl z-[100] transform transition-all duration-300 translate-y-[-100%] opacity-0 flex items-center ${
        isError ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
    }`;
    
    toast.innerHTML = `
        <i class="fas ${isError ? 'fa-exclamation-triangle' : 'fa-check-circle'} mr-3 text-xl"></i>
        <span class="font-bold text-sm">${message}</span>
    `;

    document.body.appendChild(toast);

    // Animação de entrada
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-[-100%]', 'opacity-0');
    });

    // Auto-remove
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-[-100%]');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
};

// --- TOGGLE LOADING (PROTEÇÃO CONTRA DUPLO CLIQUE) ---
export const toggleLoading = (btnElement, isLoading, loadingText = 'Processando...') => {
    if (!btnElement) return;

    if (isLoading) {
        // Proteção: Só salva o texto original se ele ainda não foi salvo
        // (Isso evita que salve o ícone de spinner como texto original em cliques rápidos)
        if (!btnElement.dataset.originalText) {
            btnElement.dataset.originalText = btnElement.innerHTML;
        }
        
        // Define largura fixa para evitar "pulo" no layout
        btnElement.style.width = `${btnElement.offsetWidth}px`;
        
        btnElement.disabled = true;
        btnElement.innerHTML = `<i class="fas fa-spinner fa-spin animate-spin"></i> ${loadingText}`;
        btnElement.classList.add('opacity-75', 'cursor-not-allowed');
    } else {
        btnElement.disabled = false;
        
        // Restaura texto original
        if (btnElement.dataset.originalText) {
            btnElement.innerHTML = btnElement.dataset.originalText;
        } else {
            btnElement.innerHTML = 'Confirmar'; // Fallback
        }
        
        btnElement.style.width = ''; // Reseta largura
        btnElement.classList.remove('opacity-75', 'cursor-not-allowed');
    }
};