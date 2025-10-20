// --- SERVICES/WOOCOMMERCESERVICE.JS ---

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
};

export const fetchWooCommerceCategories = async (renderCategoryFiltersCallback) => {
    const categories = await fetchWooCommerceData('products/categories');
    WOOCOMMERCE_CATEGORIES = [{ id: 'all', name: 'Todos', slug: 'all' }, ...categories.map(c => ({ id: c.id, name: c.name, slug: c.slug }))];
    if (renderCategoryFiltersCallback) renderCategoryFiltersCallback();
};
