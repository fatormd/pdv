// --- CONTROLLERS/MANAGERCONTROLLER.JS (Painel 4) ---
import { goToScreen } from "../app.js";
import { getProducts } from "../services/wooCommerceService.js";
import { formatCurrency } from "../utils.js";

// Credenciais Staff Centralizadas (copiadas do app.js)
const STAFF_CREDENTIALS = {
    'agencia@fatormd.com': { password: '1234', role: 'gerente', name: 'Fmd' }, 
};

// Senha do gerente para validação de ações críticas
const MANAGER_PASSWORD = STAFF_CREDENTIALS['agencia@fatormd.com'].password;
const productManagementModal = document.getElementById('productManagementModal');


// --- FUNÇÕES DE GESTÃO WOOCOMMERCE/PRODUTOS ---

const renderProductManagement = () => {
    if (!productManagementModal) return;
    
    const products = getProducts();
    
    let listHtml = products.map(p => `
        <div class="flex justify-between items-center py-2 border-b border-gray-100">
            <div class="flex flex-col">
                <span class="font-semibold text-gray-800">${p.name}</span>
                <span class="text-xs text-gray-500">ID: ${p.id} | Setor: ${p.sector}</span>
            </div>
            <div class="flex items-center space-x-2">
                <span class="font-bold text-indigo-700">${formatCurrency(p.price)}</span>
                <button class="px-3 py-1 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition" onclick="alert('Editar produto ${p.id}')">Editar</button>
                <button class="px-3 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition" onclick="alert('Excluir produto ${p.id}')">Excluir</button>
            </div>
        </div>
    `).join('');
    
    productManagementModal.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-2xl w-full max-w-xl max-h-screen overflow-y-auto">
            <h3 class="text-xl font-bold mb-4 text-indigo-700">Gestão de Produtos (WooCommerce)</h3>
            <div class="flex justify-between mb-4">
                 <button class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition" onclick="alert('Abrir formulário de criação')">
                    <i class="fas fa-plus"></i> Novo Produto
                 </button>
                 <button class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition" onclick="document.getElementById('productManagementModal').style.display='none'">
                    Fechar
                 </button>
            </div>
            <div class="border p-3 rounded-lg max-h-96 overflow-y-auto">
                ${listHtml}
            </div>
        </div>
    `;
    productManagementModal.style.display = 'flex';
};


// --- CONTROLE DE ACESSO E AÇÕES ---

const handleGerencialAction = (action, payload) => {
    switch (action) {
        case 'goToManagerPanel':
            goToScreen('managerScreen'); 
            break;
        case 'openProductManagement':
        case 'openCategoryManagement':
            renderProductManagement(); // Usa o mesmo modal para visualização
            break;
        case 'openItemTransfer':
             window.activateItemSelection(payload); // Ativa modo de seleção (transfer)
            break;
        case 'openItemDelete':
            window.activateItemSelection(payload); // Ativa modo de seleção (delete)
            break;
        case 'disableServiceTax':
            window.handleServiceTaxToggleConfirmed(); // Chama a função no paymentController.js
            break;
        case 'deletePayment':
            window.handleDeletePaymentConfirmed(payload); // Chama a função no paymentController.js com o ID do pagamento
            break;
        case 'openInventoryManagement':
            alert("Módulo de ESTOQUE/INVENTÁRIO (Fase 2) em desenvolvimento. Requer Ficha Técnica e entrada por NF-e.");
            break;
        case 'openCashManagement':
            alert("Módulo de GESTÃO DE CAIXA (Fase 1) em desenvolvimento. Requer Abertura/Sangria/Fechamento.");
            break;
        case 'openReservations':
            alert("Módulo de RESERVAS/FILA DE ESPERA em desenvolvimento. Requer nova coleção no Firebase.");
            break;
        case 'openCustomerCRM':
            alert("Módulo de CRM (Fidelidade) em desenvolvimento. Requer painel de busca e histórico do cliente.");
            break;
        case 'openWaiterReg':
            alert("Módulo de Cadastro de Usuários em desenvolvimento.");
            break;
        case 'openRecipesManagement':
            alert("Módulo de FICHA TÉCNICA (BOM) em desenvolvimento. Essencial para controle de CMV.");
            break;
        case 'deleteMass':
            alert("Ação de EXCLUSÃO EM MASSA (Contingência) em desenvolvimento.");
            break;
        case 'openSelectiveTransfer':
            alert("Ação de TRANSFERÊNCIA SELETIVA (Logística) em desenvolvimento.");
            break;
        case 'openWooSync':
            alert("Ação de SINCRONIZAÇÃO FORÇADA em desenvolvimento.");
            break;
        default:
            alert("Módulo Gerencial não reconhecido.");
    }
};

export const openManagerAuthModal = (action, payload = null) => {
    const managerModal = document.getElementById('managerModal');
    if (!managerModal) return; 

    // 1. Injeta o HTML do modal de autenticação
    managerModal.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm">
            <h3 class="text-xl font-bold mb-4 text-red-600">Ação Gerencial Necessária</h3>
            <p class="text-base mb-3">Insira a senha do gerente para prosseguir.</p>
            <input type="password" id="managerPasswordInput" placeholder="Senha (Ex: ${MANAGER_PASSWORD})" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500 text-base" maxlength="4">
            
            <div class="flex justify-end space-x-3 mt-4">
                <button class="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-base" onclick="document.getElementById('managerModal').style.display='none'">Cancelar</button>
                <button id="authManagerBtn" class="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-base">Autenticar</button>
            </div>
        </div>
    `;
    managerModal.style.display = 'flex';
    
    // 2. Adiciona o listener para o botão de autenticar
    document.getElementById('authManagerBtn').onclick = () => {
        const input = document.getElementById('managerPasswordInput');
        
        if (input && input.value === MANAGER_PASSWORD) {
            managerModal.style.display = 'none';
            handleGerencialAction(action, payload);
            
        } else {
            alert("Senha incorreta.");
            if (input) input.value = '';
        }
    };
};
window.openManagerAuthModal = openManagerAuthModal;
