// --- CONTROLLERS/MANAGER_MODULES/DELIVERYMANAGER.JS ---
import { showToast, currentTableId, goToScreen } from "/app.js"; 
import { getTableDocRef, getTablesCollectionRef } from "/services/firebaseService.js";
import { setDoc, serverTimestamp, updateDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let currentMode = 'mesa'; // 'mesa', 'retirada', 'entrega'
let generatedPin = null;

// ==================================================================
//           1. INICIALIZAÇÃO
// ==================================================================

export const init = () => {
    console.log("[DeliveryModule] Inicializando...");
    
    // Vincula o botão "Confirmar/Iniciar Pedido" do modal
    const confirmBtn = document.getElementById('confirmOrderModeBtn');
    if(confirmBtn) {
        // Remove listeners antigos clonando o botão (truque simples para evitar duplicação de eventos)
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
        
        newBtn.addEventListener('click', handleConfirmOrder);
    }
    
    // Garante que o estado inicial visual esteja correto
    switchTab('mesa');
};

// ==================================================================
//           2. CONTROLE DE ABAS (UI)
// ==================================================================

export const switchTab = (mode) => {
    currentMode = mode;
    
    // 1. Atualiza visual das Abas
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if(btn.dataset.tab === `tab-${mode}`) {
            btn.classList.add('text-pumpkin', 'border-b-2', 'border-pumpkin', 'bg-gray-700');
            btn.classList.remove('text-gray-400', 'border-transparent');
        } else {
            btn.classList.remove('text-pumpkin', 'border-b-2', 'border-pumpkin', 'bg-gray-700');
            btn.classList.add('text-gray-400', 'border-transparent');
        }
    });

    // 2. Mostra/Esconde Conteúdo
    document.querySelectorAll('.order-mode-content').forEach(div => div.classList.add('hidden'));
    const targetDiv = document.getElementById(`tab-${mode}`);
    if(targetDiv) targetDiv.classList.remove('hidden');

    // 3. Lógica Específica de cada Aba
    if (mode === 'mesa') {
        const display = document.getElementById('modalCurrentTableDisplay');
        if(display) display.innerText = currentTableId || '--';
        updateConfirmButtonText("Confirmar Vínculo");
    } 
    else if (mode === 'retirada') {
        generatePin();
        updateConfirmButtonText("Iniciar Retirada");
    }
    else if (mode === 'entrega') {
        updateConfirmButtonText("Iniciar Delivery");
    }
};

const updateConfirmButtonText = (text) => {
    const btn = document.getElementById('confirmOrderModeBtn');
    if(btn) btn.innerHTML = `<i class="fas fa-check-circle mr-2"></i> ${text}`;
};

// ==================================================================
//           3. LÓGICA DE NEGÓCIO
// ==================================================================

const generatePin = () => {
    // Gera PIN aleatório (Letra + 3 Números) ex: A123
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const letter = letters.charAt(Math.floor(Math.random() * letters.length));
    const numbers = Math.floor(100 + Math.random() * 900);
    generatedPin = `${letter}${numbers}`;
    
    const display = document.getElementById('generatedPinDisplay');
    if(display) display.innerText = generatedPin;
};

export const handleCallMotoboy = () => {
    const address = document.getElementById('deliveryStreet').value;
    if(!address) {
        showToast("Preencha a Rua/Av para estimar o motoboy.", true);
        document.getElementById('deliveryStreet').focus();
        return;
    }
    
    // Simulação de integração com API de Logística
    const btn = document.getElementById('callMotoboyBtn');
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Buscando...`;
    
    setTimeout(() => {
        alert(`SIMULAÇÃO DE ENTREGA:\n\n3 Entregadores encontrados próximos a "${address}".\n\nValor estimado: R$ 8,50`);
        btn.innerHTML = originalText;
        btn.disabled = false;
    }, 1500);
};

// Função Principal: Decide se vincula mesa ou cria pedido virtual
const handleConfirmOrder = async () => {
    const customerName = document.getElementById('customerNameInput').value || 'Cliente Não Identificado';
    const customerCpf = document.getElementById('customerSearchCpf').value || '';
    
    const btn = document.getElementById('confirmOrderModeBtn');
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processando...`;

    try {
        if (currentMode === 'mesa') {
            await linkCustomerToTable(customerName, customerCpf);
        } 
        else {
            await createVirtualOrder(customerName, customerCpf);
        }
    } catch(error) {
        console.error(error);
        showToast("Erro ao processar pedido.", true);
    } finally {
        btn.disabled = false;
    }
};

// Caso 1: Vincular a uma Mesa Física existente
const linkCustomerToTable = async (name, cpf) => {
    if(!currentTableId) {
        showToast("Erro: Nenhuma mesa selecionada no fundo.", true);
        return;
    }
    
    try {
        await updateDoc(getTableDocRef(currentTableId), {
            clientName: name,
            clientCpf: cpf,
            updatedAt: serverTimestamp()
        });
        
        showToast(`Mesa ${currentTableId} vinculada a ${name}`);
        document.getElementById('customerRegModal').style.display = 'none';
        
        // Atualiza interface se necessário
        const nameDisplay = document.getElementById('order-screen-client-name'); // Se existir esse elemento
        if(nameDisplay) nameDisplay.textContent = name;
        
    } catch(e) {
        throw new Error("Falha ao vincular cliente à mesa.");
    }
};

// Caso 2: Criar Mesa Virtual (Retirada ou Entrega)
const createVirtualOrder = async (name, cpf) => {
    // ID Virtual: 
    // 9000-9999 para Retirada (Balcão)
    // 8000-8999 para Entrega (Delivery)
    const prefix = currentMode === 'retirada' ? 9000 : 8000;
    
    // Tenta encontrar um ID livre (simples)
    const randomId = prefix + Math.floor(Math.random() * 999);
    
    const orderData = {
        tableNumber: randomId,
        status: 'open',
        type: currentMode, // 'retirada' ou 'entrega'
        clientName: name,
        clientCpf: cpf,
        openedAt: serverTimestamp(),
        total: 0,
        selectedItems: [],
        payments: [],
        isVirtual: true // Flag importante para relatórios
    };

    if (currentMode === 'retirada') {
        orderData.pickupPin = generatedPin;
        orderData.notes = `RETIRADA - PIN: ${generatedPin}`;
        orderData.sector = 'Balcão';
    } 
    else if (currentMode === 'entrega') {
        const rua = document.getElementById('deliveryStreet').value;
        const num = document.getElementById('deliveryNumber').value;
        const comp = document.getElementById('deliveryComplement').value;
        const zip = document.getElementById('deliveryZip').value;
        
        if(!rua) {
            showToast("Endereço é obrigatório para entrega.", true);
            document.getElementById('deliveryStreet').focus();
            throw new Error("Endereço incompleto");
        }

        const fullAddress = `${rua}, ${num} ${comp ? '- ' + comp : ''}`;
        orderData.deliveryAddress = fullAddress;
        orderData.deliveryZip = zip;
        orderData.notes = `DELIVERY: ${fullAddress}`;
        orderData.sector = 'Delivery';
    }

    // Cria o documento no Firestore
    await setDoc(getTableDocRef(randomId), orderData);

    // Finaliza
    document.getElementById('customerRegModal').style.display = 'none';
    showToast(`${currentMode === 'retirada' ? 'Retirada' : 'Entrega'} iniciada! Pedido #${randomId}`);
    
    // Redireciona para a tela de pedidos dessa nova "mesa"
    if(window.loadTable) {
        window.loadTable(randomId);
    } else {
        // Fallback se loadTable não estiver global
        window.location.reload(); 
    }
};