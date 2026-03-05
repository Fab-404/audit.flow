var currentView = 'week';
var currentDate = new Date();
var selectedAudit = null;

async function initPlanning() {
  persons = await loadData('persons', {});
  audits = await loadData('audits', {});
  planning = await loadData('planning', {});
  personsOrder = await loadData('personsOrder', []);
  auditsOrder = await loadData('auditsOrder', []);

  document.getElementById('btnPrev').onclick = function () { navigate(-1); };
  document.getElementById('btnNext').onclick = function () { navigate(1); };
  document.getElementById('btnToday').onclick = function () {
    currentDate = new Date();
    renderCalendar();
    updateStats();
    // Scroll automatique vers aujourd'hui
    setTimeout(function () {
      var todayEl = document.querySelector('.today-col');
      if (todayEl) {
        todayEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }, 100);
  };
  document.getElementById('viewSelect').onchange = function () { currentView = this.value; renderCalendar(); updateStats(); };
  document.getElementById('filterStatus').onchange = function () { applyFilter(); updateStats(); };
  document.getElementById('btnAutoFill').onclick = runAutoFill;
  document.getElementById('btnClearPeriod').onclick = clearPeriod;
  document.getElementById('btnPrint').onclick = function () {
    var now = new Date();
    var dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    var timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    var printDateEl = document.getElementById('printDate');
    if (printDateEl) {
      printDateEl.textContent = "Imprimé le " + dateStr + " à " + timeStr;
    }
    window.print();
  };

  var chkWeekend = document.getElementById('chkShowWeekend');
  if (chkWeekend) {
    chkWeekend.checked = await loadData('showWeekend', false);
    chkWeekend.onchange = async function () {
      await saveData('showWeekend', this.checked);
      updateWeekendVisibility();
    };
  }

  document.addEventListener('auditDropped', function (e) { handleDrop(e.detail); });
  document.addEventListener('click', handleChipClick);

  var btnToggle = document.getElementById('btnToggleSidebar');
  if (btnToggle) {
    btnToggle.onclick = async function () {
      var sidebar = document.getElementById('auditSidebar');
      var isCollapsed = sidebar.classList.toggle('collapsed');
      await saveData('sidebarCollapsed', isCollapsed);
    };
  }

  var sidebar = document.getElementById('auditSidebar');
  if (sidebar && await loadData('sidebarCollapsed', false)) sidebar.classList.add('collapsed');

  refreshPlanning();
  updateWeekendVisibility();
}

async function updateWeekendVisibility() {
  var show = await loadData('showWeekend', false);
  var wrapper = document.querySelector('.cal-wrapper');
  if (wrapper) {
    if (show) wrapper.classList.remove('hide-weekends');
    else wrapper.classList.add('hide-weekends');
  }
  // Régénère le tableau pour recalculer les colonnes visibles et l'alternance CSS
  renderCalendar();
}

function refreshPlanning() {
  renderSidebar();
  renderCalendar();
  updateStats();
}

function handleChipClick(e) {
  var vBtn = e.target.closest ? e.target.closest('.chip-validate') : null;
  if (vBtn) { toggleStatus(vBtn.dataset.date, vBtn.dataset.person, parseInt(vBtn.dataset.idx)); return; }
  var rBtn = e.target.closest ? e.target.closest('.chip-remove') : null;
  if (rBtn) { removeAssignment(rBtn.dataset.date, rBtn.dataset.person, parseInt(rBtn.dataset.idx)); return; }
  var nBtn = e.target.closest ? e.target.closest('.chip-note') : null;
  if (nBtn) {
    var chip = nBtn.closest('.assignment-chip');
    chip.classList.toggle('show-comment');
    if (chip.classList.contains('show-comment')) {
      var input = chip.querySelector('.chip-comment-input');
      if (input) input.focus();
    }
  }
}

function navigate(dir) {
  if (currentView === 'week') currentDate.setDate(currentDate.getDate() + dir * 7);
  else { currentDate.setMonth(currentDate.getMonth() + dir); currentDate.setDate(1); }
  renderCalendar(); updateStats();
}

function getCurrentDates() {
  if (currentView === 'week') return getWeekDates(getWeekMonday(new Date(currentDate)));
  return getMonthDates(currentDate.getFullYear(), currentDate.getMonth());
}

/**
 * Filtre le tableau de dates pour ne garder que les colonnes visibles.
 * Si la case "Week-ends" n'est pas cochée, les samedis et dimanches sont exclus.
 * C'est ce tableau filtré qui sert à générer le HTML, garantissant
 * une alternance CSS (nth-child) correcte et stable.
 */
function getVisibleDates(dates) {
  var chk = document.getElementById('chkShowWeekend');
  var showWeekend = chk ? chk.checked : true;
  if (showWeekend) return dates;
  return dates.filter(function (d) { return !isWeekend(d); });
}

function renderSidebar() {
  var c = document.getElementById('auditSidebarContent');
  if (!c) return;
  var names = getSortedKeys(audits, 'auditsOrder');
  if (names.length === 0) {
    c.innerHTML = '<div class="empty-state">Aucun audit.<br><a href="parametres.html">Configurer les audits</a></div>'; return;
  }
  var byTheme = {};
  names.forEach(function (n) {
    var t = audits[n].theme || 'Sans thème';
    if (!byTheme[t]) byTheme[t] = [];
    byTheme[t].push(n);
  });
  var freqLabels = { hebdo: '🔁 Hebdo', mensuel: '📅 Mensuel', ponctuel: '• Ponctuel' };
  var freqClasses = { hebdo: 'freq-hebdo', mensuel: 'freq-mensuel', ponctuel: 'freq-ponctuel' };
  var html = '<div class="sidebar-search-wrap"><i data-lucide="search" class="search-icon" style="width:14px; height:14px;"></i><input type="text" id="sidebarSearchInput" placeholder="Rechercher un audit..."></div>';
  Object.keys(byTheme).forEach(function (theme) {
    var tSlug = slugify(theme);
    html += '<div class="sidebar-acc"><div class="sidebar-acc-header theme-header-' + tSlug + '" onclick="this.parentElement.classList.toggle(\'closed\')"><span>' + escH(theme) + '</span><i data-lucide="chevron-down" style="width:12px; height:12px;"></i></div><div class="sidebar-acc-body">';
    byTheme[theme].forEach(function (n) {
      var a = audits[n];
      var freq = a.frequency || 'ponctuel';
      var freqBadge = '<span class="audit-card-freq ' + (freqClasses[freq] || 'freq-ponctuel') + '">' + (freqLabels[freq] || freq) + '</span>';
      var desc = a.description ? '<div class="audit-card-desc">' + escH(a.description) + '</div>' : '';
      var respLabel = '';
      if (a.defaultAssignee) {
        var respList = Array.isArray(a.defaultAssignee) ? a.defaultAssignee : [a.defaultAssignee];
        if (respList.length > 0) {
          respLabel = '<div class="audit-card-assignee"><i data-lucide="user" style="width:10px; height:10px; display:inline-block; vertical-align:middle; margin-right:4px;"></i>' + escH(respList.join(', ')) + '</div>';
        }
      }

      var exclDays = '';
      if (a.excludedDays && a.excludedDays.length > 0) {
        var dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
        exclDays = '<div class="audit-card-info-item"><i data-lucide="calendar-x" style="width:10px; height:10px; display:inline-block; vertical-align:middle; margin-right:4px;"></i>Jours : ' + a.excludedDays.map(function (d) { return dayNames[d]; }).join(', ') + '</div>';
      }
      var exclPers = '';
      if (a.excludedPersons && a.excludedPersons.length > 0) {
        exclPers = '<div class="audit-card-info-item"><i data-lucide="user-x" style="width:10px; height:10px; display:inline-block; vertical-align:middle; margin-right:4px;"></i>Exclus : ' + a.excludedPersons.join(', ') + '</div>';
      }
      var infoHtml = (exclDays || exclPers || respLabel) ?
        '<div class="audit-card-info">' + exclDays + exclPers + respLabel + '</div>' : '';

      html += '<div class="audit-card theme-' + tSlug + '" draggable="true" data-audit="' + escH(n) + '" data-type="audit-sidebar">' +
        '<div class="audit-card-name">' + escH(n) + '</div>' + freqBadge + desc + infoHtml + '</div>';
    });
    html += '</div></div>';
  });
  c.innerHTML = html;
  if (window.lucide) lucide.createIcons();
  initDragAndDrop();
  initSidebarReordering();
  initClickSelection(); // Nouvelle fonction pour mobile

  var searchInput = document.getElementById('sidebarSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      var q = this.value.toLowerCase().trim();
      document.querySelectorAll('.audit-card').forEach(function (card) {
        var name = (card.querySelector('.audit-card-name') || card).textContent.toLowerCase();
        card.classList.toggle('hidden-card', q.length > 0 && name.indexOf(q) === -1);
      });
    });
  }
}

function slugify(str) {
  return (str || 'autre').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');
}

function renderCalendar() {
  var titleEl = document.getElementById('calTitle');
  var wrapper = document.querySelector('.cal-wrapper');
  if (currentView === 'week') {
    if (wrapper) wrapper.classList.remove('month-view-wrapper');
    titleEl.textContent = getWeekLabel(getWeekMonday(new Date(currentDate)));
    renderWeek();
  } else {
    if (wrapper) wrapper.classList.add('month-view-wrapper');
    titleEl.textContent = getMonthLabel(currentDate.getFullYear(), currentDate.getMonth());
    renderMonth();
  }
}

function getInitials(name) {
  var words = name.trim().split(/[\s-]+/);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

function buildPersonHeader(pName, dates, isMonth) {
  var load = dates.reduce(function (acc, d) {
    return acc + (planning[d] && planning[d][pName] ? planning[d][pName].length : 0);
  }, 0);
  var overThreshold = isMonth ? 10 : 5;
  var loadBadge = load > 0 ? '<span class="person-load-badge' + (load > overThreshold ? ' overload' : '') + '">' + load + '</span>' : '<span></span>';
  var initials = getInitials(pName);

  return '<td class="person-name-cell sticky-col" draggable="true" data-person="' + escH(pName) + '" data-type="person-row">' +
    '<div class="person-info">' +
    '<div class="person-info-left">' +
    '<div class="reorder-handle no-print">⠿</div>' +
    '<div class="avatar" style="background:var(--accent);">' + initials + '</div>' +
    '<span class="p-name">' + escH(pName).replace(' ', '<br>') + '</span>' +
    '</div>' +
    '<div class="person-info-right">' +
    loadBadge +
    '<button class="view-person-btn no-print" onclick="openPersonSummary(\'' + escH(pName).replace(/'/g, "\\'") + '\')">👁</button>' +
    '</div>' +
    '</div></td>';
}

function renderWeek() {
  var monday = getWeekMonday(new Date(currentDate));
  // allDates : toutes les dates (pour les calculs de charge, absences, etc.)
  var allDates = getWeekDates(monday);
  // visibleDates : seulement les colonnes visibles → base du rendu HTML
  var visibleDates = getVisibleDates(allDates);
  var pNames = getSortedKeys(persons, 'personsOrder').filter(function (name) {
    return !persons[name].hidden;
  });
  var todayStr = formatDate(new Date());
  var c = document.getElementById('calGrid');
  if (pNames.length === 0) {
    c.innerHTML = '<div class="empty-state">Aucune personne.<br><a href="parametres.html">Ajouter des personnes</a></div>'; return;
  }
  var weekNum = getWeekNumber(monday);
  var html = '<table class="cal-grid"><thead><tr><th class="person-col"><div class="header-week-content"><span class="week-badge">S' + weekNum + '</span><span class="month-label">' + MONTH_NAMES[monday.getMonth()] + '</span></div></th>';

  // Génère l'en-tête uniquement pour les dates visibles (pas de even-col/odd-col JS)
  visibleDates.forEach(function (d) {
    var dObj = parseDate(d);
    var isWknd = isWeekend(d);
    var lbl = '<div class="header-day-content"><span class="day-name">' + DAY_NAMES_SHORT[dObj.getDay()] + '</span><span class="date-badge">' + dObj.getDate() + '</span></div>';
    var cls = (d === todayStr ? ' today-col' : '') + (isWknd ? ' weekend-col' : '');
    html += '<th class="' + cls.trim() + '">' + lbl + '</th>';
  });
  html += '</tr></thead><tbody>';
  pNames.forEach(function (pName) {
    var p = persons[pName];
    // buildPersonHeader utilise allDates pour le calcul de la charge
    html += '<tr>' + buildPersonHeader(pName, allDates, false);

    // Génère les cellules uniquement pour les dates visibles
    visibleDates.forEach(function (d) {
      var isWknd = isWeekend(d);
      var isAbs = (p.absences || []).indexOf(d) !== -1;

      if (isAbs) {
        html += '<td class="absent-cell" title="Absent(e)"></td>';
        return;
      }
      var cls = 'drop-zone' + (d === todayStr ? ' today-cell' : '') + (isWknd ? ' weekend-col' : '');
      html += '<td class="' + cls.trim() + '" data-date="' + d + '" data-person="' + escH(pName) + '" onclick="handleCellClick(event, this)">' + renderAssignments(d, pName) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  c.innerHTML = html;
  initDragAndDrop();
  initPersonReordering();
  initGrabToScroll();
  applyFilter();
  if (window.lucide) lucide.createIcons();
}

function renderMonth() {
  var year = currentDate.getFullYear(), month = currentDate.getMonth();
  // allDates : toutes les dates du mois (pour les calculs de charge, absences, etc.)
  var allDates = getMonthDates(year, month);
  // visibleDates : seulement les colonnes visibles → base du rendu HTML
  var visibleDates = getVisibleDates(allDates);
  var pNames = getSortedKeys(persons, 'personsOrder').filter(function (name) {
    return !persons[name].hidden;
  });
  var todayStr = formatDate(new Date());
  var c = document.getElementById('calGrid');
  if (pNames.length === 0) {
    c.innerHTML = '<div class="empty-state">Aucune personne.<br><a href="parametres.html">Ajouter des personnes</a></div>'; return;
  }

  // Suppression du week-badge en vue mois, on ne garde que le mois
  var html = '<table class="cal-grid month-view"><thead><tr><th class="person-col"><div class="header-week-content"><span class="month-label">' + MONTH_NAMES[month] + '</span></div></th>';

  // Génère l'en-tête uniquement pour les dates visibles (pas de even-col/odd-col JS)
  visibleDates.forEach(function (d) {
    var dObj = parseDate(d);
    var isOtherMonth = dObj.getMonth() !== month;
    var isWknd = isWeekend(d);

    var weekFlag = '';
    if (dObj.getDay() === 1) {
      weekFlag = '<span class="month-week-flag">S' + getWeekNumber(dObj) + '</span>';
    }
    var lbl = '<div class="header-day-content">' + weekFlag + '<span class="day-name">' + DAY_NAMES_SHORT[dObj.getDay()] + '</span><span class="date-badge">' + dObj.getDate() + '</span></div>';
    var cls = (d === todayStr ? ' today-col' : '') + (isWknd ? ' weekend-col' : '') + (isOtherMonth ? ' other-month' : '');
    html += '<th class="' + cls.trim() + '">' + lbl + '</th>';
  });

  html += '</tr></thead><tbody>';
  pNames.forEach(function (pName) {
    var p = persons[pName];
    // buildPersonHeader utilise allDates pour le calcul de la charge
    html += '<tr>' + buildPersonHeader(pName, allDates, true);

    // Génère les cellules uniquement pour les dates visibles
    visibleDates.forEach(function (dStr) {
      var dObj = parseDate(dStr);
      var isOtherMonth = dObj.getMonth() !== month;
      var isWknd = isWeekend(dStr);

      var extraCls = (isOtherMonth ? ' other-month' : '');
      var isAbs = (p.absences || []).indexOf(dStr) !== -1;

      if (isAbs) {
        html += '<td class="absent-cell' + extraCls + '" title="Absent(e)"></td>';
        return;
      }

      var cls = 'drop-zone' + (dStr === todayStr ? ' today-cell' : '') + (isWknd ? ' weekend-col' : '') + extraCls;
      html += '<td class="' + cls.trim() + '" data-date="' + dStr + '" data-person="' + escH(pName) + '" onclick="handleCellClick(event, this)">' + renderAssignments(dStr, pName) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  c.innerHTML = html;
  initGrabToScroll();
  initDragAndDrop();
  initPersonReordering();
  applyFilter();
  if (window.lucide) lucide.createIcons();
}

function renderAssignments(date, person) {
  if (!planning[date] || !planning[date][person]) return '';
  var html = '';
  planning[date][person].forEach(function (item, idx) {
    var isDone = item.status === 'done';
    var key = date + '|' + person + '|' + idx;
    var auditData = audits[item.audit] || {};
    var tooltip = auditData.description ? 'Description : ' + auditData.description : item.audit;
    var themeClass = 'theme-' + slugify(auditData.theme || '');
    var comment = item.comment || '';
    var descHtml = auditData.description ? '<div class="chip-desc">' + escH(auditData.description) + '</div>' : '';
    var hasNoteClass = comment ? ' has-note' : '';
    html += '<div class="assignment-chip ' + themeClass + hasNoteClass + (isDone ? ' done' : '') + '" draggable="' + (!isDone) + '" data-audit="' + escH(item.audit) + '" data-key="' + escH(key) + '" title="' + escH(tooltip) + '">' +
      '<span class="chip-print-checkbox only-print"></span>' +
      '<span class="assignment-chip-name">' + escH(item.audit) + '</span>' + descHtml +
      '<div class="chip-comment-wrap no-print">' +
      '<input type="text" class="chip-comment-input" placeholder="Note..." value="' + escH(comment) + '" ' +
      'onblur="saveAssignmentComment(\'' + date + '\',\'' + escH(person).replace(/'/g, "\\'") + '\',' + idx + ',this.value)" ' +
      'onmousedown="event.stopPropagation()" ondragstart="event.preventDefault();event.stopPropagation()">' +
      (comment ? '<button class="chip-comment-clear" title="Effacer la note" onclick="saveAssignmentComment(\'' + date + '\',\'' + escH(person).replace(/'/g, "\\'") + '\',' + idx + ',\'\');refreshCell(\'' + date + '\',\'' + escH(person).replace(/'/g, "\\'") + '\')"><i data-lucide="x-circle" style="width:14px; height:14px;"></i></button>' : '') +
      '</div>' +
      (comment ? '<div class="chip-comment-print only-print">' + escH(comment) + '</div>' : '') +
      '<div class="chip-actions">' +
      '<button class="chip-note' + (comment ? ' has-note' : '') + '" title="Ajouter une note" data-date="' + date + '" data-person="' + escH(person) + '" data-idx="' + idx + '">' +
      '<i data-lucide="message-square" style="width:14px; height:14px;"></i>' +
      '</button>' +
      '<button class="chip-validate" title="' + (isDone ? 'Annuler' : 'Valider') + '" data-date="' + date + '" data-person="' + escH(person) + '" data-idx="' + idx + '">' +
      '<i data-lucide="' + (isDone ? 'rotate-ccw' : 'check') + '" style="width:14px; height:14px;"></i>' +
      '</button>' +
      '<button class="chip-remove" title="Supprimer" data-date="' + date + '" data-person="' + escH(person) + '" data-idx="' + idx + '">' +
      '<i data-lucide="x" style="width:14px; height:14px;"></i>' +
      '</button>' +
      '</div></div>';
  });
  return html;
}

async function toggleStatus(date, person, idx) {
  if (!planning[date] || !planning[date][person] || planning[date][person][idx] === undefined) return;
  var cur = planning[date][person][idx].status;
  planning[date][person][idx].status = cur === 'done' ? 'pending' : 'done';
  await saveData('planning', planning);
  refreshCell(date, person); updateStats(); applyFilter();
}

async function saveAssignmentComment(date, person, idx, newComment) {
  if (!planning[date] || !planning[date][person] || planning[date][person][idx] === undefined) return;
  planning[date][person][idx].comment = newComment.trim();
  await saveData('planning', planning);
  refreshCell(date, person); // Rafraîchit la cellule pour mettre à jour le div .only-print
}

async function removeAssignment(date, person, idx) {
  if (!planning[date] || !planning[date][person]) return;
  planning[date][person].splice(idx, 1);
  if (!planning[date][person].length) delete planning[date][person];
  if (!Object.keys(planning[date] || {}).length) delete planning[date];
  await saveData('planning', planning);
  renderCalendar(); updateStats();
}

function refreshCell(date, person) {
  var sel = '.drop-zone[data-date="' + date + '"][data-person="' + person.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]';
  var cell = document.querySelector(sel);
  if (cell) {
    cell.innerHTML = renderAssignments(date, person);
    initDragAndDrop();
    if (window.lucide) lucide.createIcons();
  }
}

async function handleDrop(detail) {
  var auditName = detail.auditName, date = detail.date, person = detail.person;
  var source = detail.source, sourceKey = detail.sourceKey;
  if (source === 'cell' && sourceKey) {
    var parts = sourceKey.split('|'), srcDate = parts[0], srcPerson = parts[1], srcIdx = parseInt(parts[2]);
    if (srcDate === date && srcPerson === person) return;
    if (planning[srcDate] && planning[srcDate][srcPerson]) {
      var item = planning[srcDate][srcPerson][srcIdx];
      if (!item) return;
      planning[srcDate][srcPerson].splice(srcIdx, 1);
      if (!planning[srcDate][srcPerson].length) delete planning[srcDate][srcPerson];
      if (!Object.keys(planning[srcDate] || {}).length) delete planning[srcDate];
      if (!planning[date]) planning[date] = {};
      if (!planning[date][person]) planning[date][person] = [];
      planning[date][person].push(item);
      await saveData('planning', planning); renderCalendar(); updateStats(); return;
    }
  }
  if (persons[person] && (persons[person].absences || []).indexOf(date) !== -1) {
    showMessage('msg-planning', person + ' est absent(e) le ' + date, 'error'); return;
  }
  if (!planning[date]) planning[date] = {};
  if (!planning[date][person]) planning[date][person] = [];
  if (planning[date][person].some(function (a) { return a.audit === auditName; })) {
    showMessage('msg-planning', '"' + auditName + '" déjà assigné à ' + person + ' ce jour.', 'warning'); return;
  }
  planning[date][person].push({ audit: auditName, status: 'pending' });
  await saveData('planning', planning);
  refreshCell(date, person); updateStats(); applyFilter();
}

function runAutoFill() {
  if (!Object.keys(persons).length) { showMessage('msg-planning', 'Aucune personne. Allez dans Paramètres.', 'error'); return; }
  if (!Object.keys(audits).length) { showMessage('msg-planning', 'Aucun audit. Allez dans Paramètres.', 'error'); return; }

  showConfirm(
    'Remplissage Automatique',
    'Générer le planning automatiquement pour cette période ?<br>Les audits existants seront conservés.',
    'Lancer',
    'btn-primary',
    'zap',
    function () {
      var btn = document.getElementById('btnAutoFill');
      btn.disabled = true;
      btn.textContent = '⏳ En cours...';
      setTimeout(async function () {
        var period = document.getElementById('autoFillPeriod').value;
        var dates = period === 'week' ? getWeekDates(getWeekMonday(new Date(currentDate))) : getMonthDates(currentDate.getFullYear(), currentDate.getMonth());
        var result = autoFill(persons, audits, planning, dates);
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="zap" style="width:16px; height:16px;"></i> Lancer le remplissage';
        if (window.lucide) lucide.createIcons();
        if (!result.success) { showMessage('msg-planning', result.msg, 'error'); return; }
        planning = result.planning; await saveData('planning', planning);
        renderCalendar(); updateStats();
        showMessage('msg-planning', result.msg, result.type || 'success');
      }, 50);
    }
  );
}

async function clearPeriod() {
  var dates = getCurrentDates();
  showConfirm(
    'Vider la période',
    'Êtes-vous sûr de vouloir <strong>effacer toutes les assignations</strong> de cette période ?<br>Cette action est irréversible.',
    'Effacer tout',
    'btn-danger',
    'trash-2',
    async function () {
      dates.forEach(function (d) { delete planning[d]; });
      await saveData('planning', planning); renderCalendar(); updateStats();
      showMessage('msg-planning', 'Période effacée.', 'info');
    }
  );
}

function applyFilter() {
  var f = document.getElementById('filterStatus').value;
  document.querySelectorAll('.assignment-chip').forEach(function (chip) {
    if (f === 'all') chip.classList.remove('hidden-chip');
    else if (f === 'done') chip.classList.toggle('hidden-chip', !chip.classList.contains('done'));
    else chip.classList.toggle('hidden-chip', chip.classList.contains('done'));
  });
}

function updateStats() {
  var dates = getCurrentDates();
  var s = getPlanningStats(planning, dates);
  document.getElementById('statDone').textContent = s.done || 0;
  document.getElementById('statTotal').textContent = s.total || 0;
  document.getElementById('statPending').textContent = s.pending > 0 ? s.pending + ' en attente' : '';
}

function openPersonSummary(personName) {
  var modal = document.getElementById('personSummaryModal');
  if (!modal) return;
  var dates = getCurrentDates();
  var items = [];
  dates.forEach(function (d) {
    if (!planning[d] || !planning[d][personName]) return;
    planning[d][personName].forEach(function (a) {
      items.push({ date: d, audit: a.audit, status: a.status });
    });
  });
  var done = items.filter(function (i) { return i.status === 'done'; }).length;
  var pending = items.filter(function (i) { return i.status !== 'done'; }).length;
  var p = persons[personName] || {};
  var absCount = (p.absences || []).filter(function (d) { return dates.indexOf(d) !== -1; }).length;
  document.getElementById('psum-name').textContent = personName;
  document.getElementById('psum-avatar').textContent = personName[0] || '?';
  document.getElementById('psum-period').textContent = currentView === 'week' ?
    getWeekLabel(getWeekMonday(new Date(currentDate))) :
    getMonthLabel(currentDate.getFullYear(), currentDate.getMonth());
  document.getElementById('psum-done').textContent = done;
  document.getElementById('psum-pending').textContent = pending;
  document.getElementById('psum-abs').textContent = absCount;
  var listEl = document.getElementById('psum-list');
  if (items.length === 0) {
    listEl.innerHTML = '<li style="text-align:center;color:var(--text-muted);padding:20px;">Aucun audit planifié.</li>';
  } else {
    listEl.innerHTML = items.map(function (item) {
      var auditData = audits[item.audit] || {};
      var themeHtml = auditData.theme ? '<span style="font-size:10px;color:var(--text-muted);">[' + escH(auditData.theme) + ']</span> ' : '';
      var statusHtml = item.status === 'done' ?
        '<span class="psum-status-done">✓ Validé</span>' : '<span class="psum-status-pending">◌ En attente</span>';
      return '<li><div>' + themeHtml + '<strong>' + escH(item.audit) + '</strong></div>' +
        '<div style="display:flex;align-items:center;gap:12px;"><span class="psum-date">' + escH(formatDisplayDate(item.date)) + '</span>' + statusHtml + '</div></li>';
    }).join('');
  }
  modal.classList.add('open');
}

function initGrabToScroll() {
  var slider = document.querySelector('.cal-wrapper');
  if (!slider) return;
  var isDown = false, startX, scrollLeft;
  slider.onmousedown = function (e) {
    if (e.target.closest('.assignment-chip') || e.target.closest('button') || e.target.closest('input')) return;
    isDown = true;
    slider.classList.add('active');
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
  };
  slider.onmouseleave = function () { isDown = false; slider.classList.remove('active'); };
  slider.onmouseup = function () { isDown = false; slider.classList.remove('active'); };
  slider.onmousemove = function (e) {
    if (!isDown) return;
    e.preventDefault();
    slider.scrollLeft = scrollLeft - (e.pageX - slider.offsetLeft - startX) * 2;
  };
}

function initSidebarReordering() {
  var cards = document.querySelectorAll('.audit-card[data-type="audit-sidebar"]');
  cards.forEach(function (card) {
    card.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('reorder-audit', card.getAttribute('data-audit'));
      card.classList.add('reordering');
    });
    card.addEventListener('dragend', function () {
      card.classList.remove('reordering');
      document.querySelectorAll('.audit-card').forEach(function (c) { c.classList.remove('drag-over-top', 'drag-over-bottom'); });
    });
    card.addEventListener('dragover', function (e) {
      e.preventDefault();
      var rect = card.getBoundingClientRect();
      card.classList.remove('drag-over-top', 'drag-over-bottom');
      if (e.clientY - rect.top < rect.height / 2) card.classList.add('drag-over-top');
      else card.classList.add('drag-over-bottom');
    });
    card.addEventListener('drop', function (e) {
      e.preventDefault();
      var draggedAudit = e.dataTransfer.getData('reorder-audit');
      var targetAudit = card.getAttribute('data-audit');
      if (!draggedAudit || draggedAudit === targetAudit) return;
      var allAudits = getSortedKeys(audits, 'auditsOrder');
      var fromIdx = allAudits.indexOf(draggedAudit);
      var toIdx = allAudits.indexOf(targetAudit);
      var rect = card.getBoundingClientRect();
      if (e.clientY - rect.top >= rect.height / 2) toIdx++;
      allAudits.splice(fromIdx, 1);
      if (fromIdx < toIdx) toIdx--;
      allAudits.splice(toIdx, 0, draggedAudit);
      updateOrder('auditsOrder', allAudits);
      renderSidebar();
    });
  });
}

function initPersonReordering() {
  var cells = document.querySelectorAll('.person-name-cell[data-type="person-row"]');
  cells.forEach(function (cell) {
    cell.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('reorder-person', cell.getAttribute('data-person'));
      cell.parentElement.classList.add('reordering');
    });
    cell.addEventListener('dragend', function () {
      cell.parentElement.classList.remove('reordering');
      document.querySelectorAll('.person-name-cell').forEach(function (c) { c.classList.remove('drag-over-top', 'drag-over-bottom'); });
    });
    cell.addEventListener('dragover', function (e) {
      e.preventDefault();
      var rect = cell.getBoundingClientRect();
      cell.classList.remove('drag-over-top', 'drag-over-bottom');
      if (e.clientY - rect.top < rect.height / 2) cell.classList.add('drag-over-top');
      else cell.classList.add('drag-over-bottom');
    });
    cell.addEventListener('drop', function (e) {
      e.preventDefault();
      var draggedPerson = e.dataTransfer.getData('reorder-person');
      var targetPerson = cell.getAttribute('data-person');
      if (!draggedPerson || draggedPerson === targetPerson) return;
      var allPersons = getSortedKeys(persons, 'personsOrder');
      var fromIdx = allPersons.indexOf(draggedPerson);
      var toIdx = allPersons.indexOf(targetPerson);
      var rect = cell.getBoundingClientRect();
      if (e.clientY - rect.top >= rect.height / 2) toIdx++;
      allPersons.splice(fromIdx, 1);
      if (fromIdx < toIdx) toIdx--;
      allPersons.splice(toIdx, 0, draggedPerson);
      updateOrder('personsOrder', allPersons);
      renderCalendar();
    });
  });
}

// --- MENU CONTEXTUEL JOUR (mobile-first) ---

var _dayMenuDate = null;
var _dayMenuPerson = null;

function initClickSelection() {
  // Compat. ancienne API (inutilisée, le menu contextuel gère tout via handleCellClick)
}

function handleCellClick(e, td) {
  // Ignorer si le clic vient d'un audit existant (évite d'ouvrir le menu en cliquant sur les boutons Actions d'un audit)
  if (e && e.target && e.target.closest('.assignment-chip')) return;

  var date = td.getAttribute('data-date');
  var person = td.getAttribute('data-person');
  if (!date || !person) return;
  openDayMenu(date, person, td);
}

function openDayMenu(date, person, anchorTd) {
  _dayMenuDate = date;
  _dayMenuPerson = person;

  var modal = document.getElementById('dayMenuModal');
  var titleEl = document.getElementById('dayMenuTitle');
  var listEl = document.getElementById('dayMenuAuditList');

  var dObj = parseDate(date);
  var dayLabel = DAY_NAMES_SHORT[dObj.getDay()] + ' ' + dObj.getDate() + ' ' + MONTH_NAMES[dObj.getMonth()].slice(0, 3);
  titleEl.textContent = dayLabel + ' — ' + person;

  var names = getSortedKeys(audits, 'auditsOrder');
  if (names.length === 0) {
    listEl.innerHTML = '<p class="day-menu-empty">Aucun audit disponible.<br><a href="parametres.html">Configurer les audits</a></p>';
  } else {
    var byTheme = {};
    names.forEach(function (n) {
      var t = audits[n].theme || 'Sans thème';
      if (!byTheme[t]) byTheme[t] = [];
      byTheme[t].push(n);
    });
    var html = '';
    Object.keys(byTheme).forEach(function (theme) {
      html += '<div class="day-menu-theme-label">' + escH(theme) + '</div>';
      byTheme[theme].forEach(function (n) {
        var a = audits[n];
        var tSlug = slugify(a.theme || '');
        var freq = a.frequency || 'ponctuel';
        var freqColors = { hebdo: '#DBEAFE', mensuel: '#E0E7FF', ponctuel: '#F3F4F6' };
        var freqLabel = { hebdo: '🔁 Hebdo', mensuel: '📅 Mensuel', ponctuel: '• Ponctuel' };
        var alreadyAssigned = planning[date] && planning[date][person] && planning[date][person].some(function (x) { return x.audit === n; });
        html += '<button class="day-menu-audit-btn theme-' + tSlug + (alreadyAssigned ? ' day-menu-already' : '') + '" data-audit="' + escH(n) + '" aria-label="Ajouter ' + escH(n) + '">' +
          '<span class="day-menu-audit-name">' + escH(n) + '</span>' +
          '<span class="day-menu-audit-freq" style="background:' + (freqColors[freq] || '#F3F4F6') + '">' + (freqLabel[freq] || freq) + '</span>' +
          (alreadyAssigned ? '<span class="day-menu-already-badge">✓ Déjà assigné</span>' : '') +
          '</button>';
      });
    });
    listEl.innerHTML = html;

    listEl.querySelectorAll('.day-menu-audit-btn:not(.day-menu-already)').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var auditName = this.getAttribute('data-audit');
        var d = _dayMenuDate, p = _dayMenuPerson;
        closeDayMenu();
        handleDrop({ auditName: auditName, date: d, person: p, source: 'cell-click', sourceKey: null });
      });
    });
  }

  modal.classList.add('open');
  if (window.lucide) lucide.createIcons();
}

function closeDayMenu() {
  var modal = document.getElementById('dayMenuModal');
  if (modal) modal.classList.remove('open');
  _dayMenuDate = null;
  _dayMenuPerson = null;
}

// --- MODAL DE CONFIRMATION GÉNÉRIQUE ---
function showConfirm(title, message, okText, okColorClass, iconName, onConfirm) {
  var modal = document.getElementById('confirmModal');
  if (!modal) return;

  document.getElementById('confirmModalTitle').textContent = title;
  document.getElementById('confirmModalText').innerHTML = message;

  var iconEl = document.getElementById('confirmModalIcon');
  iconEl.innerHTML = '<i data-lucide="' + (iconName || 'help-circle') + '" style="width: 48px; height: 48px; margin: 0 auto;"></i>';
  iconEl.style.color = (okColorClass === 'btn-danger') ? 'var(--danger, #DC2626)' : 'var(--accent, #3B82F6)';

  var okBtn = document.getElementById('confirmModalOk');
  okBtn.textContent = okText || 'Confirmer';
  okBtn.className = 'btn ' + (okColorClass || 'btn-primary');

  var newOkBtn = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newOkBtn, okBtn);

  newOkBtn.onclick = function () {
    modal.classList.remove('open');
    if (onConfirm) onConfirm();
  };

  document.getElementById('confirmModalCancel').onclick = function () {
    modal.classList.remove('open');
  };

  // Fermeture fond
  modal.onclick = function (e) {
    if (e.target === modal) modal.classList.remove('open');
  };

  modal.classList.add('open');
  if (window.lucide) lucide.createIcons();
}
