// --- CONTROLLERS/MANAGERCONTROLLER.JS (Painel 4) ---
import { goToScreen } from "/app.js";
import { getProducts } from "/services/wooCommerceService.js";
import { formatCurrency } from "/utils.js";
// REMOVIDO: import { activateItemSelection, handleMassDeleteConfirmed } from "./paymentController.js";

// Estado
let managerInitialized = false;
const productManagementModal = document.getElementById('productManagementModal');


// --- FUNÇÕES DE GESTÃO (Placeholders) ---
const renderProductManagement = () => {
    // ... (lógica mantida para renderizar o modal de produtos, se existir) ...
    if (!productManagementModal) {
         alert("Módulo de Gestão de Produtos em desenvolvimento.");
         return;
    }
    // ... (resto da lógica de renderProductManagement) ...
};

// Esta função agora é chamada pelo app.js (openManagerAuthModal)
export const handleGerencialAction = (action, payload) => {
    console.log(`[Manager] Executando ação gerencial: ${action}`);
    switch (action) {
        // REMOVIDO: 'openMassDelete', 'openMassTransfer', 'deletePayment' (agora no app.js)
        
        case 'goToManagerPanel':
             goToScreen('managerScreen');
             break;
        case 'openProductManagement':
        case 'openCategoryManagement':
            renderProductManagement(); // Usa o mesmo modal para visualização
            break;
        case 'openInventoryManagement':
            alert("Módulo de ESTOQUE/INVENTÁRIO (Fase 2) em desenvolvimento.");
            break;
        case 'openCashManagement':
            alert("Módulo de GESTÃO DE CAIXA (Fase 1) em desenvolvimento.");
            break;
        case 'openReservations':
            alert("Módulo de RESERVAS/FILA DE ESPERA em desenvolvimento.");
            break;
        case 'openCustomerCRM':
            alert("Módulo de CRM (Fidelidade) em desenvolvimento.");
            break;
        case 'openWaiterReg':
            alert("Módulo de Cadastro de Usuários em desenvolvimento.");
            break;
        case 'openRecipesManagement':
            alert("Módulo de FICHA TÉCNICA (BOM) em desenvolvimento.");
            break;
        case 'openWooSync':
            alert("Ação de SINCRONIZAÇÃO FORÇADA em desenvolvimento.");
            break;
        default:
             alert(`Módulo Gerencial não reconhecido: ${action}.`);
    }
};

// REMOVIDO: export const openManagerAuthModal = (...) => { ... }; (Movido para app.js)


// --- INICIALIZAÇÃO DO CONTROLLER ---
export const initManagerController = () => {
    if(managerInitialized) return;
    console.log("[ManagerController] Inicializando...");

    const managerCards = document.querySelectorAll('#managerScreen .manager-card');

    managerCards.forEach(card => {
        const onclickAttr = card.getAttribute('onclick');
        if (onclickAttr) {
            // Extrai a ação
            const match = onclickAttr.match(/openManagerAuthModal\('([^']+)'/);
            // OU a ação de clique direto (para Relatórios)
            const matchDirect = onclickAttr.match(/document.getElementById\('([^']+)'\)/);
            
            card.removeAttribute('onclick'); // Remove onclick inline

            if (match && match[1]) {
                const action = match[1];
                const payload = null;
                card.addEventListener('click', () => {
                    // Chama a função GLOBAL do app.js
                    window.openManagerAuthModal(action, payload);
                });
            } else if (matchDirect && matchDirect[1] === 'reportsModal') {
                 // Trata o botão de Relatórios especificamente
                 card.addEventListener('click', () => {
                     const modal = document.getElementById('reportsModal');
                     if(modal) modal.style.display = 'flex';
                 });
                 console.log(`[Manager] Card 'Relatórios' configurado.`);
            } else {
                 console.warn("Não foi possível parsear onclick para card:", card ? card.outerHTML : "CARD NULO");
                 // Adiciona um listener de fallback se o parse falhar
                 card.addEventListener('click', () => {
                    try { eval(onclickAttr); } catch(e) { console.error("Erro ao executar onclick antigo:", e); }
                 });
            }
        }
    });

    // Mapeia e adiciona listener para o botão de voltar
    const backBtn = document.getElementById('backToPanelFromManagerBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => window.goToScreen('panelScreen'));
    }

    managerInitialized = true;
    console.log("[ManagerController] Inicializado.");
};
