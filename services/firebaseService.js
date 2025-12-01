// --- SERVICES/FIREBASESERVICE.JS (CORRIGIDO) ---
import { collection, doc, updateDoc, arrayUnion, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Variáveis globais exportadas (inicializadas no app.js)
export let db = null;
export let auth = null;
export let appId = null;
export let functions = null;

// Exporta funções úteis do Firestore para uso nos controllers
export { arrayUnion, serverTimestamp };

// Função de inicialização (Chamada única no app.js)
export const initializeFirebase = (database, authentication, appIdentifier, appFunctions) => {
    db = database;
    auth = authentication;
    appId = appIdentifier;
    functions = appFunctions;
};

// ==================================================================
//               REFERÊNCIAS DE COLEÇÕES (Collection Refs)
// ==================================================================

// 1. Helper Genérico (ESTA É A FUNÇÃO QUE FALTAVA)
export const getCollectionRef = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);

// Mesas e Pedidos
export const getTablesCollectionRef = () => getCollectionRef('tables');
export const getTableDocRef = (tableNumber) => doc(db, 'artifacts', appId, 'public', 'data', 'tables', tableNumber.toString());

// KDS (Kitchen Display System)
export const getKdsCollectionRef = () => getCollectionRef('kds_orders');

// CRM e Clientes
export const getCustomersCollectionRef = () => getCollectionRef('customers');

// Configurações do Sistema (Vouchers, Obs, Setores)
export const getQuickObsCollectionRef = () => getCollectionRef('quick_obs');
export const getVouchersCollectionRef = () => getCollectionRef('vouchers');
export const getSectorsCollectionRef = () => getCollectionRef('sectors');


// ==================================================================
//               REFERÊNCIAS DE DOCUMENTOS ÚNICOS (Doc Refs)
// ==================================================================

// Status do Sistema (Abertura/Fechamento de Casa/Turno)
export const getSystemStatusDocRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'system_status', 'business_day');

// Metas Financeiras e KPIs
export const getFinancialGoalsDocRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'system_status', 'financial_goals');


// ==================================================================
//               FUNÇÕES AUXILIARES (Helpers)
// ==================================================================

/**
 * Salva os itens selecionados na mesa (Carrinho local -> Firebase)
 */
export const saveSelectedItemsToFirebase = async (tableId, selectedItems) => {
    if (!tableId || !db) return;

    const tableRef = getTableDocRef(tableId);

    try {
        await updateDoc(tableRef, {
            selectedItems: selectedItems
        });
        // console.log(`[FirebaseService] Itens da mesa ${tableId} salvos.`);
    } catch (e) {
        console.error(`[FirebaseService] Erro ao salvar itens da mesa ${tableId}:`, e);
    }
};