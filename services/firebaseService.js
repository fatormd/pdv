// --- SERVICES/FIREBASESERVICE.JS ---
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

// Mesas e Pedidos
export const getTablesCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'tables');
export const getTableDocRef = (tableNumber) => doc(db, 'artifacts', appId, 'public', 'data', 'tables', tableNumber.toString());

// KDS (Kitchen Display System)
export const getKdsCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'kds_orders');

// CRM e Clientes
export const getCustomersCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'customers');

// Configurações do Sistema (Vouchers, Obs, Setores)
export const getQuickObsCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'quick_obs');
export const getVouchersCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'vouchers');
export const getSectorsCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'sectors');


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
        console.log(`[FirebaseService] Itens da mesa ${tableId} salvos com sucesso.`);
    } catch (e) {
        console.error(`[FirebaseService] Erro ao salvar itens da mesa ${tableId}:`, e);
    }
};