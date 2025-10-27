// --- SERVICES/WOOCOMMERCESERVICE.JS ---

// Chaves de Autenticação (Novas)// --- SERVICES/WOOCOMMERCESERVICE.JS ---
// NOVO IMPORT (necessário para calcular totais)
import { getNumericValueFromCurrency } from "/utils.js"; 

// Chaves de Autenticação (Novas)
const WOOCOMMERCE_URL = 'https://nossotempero.fatormd.com';
const CONSUMER_KEY = 'ck_4dacda97b4e7bfbc4afe1c00902770718115a044';
const CONSUMER_SECRET = 'cs_4ac0b6b050ea25eb8457013551e4cdd926e3227f';


const fetchWooCommerceData = async (endpoint) => {
    const querySeparator = endpoint.includes('?') ? '&' : '?';
    const url = `${WOOCOMMERCE_URL}/wp-json/wc/v3/${endpoint}${querySeparator}consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorBody = await response.text(); 
            console.error(`Erro ao buscar dados do WooCommerce (${endpoint}):`, errorBody);
            throw new Error(`Erro do WooCommerce: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Falha ao conectar à API do WooCommerce (${endpoint}):`, error);
        // Retorna um array vazio em caso de falha de conexão para evitar quebrar o app
        return []; 
    }
};

// ==================================================================
//               NOVAS FUNÇÕES (POST PARA WOOCOMMERCE)
// ==================================================================

/**
 * Helper genérico para enviar dados (POST) para o WooCommerce.
 * Usa o mesmo método de autenticação (query string) do seu fetchWooCommerceData.
 */
const postWooCommerceData = async (endpoint, data) => {
    const url = `${WOOCOMMERCE_URL}/wp-json/wc/v3/${endpoint}?consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const responseBody = await response.json(); // Tenta ler o corpo da resposta

        if (!response.ok) {
            console.error(`Erro ao ENVIAR dados para o WooCommerce (${endpoint}):`, responseBody);
            // Tenta extrair a mensagem de erro específica do WooCommerce
            const errorMessage = responseBody.message || `Erro do WooCommerce: ${response.status}`;
            throw new Error(errorMessage);
        }
        return responseBody; // Retorna a resposta (ex: o pedido criado)
    } catch (error) {
        console.error(`Falha ao conectar à API do WooCommerce (POST ${endpoint}):`, error);
        throw error; // Re-lança o erro para ser pego pelo controller
    }
};

/**
 * Formata e envia o pedido finalizado do PDV para o WooCommerce.
 */
export const createWooCommerceOrder = async (orderSnapshot) => {
    console.log("[Woo] Iniciando criação de pedido para a mesa:", orderSnapshot.tableNumber);
    
    // 1. Agrupar Itens (Formato line_items)
    // O 'sentItems' é uma lista flat, precisamos agrupar por ID
    const groupedItems = (orderSnapshot.sentItems || []).reduce((acc, item) => {
        const key = item.id; // product_id
        if (!acc[key]) {
            // Nota: O product_id DEVE ser o ID do produto no WooCommerce
            acc[key] = { product_id: item.id, name: item.name, quantity: 0, total: 0 };
        }
        acc[key].quantity++;
        acc[key].total += (item.price || 0);
        return acc;
    }, {});

    const line_items = Object.values(groupedItems).map(group => ({
        product_id: group.product_id,
        quantity: group.quantity,
        // O WooCommerce recalcula o total, mas podemos enviar o subtotal
        subtotal: group.total.toFixed(2).toString() 
    }));

    if (line_items.length === 0) {
        throw new Error("A conta não possui itens (sentItems) para enviar ao WooCommerce.");
    }

    // 2. Formatar Pagamentos
    const payments = (orderSnapshot.payments || []);
    const payment_method_title = payments.length > 0 
        ? payments.map(p => `${p.method} (${p.value})`).join(', ') // Ex: "Pix (R$ 50,00), Crédito (R$ 20,00)"
        : 'PDV Local';
    const totalPaid = payments.reduce((sum, p) => sum + getNumericValueFromCurrency(p.value), 0);

    // 3. Formatar Cliente (se existir)
    const customerData = {};
    if (orderSnapshot.clientName) {
        customerData.billing = {
            first_name: orderSnapshot.clientName.split(' ')[0],
            last_name: orderSnapshot.clientName.split(' ').slice(1).join(' ') || 'PDV',
            // (idealmente, você salvaria email e telefone no snapshot também)
            // email: orderSnapshot.clientEmail || '',
            // phone: orderSnapshot.clientPhone || '',
        };
    }

    // 4. Montar Payload Final do Pedido
    const orderPayload = {
        payment_method: "bacs", // (Default, ex: "Transferência". Pode ser qualquer slug)
        payment_method_title: payment_method_title,
        set_paid: true, // Define o pedido como pago
        status: "completed", // Define o pedido como concluído
        total: totalPaid.toFixed(2).toString(), // O total que foi pago
        line_items: line_items,
        ...customerData, // Adiciona dados de faturamento se existirem
        customer_note: `Pedido do PDV - Mesa ${orderSnapshot.tableNumber || 'N/A'}.`
    };

    console.log("[Woo] Enviando payload:", orderPayload);

    // 5. Enviar o Pedido
    try {
        const createdOrder = await postWooCommerceData('orders', orderPayload);
        console.log("[Woo] Pedido criado com sucesso! ID:", createdOrder.id);
        return createdOrder; // Sucesso
    } catch (error) {
        console.error("[Woo] Falha ao criar pedido:", error.message);
        throw new Error(`Falha no WooCommerce: ${error.message}`);
    }
};
// ==================================================================
//               FIM DAS NOVAS FUNÇÕES
// ==================================================================

let WOOCOMMERCE_PRODUCTS = [];
let WOOCOMMERCE_CATEGORIES = []; // Variável Correta

export const getProducts = () => WOOCOMMERCE_PRODUCTS;
export const getCategories = () => WOOCOMMERCE_CATEGORIES; // CORRIGIDO: Era WOOCOMMERCE_CATEGES


export const fetchWooCommerceProducts = async (renderMenuCallback) => {
    const products = await fetchWooCommerceData('products?per_page=100');
    WOOCOMMERCE_PRODUCTS = products.map(p => ({
        id: p.id,
        name: p.name,
        price: parseFloat(p.price),
        category: p.categories.length > 0 ? p.categories[0].slug : 'uncategorized',
        sector: 'cozinha'
    }));
    if (renderMenuCallback) renderMenuCallback();
    return WOOCOMMERCE_PRODUCTS; // Garante que a promessa resolva com o valor
};

export const fetchWooCommerceCategories = async (renderCategoryFiltersCallback) => {
    const categories = await fetchWooCommerceData('products/categories');
    WOOCOMMERCE_CATEGORIES = [{ id: 'all', name: 'Todos', slug: 'all' }, ...categories.map(c => ({ id: c.id, name: c.name, slug: c.slug }))];
    if (renderCategoryFiltersCallback) renderCategoryFiltersCallback();
    return WOOCOMMERCE_CATEGORIES; // Garante que a promessa resolva com o valor
};
const WOOCOMMERCE_URL = 'https://nossotempero.fatormd.com';
const CONSUMER_KEY = 'ck_4dacda97b4e7bfbc4afe1c00902770718115a044';
const CONSUMER_SECRET = 'cs_4ac0b6b050ea25eb8457013551e4cdd926e3227f';


const fetchWooCommerceData = async (endpoint) => {
    const querySeparator = endpoint.includes('?') ? '&' : '?';
    const url = `${WOOCOMMERCE_URL}/wp-json/wc/v3/${endpoint}${querySeparator}consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorBody = await response.text(); 
            console.error(`Erro ao buscar dados do WooCommerce (${endpoint}):`, errorBody);
            throw new Error(`Erro do WooCommerce: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Falha ao conectar à API do WooCommerce (${endpoint}):`, error);
        // Retorna um array vazio em caso de falha de conexão para evitar quebrar o app
        return []; 
    }
};

let WOOCOMMERCE_PRODUCTS = [];
let WOOCOMMERCE_CATEGORIES = []; // Variável Correta

export const getProducts = () => WOOCOMMERCE_PRODUCTS;
export const getCategories = () => WOOCOMMERCE_CATEGORIES; // CORRIGIDO: Era WOOCOMMERCE_CATEGES


export const fetchWooCommerceProducts = async (renderMenuCallback) => {
    const products = await fetchWooCommerceData('products?per_page=100');
    WOOCOMMERCE_PRODUCTS = products.map(p => ({
        id: p.id,
        name: p.name,
        price: parseFloat(p.price),
        category: p.categories.length > 0 ? p.categories[0].slug : 'uncategorized',
        sector: 'cozinha'
    }));
    if (renderMenuCallback) renderMenuCallback();
    return WOOCOMMERCE_PRODUCTS; // Garante que a promessa resolva com o valor
};

export const fetchWooCommerceCategories = async (renderCategoryFiltersCallback) => {
    const categories = await fetchWooCommerceData('products/categories');
    WOOCOMMERCE_CATEGORIES = [{ id: 'all', name: 'Todos', slug: 'all' }, ...categories.map(c => ({ id: c.id, name: c.name, slug: c.slug }))];
    if (renderCategoryFiltersCallback) renderCategoryFiltersCallback();
    return WOOCOMMERCE_CATEGORIES; // Garante que a promessa resolva com o valor
};
