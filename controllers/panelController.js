// --- DENTRO DO controllers/panelController.js ---

export const loadOpenTables = () => {
    if (unsubscribeTables) unsubscribeTables(); 
    
    // Diagnóstico: Remova qualquer conteúdo de diagnóstico anterior no console.

    const tablesCollection = getTablesCollectionRef();
    let q;
    
    // A consulta complexa que exige o índice triplo (status, sector, tableNumber)
    if (currentSectorFilter === 'Todos') {
        q = query(tablesCollection, where('status', '==', 'open'), orderBy('tableNumber', 'asc'));
    } else {
        q = query(tablesCollection, 
                  where('status', '==', 'open'), 
                  where('sector', '==', currentSectorFilter),
                  orderBy('tableNumber', 'asc'));
    }

    unsubscribeTables = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs;
        renderTables(docs);
    }, (error) => {
        // CRÍTICO: Exibe o erro do Firebase diretamente na LISTA DE MESAS
        const openTablesList = document.getElementById('openTablesList');
        const errorMessage = error.message || "Erro desconhecido. Verifique o Console (F12).";
        
        if (openTablesList) {
            openTablesList.innerHTML = `<div class="col-span-full text-sm text-red-600 font-bold italic p-4 content-card bg-white">
                ERRO CRÍTICO FIREBASE: A sincronização de mesas falhou!
                <br>O problema é de Índice Composto ou Regras de Segurança.
                <br>Detalhe da Falha: ${errorMessage.substring(0, 300)}
            </div>`;
        }
        
        console.error("Erro fatal ao carregar mesas (onSnapshot):", error);
    });
};
