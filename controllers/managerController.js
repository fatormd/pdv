// --- CONTROLLERS/MANAGERCONTROLLER.JS (com data-action e logs) ---
import { goToScreen } from "/app.js";
import { getProducts } from "/services/wooCommerceService.js";
// Removida importação de formatCurrency (não usada aqui)
// Removida importação de userManagementController (agora tratado no app.js)

// Estado
let managerInitialized = false;
let productManagementModal; // Mapeado no init

// --- FUNÇÕES DE GESTÃO (Placeholders/Lógica) ---

// Renderiza o modal de gestão de produtos (exemplo)
const renderProductManagement = () => {
    // Implementação mantida como antes...
     if (!productManagementModal) {
         productManagementModal = document.getElementById('productManagementModal');
         if (!productManagementModal) {
             alert("Módulo de Gestão de Produtos em desenvolvimento.");
             return;
         }
    }
    // Adiciona lógica para buscar produtos e renderizar HTML aqui...
    const products = getProducts(); // Exemplo
    let listHtml = products.map(p => `
        <div class="flex justify-between items-center py-2 border-b border-gray-600">
            <div class="flex flex-col">
                <span class="font-semibold text-dark-text">${p.name}</span>
                <span class="text-xs text-dark-placeholder">ID: ${p.id} | Cat: ${p.category}</span>
            </div>
             <div class="space-x-2 print-hide">
                <button class="p-2 text-indigo-400 hover:text-indigo-300 transition" title="Editar Produto">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="p-2 text-red-500 hover:text-red-400 transition" title="Excluir Produto">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');

     productManagementModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-xl max-h-screen overflow-y-auto">
            <h3 class="text-xl font-bold mb-4 text-pumpkin">Gestão de Produtos (WooCommerce)</h3>
            <div class="flex justify-between mb-4">
                 <button class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition" onclick="alert('Abrir formulário de criação')">
                    <i class="fas fa-plus"></i> Novo Produto
                 </button>
                 <button class="px-4 py-2 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition" onclick="document.getElementById('productManagementModal').style.display='none'">
                    Fechar
                 </button>
            </div>
            <div class="border border-gray-600 p-3 rounded-lg max-h-96 overflow-y-auto bg-dark-bg custom-scrollbar">
                ${listHtml || '<p class="text-dark-placeholder italic">Nenhum produto carregado.</p>'}
            </div>
        </div>
    `;
    // ... resto da lógica de renderização ...
    productManagementModal.style.display = 'flex';
};

/**
 * Função chamada pelo app.js (via openManagerAuthModal) após autenticação.
 * Direciona a ação para a função correta.
 * @param {string} action - O nome da ação (vindo do data-action).
 * @param {*} payload - Dados adicionais (geralmente null aqui).
 */
export const handleGerencialAction = (action, payload) => {
    console.log(`[Manager] handleGerencialAction recebida: ${action}`); // DEBUG LOG

    switch (action) {
        // Ações tratadas DIRETAMENTE aqui (ou que abrem modais específicos)
        case 'openProductManagement':
        case 'openCategoryManagement': // Assumindo que usa o mesmo modal/lógica
            renderProductManagement();
            break;
        case 'openReportsModal':
            const modal = document.getElementById('reportsModal');
            if(modal) modal.style.display = 'flex';
            else {
                console.error("[Manager] Modal de relatórios não encontrado.");
                alert("Modal de relatórios não encontrado.");
            }
            break;

        // Ações que são apenas placeholders por enquanto
        case 'openInventoryManagement':
            alert("Módulo de ESTOQUE (DEV).");
            break;
        case 'openCashManagement':
            alert("Módulo de GESTÃO DE CAIXA (DEV).");
            break;
        case 'openReservations':
            alert("Módulo de RESERVAS/FILA (DEV).");
            break;
        case 'openCustomerCRM':
            alert("Módulo de CRM (DEV).");
            break;
        case 'openRecipesManagement':
            alert("Módulo de FICHA TÉCNICA (DEV).");
            break;
        case 'openWooSync':
            alert("Ação de SINCRONIZAÇÃO (DEV).");
            break;

        // Ação 'openWaiterReg' é tratada no app.js para chamar openUserManagementModal

        // Ação 'goToManagerPanel' é tratada no app.js chamando goToScreen

        default:
             console.warn(`[Manager] Ação Gerencial não reconhecida explicitamente: ${action}.`);
             alert(`Ação Gerencial não reconhecida: ${action}.`);
    }
};

// --- INICIALIZAÇÃO DO CONTROLLER ---
export const initManagerController = () => {
    // Previne reinicialização
    if (managerInitialized) {
        console.log("[ManagerController] Já inicializado.");
        return;
    }
    console.log("[ManagerController] Inicializando...");

    // Mapeia elementos específicos desta tela/módulo
    productManagementModal = document.getElementById('productManagementModal'); // Para a função renderProductManagement
    const managerScreen = document.getElementById('managerScreen'); // Seleciona a tela
    if (!managerScreen) {
        console.error("[ManagerController] Erro Fatal: Elemento #managerScreen não encontrado.");
        return;
    }
    const managerCards = managerScreen.querySelectorAll('.manager-card'); // Seleciona os cards DENTRO da tela
    console.log(`[ManagerController] Encontrados ${managerCards.length} cards gerenciais.`);

    // --- LÓGICA DE ANEXAÇÃO DE LISTENERS (REVISADA) ---
    managerCards.forEach((card, index) => {
        // 1. Limpa qualquer listener antigo clonando o nó (garantia extra)
        const newCard = card.cloneNode(true);
        card.parentNode.replaceChild(newCard, card);

        // 2. Pega a ação do atributo data-action
        const action = newCard.dataset.action;
        console.log(`[ManagerController] Card ${index}: Configurando para data-action = ${action}`);

        if (action) {
            // 3. Adiciona o listener de clique ao *novo* nó clonado
            newCard.addEventListener('click', () => {
                // LOG DENTRO DO LISTENER para confirmar que o clique dispara
                console.log(`[ManagerController] Card clicado! Ação detectada: ${action}`);
                const payload = null; // Payload não usado para essas ações por enquanto

                // Chama a função global openManagerAuthModal (definida no app.js)
                // passando a ação lida do data-action.
                // Exceto para o modal de relatórios que não precisa de senha.
                if (action === 'openReportsModal') {
                    handleGerencialAction(action, payload); // Chama a lógica direta
                } else {
                    window.openManagerAuthModal(action, payload); // Chama o modal de senha
                }
            });
            console.log(`[ManagerController] Listener adicionado com sucesso para ação: ${action}`);
        } else {
             console.warn(`[ManagerController] Card ${index} encontrado sem data-action:`, newCard.outerHTML);
        }
    });
    // --- FIM DA LÓGICA DE ANEXAÇÃO ---

    // Listener para o botão de voltar
    const backBtn = document.getElementById('backToPanelFromManagerBtn');
    if (backBtn) {
        // Limpa listener antigo (se houver) e adiciona o novo
        const newBackBtn = backBtn.cloneNode(true);
        backBtn.parentNode.replaceChild(newBackBtn, backBtn);
        newBackBtn.addEventListener('click', () => window.goToScreen('panelScreen'));
    } else {
        console.warn("[ManagerController] Botão 'backToPanelFromManagerBtn' não encontrado.");
    }

    managerInitialized = true; // Marca como inicializado
    console.log("[ManagerController] Inicializado com sucesso.");
};
