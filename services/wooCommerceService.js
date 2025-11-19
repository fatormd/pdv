// --- SERVICES/WOOCOMMERCESERVICE.JS (COMPLETO E ATUALIZADO) ---
import { getNumericValueFromCurrency } from "/utils.js";
import { functions } from "/services/firebaseService.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// ==================================================================
//               FUNÇÃO PROXY (HELPER GERAL)
// ==================================================================

/**
 * Helper genérico para chamar a Cloud Function 'proxyWooCommerce'.
 * 'data' deve ser { method: 'GET'|'POST'|'PUT'|'DELETE', endpoint: '...', payload: {...} }
 */
const callWooProxy = async (data) => {
    try {
        if (!functions) {
            throw new Error("Serviço Firebase Functions não inicializado. Verifique sua conexão.");
        }
        
        // Inicializa a chamada para a função 'proxyWooCommerce'
        const callWooApi = httpsCallable(functions, 'proxyWooCommerce');

        console.log(`[WooProxy] Chamando: ${data.method} ${data.endpoint}`);
        const result = await callWooApi(data);
        
        // A Cloud Function retorna um objeto { data: ... }
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

/**
 * Formata e envia o pedido finalizado do PDV para o WooCommerce.
 */
export const createWooCommerceOrder = async (orderSnapshot) => {
    console.log("[Woo] Iniciando criação de pedido para a mesa:", orderSnapshot.tableNumber);

    // 1. Agrupar Itens
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
        subtotal: (group.total || 0).toFixed(2).toString()
    }));

    if (line_items.length === 0) {
        console.warn("[Woo] Nenhum item na lista 'sentItems'. Pedido para Woo cancelado.");
        throw new Error("A conta não possui itens enviados para registrar no WooCommerce.");
    }

    // 2. Formatar Pagamentos
    const payments = (orderSnapshot.payments || []);
    const payment_method_title = payments.length > 0
        ? payments.map(p => `${p.method} (${p.value})`).join(', ')
        : 'PDV Local';
    
    // Usa o total FINAL da conta
    const finalBillTotal = orderSnapshot.total ? parseFloat(orderSnapshot.total) : 0;

    // 3. Formatar Cliente
    const customerData = {};
    if (orderSnapshot.clientName) {
        customerData.billing = {
            first_name: orderSnapshot.clientName.split(' ')[0],
            last_name: orderSnapshot.clientName.split(' ').slice(1).join(' ') || 'PDV',
        };
    }

    // 4. Montar Payload
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

    // 5. Enviar o Pedido via Proxy
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

// Variáveis de Cache Local
let WOOCOMMERCE_PRODUCTS = [];
let WOOCOMMERCE_CATEGORIES = [];

export const getProducts = () => WOOCOMMERCE_PRODUCTS;
export const getCategories = () => WOOCOMMERCE_CATEGORIES;


/**
 * Busca produtos via Proxy e atualiza o cache local.
 */
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
            regular_price: parseFloat(p.regular_price || 0), // Útil para edição
            category: p.categories && p.categories.length > 0 ? p.categories[0].slug : 'uncategorized',
            categoryId: p.categories && p.categories.length > 0 ? p.categories[0].id : null, // Útil para edição
            sector: 'cozinha', 
            status: p.status, // 'publish', 'draft', etc.
            description: p.description || '',
            // Usa a primeira imagem ou um placeholder
            image: (p.images && p.images.length > 0 && p.images[0].src) ? p.images[0].src : 'https://placehold.co/600x400/1f2937/d1d5db?text=Produto'
        }));

        if (renderMenuCallback) renderMenuCallback();
        return WOOCOMMERCE_PRODUCTS;

    } catch (error) {
        console.error("[Woo] Falha ao buscar produtos:", error.message);
        alert(`Erro ao carregar produtos: ${error.message}`);
        return [];
    }
};

/**
 * Busca categorias via Proxy e atualiza o cache local.
 */
export const fetchWooCommerceCategories = async (renderCategoryFiltersCallback) => {
   try {
        const categories = await callWooProxy({
            method: 'GET',
            endpoint: 'products/categories?per_page=100'
        });

        // Adiciona categoria "Novidades" (All) manualmente e mapeia as outras
        WOOCOMMERCE_CATEGORIES = [{ id: 'all', name: 'Novidades', slug: 'all' }, ...categories
            .map(c => ({ id: c.id, name: c.name, slug: c.slug }))
        ];

        if (renderCategoryFiltersCallback) renderCategoryFiltersCallback();
        return WOOCOMMERCE_CATEGORIES;

    } catch (error) {
         console.error("[Woo] Falha ao buscar categorias:", error.message);
         alert(`Erro ao carregar categorias: ${error.message}`);
         return [{ id: 'all', name: 'Novidades', slug: 'all' }];
    }
};


// ==================================================================
//               GESTÃO DE PRODUTOS (CRUD)
// ==================================================================

/**
 * Cria um novo produto no WooCommerce.
 */
export const createWooProduct = async (productData) => {
    console.log("[Woo] Criando produto:", productData);
    const result = await callWooProxy({
        method: 'POST',
        endpoint: 'products',
        payload: productData
    });
    // Atualiza cache local após criar
    await fetchWooCommerceProducts(); 
    return result;
};

/**
 * Atualiza um produto existente no WooCommerce.
 */
export const updateWooProduct = async (id, productData) => {
    console.log("[Woo] Atualizando produto:", id, productData);
    const result = await callWooProxy({
        method: 'PUT',
        endpoint: `products/${id}`,
        payload: productData
    });
    // Atualiza cache local após editar
    await fetchWooCommerceProducts();
    return result;
};

/**
 * Exclui (move para lixeira) ou apaga definitivamente um produto.
 */
export const deleteWooProduct = async (id, force = false) => {
    console.log("[Woo] Excluindo produto:", id, "Force:", force);
    const result = await callWooProxy({
        method: 'DELETE',
        endpoint: `products/${id}?force=${force}` // true = apagar permanentemente, false = lixeira
    });
    // Atualiza cache local após excluir
    await fetchWooCommerceProducts();
    return result;
};


// ==================================================================
//               SINCRONIZAÇÃO (CLOUD FUNCTION DEDICADA)
// ==================================================================

/**
 * Aciona a Cloud Function de Sincronização em massa (syncProductsFromWoo).
 * Chamado pelo botão "Sincronizar" no painel gerencial.
 */
export const syncWithWooCommerce = async () => {
    console.log("[Sync] Solicitando sincronização ao servidor...");
    
    if (!functions) {
        const msg = "Firebase Functions não inicializado. Recarregue a página.";
        console.error(msg);
        alert(msg);
        return;
    }

    try {
        // Chama a função específica de Sync (NÃO usa o callWooProxy pois o nome da function é diferente)
        const syncFunc = httpsCallable(functions, 'syncProductsFromWoo');
        
        // Executa a função
        const result = await syncFunc();
        
        // O resultado vem em result.data
        const data = result.data;
        
        console.log("[Sync] Resultado:", data);
        
        if (data.success) {
            alert(`Sincronização concluída! ${data.count || 0} produtos processados.`);
            // Recarrega a lista visual também
            await fetchWooCommerceProducts(); 
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