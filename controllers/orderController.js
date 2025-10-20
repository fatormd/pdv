// --- CONTROLLERS/ORDERCONTROLLER.JS (Painel 2) ---
import { getProducts } from "../services/wooCommerceService.js";
import { formatCurrency } from "../utils.js";
import { currentTableId } from "../app.js";

// Função para renderizar o cardápio
export const renderMenu = () => { 
    const menuItemsGrid = document.getElementById('menuItemsGrid');
    if (!menuItemsGrid) return;
    
    const products = getProducts();
    if (products.length === 0) {
        menuItemsGrid.innerHTML = `<div class="col-span-full text-center p-6 text-red-500 italic">Erro ao carregar produtos. Verifique a API do WooCommerce.</div>`;
        return;
    }
    
    menuItemsGrid.innerHTML = products.map(product => `
        <div class="product-card bg-white p-4 rounded-xl shadow-md cursor-pointer hover:shadow-lg transition duration-150 border border-gray-200">
            <h4 class="font-bold text-base text-gray-800">${product.name}</h4>
            <p class="text-xs text-gray-500">${product.category} (${product.sector})</p>
            <div class="flex justify-between items-center mt-2">
                <span class="font-bold text-lg text-indigo-700">${formatCurrency(product.price)}</span>
                <button class="add-item-btn add-icon-btn bg-green-500 text-white hover:bg-green-600 transition"
                        onclick='window.addItemToSelection(${JSON.stringify(product).replace(/'/g, '&#39;')})'>
                    <i class="fas fa-plus text-lg"></i>
                </button>
            </div>
            <button class="w-full mt-2 px-2 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                    onclick="window.openProductInfoModal(${product.id})">
                Informações
            </button>
        </div>
    `).join('');
};

// Função para renderizar a lista de itens selecionados (Painel 2)
export const renderOrderScreen = () => { console.log('OrderController: Renderizando Itens Selecionados...'); };
export const handleSendSelectedItems = () => { alert('Função de Envio KDS (Marcha) em desenvolvimento.'); };
