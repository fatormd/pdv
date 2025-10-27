// --- SERVICES/WOOCOMMERCESERVICE.JS ---
import { getNumericValueFromCurrency } from "/utils.js";
// NOVOS IMPORTS
import { functions } from "/services/firebaseService.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";


// ==================================================================
//               REMOVIDO (CHAVES DE API E FETCH DIRETO)
// ==================================================================


// ==================================================================
//               NOVA FUNÇÃO PROXY
// ==================================================================

// Inicializa a referência para a Cloud Function que criamos
// O nome 'proxyWooCommerce' DEVE ser idêntico ao 'exports.proxyWooCommerce' no seu functions/index.js
const callWooApi = httpsCallable(functions, 'proxyWooCommerce');

/**
 * Helper genérico para chamar a Cloud Function.
 * 'data' deve ser { method: 'GET'|'POST', endpoint: '...', payload: {...} }
 */
const callWooProxy = async (data) => {
    try {
        console.log(`[WooProxy] Chamando função com:`, data);
        const result = await callWooApi(data);
        // A Cloud Function retorna um objeto { data: ... }
        // então pegamos o 'data' de dentro dele.
        return result.data;
    } catch (error) {
        console.error(`[WooProxy] Erro ao chamar a Cloud Function '${data.endpoint}':`, error);
        // Tenta extrair detalhes do erro da HttpsError
        const details = error.details || error.message;
        throw new Error(`Erro na Cloud Function: ${details}`); // Re-lança o erro com mais detalhes
    }
};


// ==================================================================
//               FUNÇÕES ANTIGAS, REESCRITAS PARA USAR O PROXY
// ==================================================================

/**
 * Formata e envia o pedido finalizado do PDV para o WooCommerce,
 * AGORA usando a Cloud Function segura.
 */
export const createWooCommerceOrder = async (orderSnapshot) => {
    console.log("[Woo] Iniciando criação de pedido para a mesa:", orderSnapshot.tableNumber);

    // 1. Agrupar Itens (Lógica local mantida)
    const groupedItems = (orderSnapshot.sentItems || []).reduce((acc, item) => {
        const key = item.id; // product_id
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
        subtotal: group.total.toFixed(2).toString()
    }));

    if (line_items.length === 0) {
        // Correção: Não envia se não há itens *enviados* (sentItems)
        console.warn("[Woo] Nenhum item na lista 'sentItems'. Pedido para Woo cancelado.");
        throw new Error("A conta não possui itens enviados (sentItems) para registrar no WooCommerce.");
    }

    // 2. Formatar Pagamentos (Lógica local mantida)
    const payments = (orderSnapshot.payments || []);
    const payment_method_title = payments.length > 0
        ? payments.map(p => `${p.method} (${p.value})`).join(', ')
        : 'PDV Local';
    const totalPaid = payments.reduce((sum, p) => sum + getNumericValueFromCurrency(p.value), 0);

    // 3. Formatar Cliente (Lógica local mantida)
    const customerData = {};
    if (orderSnapshot.clientName) {
        customerData.billing = {
            first_name: orderSnapshot.clientName.split(' ')[0],
            last_name: orderSnapshot.clientName.split(' ').slice(1).join(' ') || 'PDV',
        };
    }

    // 4. Montar Payload Final do Pedido (Lógica local mantida)
    const orderPayload = {
        payment_method: "bacs", // Slug de um método existente (pode ser "cod" - Cash on Delivery)
        payment_method_title: payment_method_title,
        set_paid: true,
        status: "completed",
        // Correção: Usar o total PAGO, não necessariamente o total da conta (caso haja troco ou erro)
        total: totalPaid.toFixed(2).toString(), 
        line_items: line_items,
        ...customerData,
        customer_note: `Pedido do PDV - Mesa ${orderSnapshot.tableNumber || 'N/A'}.`
    };

    console.log("[Woo] Enviando payload para Cloud Function:", orderPayload);

    // 5. Enviar o Pedido (AGORA via proxy)
    try {
        // Chama a Cloud Function
        const createdOrder = await callWooProxy({
            method: 'POST',
            endpoint: 'orders',
            payload: orderPayload
        });

        console.log("[Woo] Pedido criado com sucesso! ID:", createdOrder.id);
        return createdOrder; // Sucesso
    } catch (error) {
        console.error("[Woo] Falha ao criar pedido (via proxy):", error.message);
        // Propaga o erro para o paymentController tratar
        throw new Error(`Falha no WooCommerce (via proxy): ${error.message}`); 
    }
};


let WOOCOMMERCE_PRODUCTS = [];
let WOOCOMMERCE_CATEGORIES = [];

export const getProducts = () => WOOCOMMERCE_PRODUCTS;
export const getCategories = () => WOOCOMMERCE_CATEGORIES;


/**
 * Busca produtos, AGORA usando a Cloud Function
 */
export const fetchWooCommerceProducts = async (renderMenuCallback) => {
    try {
        // Chama a Cloud Function
        const products = await callWooProxy({
            method: 'GET',
            endpoint: 'products?per_page=100' // Ajuste per_page se necessário
        });

        WOOCOMMERCE_PRODUCTS = products.map(p => ({
            id: p.id,
            name: p.name,
            price: parseFloat(p.price || 0), // Garante que preço seja número
            category: p.categories && p.categories.length > 0 ? p.categories[0].slug : 'uncategorized',
            sector: 'cozinha' // Você pode buscar isso de um custom field se quiser
        }));
        if (renderMenuCallback) renderMenuCallback();
        return WOOCOMMERCE_PRODUCTS;
    } catch (error) {
        console.error("[Woo] Falha ao buscar produtos (via proxy):", error.message);
        alert(`Erro ao carregar produtos: ${error.message}`);
        return []; // Retorna array vazio em caso de erro
    }
};

/**
 * Busca categorias, AGORA usando a Cloud Function
 */
export const fetchWooCommerceCategories = async (renderCategoryFiltersCallback) => {
   try {
        // Chama a Cloud Function
        const categories = await callWooProxy({
            method: 'GET',
            endpoint: 'products/categories?per_page=100' // Garante buscar todas
        });

        WOOCOMMERCE_CATEGORIES = [{ id: 'all', name: 'Todos', slug: 'all' }, ...categories
            .filter(c => c.count > 0) // Opcional: Filtra categorias sem produtos
            .map(c => ({ id: c.id, name: c.name, slug: c.slug }))
        ];
        if (renderCategoryFiltersCallback) renderCategoryFiltersCallback();
        return WOOCOMMERCE_CATEGORIES;
    } catch (error) {
         console.error("[Woo] Falha ao buscar categorias (via proxy):", error.message);
         alert(`Erro ao carregar categorias: ${error.message}`);
         return [{ id: 'all', name: 'Todos', slug: 'all' }]; // Retorna pelo menos 'Todos'
    }
};
