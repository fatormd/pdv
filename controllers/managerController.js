// --- CONTROLLERS/MANAGER/HUB/MANAGERCONTROLLER.JS (CORRIGIDO E ROBUSTO) ---

import { auth, db, signOut } from "/services/firebaseService.js";
import { showToast } from "/utils.js";

// Importação dos Módulos
import * as productManager from "../modules/productManager.js";
import * as teamManager from "../modules/teamManager.js";
import * as settingsManager from "../modules/settingsManager.js";
import * as financeManager from "../modules/financeManager.js";
import * as deliveryManager from "../modules/deliveryManager.js";
import * as crmManager from "../modules/crmManager.js";
import * as voucherManager from "../modules/voucherManager.js";
import * as salesManager from "../modules/salesManager.js";
import * as reservationManager from "../modules/reservationManager.js"; 

let currentModule = null;

export const initManagerController = async () => {
    console.log("[ManagerHub] Inicializando...");
    
    const appContainer = document.getElementById('appContainer');
    if (!appContainer) {
        console.error("[ManagerHub] Erro: appContainer não encontrado no index.html");
        return;
    }

    // 1. Renderizar Layout do Painel
    // IMPORTANTE: O id="managerModuleContainer" é criado aqui dentro.
    appContainer.innerHTML = `
        <div class="flex h-screen bg-dark-bg overflow-hidden">
            
            <aside class="w-64 bg-gray-900 border-r border-gray-800 flex-shrink-0 flex flex-col transition-all duration-300 absolute md:relative z-20 h-full transform -translate-x-full md:translate-x-0" id="managerSidebar">
                <div class="p-6 border-b border-gray-800 flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pumpkin to-orange-600">Fator PDV</h1>
                        <p class="text-xs text-gray-500 uppercase tracking-widest mt-1">Gestão</p>
                    </div>
                    <button class="md:hidden text-gray-400" id="closeSidebarBtn"><i class="fas fa-times"></i></button>
                </div>

                <nav class="flex-grow overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    <p class="text-xs font-bold text-gray-600 uppercase ml-3 mt-2 mb-1">Operacional</p>
                    <button class="manager-nav-btn w-full text-left px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition flex items-center" data-module="sales"><i class="fas fa-cash-register w-6"></i> Vendas / Caixa</button>
                    <button class="manager-nav-btn w-full text-left px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition flex items-center" data-module="delivery"><i class="fas fa-motorcycle w-6"></i> Delivery</button>
                    <button class="manager-nav-btn w-full text-left px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition flex items-center" data-module="reservations"><i class="fas fa-calendar-check w-6"></i> Reservas</button>

                    <p class="text-xs font-bold text-gray-600 uppercase ml-3 mt-4 mb-1">Gestão</p>
                    <button class="manager-nav-btn w-full text-left px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition flex items-center" data-module="products"><i class="fas fa-hamburger w-6"></i> Produtos & Estoque</button>
                    <button class="manager-nav-btn w-full text-left px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition flex items-center" data-module="finance"><i class="fas fa-chart-line w-6"></i> Financeiro</button>
                    <button class="manager-nav-btn w-full text-left px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition flex items-center" data-module="crm"><i class="fas fa-users w-6"></i> Clientes (CRM)</button>
                    <button class="manager-nav-btn w-full text-left px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition flex items-center" data-module="vouchers"><i class="fas fa-ticket-alt w-6"></i> Vouchers</button>

                    <p class="text-xs font-bold text-gray-600 uppercase ml-3 mt-4 mb-1">Sistema</p>
                    <button class="manager-nav-btn w-full text-left px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition flex items-center" data-module="team"><i class="fas fa-user-shield w-6"></i> Equipe</button>
                    <button class="manager-nav-btn w-full text-left px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition flex items-center" data-module="settings"><i class="fas fa-cogs w-6"></i> Configurações</button>
                </nav>

                <div class="p-4 border-t border-gray-800">
                    <button id="managerLogoutBtn" class="w-full flex items-center justify-center px-4 py-3 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 transition font-bold text-sm"><i class="fas fa-sign-out-alt mr-2"></i> Sair</button>
                </div>
            </aside>

            <div class="flex-grow flex flex-col h-full overflow-hidden relative bg-dark-bg">
                <header class="md:hidden h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 z-10">
                    <button class="text-white text-xl" id="mobileMenuBtn"><i class="fas fa-bars"></i></button>
                    <span class="font-bold text-pumpkin">Fator PDV</span>
                    <div class="w-8"></div> 
                </header>
                
                <main id="managerModuleContainer" class="flex-grow overflow-hidden relative">
                    <div class="flex items-center justify-center h-full text-gray-500"><div class="text-center"><i class="fas fa-chart-pie text-6xl mb-4 opacity-20"></i><p>Selecione um módulo.</p></div></div>
                </main>
            </div>
        </div>

        <div id="managerModal" class="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] hidden p-4 animate-fade-in"></div>
    `;

    setupLayoutEvents();
    
    // Pequeno delay para garantir que o DOM renderizou antes de carregar o módulo
    setTimeout(() => {
        loadModule('sales'); 
    }, 50);
};

function setupLayoutEvents() {
    const sidebar = document.getElementById('managerSidebar');
    const mobileBtn = document.getElementById('mobileMenuBtn');
    const closeBtn = document.getElementById('closeSidebarBtn');

    if (mobileBtn) mobileBtn.onclick = () => sidebar.classList.remove('-translate-x-full');
    if (closeBtn) closeBtn.onclick = () => sidebar.classList.add('-translate-x-full');

    document.querySelectorAll('.manager-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.innerWidth < 768) sidebar.classList.add('-translate-x-full');
            
            document.querySelectorAll('.manager-nav-btn').forEach(b => {
                b.classList.remove('bg-gray-800', 'text-white', 'border-l-4', 'border-pumpkin');
                b.classList.add('text-gray-400');
            });
            btn.classList.add('bg-gray-800', 'text-white', 'border-l-4', 'border-pumpkin');
            btn.classList.remove('text-gray-400');

            loadModule(btn.dataset.module);
        });
    });

    document.getElementById('managerLogoutBtn').onclick = async () => {
        if(confirm("Deseja sair do painel?")) {
            await signOut(auth);
            window.location.reload();
        }
    };
}

async function loadModule(moduleName) {
    const container = document.getElementById('managerModuleContainer');
    
    // LOG DE DEBUG
    if (!container) {
        console.error("[ManagerHub] FATAL: managerModuleContainer não encontrado no DOM! Impossível carregar módulo.");
        alert("Erro interno: Elemento de layout não encontrado. Recarregue a página.");
        return;
    }

    container.innerHTML = `<div class="flex justify-center items-center h-full"><i class="fas fa-spinner fa-spin text-4xl text-pumpkin"></i></div>`;
    currentModule = moduleName;

    try {
        switch (moduleName) {
            case 'products': await productManager.init(container); break;
            case 'team': await teamManager.init(container); break;
            case 'finance': await financeManager.init(container); break;
            case 'delivery': await deliveryManager.init(container); break;
            case 'crm': await crmManager.init(container); break;
            case 'vouchers': await voucherManager.init(container); break;
            case 'sales': await salesManager.init(container); break;
            
            // Verificação extra para Reservas
            case 'reservations': 
                if (reservationManager && typeof reservationManager.init === 'function') {
                    await reservationManager.init(container); 
                } else {
                    console.error("[ManagerHub] Módulo ReservationManager não exportou 'init' corretamente.");
                    container.innerHTML = `<p class="text-red-500 p-4">Erro no código do módulo de Reservas.</p>`;
                }
                break;
                
            case 'settings':
                settingsManager.init();
                settingsManager.open();
                container.innerHTML = `<div class="flex items-center justify-center h-full text-gray-500"><p>Configurações abertas em janela.</p></div>`;
                break;
            default:
                container.innerHTML = `<div class="flex items-center justify-center h-full text-gray-500"><p>Módulo em construção: ${moduleName}</p></div>`;
        }
    } catch (error) {
        console.error(`Erro ao carregar módulo ${moduleName}:`, error);
        container.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-red-400"><p>Erro ao carregar módulo.</p><p class="text-xs">${error.message}</p></div>`;
    }
}