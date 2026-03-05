async function initParametres() {
  persons = await loadData('persons', {});
  audits = await loadData('audits', {});
  planning = await loadData('planning', {});
  personsOrder = await loadData('personsOrder', []);
  auditsOrder = await loadData('auditsOrder', []);

  document.getElementById('btnAddPerson').onclick = addPerson;
  document.getElementById('personFirst').addEventListener('keydown', function (e) { if (e.key === 'Enter') addPerson(); });
  document.getElementById('personLast').addEventListener('keydown', function (e) { if (e.key === 'Enter') addPerson(); });
  document.getElementById('btnAddAudit').onclick = addAudit;
  document.getElementById('auditName').addEventListener('keydown', function (e) { if (e.key === 'Enter') addAudit(); });
  document.getElementById('auditTheme').addEventListener('keydown', function (e) { if (e.key === 'Enter') addAudit(); });

  var btnShowAuditForm = document.getElementById('btnShowAuditForm');
  if (btnShowAuditForm) {
    btnShowAuditForm.onclick = function () {
      var container = document.getElementById('auditFormContainer');
      if (container.style.display === 'none') {
        container.style.display = 'block';
        this.innerHTML = '<i data-lucide="minus" style="width:14px; height:14px;"></i> Annuler';
      } else {
        container.style.display = 'none';
        this.innerHTML = '<i data-lucide="plus" style="width:14px; height:14px;"></i> Nouveau Audit';
      }
      if (window.lucide) lucide.createIcons();
    };
  }

  document.querySelectorAll('.close-modal-person').forEach(function (btn) {
    btn.onclick = function () { document.getElementById('editPersonModal').classList.remove('open'); };
  });
  document.getElementById('btnSavePersonEdit').onclick = savePersonEdit;

  document.querySelectorAll('.close-modal-abs').forEach(function (btn) {
    btn.onclick = function () { document.getElementById('absencesModal').classList.remove('open'); };
  });
  document.getElementById('absPrevMonth').onclick = function () { moveAbsMonth(-1); };
  document.getElementById('absNextMonth').onclick = function () { moveAbsMonth(1); };

  initAbsCalendarEvents();

  document.querySelectorAll('.close-modal').forEach(function (btn) {
    btn.onclick = function () { document.getElementById('editAuditModal').classList.remove('open'); };
  });
  document.getElementById('btnSaveAuditEdit').onclick = saveAuditEdit;

  // Initialisation de la modale d'alerte
  var btnConfirm = document.getElementById('btnConfirmAlert');
  if (btnConfirm) {
    btnConfirm.onclick = function () {
      document.getElementById('alertModal').classList.remove('open');
    };
  }

  refreshParametres();
}

/**
 * Affiche une modale d'alerte stylisée au lieu d'une alert() navigateur
 * @param {string} title - Titre de l'alerte
 * @param {string} message - Message de l'alerte
 * @param {string} icon - Emoji ou icône (optionnel)
 */
function showAlertModal(title, message, icon) {
  var modal = document.getElementById('alertModal');
  var titleEl = document.getElementById('alertModalTitle');
  var msgEl = document.getElementById('alertModalMessage');
  var iconEl = document.getElementById('alertModalIcon');

  if (modal && titleEl && msgEl) {
    titleEl.textContent = title || "Attention";
    msgEl.innerHTML = message || "";
    if (icon && iconEl) iconEl.textContent = icon;
    else if (iconEl) iconEl.textContent = "⚠️";

    modal.classList.add('open');
  } else {
    // Fallback au cas où le HTML n'est pas chargé
    alert(title + "\n\n" + message);
  }
}

function refreshParametres() {
  renderPersons();
  renderAudits();
  renderAuditExclusionPersons('auditDefaultAssigneeGroup');
  renderAuditExclusionPersons('auditPersonExclusions');
}


function renderAuditExclusionPersons(containerId, selectedPersons) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  var names = Object.keys(persons).sort();
  if (names.length === 0) {
    container.innerHTML = '<span style="font-size:12px;color:var(--text-muted);font-style:italic;">Aucune personne configurée.</span>';
    return;
  }
  names.forEach(function (name) {
    var lbl = document.createElement('label');
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = name;
    if (selectedPersons && selectedPersons.indexOf(name) !== -1) cb.checked = true;
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + name));
    container.appendChild(lbl);
  });
}

async function addPerson() {
  var fIn = document.getElementById('personFirst');
  var lIn = document.getElementById('personLast');
  var first = fIn.value.trim();
  var last = lIn.value.trim();
  var errF = validateNonEmpty(first, 'Prénom');
  if (errF) { showMessage('msg-persons', errF, 'error'); return; }
  var errL = validateNonEmpty(last, 'Nom');
  if (errL) { showMessage('msg-persons', errL, 'error'); return; }
  var fullName = (first + ' ' + last).trim();
  if (persons[fullName]) { showMessage('msg-persons', '"' + fullName + '" existe déjà.', 'error'); return; }
  persons[fullName] = { prenom: first, nom: last, absences: [], hidden: false };
  await saveData('persons', persons);
  fIn.value = ''; lIn.value = '';
  renderPersons();
  renderAuditExclusionPersons('auditDefaultAssigneeGroup');
  renderAuditExclusionPersons('auditPersonExclusions');
  showMessage('msg-persons', '"' + fullName + '" ajouté.', 'success');
}

async function deletePerson(name) {
  if (!confirm('Supprimer "' + name + '" ?')) return;
  delete persons[name];
  await saveData('persons', persons);
  renderPersons();
  renderAuditExclusionPersons('auditDefaultAssigneeGroup');
  renderAuditExclusionPersons('auditPersonExclusions');
}

async function deleteAbsence(name, ds) {
  if (!persons[name]) return;
  var datesToDelete = ds.split(',');
  persons[name].absences = persons[name].absences.filter(function (d) {
    return datesToDelete.indexOf(d) === -1;
  });
  await saveData('persons', persons);
  renderPersonBlock(name, true);
}

function groupContiguousDates(dateStrings) {
  if (!dateStrings || dateStrings.length === 0) return [];
  var dates = dateStrings.slice().sort();
  var groups = [];
  var currentGroup = [dates[0]];

  for (var i = 1; i < dates.length; i++) {
    var prev = parseDate(dates[i - 1]);
    var curr = parseDate(dates[i]);
    var diff = (curr - prev) / (1000 * 60 * 60 * 24);
    if (Math.round(diff) === 1) {
      currentGroup.push(dates[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [dates[i]];
    }
  }
  groups.push(currentGroup);
  return groups;
}

function renderPersonBlock(name, keepOpen) {
  var container = document.getElementById('personsList');
  var sid = safeId(name);
  var existing = container.querySelector('.person-block[data-pid="' + sid + '"]');
  var wasOpen = existing ? existing.classList.contains('open') : false;
  var p = persons[name];
  var absCount = p.absences.length;
  var absLabel = absCount > 0 ? absCount + ' absence(s)' : 'Aucune absence';
  var groups = groupContiguousDates(p.absences);
  var absHtml = groups.length === 0 ? '<span class="no-abs-msg">Aucune absence.</span>' :
    groups.map(function (group) {
      var label = "";
      var dateValue = group.join(',');
      var badgeHtml = "";
      if (group.length === 1) {
        label = formatDisplayDate(group[0]);
      } else {
        label = formatDisplayDate(group[0]) + ' au ' + formatDisplayDate(group[group.length - 1]);
        badgeHtml = '<span class="absence-badge">' + group.length + '</span>';
      }
      return '<span class="absence-tag">' + escH(label) + badgeHtml +
        '<button class="del-abs-btn" data-name="' + escH(name) + '" data-date="' + escH(dateValue) + '">×</button></span>';
    }).join('');

  var block = document.createElement('div');
  block.className = 'person-block' + (keepOpen || wasOpen ? ' open' : '');
  block.setAttribute('data-pid', sid);
  block.innerHTML =
    '<div class="person-block-header" draggable="true" data-person="' + escH(name) + '">' +
    '<div style="display:flex;align-items:center;gap:8px;">' +
    '<div class="reorder-handle">⠿</div>' +
    '<span class="person-block-name">' + escH(name) + '</span>' +
    (p.hidden ? '<span class="person-block-meta" style="color:#EF4444;">(Masqué)</span>' : '') +
    '<span class="person-block-meta">' + escH(absLabel) + '</span>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:8px;">' +
    '<button class="btn btn-xs btn-outline manage-abs-btn">Absences</button>' +
    '<button class="btn btn-xs btn-outline edit-person-btn"><i data-lucide="edit-3" style="width:12px; height:12px;"></i></button>' +
    '<button class="btn btn-xs btn-danger del-person-btn"><i data-lucide="trash-2" style="width:12px; height:12px;"></i></button>' +
    '<span class="accordion-arrow">▼</span>' +
    '</div>' +
    '</div>' +
    '<div class="person-block-body">' +
    '<label style="font-size:12px;font-weight:500;color:var(--text-light);">Résumé des absences</label>' +
    '<div class="absences-list">' + absHtml + '</div>' +
    '</div>';

  block.querySelector('.person-block-header').addEventListener('click', function (e) {
    if (e.target.closest('.del-person-btn') || e.target.closest('.edit-person-btn') || e.target.closest('.manage-abs-btn')) return;
    block.classList.toggle('open');
  });
  block.querySelector('.edit-person-btn').addEventListener('click', function (e) {
    e.stopPropagation(); editPerson(name);
  });
  block.querySelector('.manage-abs-btn').addEventListener('click', function (e) {
    e.stopPropagation(); openAbsCalendar(name);
  });
  block.querySelector('.del-person-btn').addEventListener('click', function (e) {
    e.stopPropagation(); deletePerson(name);
  });
  block.querySelectorAll('.del-abs-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation(); deleteAbsence(name, btn.getAttribute('data-date'));
    });
  });

  if (existing) existing.replaceWith(block);
  else container.appendChild(block);
}

function renderPersons() {
  var container = document.getElementById('personsList');
  if (!container) return;
  var empty = document.getElementById('personsEmpty');
  var names = getSortedKeys(persons, 'personsOrder');
  container.querySelectorAll('.person-block').forEach(function (el) { el.remove(); });
  if (names.length === 0) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  names.forEach(function (n) { renderPersonBlock(n, false); });
  if (window.lucide) lucide.createIcons();
  initParametresReordering('person', '.person-block-header', 'person', 'personsOrder', renderPersons);
}

async function addAudit() {
  try {
    var nIn = document.getElementById('auditName');
    var tIn = document.getElementById('auditTheme');
    var dIn = document.getElementById('auditDesc');
    var fIn = document.getElementById('auditFreq');
    if (!nIn || !tIn || !dIn || !fIn) { alert('Erreur technique : champs manquants.'); return; }
    var name = nIn.value.trim();
    var theme = tIn.value.trim();
    var desc = dIn.value.trim();
    var freq = fIn.value;
    var errN = validateNonEmpty(name, "Nom de l'audit");
    if (errN) { showMessage('msg-audits', errN, 'error'); return; }
    var errT = validateNonEmpty(theme, 'Thème');
    if (errT) { showMessage('msg-audits', errT, 'error'); return; }
    if (audits[name]) { showMessage('msg-audits', '"' + name + '" existe déjà.', 'error'); return; }
    var excludedDays = [];
    document.querySelectorAll('#auditExclusions input:checked').forEach(function (cb) {
      excludedDays.push(parseInt(cb.value));
    });
    var excludedPersons = [];
    document.querySelectorAll('#auditPersonExclusions input:checked').forEach(function (cb) {
      excludedPersons.push(cb.value);
    });
    var defaultAssignees = [];
    document.querySelectorAll('#auditDefaultAssigneeGroup input:checked').forEach(function (cb) {
      defaultAssignees.push(cb.value);
    });
    // Vérification de conflit : un responsable ne doit pas être exclu
    var conflicts = defaultAssignees.filter(function (name) { return excludedPersons.indexOf(name) !== -1; });
    if (conflicts.length > 0) {
      showAlertModal("Conflit détecté", "<strong>" + conflicts.join(', ') + "</strong> est désigné comme auditeur responsable ET est dans la liste des personnes à exclure.<br><br>Veuillez corriger ce conflit pour continuer.", "🚫");
      return;
    }
    audits[name] = {
      nom: name, theme: theme, description: desc, frequency: freq,
      excludedDays: excludedDays,
      excludedPersons: excludedPersons,
      defaultAssignee: defaultAssignees
    };
    await saveData('audits', audits);
    nIn.value = ''; tIn.value = ''; dIn.value = '';
    document.querySelectorAll('#auditExclusions input').forEach(function (cb) {
      cb.checked = (cb.value === '0' || cb.value === '6');
    });
    document.querySelectorAll('#auditPersonExclusions input').forEach(function (cb) {
      cb.checked = false;
    });
    document.querySelectorAll('#auditDefaultAssigneeGroup input').forEach(function (cb) {
      cb.checked = false;
    });
    nIn.focus();
    renderAudits();
    showMessage('msg-audits', '"' + name + '" ajouté.', 'success');
    var container = document.getElementById('auditFormContainer');
    if (container) container.style.display = 'none';
    var btnShow = document.getElementById('btnShowAuditForm');
    if (btnShow) {
      btnShow.innerHTML = '<i data-lucide="plus" style="width:14px; height:14px;"></i> Nouveau Audit';
      if (window.lucide) lucide.createIcons();
    }
  } catch (e) {
    console.error('addAudit error:', e);
    alert('Erreur lors de l\'ajout : ' + e.message);
  }
}

async function deleteAudit(name) {
  if (!confirm('Supprimer "' + name + '" ?')) return;
  delete audits[name];
  await saveData('audits', audits);
  renderAudits();
}

function renderAudits() {
  var container = document.getElementById('auditsList');
  if (!container) return;
  var empty = document.getElementById('auditsEmpty');
  var names = getSortedKeys(audits, 'auditsOrder');
  container.querySelectorAll('.accordion').forEach(function (el) { el.remove(); });
  if (names.length === 0) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  var byTheme = {};
  names.forEach(function (n) {
    var t = audits[n].theme || 'Sans thème';
    if (!byTheme[t]) byTheme[t] = [];
    byTheme[t].push(n);
  });

  var idx = 0;
  Object.keys(byTheme).forEach(function (theme) {
    var list = byTheme[theme];
    var acc = document.createElement('div');
    acc.className = 'accordion open'; acc.id = 'acc_t_' + idx++;

    var dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    var itemsHtml = list.map(function (n) {
      var a = audits[n];
      var exclHtml = '';
      if (a.excludedDays && a.excludedDays.length > 0) {
        var exclNames = a.excludedDays.map(function (d) { return dayNames[d]; });
        exclHtml = '<span class="excluded-days-tag">Excl: ' + exclNames.join(', ') + '</span>';
      }
      var info = a.frequency ? '<span class="list-item-sub">Fréq: ' + escH(a.frequency) + '</span>' : '';
      var desc = a.description ? '<div style="font-size:11px;color:var(--text-muted);font-style:italic;">' + escH(a.description) + '</div>' : '';
      var respLabel = '';
      if (a.defaultAssignee) {
        var respList = Array.isArray(a.defaultAssignee) ? a.defaultAssignee : [a.defaultAssignee];
        if (respList.length > 0) {
          respLabel = '<span class="list-item-sub"><i data-lucide="user-check" style="width:11px; height:11px; display:inline-block; vertical-align:middle; margin-right:4px;"></i>' + escH(respList.join(', ')) + '</span>';
        }
      }
      return '<li class="list-item" draggable="true" data-audit="' + escH(n) + '">' +
        '<div class="reorder-handle">⠿</div>' +
        '<div class="list-item-content">' +
        '<span class="list-item-title">' + escH(n) + exclHtml + '</span>' +
        info + respLabel + desc +
        '</div>' +
        '<div class="btn-group">' +
        '<button class="btn btn-xs btn-outline edit-audit-btn" data-name="' + escH(n) + '"><i data-lucide="edit-3" style="width:12px; height:12px;"></i></button>' +
        '<button class="btn btn-xs btn-danger del-audit-btn" data-name="' + escH(n) + '"><i data-lucide="trash-2" style="width:12px; height:12px;"></i></button>' +
        '</div></li>';
    }).join('');

    acc.innerHTML =
      '<div class="accordion-header"><span>' + escH(theme) +
      ' <span style="font-size:11px;color:var(--text-muted);font-weight:400;">(' + list.length + ')</span></span>' +
      '<span class="accordion-arrow">▼</span></div>' +
      '<div class="accordion-body"><ul class="list">' + itemsHtml + '</ul></div>';

    acc.querySelector('.accordion-header').addEventListener('click', function () { acc.classList.toggle('open'); });
    acc.querySelectorAll('.edit-audit-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); editAudit(btn.getAttribute('data-name')); });
    });
    acc.querySelectorAll('.del-audit-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); deleteAudit(btn.getAttribute('data-name')); });
    });
    container.appendChild(acc);
  });
  if (window.lucide) lucide.createIcons();
  initParametresReordering('audit', '.list-item', 'audit', 'auditsOrder', renderAudits);
}

function initParametresReordering(type, selector, dataAttr, orderKey, refreshFn) {
  var elements = document.querySelectorAll(selector + '[draggable="true"]');
  elements.forEach(function (el) {
    el.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('reorder-' + type, el.getAttribute('data-' + dataAttr));
      el.classList.add('reordering');
    });
    el.addEventListener('dragend', function () {
      el.classList.remove('reordering');
      elements.forEach(function (e) { e.classList.remove('drag-over-top', 'drag-over-bottom'); });
    });
    el.addEventListener('dragover', function (e) {
      e.preventDefault();
      var rect = el.getBoundingClientRect();
      el.classList.remove('drag-over-top', 'drag-over-bottom');
      if (e.clientY - rect.top < rect.height / 2) el.classList.add('drag-over-top');
      else el.classList.add('drag-over-bottom');
    });
    el.addEventListener('drop', function (e) {
      e.preventDefault();
      var draggedId = e.dataTransfer.getData('reorder-' + type);
      var targetId = el.getAttribute('data-' + dataAttr);
      if (!draggedId || draggedId === targetId) return;
      var data = (type === 'person') ? persons : audits;
      var allKeys = getSortedKeys(data, orderKey);
      var fromIdx = allKeys.indexOf(draggedId);
      var toIdx = allKeys.indexOf(targetId);
      var rect = el.getBoundingClientRect();
      if (e.clientY - rect.top >= rect.height / 2) toIdx++;
      allKeys.splice(fromIdx, 1);
      if (fromIdx < toIdx) toIdx--;
      allKeys.splice(toIdx, 0, draggedId);
      updateOrder(orderKey, allKeys);
      refreshFn();
    });
  });
}


function editPerson(name) {
  var p = persons[name];
  if (!p) return;
  document.getElementById('editPersonOldName').value = name;
  document.getElementById('editPersonFirst').value = p.prenom || '';
  document.getElementById('editPersonLast').value = p.nom || '';
  document.getElementById('editPersonVisible').checked = !p.hidden;
  document.getElementById('editPersonModal').classList.add('open');
}

async function savePersonEdit() {
  var oldName = document.getElementById('editPersonOldName').value;
  var first = document.getElementById('editPersonFirst').value.trim();
  var last = document.getElementById('editPersonLast').value.trim();
  if (!first || !last) { alert('Prénom et Nom sont obligatoires.'); return; }
  var newName = (first + ' ' + last).trim();
  if (newName !== oldName && persons[newName]) { alert('Cette personne existe déjà.'); return; }
  var pData = persons[oldName];
  var isVisible = document.getElementById('editPersonVisible').checked;
  if (newName !== oldName) {
    delete persons[oldName];
    updatePlanningReferences(planning, oldName, newName, 'person');
  }
  persons[newName] = { prenom: first, nom: last, absences: pData.absences || [], hidden: !isVisible };
  await saveData('persons', persons);
  await saveData('planning', planning);
  document.getElementById('editPersonModal').classList.remove('open');
  renderPersons();
  renderAuditExclusionPersons('auditDefaultAssigneeGroup');
  renderAuditExclusionPersons('auditPersonExclusions');
  showMessage('msg-persons', 'Personne mise à jour.', 'success');
}

var currentAbsPerson = null;
var absCalDate = new Date();
var isDraggingAbs = false;
var dragStartValue = null;

function openAbsCalendar(name) {
  currentAbsPerson = name;
  absCalDate = new Date();
  document.getElementById('absModalTitle').textContent = 'Absences : ' + name;
  renderAbsCalendar();
  document.getElementById('absencesModal').classList.add('open');
}

function moveAbsMonth(dir) {
  absCalDate.setMonth(absCalDate.getMonth() + dir);
  renderAbsCalendar();
}

function renderAbsCalendar() {
  var container = document.getElementById('absCalendarGrid');
  var label = document.getElementById('absCurrentMonthLabel');
  var year = absCalDate.getFullYear();
  var month = absCalDate.getMonth();
  label.textContent = MONTH_NAMES[month] + ' ' + year;
  var firstDay = new Date(year, month, 1);
  var startOffset = (firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1);
  var numDays = new Date(year, month + 1, 0).getDate();
  var html = '';
  ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].forEach(function (d) {
    html += '<div class="abs-day-header">' + d + '</div>';
  });
  for (var i = 0; i < startOffset; i++) html += '<div class="abs-day prev-month"></div>';
  var p = persons[currentAbsPerson];
  var todayStr = formatDate(new Date());
  for (var day = 1; day <= numDays; day++) {
    var dObj = new Date(year, month, day);
    var dStr = formatDate(dObj);
    var isAbs = p.absences.indexOf(dStr) !== -1;
    var weekend = (dObj.getDay() === 0 || dObj.getDay() === 6);
    var cls = 'abs-day' + (isAbs ? ' is-absent' : '') + (weekend ? ' is-weekend' : '') + (dStr === todayStr ? ' is-today' : '');
    html += '<div class="' + cls + '" data-date="' + dStr + '"><span class="abs-day-num">' + day + '</span></div>';
  }
  container.innerHTML = html;
}

function initAbsCalendarEvents() {
  var container = document.getElementById('absCalendarGrid');

  container.addEventListener('mousedown', function (e) {
    var dayEl = e.target.closest('.abs-day');
    if (!dayEl || !dayEl.dataset.date || dayEl.classList.contains('prev-month')) return;
    isDraggingAbs = true;
    var date = dayEl.dataset.date;
    var isAbs = persons[currentAbsPerson].absences.indexOf(date) !== -1;
    dragStartValue = !isAbs;
    toggleAbsenceState(date, dragStartValue);
    dayEl.classList.toggle('is-absent', dragStartValue);
  });

  var onMouseMove = function (e) {
    if (!isDraggingAbs) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (el) el = el.closest('.abs-day');
    if (el && el.dataset.date && !el.classList.contains('prev-month')) {
      var date = el.dataset.date;
      var isCurrentAbs = persons[currentAbsPerson].absences.indexOf(date) !== -1;
      if (isCurrentAbs !== dragStartValue) {
        toggleAbsenceState(date, dragStartValue);
        el.classList.toggle('is-absent', dragStartValue);
      }
    }
  };

  var onMouseUp = async function () {
    if (!isDraggingAbs) return;
    isDraggingAbs = false;
    await saveData('persons', persons);
    renderPersonBlock(currentAbsPerson, true);
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

function toggleAbsenceState(date, state) {
  var abs = persons[currentAbsPerson].absences;
  var idx = abs.indexOf(date);
  if (state && idx === -1) { abs.push(date); abs.sort(); }
  else if (!state && idx !== -1) { abs.splice(idx, 1); }
}

function editAudit(name) {
  var a = audits[name];
  if (!a) return;
  document.getElementById('editAuditOldName').value = name;
  document.getElementById('editAuditName').value = a.nom || name;
  document.getElementById('editAuditTheme').value = a.theme || '';
  document.getElementById('editAuditDesc').value = a.description || '';
  document.getElementById('editAuditFreq').value = a.frequency || 'ponctuel';
  renderAuditExclusionPersons('editAuditDefaultAssigneeGroup', Array.isArray(a.defaultAssignee) ? a.defaultAssignee : [a.defaultAssignee]);
  document.querySelectorAll('#editAuditExclusions input').forEach(function (cb) {
    cb.checked = (a.excludedDays || []).indexOf(parseInt(cb.value)) !== -1;
  });
  renderAuditExclusionPersons('editAuditPersonExclusions', a.excludedPersons || []);
  document.getElementById('editAuditModal').classList.add('open');
}

async function saveAuditEdit() {
  var oldName = document.getElementById('editAuditOldName').value;
  var newName = document.getElementById('editAuditName').value.trim();
  var newTheme = document.getElementById('editAuditTheme').value.trim();
  var newDesc = document.getElementById('editAuditDesc').value.trim();
  var newFreq = document.getElementById('editAuditFreq').value;
  if (!newName) { alert('Le nom est obligatoire.'); return; }
  if (!newTheme) { alert('Le thème est obligatoire.'); return; }
  if (newName !== oldName && audits[newName]) { alert('Un audit porte déjà ce nom.'); return; }
  var newExcluded = [];
  document.querySelectorAll('#editAuditExclusions input:checked').forEach(function (cb) {
    newExcluded.push(parseInt(cb.value));
  });
  var newExcludedPersons = [];
  document.querySelectorAll('#editAuditPersonExclusions input:checked').forEach(function (cb) {
    newExcludedPersons.push(cb.value);
  });
  var defaultAssignees = [];
  document.querySelectorAll('#editAuditDefaultAssigneeGroup input:checked').forEach(function (cb) {
    defaultAssignees.push(cb.value);
  });
  var conflicts = defaultAssignees.filter(function (name) { return newExcludedPersons.indexOf(name) !== -1; });
  if (conflicts.length > 0) {
    showAlertModal("Conflit détecté", "<strong>" + conflicts.join(', ') + "</strong> est désigné comme auditeur responsable ET est dans la liste des personnes à exclure.<br><br>Veuillez corriger ce conflit pour continuer.", "🚫");
    return;
  }
  var updated = {
    nom: newName, theme: newTheme, description: newDesc, frequency: newFreq,
    excludedDays: newExcluded,
    excludedPersons: newExcludedPersons,
    defaultAssignee: defaultAssignees
  };
  if (newName !== oldName) {
    delete audits[oldName];
    updatePlanningReferences(planning, oldName, newName, 'audit');
  }
  audits[newName] = updated;
  await saveData('audits', audits);
  await saveData('planning', planning);
  document.getElementById('editAuditModal').classList.remove('open');
  renderAudits();
  showMessage('msg-audits', 'Audit mis à jour.', 'success');
}
