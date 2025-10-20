// --- CONTROLLERS/ORDERCONTROLLER.JS (Painel 2) ---
import { getProducts } from "../services/wooCommerceService.js";

// Função para renderizar o cardápio (Apenas placeholder funcional)
export const renderMenu = () => { 
    const menuItemsGrid = document.getElementById('menuItemsGrid');
    if (!menuItemsGrid) return;
    
    const products = getProducts();
    if (products.length === 0) {
        menuItemsGrid.innerHTML = `<div class="col-span-full text-center p-6 text-red-500 italic">Erro ao carregar produtos. Verifique a API do WooCommerce.</div>`;
        return;
    }
    
    menuItemsGrid.innerHTML = products.map(product => `
        <div class="product-card bg-white p-4 rounded-xl shadow-md cursor-pointer hover:shadow-lg transition duration-150 border border-gray-200"
            data-product='${JSON.stringify(product).replace(/'/g, '&#39;')}'
            onclick='window.addItemToSelection(${JSON.stringify(product).replace(/'/g, '&#39;')})'>
            <h4 class="font-bold text-base text-gray-800">${product.name}</h4>
            <p class="text-xs text-gray-500">${product.category} (${product.sector})</p>
            <div class="flex justify-between items-center mt-2">
                <span class="font-bold text-lg text-indigo-700">R$ ${product.price.toFixed(2).replace('.', ',')}</span>
                <button class="add-item-btn add-icon-btn bg-green-500 text-white hover:bg-green-600 transition">
                    <i class="fas fa-plus text-lg"></i>
                </button>
            </div>
        </div>
    `).join('');
};

export const renderOrderScreen = () => { console.log('OrderController: Renderizando Itens Selecionados (Placeholder).'); };
export const handleSendSelectedItems = () => { alert('Função de Envio KDS (Marcha) em desenvolvimento.'); };
