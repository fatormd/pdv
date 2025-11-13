// --- utils.js (COM AS NOVAS FUNÇÕES) ---

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

// =======================================================
// ===== NOVAS FUNÇÕES ADICIONADAS ABAIXO =====
// =======================================================

/**
 * Converte uma string de moeda (ex: "R$ 50,00") para um número (ex: 50.00)
 * Esta função corrige o erro 'getNumericValueFromCurrency'
 */
export const getNumericValueFromCurrency = (currencyString) => {
    if (!currencyString) return 0;
    // 1. Remove "R$", " ", etc.
    // 2. Troca a vírgula decimal brasileira (,) por ponto (.)
    const cleanedValue = String(currencyString)
        .replace(/[^0-9,-]/g, '')
        .replace(',', '.');
        
    return parseFloat(cleanedValue) || 0;
};

/**
 * Mascara um número de telefone, exibindo apenas o DDD e os últimos 4 dígitos.
 * (Esta é a função para o seu pedido de privacidade do staff)
 */
export const maskPhoneNumber = (phone) => {
    if (!phone) return null;
    
    // Limpa qualquer caractere que não seja dígito
    const cleaned = String(phone).replace(/\D/g, '');

    // Celular com 9 dígitos (Ex: 11987654321) - 11 dígitos no total
    if (cleaned.length === 11) {
        const ddd = cleaned.substring(0, 2);
        const lastFour = cleaned.substring(7);
        return `(${ddd}) *****-${lastFour}`;
    }
    
    // Fixo com 8 dígitos (Ex: 1140044004) - 10 dígitos no total
    if (cleaned.length === 10) {
        const ddd = cleaned.substring(0, 2);
        const lastFour = cleaned.substring(6);
        return `(${ddd}) ****-${lastFour}`;
    }

    // Se for um formato inesperado, apenas mostra os últimos 4
    if (cleaned.length > 4) {
        const lastFour = cleaned.slice(-4);
        return `*****-${lastFour}`;
    }
    
    // Se for muito curto, retorna como está (não deve acontecer)
    return phone;
};