// --- SERVICES/WOOCOMMERCESERVICE.JS (VERSÃO FINAL OTIMIZADA) ---
// Implementa Paginação, Busca Sob Demanda e Cache Inteligente

import { functions } from "/services/firebaseService.js"; 
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// --- ESTADO LOCAL (CACHE) ---
let WOOCOMMERCE_PRODUCTS = [];
let WOOCOMMERCE_CATEGORIES = [];

// Expor getters para acessar o cache atual
export const getProducts = () => WOOCOMMERCE_PRODUCTS;
export const getCategories = () => WOOCOMMERCE_CATEGORIES;

// --- FUNÇÃO PROXY (HELPER) ---
const callWooProxy = async (data) => {
    try {
        if (!functions) throw new Error("Firebase Functions não inicializado.");
        
        const callWooApi = httpsCallable(functions, 'proxyWooCommerce');
        console.log(`[WooProxy] ${data.method} ${data.endpoint}`);
        
        const result = await callWooApi(data);
        return result.data;
    } catch (error) {
        console.error(`[WooProxy] Erro:`, error);
        throw new Error(error.message || "Erro na comunicação com WooCommerce.");
    }
};

// ==================================================================
//               BUSCA DE PRODUTOS (PAGINADA & OTIMIZADA)
// ==================================================================

/**
 * Busca produtos com paginação e filtro de texto diretamente da API.
 * @param {number} page - Número da página (1, 2, 3...)
 * @param {string} search - Termo de busca (opcional)
 * @param {string} category - ID da categoria (opcional - filtro server-side)
 * @param {boolean} append - Se true, adiciona aos existentes (Load More). Se false, substitui a lista.
 */
export const fetchWooCommerceProducts = async (page = 1, search = '', category = '', append = false) => {
    try {
        // Constrói a query string para a API do Woo
        let endpoint = `products?per_page=50&page=${page}&status=publish`;
        
        if (search) {
            endpoint += `&search=${encodeURIComponent(search)}`;
        }
        
        // Filtra por categoria na API apenas se não for uma categoria especial (All ou Top10)
        if (category && category !== 'all' && category !== 'top10') {
            endpoint += `&category=${category}`;
        }

        const products = await callWooProxy({
            method: 'GET',
            endpoint: endpoint
        });

        const mappedProducts = products.map(p => ({
            id: p.id,
            name: p.name,
            price: parseFloat(p.price || 0),
            regular_price: parseFloat(p.regular_price || 0),
            // Pega a primeira categoria ou 'uncategorized'
            category: p.categories && p.categories.length > 0 ? p.categories[0].slug : 'uncategorized',
            categoryId: p.categories && p.categories.length > 0 ? p.categories[0].id : null,
            // Tenta pegar o setor do meta_data, senão define padrão
            sector: getMetaValue(p.meta_data, 'sector') || 'cozinha',
            status: p.status,
            description: p.description || '',
            image: (p.images && p.images.length > 0) ? p.images[0].src : 'https://placehold.co/600x400/1f2937/d1d5db?text=Produto'
        }));

        if (append) {
            // MODO CARREGAR MAIS: Adiciona ao final, evitando duplicatas por ID
            const newIds = new Set(mappedProducts.map(p => p.id));
            WOOCOMMERCE_PRODUCTS = [
                ...WOOCOMMERCE_PRODUCTS.filter(p => !newIds.has(p.id)),
                ...mappedProducts
            ];
        } else {
            // MODO SUBSTITUIÇÃO: Troca a lista inteira (nova busca ou filtro)
            WOOCOMMERCE_PRODUCTS = mappedProducts;
        }

        return mappedProducts; // Retorna apenas o lote atual para controle (saber se acabou)

    } catch (error) {
        console.error("[Woo] Falha ao buscar produtos:", error.message);
        return [];
    }
};

// Helper para extrair valores de meta_data do array do Woo
const getMetaValue = (metaData, key) => {
    if (!metaData || !Array.isArray(metaData)) return null;
    const meta = metaData.find(m => m.key === key);
    return meta ? meta.value : null;
};

// ==================================================================
//               CATEGORIAS (MANTIDO)
// ==================================================================

export const fetchWooCommerceCategories = async (callback) => {
   try {
        const categories = await callWooProxy({ 
            method: 'GET', 
            endpoint: 'products/categories?per_page=100' 
        });
        
        const mapped = categories.map(c => ({
            id: c.id, 
            name: c.name, 
            slug: c.slug, 
            parent: c.parent || 0, 
            count: c.count
        }));

        // Categorias Virtuais + Reais
        WOOCOMMERCE_CATEGORIES = [
            { id: 'all', name: 'Novidades', slug: 'all', parent: 0 }, 
            { id: 'top10', name: '🔥 Top 10', slug: 'top10', parent: 0 }, 
            ...mapped
        ];

        if (callback) callback();
        return WOOCOMMERCE_CATEGORIES;

    } catch (error) {
         console.error("[Woo] Erro ao buscar categorias:", error);
         // Fallback mínimo
         WOOCOMMERCE_CATEGORIES = [{ id: 'all', name: 'Novidades', slug: 'all', parent: 0 }];
         return WOOCOMMERCE_CATEGORIES;
    }
};

// ==================================================================
//               PEDIDOS (WOOCOMMERCE)
// ==================================================================

export const createWooCommerceOrder = async (orderSnapshot) => {
    console.log("[Woo] Iniciando criação de pedido para a mesa:", orderSnapshot.tableNumber);

    const groupedItems = (orderSnapshot.sentItems || []).reduce((acc, item) => {
        const key = item.id; 
        if (!acc[key]) {
            acc[key] = { product_id: item.id, name: item.name, quantity: 0, total: 0 };
        }
        acc[key].quantity++;
        acc[key].total += (item.price || 0);
        return acc;
    }, {});

    const line_items = Object.values(groupedItems).map(group => ({
        product_id: group.product_id,
        quantity: group.quantity,
        subtotal: (group.total || 0).toFixed(2).toString()
    }));

    if (line_items.length === 0) {
        throw new Error("A conta não possui itens enviados para registrar no WooCommerce.");
    }

    const payments = (orderSnapshot.payments || []);
    const payment_method_title = payments.length > 0
        ? payments.map(p => `${p.method} (${p.value})`).join(', ')
        : 'PDV Local';
    
    const finalBillTotal = orderSnapshot.total ? parseFloat(orderSnapshot.total) : 0;

    const customerData = {};
    if (orderSnapshot.clientName) {
        customerData.billing = {
            first_name: orderSnapshot.clientName.split(' ')[0],
            last_name: orderSnapshot.clientName.split(' ').slice(1).join(' ') || 'PDV',
        };
    }

    const orderPayload = {
        payment_method: "bacs", // Transferência bancária (placeholder padrão para PDV)
        payment_method_title: payment_method_title,
        set_paid: true,
        status: "completed",
        total: finalBillTotal.toFixed(2).toString(), 
        line_items: line_items,
        ...customerData,
        customer_note: `Pedido do PDV - Mesa ${orderSnapshot.tableNumber || 'N/A'}.`
    };

    const createdOrder = await callWooProxy({
        method: 'POST',
        endpoint: 'orders',
        payload: orderPayload
    });

    console.log("[Woo] Pedido criado com sucesso! ID:", createdOrder.id);
    return createdOrder;
};


// ==================================================================
//               CRUD DE PRODUTOS (INTEGRADO AO CACHE)
// ==================================================================

export const createWooProduct = async (productData) => {
    console.log("[Woo] Criando produto:", productData);
    const result = await callWooProxy({
        method: 'POST',
        endpoint: 'products',
        payload: productData
    });
    // Recarrega a primeira página para mostrar o novo item
    await fetchWooCommerceProducts(1, '', '', false); 
    return result;
};

export const updateWooProduct = async (id, productData) => {
    console.log("[Woo] Atualizando produto:", id);
    const result = await callWooProxy({
        method: 'PUT',
        endpoint: `products/${id}`,
        payload: productData
    });
    // Recarrega para refletir a edição
    await fetchWooCommerceProducts(1, '', '', false);
    return result;
};

export const deleteWooProduct = async (id, force = false) => {
    console.log("[Woo] Excluindo produto:", id);
    const result = await callWooProxy({
        method: 'DELETE',
        endpoint: `products/${id}?force=${force}` 
    });
    await fetchWooCommerceProducts(1, '', '', false);
    return result;
};

// ==================================================================
//               CRUD DE CATEGORIAS
// ==================================================================

export const createWooCategory = async (name, parentId = 0) => {
    const result = await callWooProxy({
        method: 'POST',
        endpoint: 'products/categories',
        payload: { name: name, parent: parentId }
    });
    await fetchWooCommerceCategories();
    return result;
};

export const updateWooCategory = async (id, data) => {
    const result = await callWooProxy({
        method: 'PUT',
        endpoint: `products/categories/${id}`,
        payload: data
    });
    await fetchWooCommerceCategories();
    return result;
};

export const deleteWooCategory = async (id) => {
    const result = await callWooProxy({
        method: 'DELETE',
        endpoint: `products/categories/${id}?force=true`
    });
    await fetchWooCommerceCategories();
    return result;
};

// ==================================================================
//               SINCRONIZAÇÃO MANUAL
// ==================================================================

export const syncWithWooCommerce = async () => {
    console.log("[Sync] Solicitando sincronização...");
    
    if (!functions) throw new Error("Firebase Functions indisponível.");

    const syncFunc = httpsCallable(functions, 'syncProductsFromWoo');
    const result = await syncFunc();
    const data = result.data;
    
    if (data.success) {
        // Se sincronizou com sucesso, reseta o cache local para a página 1
        await fetchWooCommerceProducts(1, '', '', false); 
        await fetchWooCommerceCategories();
    }
    return data;
};