// Configuration Supabase récupérée depuis js/config.js (via window.PARAM_ENV)
var SUPABASE_URL = (window.PARAM_ENV && window.PARAM_ENV.SUPABASE_URL) || '';
var SUPABASE_KEY = (window.PARAM_ENV && window.PARAM_ENV.SUPABASE_KEY) || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Erreur de configuration : Les clés Supabase sont manquantes dans js/config.js.");
  alert("Erreur de configuration détectée. Vérifiez le fichier js/config.js.");
}

// Le client est créé de manière sécurisée
var supabase;
try {
  if (window.supabase && SUPABASE_URL && SUPABASE_KEY) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
} catch (e) {
  console.error("Erreur d'initialisation Supabase dans scripts.js:", e);
}

// Gestion de la session
async function checkAuth() {
  if (!supabase) {
    console.error("Supabase n'est pas initialisé.");
    if (!window.location.pathname.includes('login.html')) {
      window.location.href = 'login.html';
    }
    return null;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session && !window.location.pathname.includes('login.html')) {
    window.location.href = 'login.html';
  }
  return session;
}
async function signOut() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

function escH(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function safeId(s) { return String(s).replace(/[^a-zA-Z0-9]/g, '_'); }

var persons = {}, audits = {}, planning = {};
var personsOrder = [], auditsOrder = [];

async function saveData(key, data) {
  const session = await checkAuth();
  if (!session) return false;

  // Cache local pour performance immédiate
  localStorage.setItem(key, JSON.stringify(data));

  try {
    const { error } = await supabase
      .from('storage')
      .upsert({
        user_id: session.user.id,
        key: key,
        data: data,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id, key' });

    if (error) throw error;
    return true;
  } catch (e) {
    console.error(`Erreur de sauvegarde Supabase (${key}):`, e);
    return false;
  }
}

async function loadData(key, defaultValue) {
  const session = await checkAuth();
  if (!session) {
    const local = localStorage.getItem(key);
    return local ? JSON.parse(local) : (defaultValue || {});
  }

  try {
    const { data, error } = await supabase
      .from('storage')
      .select('data')
      .eq('user_id', session.user.id)
      .eq('key', key)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      localStorage.setItem(key, JSON.stringify(data.data));
      return data.data;
    }
  } catch (e) {
    console.error(`Erreur de chargement Supabase (${key}):`, e);
  }

  const local = localStorage.getItem(key);
  if (local) {
    try { return JSON.parse(local); } catch (e) { return defaultValue || {}; }
  }
  return defaultValue || {};
}
window.saveData = saveData;
window.loadData = loadData;

function getSortedKeys(data, orderKey) {
  var keys = Object.keys(data);
  var order = (orderKey === 'personsOrder') ? personsOrder : auditsOrder;
  if (!order || !Array.isArray(order) || order.length === 0) return keys.sort();
  var sorted = order.filter(function (k) { return keys.indexOf(k) !== -1; });
  keys.forEach(function (k) { if (sorted.indexOf(k) === -1) sorted.push(k); });
  return sorted;
}

async function updateOrder(orderKey, newOrder) {
  if (orderKey === 'personsOrder') personsOrder = newOrder;
  else if (orderKey === 'auditsOrder') auditsOrder = newOrder;
  await saveData(orderKey, newOrder);
}


function showMessage(id, msg, type) {
  if (!type) type = 'error';
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'message ' + type;
  el.style.display = 'block';
  if (el._timeout) clearTimeout(el._timeout);
  el._timeout = setTimeout(function () { el.style.display = 'none'; }, 5000);
}
window.getSortedKeys = getSortedKeys;
window.updateOrder = updateOrder;
window.showMessage = showMessage;

var DAY_NAMES_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
var DAY_NAMES_LONG = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
var MONTH_NAMES = ['Janvier', 'F\u00e9vrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Ao\u00fbt', 'Septembre', 'Octobre', 'Novembre', 'D\u00e9cembre'];

function formatDate(date) {
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function parseDate(str) {
  var parts = str.split('-');
  return new Date(+parts[0], +parts[1] - 1, +parts[2]);
}

function formatDisplayDate(dateStr) {
  var d = parseDate(dateStr);
  return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()].slice(0, 3);
}

function getWeekMonday(date) {
  var d = new Date(date);
  var day = d.getDay();
  var diff = (day === 0) ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDates(mondayDate) {
  var dates = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(mondayDate);
    d.setDate(d.getDate() + i);
    dates.push(formatDate(d));
  }
  return dates;
}

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getMonthDates(year, month) {
  var dates = [];
  var firstDayOfMonth = new Date(year, month, 1);
  var lastDayOfMonth = new Date(year, month + 1, 0);

  // On commence au lundi de la première semaine du mois
  var d = getWeekMonday(firstDayOfMonth);

  // On s'arrête au dimanche de la dernière semaine du mois
  var endDate = new Date(lastDayOfMonth);
  var day = endDate.getDay();
  var diff = (day === 0) ? 0 : 7 - day;
  endDate.setDate(endDate.getDate() + diff);
  endDate.setHours(23, 59, 59, 999);

  var current = new Date(d);
  while (current <= endDate) {
    dates.push(formatDate(new Date(current)));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function getPastNWeeksDates(n) {
  var today = new Date();
  var all = [];
  for (var i = 1; i <= n; i++) {
    var d = new Date(today);
    d.setDate(today.getDate() - i * 7);
    var monday = getWeekMonday(d);
    var wDates = getWeekDates(monday);
    for (var j = 0; j < wDates.length; j++) all.push(wDates[j]);
  }
  return all;
}

function getWeekLabel(mondayDate) {
  var sunday = new Date(mondayDate);
  sunday.setDate(sunday.getDate() + 6);
  return 'Semaine du ' + mondayDate.getDate() + ' ' + MONTH_NAMES[mondayDate.getMonth()].slice(0, 3) +
    ' au ' + sunday.getDate() + ' ' + MONTH_NAMES[sunday.getMonth()].slice(0, 3) + ' ' + sunday.getFullYear();
}

function getMonthLabel(year, month) { return MONTH_NAMES[month] + ' ' + year; }

function isWeekend(dateStr) {
  var d = parseDate(dateStr);
  return d.getDay() === 0 || d.getDay() === 6;
}
window.formatDate = formatDate;
window.parseDate = parseDate;
window.formatDisplayDate = formatDisplayDate;
window.getWeekMonday = getWeekMonday;
window.getWeekDates = getWeekDates;
window.getWeekNumber = getWeekNumber;
window.getMonthDates = getMonthDates;
window.getPastNWeeksDates = getPastNWeeksDates;
window.getWeekLabel = getWeekLabel;
window.getMonthLabel = getMonthLabel;
window.isWeekend = isWeekend;

var draggedAudit = null, dragSource = null, dragSourceKey = null;

function initDragAndDrop() {
  document.querySelectorAll('.audit-card').forEach(function (card) {
    card.removeEventListener('dragstart', onAuditDragStart);
    card.removeEventListener('dragend', onDragEnd);
    card.addEventListener('dragstart', onAuditDragStart);
    card.addEventListener('dragend', onDragEnd);
  });
  document.querySelectorAll('.drop-zone').forEach(function (zone) {
    zone.removeEventListener('dragover', onDragOver);
    zone.removeEventListener('dragleave', onDragLeave);
    zone.removeEventListener('drop', onDrop);
    zone.addEventListener('dragover', onDragOver);
    zone.addEventListener('dragleave', onDragLeave);
    zone.addEventListener('drop', onDrop);
  });
  document.querySelectorAll('.assignment-chip[draggable="true"]').forEach(function (chip) {
    chip.removeEventListener('dragstart', onChipDragStart);
    chip.removeEventListener('dragend', onDragEnd);
    chip.addEventListener('dragstart', onChipDragStart);
    chip.addEventListener('dragend', onDragEnd);
  });
}

function onAuditDragStart(e) {
  draggedAudit = e.currentTarget.dataset.audit;
  dragSource = 'sidebar'; dragSourceKey = null;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('text/plain', draggedAudit);
}

function onChipDragStart(e) {
  draggedAudit = e.currentTarget.dataset.audit;
  dragSource = 'cell'; dragSourceKey = e.currentTarget.dataset.key;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedAudit);
  e.stopPropagation();
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.drop-zone').forEach(function (z) { z.classList.remove('drag-over'); });
}

function onDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
  e.dataTransfer.dropEffect = dragSource === 'cell' ? 'move' : 'copy';
}

function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

function onDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  var auditName = e.dataTransfer.getData('text/plain') || draggedAudit;
  if (!auditName) return;
  var date = e.currentTarget.dataset.date;
  var person = e.currentTarget.dataset.person;
  if (!date || !person) return;
  document.dispatchEvent(new CustomEvent('auditDropped', {
    detail: { auditName: auditName, date: date, person: person, source: dragSource, sourceKey: dragSourceKey }
  }));
  draggedAudit = null; dragSource = null; dragSourceKey = null;
}

function autoFill(persons, audits, planning, dates) {
  var personNames = Object.keys(persons).filter(function (name) {
    return !persons[name].hidden;
  });
  var auditNames = Object.keys(audits);
  if (personNames.length === 0) return { success: false, msg: 'Aucune personne configurée.' };
  if (auditNames.length === 0) return { success: false, msg: 'Aucun audit configuré.' };

  var newPlanning = JSON.parse(JSON.stringify(planning));
  var toAssign = [];

  auditNames.forEach(function (name) {
    var audit = audits[name];
    var freq = audit.frequency || 'ponctuel';
    var needed = 0;
    var currentCount = 0;
    dates.forEach(function (d) {
      if (planning[d]) {
        Object.keys(planning[d]).forEach(function (p) {
          planning[d][p].forEach(function (a) { if (a.audit === name) currentCount++; });
        });
      }
    });
    if (freq === 'hebdo') {
      var mondays = [];
      dates.forEach(function (d) {
        var m = formatDate(getWeekMonday(parseDate(d)));
        if (mondays.indexOf(m) === -1) mondays.push(m);
      });
      mondays.forEach(function (m) {
        var weekDates = getWeekDates(parseDate(m));
        var foundInWeek = false;
        weekDates.forEach(function (wd) {
          if (planning[wd]) {
            Object.keys(planning[wd]).forEach(function (p) {
              planning[wd][p].forEach(function (a) { if (a.audit === name) foundInWeek = true; });
            });
          }
        });
        if (!foundInWeek) needed++;
      });
    } else if (freq === 'mensuel') {
      if (currentCount === 0) needed = 1;
    } else {
      if (currentCount === 0) needed = 1;
    }
    for (var i = 0; i < needed; i++) toAssign.push(name);
  });

  if (toAssign.length === 0) return { success: false, msg: 'Tous les audits respectent déjà leur fréquence.' };

  var pastDates = getPastNWeeksDates(3);
  var history = {};
  personNames.forEach(function (p) {
    history[p] = { audits: {}, themes: {} };
    pastDates.forEach(function (d) {
      if (!planning[d] || !planning[d][p]) return;
      planning[d][p].forEach(function (a) {
        history[p].audits[a.audit] = true;
        if (audits[a.audit]) history[p].themes[audits[a.audit].theme] = true;
      });
    });
  });

  var weeklyCount = {};
  function getWKey(d) { return formatDate(getWeekMonday(parseDate(d))) + '|'; }
  function getLoad(person) {
    return dates.reduce(function (acc, d) {
      return acc + (newPlanning[d] && newPlanning[d][person] ? newPlanning[d][person].length : 0);
    }, 0);
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function isHebdoInWeek(auditName, mondayStr) {
    var inWeek = false;
    getWeekDates(parseDate(mondayStr)).forEach(function (wd) {
      if (newPlanning[wd]) {
        Object.keys(newPlanning[wd]).forEach(function (p) {
          newPlanning[wd][p].forEach(function (a) { if (a.audit === auditName) inWeek = true; });
        });
      }
    });
    return inWeek;
  }
  function placeAudit(auditName, d, person) {
    if (!newPlanning[d]) newPlanning[d] = {};
    if (!newPlanning[d][person]) newPlanning[d][person] = [];
    newPlanning[d][person].push({ audit: auditName, status: 'pending' });
    var wk = getWKey(d) + person;
    weeklyCount[wk] = (weeklyCount[wk] || 0) + 1;
  }

  var todayStr = formatDate(new Date());
  var assigned = 0, warnings = [], failed = [];
  var workDates = dates.filter(function (d) {
    return !isWeekend(d) && d >= todayStr;
  });
  if (workDates.length === 0) return { success: false, msg: 'Aucun jour ouvré disponible (passé ou week-end).' };

  shuffle(toAssign).forEach(function (auditName) {
    var audit = audits[auditName] || {};
    var sDates = shuffle(workDates);
    var placed = false;

    function tryPlace(relaxTheme, relaxWeekly) {
      for (var di = 0; di < sDates.length && !placed; di++) {
        var d = sDates[di];
        var dayOfWeek = parseDate(d).getDay();
        if ((audit.excludedDays || []).indexOf(dayOfWeek) !== -1) continue;
        if (audit.frequency === 'hebdo') {
          var mondayStr = formatDate(getWeekMonday(parseDate(d)));
          if (isHebdoInWeek(auditName, mondayStr)) continue;
        }
        var present = personNames.filter(function (p) { return (persons[p].absences || []).indexOf(d) === -1; });
        if (present.length === 0) continue;
        var sorted = present.slice().sort(function (a, b) { return getLoad(a) - getLoad(b); });
        for (var pi = 0; pi < sorted.length && !placed; pi++) {
          var person = sorted[pi];
          if ((audit.excludedPersons || []).indexOf(person) !== -1) continue;
          var wk = getWKey(d) + person;
          if (!relaxWeekly && (weeklyCount[wk] || 0) >= 1) continue;
          if (history[person].audits[auditName]) continue;
          if (!relaxTheme && audit.theme && history[person].themes[audit.theme]) continue;
          placeAudit(auditName, d, person);
          assigned++;
          placed = true;
          if (relaxTheme) warnings.push('"' + auditName + '": thème répété.');
        }
      }
    }

    tryPlace(false, false);
    if (!placed) tryPlace(true, false);
    if (!placed) tryPlace(true, true);
    if (!placed) failed.push(auditName);
  });

  var msg = assigned + ' audit(s) assignés sur ' + toAssign.length + '.';
  if (failed.length > 0) msg += ' Non assignés : ' + failed.slice(0, 3).join(', ') + '.';
  return { success: true, msg: msg, planning: newPlanning, type: warnings.length > 0 ? 'warning' : 'success' };
}
window.autoFill = autoFill;

function validateNonEmpty(value, label) {
  if (!value || value.trim() === '') return 'Le champ "' + label + '" est obligatoire.';
  return null;
}

function getPlanningStats(planning, dates) {
  var total = 0, done = 0, pending = 0;
  dates.forEach(function (d) {
    if (!planning[d]) return;
    Object.values(planning[d]).forEach(function (list) {
      list.forEach(function (a) {
        total++;
        if (a.status === 'done') done++; else pending++;
      });
    });
  });
  return { total: total, done: done, pending: pending };
}
window.validateNonEmpty = validateNonEmpty;
window.getPlanningStats = getPlanningStats;

function updatePlanningReferences(planning, oldVal, newVal, type) {
  var changed = false;
  Object.keys(planning).forEach(function (date) {
    var dayData = planning[date];
    if (type === 'person') {
      if (dayData[oldVal]) { dayData[newVal] = dayData[oldVal]; delete dayData[oldVal]; changed = true; }
    } else if (type === 'audit') {
      Object.keys(dayData).forEach(function (person) {
        dayData[person].forEach(function (item) {
          if (item.audit === oldVal) { item.audit = newVal; changed = true; }
        });
      });
    }
  });
  return changed;
}
window.updatePlanningReferences = updatePlanningReferences;


