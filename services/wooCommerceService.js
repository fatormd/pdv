// --- SERVICES/WOOCOMMERCESERVICE.JS (MANTENDO APENAS PRODUTOS) ---

import { functions } from "/services/firebaseService.js"; 
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// --- ESTADO LOCAL (CACHE) ---
let WOOCOMMERCE_PRODUCTS = [];

export const getProducts = () => WOOCOMMERCE_PRODUCTS;

// --- FUNÇÃO PROXY (HELPER) ---
const callWooProxy = async (data) => {
    try {
        if (!functions) throw new Error("Firebase Functions não inicializado.");
        const callWooApi = httpsCallable(functions, 'proxyWooCommerce');
        const result = await callWooApi(data);
        return result.data;
    } catch (error) {
        console.error(`[WooProxy] Erro:`, error);
        throw new Error(error.message || "Erro na comunicação com WooCommerce.");
    }
};

// ==================================================================
//               BUSCA DE HISTÓRICO
// ==================================================================
export const fetchSalesHistory = async (days = 30) => {
    try {
        const date = new Date();
        date.setDate(date.getDate() - days);
        const afterDate = date.toISOString();
        const orders = await callWooProxy({
            method: 'GET',
            endpoint: `orders?after=${afterDate}&per_page=100&status=completed,processing,on-hold`
        });
        return orders;
    } catch (error) {
        console.error("[Woo] Falha ao buscar histórico:", error);
        return [];
    }
};

// ==================================================================
//               BUSCA DE PRODUTOS
// ==================================================================

export const fetchWooCommerceProducts = async (page = 1, search = '', category = '', append = false) => {
    try {
        let endpoint = `products?per_page=50&page=${page}&status=publish`;
        // Nota: O filtro 'category' aqui é do Woo. Se usarmos setores do Firebase,
        // não passamos category para a API, filtramos no front.
        if (search) endpoint += `&search=${encodeURIComponent(search)}`;
        
        const products = await callWooProxy({ method: 'GET', endpoint: endpoint });

        const mappedProducts = products.map(p => ({
            id: p.id,
            name: p.name,
            price: parseFloat(p.price || 0),
            regular_price: parseFloat(p.regular_price || 0),
            sale_price: parseFloat(p.sale_price || 0),
            on_sale: p.on_sale,
            categories: p.categories || [], 
            category: p.categories && p.categories.length > 0 ? p.categories[0].slug : 'uncategorized',
            categoryId: p.categories && p.categories.length > 0 ? p.categories[0].id : null,
            
            // IMPORTANTE: Mapeamos 'sector' do metadado para filtrar com o Firebase depois
            sector: getMetaValue(p.meta_data, 'sector') || 'cozinha',
            
            status: p.status,
            description: p.description || '',
            image: (p.images && p.images.length > 0) ? p.images[0].src : 'https://placehold.co/600x400/1f2937/d1d5db?text=Produto'
        }));

        if (append) {
            const newIds = new Set(mappedProducts.map(p => p.id));
            WOOCOMMERCE_PRODUCTS = [...WOOCOMMERCE_PRODUCTS.filter(p => !newIds.has(p.id)), ...mappedProducts];
        } else {
            WOOCOMMERCE_PRODUCTS = mappedProducts;
        }

        return mappedProducts;

    } catch (error) {
        console.error("[Woo] Falha ao buscar produtos:", error.message);
        return [];
    }
};

const getMetaValue = (metaData, key) => {
    if (!metaData || !Array.isArray(metaData)) return null;
    const meta = metaData.find(m => m.key === key);
    return meta ? meta.value : null;
};

// MANTEMOS APENAS PARA FINS DE SINCRONIZAÇÃO INTERNA, SE NECESSÁRIO
// MAS NÃO EXPORTAMOS MAIS PARA A UI DO CLIENTE
export const fetchWooCommerceCategories = async () => { return []; }; 

// ... (Restante das funções de criação de pedidos e CRUD mantidas) ...
export const createWooCommerceOrder = async (orderSnapshot) => { const groupedItems = (orderSnapshot.sentItems || []).reduce((acc, item) => { const key = item.id; if (!acc[key]) { acc[key] = { product_id: item.id, name: item.name, quantity: 0, total: 0 }; } acc[key].quantity++; acc[key].total += (item.price || 0); return acc; }, {}); const line_items = Object.values(groupedItems).map(group => ({ product_id: group.product_id, quantity: group.quantity, subtotal: (group.total || 0).toFixed(2).toString() })); if (line_items.length === 0) { throw new Error("A conta não possui itens enviados para registrar no WooCommerce."); } const payments = (orderSnapshot.payments || []); const payment_method_title = payments.length > 0 ? payments.map(p => `${p.method} (${p.value})`).join(', ') : 'PDV Local'; const finalBillTotal = orderSnapshot.total ? parseFloat(orderSnapshot.total) : 0; const customerData = {}; if (orderSnapshot.clientName) { customerData.billing = { first_name: orderSnapshot.clientName.split(' ')[0], last_name: orderSnapshot.clientName.split(' ').slice(1).join(' ') || 'PDV', }; } const orderPayload = { payment_method: "bacs", payment_method_title: payment_method_title, set_paid: true, status: "completed", total: finalBillTotal.toFixed(2).toString(), line_items: line_items, ...customerData, customer_note: `Pedido do PDV - Mesa ${orderSnapshot.tableNumber || 'N/A'}.` }; const createdOrder = await callWooProxy({ method: 'POST', endpoint: 'orders', payload: orderPayload }); return createdOrder; };
export const createWooProduct = async (productData) => { const result = await callWooProxy({ method: 'POST', endpoint: 'products', payload: productData }); await fetchWooCommerceProducts(1, '', '', false); return result; };
export const updateWooProduct = async (id, productData) => { const result = await callWooProxy({ method: 'PUT', endpoint: `products/${id}`, payload: productData }); await fetchWooCommerceProducts(1, '', '', false); return result; };
export const deleteWooProduct = async (id, force = false) => { const result = await callWooProxy({ method: 'DELETE', endpoint: `products/${id}?force=${force}` }); await fetchWooCommerceProducts(1, '', '', false); return result; };
export const createWooCategory = async (name, parentId = 0) => { const result = await callWooProxy({ method: 'POST', endpoint: 'products/categories', payload: { name: name, parent: parentId } }); return result; };
export const updateWooCategory = async (id, data) => { const result = await callWooProxy({ method: 'PUT', endpoint: `products/categories/${id}`, payload: data }); return result; };
export const deleteWooCategory = async (id) => { const result = await callWooProxy({ method: 'DELETE', endpoint: `products/categories/${id}?force=true` }); return result; };
export const syncWithWooCommerce = async () => { if (!functions) throw new Error("Firebase Functions indisponível."); const syncFunc = httpsCallable(functions, 'syncProductsFromWoo'); const result = await syncFunc(); const data = result.data; if (data.success) { await fetchWooCommerceProducts(1, '', '', false); } return data; };