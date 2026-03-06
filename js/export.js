/**
 * Logique d'exportation Excel pour Audit Planner
 * Utilise la bibliothèque ExcelJS
 */

async function exportToExcel() {
    console.log("Démarrage de l'export Excel...");
    const btn = document.getElementById('btnExportExcel');
    const originalContent = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Génération...';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Audit Planner';
        workbook.lastModifiedBy = 'Audit Planner';
        workbook.created = new Date();

        // --- Récupération des données ---
        // Les variables persons, audits et planning sont globales (définies dans scripts.js)
        const sortedPersons = window.getSortedKeys(window.persons, 'personsOrder');
        const sortedAudits = window.getSortedKeys(window.audits, 'auditsOrder');

        // Déterminer la plage de dates à exporter (on prend le mois en cours par défaut ou la vue actuelle)
        // Pour faire simple et complet, on exporte le mois de la date actuelle du planning
        const year = window.currentDate.getFullYear();
        const month = window.currentDate.getMonth();
        const dates = window.getMonthDates(year, month);

        // --- FEUILLE 1 : PLANNING GLOBAL ---
        const sheet1 = workbook.addWorksheet('Planning Global');

        // En-tête des dates
        const headerRow = ['Auditeurs / Dates', ...dates.map(d => window.formatDisplayDate(d))];
        const row1 = sheet1.addRow(headerRow);
        row1.font = { bold: true };
        row1.alignment = { horizontal: 'center' };

        // Remplissage des lignes par personne
        sortedPersons.forEach(pName => {
            const rowData = [pName];
            dates.forEach(d => {
                const dayAssignments = (window.planning[d] && window.planning[d][pName]) || [];
                if (dayAssignments.length > 0) {
                    rowData.push(dayAssignments.map(a => a.audit).join(', '));
                } else {
                    rowData.push('');
                }
            });
            const row = sheet1.addRow(rowData);

            // Style conditionnel pour les cellules avec audits
            row.eachCell((cell, colNumber) => {
                if (colNumber > 1 && cell.value) {
                    const date = dates[colNumber - 2];
                    const dayAssignments = window.planning[date][pName];
                    const allDone = dayAssignments.every(a => a.status === 'done');

                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: allDone ? 'FFC6EFCE' : 'FFFFEB9C' } // Vert clair si fini, Jaune si en attente
                    };
                    cell.font = { color: { argb: allDone ? 'FF006100' : 'FF9C6500' }, size: 9 };
                }
            });
        });

        sheet1.getColumn(1).width = 20;
        dates.forEach((_, i) => sheet1.getColumn(i + 2).width = 12);

        // --- FEUILLE 2 : JOURNAL DÉTAILLÉ ---
        const sheet2 = workbook.addWorksheet('Journal des Audits');
        sheet2.columns = [
            { header: 'Date', key: 'date', width: 12 },
            { header: 'Auditeur', key: 'person', width: 20 },
            { header: 'Audit', key: 'audit', width: 25 },
            { header: 'Thème', key: 'theme', width: 20 },
            { header: 'Statut', key: 'status', width: 12 },
            { header: 'Commentaire', key: 'comment', width: 40 }
        ];
        sheet2.getRow(1).font = { bold: true };

        Object.keys(window.planning).sort().forEach(date => {
            const day = window.planning[date];
            Object.keys(day).forEach(pName => {
                day[pName].forEach(a => {
                    const auditDef = window.audits[a.audit] || {};
                    sheet2.addRow({
                        date: date,
                        person: pName,
                        audit: a.audit,
                        theme: auditDef.theme || '-',
                        status: a.status === 'done' ? 'Réalisé' : 'Prévu',
                        comment: a.comment || ''
                    });
                });
            });
        });

        // --- FEUILLE 3 : STATISTIQUES ---
        const sheet3 = workbook.addWorksheet('Statistiques');
        const stats = window.getPlanningStats(window.planning, dates);

        sheet3.addRow(['Récapitulatif - ' + window.getMonthLabel(year, month)]).font = { bold: true, size: 14 };
        sheet3.addRow([]);
        sheet3.addRow(['Total Audits Prévus', stats.total]);
        sheet3.addRow(['Total Audits Réalisés', stats.done]);
        sheet3.addRow(['Total Audits En attente', stats.pending]);
        sheet3.addRow(['Taux de réalisation', stats.total > 0 ? Math.round((stats.done / stats.total) * 100) + '%' : '0%']);

        sheet3.getColumn(1).width = 25;
        sheet3.getColumn(2).width = 15;

        // --- Génération et téléchargement ---
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const monthName = window.MONTH_NAMES[month];
        const fileName = `Export_Audits_${monthName}_${year}.xlsx`;
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        window.URL.revokeObjectURL(url);

    } catch (err) {
        console.error("Erreur export Excel:", err);
        alert("Une erreur est survenue lors de l'exportation : " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// Initialisation des événements
document.addEventListener('DOMContentLoaded', () => {
    const btnExport = document.getElementById('btnExportExcel');
    if (btnExport) btnExport.onclick = exportToExcel;

    const btnExportMobile = document.getElementById('btnExportExcelMobile');
    if (btnExportMobile) btnExportMobile.onclick = exportToExcel;
});
