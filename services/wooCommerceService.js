// --- SERVICES/WOOCOMMERCESERVICE.JS ---
// VERSÃO FINAL COM GESTÃO DE HIERARQUIA (CATEGORIAS)

import { getNumericValueFromCurrency } from "/utils.js";
import { functions } from "/services/firebaseService.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// ==================================================================
//               FUNÇÃO PROXY (HELPER GERAL)
// ==================================================================

const callWooProxy = async (data) => {
    try {
        if (!functions) {
            throw new Error("Serviço Firebase Functions não inicializado. Verifique sua conexão.");
        }
        
        const callWooApi = httpsCallable(functions, 'proxyWooCommerce');

        console.log(`[WooProxy] Chamando: ${data.method} ${data.endpoint}`);
        const result = await callWooApi(data);
        
        return result.data;
    } catch (error) {
        console.error(`[WooProxy] Erro ao chamar a Cloud Function '${data.endpoint}':`, error);
        const details = error.details || error.message;
        throw new Error(`Erro na Cloud Function: ${details}`);
    }
};


// ==================================================================
//               MÉTODOS EXPORTADOS (PEDIDOS)
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
        console.warn("[Woo] Nenhum item na lista 'sentItems'. Pedido para Woo cancelado.");
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
        payment_method: "bacs",
        payment_method_title: payment_method_title,
        set_paid: true,
        status: "completed",
        total: finalBillTotal.toFixed(2).toString(), 
        line_items: line_items,
        ...customerData,
        customer_note: `Pedido do PDV - Mesa ${orderSnapshot.tableNumber || 'N/A'}.`
    };

    console.log("[Woo] Enviando payload para Cloud Function:", orderPayload);

    try {
        const createdOrder = await callWooProxy({
            method: 'POST',
            endpoint: 'orders',
            payload: orderPayload
        });

        console.log("[Woo] Pedido criado com sucesso! ID:", createdOrder.id);
        return createdOrder;
    } catch (error) {
        console.error("[Woo] Falha ao criar pedido:", error.message);
        throw new Error(`Falha no WooCommerce: ${error.message}`);
    }
};


// ==================================================================
//               CACHE E LEITURA DE DADOS
// ==================================================================

let WOOCOMMERCE_PRODUCTS = [];
let WOOCOMMERCE_CATEGORIES = [];

export const getProducts = () => WOOCOMMERCE_PRODUCTS;
export const getCategories = () => WOOCOMMERCE_CATEGORIES;

export const fetchWooCommerceProducts = async (renderMenuCallback) => {
    try {
        const products = await callWooProxy({
            method: 'GET',
            endpoint: 'products?per_page=100'
        });

        WOOCOMMERCE_PRODUCTS = products.map(p => ({
            id: p.id,
            name: p.name,
            price: parseFloat(p.price || 0),
            regular_price: parseFloat(p.regular_price || 0),
            // Categoria principal (para compatibilidade simples)
            category: p.categories && p.categories.length > 0 ? p.categories[0].slug : 'uncategorized',
            categoryId: p.categories && p.categories.length > 0 ? p.categories[0].id : null,
            sector: 'cozinha', 
            status: p.status,
            description: p.description || '',
            image: (p.images && p.images.length > 0 && p.images[0].src) ? p.images[0].src : 'https://placehold.co/600x400/1f2937/d1d5db?text=Produto'
        }));

        if (renderMenuCallback) renderMenuCallback();
        return WOOCOMMERCE_PRODUCTS;

    } catch (error) {
        console.error("[Woo] Falha ao buscar produtos:", error.message);
        return [];
    }
};

export const fetchWooCommerceCategories = async (renderCategoryFiltersCallback) => {
   try {
        const categories = await callWooProxy({
            method: 'GET',
            endpoint: 'products/categories?per_page=100'
        });

        // MAPEAR ESTRUTURA COM PARENT (HIERARQUIA)
        const mappedCategories = categories.map(c => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            parent: c.parent || 0, // ID do pai (0 se for raiz)
            count: c.count
        }));

        // ADICIONA A CATEGORIA TOP 10 MANUALMENTE (Virtual)
        WOOCOMMERCE_CATEGORIES = [
            { id: 'all', name: 'Novidades', slug: 'all', parent: 0 }, 
            { id: 'top10', name: '🔥 Top 10', slug: 'top10', parent: 0 }, 
            ...mappedCategories
        ];

        if (renderCategoryFiltersCallback) renderCategoryFiltersCallback();
        return WOOCOMMERCE_CATEGORIES;

    } catch (error) {
         console.error("[Woo] Falha ao buscar categorias:", error.message);
         return [{ id: 'all', name: 'Novidades', slug: 'all', parent: 0 }];
    }
};


// ==================================================================
//               GESTÃO DE PRODUTOS (CRUD)
// ==================================================================

export const createWooProduct = async (productData) => {
    console.log("[Woo] Criando produto:", productData);
    const result = await callWooProxy({
        method: 'POST',
        endpoint: 'products',
        payload: productData
    });
    await fetchWooCommerceProducts(); 
    return result;
};

export const updateWooProduct = async (id, productData) => {
    console.log("[Woo] Atualizando produto:", id, productData);
    const result = await callWooProxy({
        method: 'PUT',
        endpoint: `products/${id}`,
        payload: productData
    });
    await fetchWooCommerceProducts();
    return result;
};

export const deleteWooProduct = async (id, force = false) => {
    console.log("[Woo] Excluindo produto:", id, "Force:", force);
    const result = await callWooProxy({
        method: 'DELETE',
        endpoint: `products/${id}?force=${force}` 
    });
    await fetchWooCommerceProducts();
    return result;
};

// ==================================================================
//               GESTÃO DE CATEGORIAS (CRUD HIERÁRQUICO)
// ==================================================================

export const createWooCategory = async (name, parentId = 0) => {
    console.log(`[Woo] Criando categoria: ${name} (Pai: ${parentId})`);
    const result = await callWooProxy({
        method: 'POST',
        endpoint: 'products/categories',
        payload: { 
            name: name,
            parent: parentId
        }
    });
    await fetchWooCommerceCategories();
    return result;
};

export const updateWooCategory = async (id, data) => {
    console.log(`[Woo] Atualizando categoria ${id}:`, data);
    const result = await callWooProxy({
        method: 'PUT',
        endpoint: `products/categories/${id}`,
        payload: data
    });
    await fetchWooCommerceCategories();
    return result;
};

export const deleteWooCategory = async (id) => {
    console.log(`[Woo] Excluindo categoria ${id}`);
    const result = await callWooProxy({
        method: 'DELETE',
        endpoint: `products/categories/${id}?force=true`
    });
    await fetchWooCommerceCategories();
    return result;
};

// ==================================================================
//               SINCRONIZAÇÃO
// ==================================================================

export const syncWithWooCommerce = async () => {
    console.log("[Sync] Solicitando sincronização ao servidor...");
    
    if (!functions) {
        const msg = "Firebase Functions não inicializado. Recarregue a página.";
        console.error(msg);
        alert(msg);
        return;
    }

    try {
        const syncFunc = httpsCallable(functions, 'syncProductsFromWoo');
        const result = await syncFunc();
        const data = result.data;
        
        console.log("[Sync] Resultado:", data);
        
        if (data.success) {
            alert(`Sincronização concluída! ${data.count || 0} produtos processados.`);
            await fetchWooCommerceProducts(); 
            await fetchWooCommerceCategories();
        } else {
            alert(`Aviso da Sincronização: ${data.message}`);
        }
        return data;

    } catch (error) {
        console.error("[Sync] Erro fatal:", error);
        const userMsg = error.message || "Erro desconhecido";
        alert(`Falha na sincronização: ${userMsg}`);
        throw error;
    }
};