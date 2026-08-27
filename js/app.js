import { CATEGORIES, SLOTS_PER_DAY, contrastText, removeCustomCategory } from './config.js?v=2';
import { canPlace, clamp, eventTimeRange, formatSlot, makeEvent, maximumDuration, startingTimelineSlot } from './planner-model.js?v=2';
import { loadDay, saveDay } from './storage.js?v=2';
import { createCalendarFile, downloadCalendar, googleCalendarUrl } from './ics.js?v=3';

const elements = {
  palette: document.querySelector('#palette'),
  palettePanel: document.querySelector('.palette-panel'),
  paletteContent: document.querySelector('#palette-content'),
  timeline: document.querySelector('#timeline'),
  timelineWrap: document.querySelector('#timeline-wrap'),
  date: document.querySelector('#planner-date'),
  friendlyDate: document.querySelector('#friendly-date'),
  selectionHint: document.querySelector('#selection-hint'),
  deleteButton: document.querySelector('#trash-button'),
  exportButton: document.querySelector('#export-button'),
  openPalette: document.querySelector('#open-palette'),
  closePalette: document.querySelector('#close-palette'),
  paletteScrollbar: document.querySelector('#palette-scrollbar'),
  timelineScrollbar: document.querySelector('#timeline-scrollbar'),
  customDialog: document.querySelector('#custom-action-dialog'),
  customForm: document.querySelector('#custom-action-form'),
  customName: document.querySelector('#custom-action-name'),
  customColor: document.querySelector('#custom-action-color'),
  customPreview: document.querySelector('#custom-action-preview'),
  closeCustomAction: document.querySelector('#close-custom-action'),
  cancelCustomAction: document.querySelector('#cancel-custom-action'),
  deleteCustomAction: document.querySelector('#delete-custom-action'),
  calendarDialog: document.querySelector('#calendar-dialog'),
  closeCalendarDialog: document.querySelector('#close-calendar-dialog'),
  doneCalendarDialog: document.querySelector('#done-calendar-dialog'),
  googleEventList: document.querySelector('#google-event-list'),
  shareCalendarButton: document.querySelector('#share-calendar-button'),
  downloadCalendarButton: document.querySelector('#download-calendar-button'),
  calendarShareNote: document.querySelector('#calendar-share-note'),
  toast: document.querySelector('#toast'),
  toastMessage: document.querySelector('#toast-message'),
  undoButton: document.querySelector('#undo-button'),
  live: document.querySelector('#live-region'),
};

let selectedDate = localDateString(new Date());
let events = [];
let selectedCategory = null;
let selectedEventId = null;
let undoRecord = null;
let undoTimer = null;
let pointerDrag = null;
let resizeSession = null;
let suppressClick = false;
let nativeDragPayload = null;
let customCategories = [];
let editingCustomId = null;
let paletteScrollControl = null;
let timelineScrollControl = null;

const CUSTOM_ACTIONS_KEY = 'adhd-daily-planner-custom-actions-v1';

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function timelineStartSlot(date, now = new Date()) {
  return startingTimelineSlot(date === localDateString(now), now);
}

function scrollTimelineToStart(date) {
  elements.timelineWrap.scrollTop = timelineStartSlot(date) * slotHeight();
  timelineScrollControl?.sync();
}

function announce(message) {
  elements.live.textContent = '';
  requestAnimationFrame(() => { elements.live.textContent = message; });
}

function slotHeight() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slot-height')) || 44;
}

function saveAndRender(message = '') {
  events.sort((a, b) => a.start - b.start);
  if (!saveDay(selectedDate, events)) announce('The schedule changed, but this browser could not save it for later.');
  renderEvents();
  if (message) announce(message);
}

function eventById(id) {
  return events.find((event) => event.id === id) || null;
}

function loadCustomCategories() {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_ACTIONS_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((category) => category && typeof category.name === 'string' && /^#[0-9a-f]{6}$/i.test(category.color))
      .map((category) => ({
        id: String(category.id || `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`),
        name: category.name.trim().slice(0, 60),
        color: category.color,
        text: contrastText(category.color),
        custom: true,
      }))
      .filter((category) => category.name);
  } catch {
    return [];
  }
}

function saveCustomCategories() {
  try {
    localStorage.setItem(CUSTOM_ACTIONS_KEY, JSON.stringify(customCategories));
    return true;
  } catch {
    announce('Your custom action works now, but this browser could not save it for later.');
    return false;
  }
}

function createActionCard(category) {
  const card = document.createElement('button');
  card.className = 'action-card';
  card.type = 'button';
  card.textContent = category.name;
  card.style.setProperty('--category-color', category.color);
  card.style.setProperty('--category-text', category.text);
  card.dataset.category = category.id || category.name;
  card.draggable = false;
  card.setAttribute('aria-pressed', String((selectedCategory?.id || selectedCategory?.name) === (category.id || category.name)));
  card.addEventListener('click', (event) => {
    if (suppressClick) return;
    event.preventDefault();
    chooseCategory(category);
  });
  card.addEventListener('dragstart', (event) => {
    nativeDragPayload = { type: 'category', category };
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', category.name);
  });
  card.addEventListener('dragend', clearDropTarget);
  card.addEventListener('pointerdown', (event) => beginPointerDrag(event, { type: 'category', category }, card));
  return card;
}

function renderPalette() {
  elements.palette.replaceChildren();
  for (const category of CATEGORIES) {
    elements.palette.append(createActionCard(category));
  }
  for (const category of customCategories) {
    const row = document.createElement('div');
    row.className = 'custom-action-item';
    row.append(createActionCard(category));
    const editButton = document.createElement('button');
    editButton.className = 'custom-edit-button';
    editButton.type = 'button';
    editButton.textContent = '✎';
    editButton.setAttribute('aria-label', `Edit ${category.name}`);
    editButton.addEventListener('click', () => openCustomActionEditor(category));
    row.append(editButton);
    elements.palette.append(row);
  }
  const customButton = document.createElement('button');
  customButton.className = 'custom-action-button';
  customButton.type = 'button';
  customButton.textContent = '＋ Create custom action';
  customButton.addEventListener('click', () => openCustomActionEditor());
  elements.palette.append(customButton);
  requestAnimationFrame(() => paletteScrollControl?.sync());
}

function updateCustomPreview() {
  const color = elements.customColor.value;
  elements.customPreview.textContent = elements.customName.value.trim() || 'Your custom action';
  elements.customPreview.style.background = color;
  elements.customPreview.style.color = contrastText(color);
}

function openCustomActionEditor(category = null) {
  editingCustomId = category?.id || null;
  elements.customName.value = category?.name || '';
  elements.customColor.value = category?.color || '#7c6ce7';
  elements.deleteCustomAction.hidden = !category;
  document.querySelector('#custom-action-title').textContent = category ? 'Edit custom action' : 'Custom action';
  updateCustomPreview();
  if (typeof elements.customDialog.showModal === 'function') elements.customDialog.showModal();
  else elements.customDialog.setAttribute('open', '');
  requestAnimationFrame(() => elements.customName.focus());
}

function closeCustomActionEditor() {
  editingCustomId = null;
  elements.deleteCustomAction.hidden = true;
  if (typeof elements.customDialog.close === 'function') elements.customDialog.close();
  else elements.customDialog.removeAttribute('open');
}

function deleteCustomAction() {
  const category = customCategories.find((item) => item.id === editingCustomId);
  if (!category) return;
  const confirmed = window.confirm(`Delete "${category.name}" from Actions? Events already scheduled will stay on your calendar.`);
  if (!confirmed) return;
  customCategories = removeCustomCategory(customCategories, category.id);
  if (selectedCategory?.id === category.id) selectedCategory = null;
  saveCustomCategories();
  renderPalette();
  renderEvents();
  closeCustomActionEditor();
  announce(`${category.name} was removed from Actions. Scheduled events were kept.`);
}

function saveCustomAction(formEvent) {
  formEvent.preventDefault();
  if (!elements.customForm.reportValidity()) return;
  const name = elements.customName.value.trim().slice(0, 60);
  const color = elements.customColor.value;
  let category = customCategories.find((item) => item.id === editingCustomId);
  if (category) {
    category.name = name;
    category.color = color;
    category.text = contrastText(color);
  } else {
    category = {
      id: globalThis.crypto?.randomUUID?.() || `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      color,
      text: contrastText(color),
      custom: true,
    };
    customCategories.push(category);
  }
  saveCustomCategories();
  selectedEventId = null;
  selectedCategory = category;
  renderPalette();
  renderEvents();
  closeCustomActionEditor();
  elements.palettePanel.classList.remove('open');
  announce(`${category.name} is ready. Tap a time in the schedule to place it.`);
}

function wireVisibleScrollbar(container, rail) {
  const thumb = rail.querySelector('.visible-scrollbar-thumb');
  let dragging = null;

  function sync() {
    const trackHeight = rail.clientHeight;
    if (!trackHeight) return;
    const maximumScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const scrollable = maximumScroll > 1;
    rail.classList.toggle('inactive', !scrollable);
    rail.setAttribute('aria-disabled', String(!scrollable));
    const thumbHeight = scrollable
      ? Math.max(48, Math.min(trackHeight, trackHeight * (container.clientHeight / container.scrollHeight)))
      : trackHeight;
    const travel = Math.max(0, trackHeight - thumbHeight);
    const top = scrollable ? (container.scrollTop / maximumScroll) * travel : 0;
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translate3d(0, ${top}px, 0)`;
    rail.setAttribute('aria-valuenow', String(scrollable ? Math.round((container.scrollTop / maximumScroll) * 100) : 0));
  }

  function startDrag(pointerEvent) {
    const maximumScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    if (!maximumScroll) return;
    pointerEvent.preventDefault();
    rail.setPointerCapture?.(pointerEvent.pointerId);
    const railBounds = rail.getBoundingClientRect();
    const thumbHeight = thumb.offsetHeight;
    const travel = Math.max(1, railBounds.height - thumbHeight);
    if (pointerEvent.target !== thumb) {
      const targetTop = clamp(pointerEvent.clientY - railBounds.top - (thumbHeight / 2), 0, travel);
      container.scrollTop = (targetTop / travel) * maximumScroll;
    }
    dragging = { pointerId: pointerEvent.pointerId, startY: pointerEvent.clientY, startScroll: container.scrollTop, ratio: maximumScroll / travel };
    sync();
  }

  function moveDrag(pointerEvent) {
    if (!dragging || dragging.pointerId !== pointerEvent.pointerId) return;
    pointerEvent.preventDefault();
    container.scrollTop = dragging.startScroll + ((pointerEvent.clientY - dragging.startY) * dragging.ratio);
  }

  function endDrag(pointerEvent) {
    if (!dragging || dragging.pointerId !== pointerEvent.pointerId) return;
    dragging = null;
  }

  rail.addEventListener('pointerdown', startDrag);
  rail.addEventListener('pointermove', moveDrag);
  rail.addEventListener('pointerup', endDrag);
  rail.addEventListener('pointercancel', endDrag);
  rail.addEventListener('keydown', (keyboardEvent) => {
    const amount = keyboardEvent.key === 'PageDown' || keyboardEvent.key === 'PageUp' ? container.clientHeight * .85 : slotHeight();
    if (keyboardEvent.key === 'ArrowDown' || keyboardEvent.key === 'PageDown') container.scrollBy({ top: amount, behavior: 'smooth' });
    else if (keyboardEvent.key === 'ArrowUp' || keyboardEvent.key === 'PageUp') container.scrollBy({ top: -amount, behavior: 'smooth' });
    else if (keyboardEvent.key === 'Home') container.scrollTo({ top: 0, behavior: 'smooth' });
    else if (keyboardEvent.key === 'End') container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    else return;
    keyboardEvent.preventDefault();
  });
  container.addEventListener('scroll', sync, { passive: true });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(sync);
    observer.observe(container);
    if (container.firstElementChild) observer.observe(container.firstElementChild);
  } else window.addEventListener('resize', sync);
  return { sync };
}

function renderTimeline() {
  const fragment = document.createDocumentFragment();
  for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
    const row = document.createElement('div');
    row.className = `slot${slot % 4 === 0 ? ' hour' : ''}`;
    row.style.top = `calc(var(--slot-height) * ${slot})`;
    row.dataset.slot = String(slot);
    row.setAttribute('role', 'gridcell');
    row.setAttribute('aria-label', formatSlot(slot));
    fragment.append(row);
    if (slot % 4 === 0) {
      const label = document.createElement('div');
      label.className = 'time-label';
      label.style.top = `calc(var(--slot-height) * ${slot})`;
      label.textContent = formatSlot(slot).replace(':00', '');
      label.setAttribute('aria-hidden', 'true');
      fragment.append(label);
    }
  }
  elements.timeline.replaceChildren(fragment);
  requestAnimationFrame(() => timelineScrollControl?.sync());
}

function renderEvents() {
  elements.timeline.querySelectorAll('.scheduled-event').forEach((element) => element.remove());
  for (const event of events) {
    const item = document.createElement('div');
    item.className = 'scheduled-event';
    if (event.id === selectedEventId) item.classList.add('selected');
    item.dataset.eventId = event.id;
    item.draggable = false;
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `${event.title}, ${eventTimeRange(event)}. Drag to move; use the resize bar to change duration.`);
    item.style.setProperty('--event-color', event.color);
    item.style.setProperty('--event-text', event.text);
    item.style.top = `calc(var(--slot-height) * ${event.start})`;
    item.style.height = `calc(var(--slot-height) * ${event.duration} - 3px)`;
    item.innerHTML = '<span class="event-title"></span><span class="event-time"></span><span class="resize-handle" role="separator" aria-label="Resize event" tabindex="-1"><span></span></span>';
    item.querySelector('.event-title').textContent = event.title;
    item.querySelector('.event-time').textContent = eventTimeRange(event);
    item.addEventListener('click', () => { if (!suppressClick) selectEvent(event.id); });
    item.addEventListener('keydown', (keyboardEvent) => handleEventKeydown(keyboardEvent, event.id));
    item.addEventListener('dragstart', (dragEvent) => {
      if (resizeSession) { dragEvent.preventDefault(); return; }
      selectedCategory = null;
      selectedEventId = event.id;
      updateSelectionUi();
      nativeDragPayload = { type: 'event', eventId: event.id };
      dragEvent.dataTransfer.effectAllowed = 'move';
      dragEvent.dataTransfer.setData('text/plain', event.id);
      item.classList.add('drag-source');
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('drag-source');
      nativeDragPayload = null;
      clearDropTarget();
    });
    item.addEventListener('pointerdown', (pointerEvent) => {
      if (pointerEvent.target.closest('.resize-handle')) return;
      beginPointerDrag(pointerEvent, { type: 'event', eventId: event.id }, item);
    });
    item.querySelector('.resize-handle').addEventListener('pointerdown', (pointerEvent) => startResize(pointerEvent, event.id, item));
    elements.timeline.append(item);
  }
  updateSelectionUi();
}

function chooseCategory(category) {
  selectedEventId = null;
  selectedCategory = (selectedCategory?.id || selectedCategory?.name) === (category.id || category.name) ? null : category;
  renderPalette();
  renderEvents();
  if (selectedCategory) {
    elements.palettePanel.classList.remove('open');
    announce(`${category.name} selected. Tap a time in the schedule.`);
  }
}

function selectEvent(eventId) {
  selectedCategory = null;
  selectedEventId = selectedEventId === eventId ? null : eventId;
  renderPalette();
  renderEvents();
  const selected = eventById(selectedEventId);
  if (selected) announce(`${selected.title} selected.`);
}

function updateSelectionUi() {
  const selected = eventById(selectedEventId);
  elements.deleteButton.disabled = !selected;
  elements.selectionHint.textContent = selected
    ? `${selected.title} • ${eventTimeRange(selected)} — drag to move or pull the white bar to resize`
    : selectedCategory
      ? `${selectedCategory.name} selected — tap a time to place it`
      : 'Nothing selected — choose an action or tap an event';
}

function addCategoryAt(category, start) {
  const candidate = makeEvent(category, start);
  if (!canPlace(events, candidate)) {
    announce(`That time is occupied. ${category.name} was not added.`);
    return false;
  }
  events.push(candidate);
  selectedCategory = null;
  selectedEventId = candidate.id;
  renderPalette();
  saveAndRender(`${category.name} added at ${formatSlot(start)}.`);
  return true;
}

function moveEventTo(eventId, start) {
  const event = eventById(eventId);
  if (!event) return false;
  const candidate = { ...event, start };
  if (!canPlace(events, candidate, eventId)) {
    announce('That event will not fit there. Nothing was moved.');
    return false;
  }
  event.start = start;
  selectedEventId = event.id;
  saveAndRender(`${event.title} moved to ${formatSlot(start)}.`);
  return true;
}

function slotFromPoint(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  const slot = target?.closest?.('.slot');
  return slot && elements.timeline.contains(slot) ? Number(slot.dataset.slot) : null;
}

function setDropTarget(slot) {
  clearDropTarget();
  if (slot == null) return;
  const element = elements.timeline.querySelector(`.slot[data-slot="${slot}"]`);
  if (element) element.classList.add('drop-target');
}

function clearDropTarget() {
  elements.timeline.querySelector('.slot.drop-target')?.classList.remove('drop-target');
}

function completeDrop(payload, slot) {
  if (slot == null) return false;
  return payload.type === 'category' ? addCategoryAt(payload.category, slot) : moveEventTo(payload.eventId, slot);
}

function beginPointerDrag(event, payload, source) {
  if (event.button !== 0 || resizeSession) return;
  pointerDrag = { pointerId: event.pointerId, payload, source, startX: event.clientX, startY: event.clientY, started: false, ghost: null };
  source.setPointerCapture?.(event.pointerId);
  source.addEventListener('pointermove', movePointerDrag);
  source.addEventListener('pointerup', endPointerDrag, { once: true });
  source.addEventListener('pointercancel', cancelPointerDrag, { once: true });
}

function movePointerDrag(event) {
  if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
  if (!pointerDrag.started && distance < 7) return;
  event.preventDefault();
  if (!pointerDrag.started) {
    pointerDrag.started = true;
    suppressClick = true;
    pointerDrag.ghost = pointerDrag.source.cloneNode(true);
    pointerDrag.ghost.classList.add('drag-ghost');
    pointerDrag.ghost.removeAttribute('tabindex');
    document.body.append(pointerDrag.ghost);
    pointerDrag.source.classList.add('drag-source');
    document.body.classList.add('is-dragging');
  }
  pointerDrag.ghost.style.transform = `translate3d(${event.clientX + 12}px, ${event.clientY + 12}px, 0)`;
  setDropTarget(slotFromPoint(event.clientX, event.clientY));
  const bounds = elements.timelineWrap.getBoundingClientRect();
  if (event.clientY < bounds.top + 60) elements.timelineWrap.scrollBy(0, -22);
  if (event.clientY > bounds.bottom - 60) elements.timelineWrap.scrollBy(0, 22);
  elements.deleteButton.classList.toggle('drop-target', document.elementFromPoint(event.clientX, event.clientY)?.closest('#trash-button') != null);
}

function finishPointerDrag(event, cancelled) {
  if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
  const current = pointerDrag;
  current.source.removeEventListener('pointermove', movePointerDrag);
  current.source.classList.remove('drag-source');
  current.ghost?.remove();
  document.body.classList.remove('is-dragging');
  const overTrash = !cancelled && document.elementFromPoint(event.clientX, event.clientY)?.closest('#trash-button');
  if (current.started && overTrash && current.payload.type === 'event') deleteEvent(current.payload.eventId);
  else if (current.started && !cancelled) completeDrop(current.payload, slotFromPoint(event.clientX, event.clientY));
  clearDropTarget();
  elements.deleteButton.classList.remove('drop-target');
  pointerDrag = null;
  setTimeout(() => { suppressClick = false; }, 0);
}

function endPointerDrag(event) { finishPointerDrag(event, false); }
function cancelPointerDrag(event) { finishPointerDrag(event, true); }

function startResize(pointerEvent, eventId, item) {
  if (pointerEvent.button !== 0) return;
  pointerEvent.preventDefault();
  pointerEvent.stopPropagation();
  const event = eventById(eventId);
  if (!event) return;
  const handle = pointerEvent.currentTarget;
  handle.setPointerCapture?.(pointerEvent.pointerId);
  resizeSession = { pointerId: pointerEvent.pointerId, event, item, handle, startY: pointerEvent.clientY, originalDuration: event.duration, draftDuration: event.duration };
  item.classList.add('resizing');
  handle.addEventListener('pointermove', moveResize);
  handle.addEventListener('pointerup', endResize, { once: true });
  handle.addEventListener('pointercancel', cancelResize, { once: true });
}

function moveResize(pointerEvent) {
  if (!resizeSession || pointerEvent.pointerId !== resizeSession.pointerId) return;
  pointerEvent.preventDefault();
  const delta = Math.round((pointerEvent.clientY - resizeSession.startY) / slotHeight());
  const duration = clamp(resizeSession.originalDuration + delta, 1, maximumDuration(events, resizeSession.event));
  resizeSession.draftDuration = duration;
  resizeSession.item.style.height = `calc(var(--slot-height) * ${duration} - 3px)`;
  resizeSession.item.querySelector('.event-time').textContent = eventTimeRange({ ...resizeSession.event, duration });
}

function finishResize(pointerEvent, cancelled) {
  if (!resizeSession || pointerEvent.pointerId !== resizeSession.pointerId) return;
  const session = resizeSession;
  session.handle.removeEventListener('pointermove', moveResize);
  session.item.classList.remove('resizing');
  session.item.draggable = false;
  session.event.duration = cancelled ? session.originalDuration : session.draftDuration;
  resizeSession = null;
  saveAndRender(`${session.event.title} now ends at ${eventTimeRange(session.event).split(' – ')[1]}.`);
}

function endResize(event) { finishResize(event, false); }
function cancelResize(event) { finishResize(event, true); }

function deleteEvent(eventId) {
  const index = events.findIndex((event) => event.id === eventId);
  if (index < 0) return;
  const [event] = events.splice(index, 1);
  undoRecord = { date: selectedDate, event, index };
  selectedEventId = null;
  saveAndRender(`${event.title} deleted.`);
  showUndo(`${event.title} deleted.`);
}

function showUndo(message) {
  clearTimeout(undoTimer);
  elements.toastMessage.textContent = message;
  elements.toast.hidden = false;
  undoTimer = setTimeout(() => { elements.toast.hidden = true; undoRecord = null; }, 7000);
}

function undoDelete() {
  if (!undoRecord) return;
  if (undoRecord.date !== selectedDate || !canPlace(events, undoRecord.event)) {
    announce('Undo is no longer available because that time is occupied or the date changed.');
    elements.toast.hidden = true;
    undoRecord = null;
    return;
  }
  events.splice(Math.min(undoRecord.index, events.length), 0, undoRecord.event);
  selectedEventId = undoRecord.event.id;
  const restoredTitle = undoRecord.event.title;
  undoRecord = null;
  clearTimeout(undoTimer);
  elements.toast.hidden = true;
  saveAndRender(`${restoredTitle} restored.`);
}

function handleEventKeydown(keyboardEvent, eventId) {
  const event = eventById(eventId);
  if (!event) return;
  if (keyboardEvent.key === 'Delete' || keyboardEvent.key === 'Backspace') {
    keyboardEvent.preventDefault();
    deleteEvent(eventId);
  } else if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
    keyboardEvent.preventDefault();
    selectEvent(eventId);
  } else if (keyboardEvent.key === 'ArrowUp' || keyboardEvent.key === 'ArrowDown') {
    keyboardEvent.preventDefault();
    const direction = keyboardEvent.key === 'ArrowUp' ? -1 : 1;
    if (keyboardEvent.shiftKey) {
      event.duration = clamp(event.duration + direction, 1, maximumDuration(events, event));
      saveAndRender(`${event.title} resized to ${eventTimeRange(event)}.`);
    } else moveEventTo(event.id, event.start + direction);
  }
}

function updateDateHeading() {
  const [year, month, day] = selectedDate.split('-').map(Number);
  const chosen = new Date(year, month - 1, day);
  const today = localDateString(new Date());
  elements.friendlyDate.textContent = selectedDate === today ? 'Today' : new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(chosen);
}

function changeDate() {
  const today = localDateString(new Date());
  if (!elements.date.value || elements.date.value < today) elements.date.value = today;
  selectedDate = elements.date.value;
  events = loadDay(selectedDate);
  selectedCategory = null;
  selectedEventId = null;
  elements.toast.hidden = true;
  undoRecord = null;
  updateDateHeading();
  renderPalette();
  renderEvents();
  scrollTimelineToStart(selectedDate);
}

function closeCalendarDialog() {
  if (typeof elements.calendarDialog.close === 'function') elements.calendarDialog.close();
  else elements.calendarDialog.removeAttribute('open');
}

function calendarShareFile() {
  try {
    return createCalendarFile(selectedDate, events);
  } catch {
    return null;
  }
}

function canShareCalendarFile(file = calendarShareFile()) {
  if (!file || typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function renderGoogleCalendarLinks() {
  const fragment = document.createDocumentFragment();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  for (const event of [...events].sort((a, b) => a.start - b.start)) {
    const item = document.createElement('li');
    item.className = 'google-event-item';

    const eventCopy = document.createElement('div');
    eventCopy.className = 'google-event-copy';
    const title = document.createElement('strong');
    title.textContent = event.title;
    const time = document.createElement('span');
    time.textContent = eventTimeRange(event);
    eventCopy.append(title, time);

    const link = document.createElement('a');
    link.className = 'button google-event-link';
    link.href = googleCalendarUrl(selectedDate, event, timeZone);
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Add';
    link.setAttribute('aria-label', `Add ${event.title}, ${eventTimeRange(event)}, to Google Calendar`);
    link.addEventListener('click', () => {
      item.classList.add('opened');
      link.textContent = 'Open again';
      announce(`${event.title} opened in Google Calendar. Save it there, then return for the next item.`);
    });

    item.append(eventCopy, link);
    fragment.append(item);
  }
  elements.googleEventList.replaceChildren(fragment);
}

function openCalendarDialog() {
  if (!events.length) {
    announce('Add at least one event before opening calendar options.');
    elements.selectionHint.textContent = 'Add at least one event before adding to a calendar.';
    return;
  }
  renderGoogleCalendarLinks();
  const canShare = canShareCalendarFile();
  elements.shareCalendarButton.hidden = !canShare;
  elements.calendarShareNote.hidden = canShare;
  if (typeof elements.calendarDialog.showModal === 'function') elements.calendarDialog.showModal();
  else elements.calendarDialog.setAttribute('open', '');
}

async function shareCalendarFile() {
  const file = calendarShareFile();
  if (!canShareCalendarFile(file)) {
    elements.shareCalendarButton.hidden = true;
    elements.calendarShareNote.hidden = false;
    announce('File sharing is not supported in this browser. Use Download instead.');
    return;
  }
  try {
    await navigator.share({
      files: [file],
      title: 'Daily Planner schedule',
      text: `My Daily Planner schedule for ${selectedDate}`,
    });
    announce('Calendar file shared.');
  } catch (error) {
    if (error?.name !== 'AbortError') announce('The calendar file could not be shared. Use Download instead.');
  }
}

function downloadCalendarFile() {
  downloadCalendar(selectedDate, events);
  announce(`${events.length} event${events.length === 1 ? '' : 's'} downloaded.`);
}

elements.timeline.addEventListener('click', (clickEvent) => {
  if (suppressClick || clickEvent.target.closest('.scheduled-event')) return;
  const slot = clickEvent.target.closest('.slot');
  if (slot && selectedCategory) addCategoryAt(selectedCategory, Number(slot.dataset.slot));
});
elements.timeline.addEventListener('dragover', (event) => {
  if (!nativeDragPayload) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = nativeDragPayload.type === 'category' ? 'copy' : 'move';
  setDropTarget(slotFromPoint(event.clientX, event.clientY));
});
elements.timeline.addEventListener('dragleave', (event) => { if (!elements.timeline.contains(event.relatedTarget)) clearDropTarget(); });
elements.timeline.addEventListener('drop', (event) => {
  event.preventDefault();
  if (nativeDragPayload) completeDrop(nativeDragPayload, slotFromPoint(event.clientX, event.clientY));
  nativeDragPayload = null;
  clearDropTarget();
});
elements.deleteButton.addEventListener('click', () => { if (selectedEventId) deleteEvent(selectedEventId); });
elements.deleteButton.addEventListener('dragover', (event) => {
  if (nativeDragPayload?.type !== 'event') return;
  event.preventDefault();
  elements.deleteButton.classList.add('drop-target');
});
elements.deleteButton.addEventListener('dragleave', () => elements.deleteButton.classList.remove('drop-target'));
elements.deleteButton.addEventListener('drop', (event) => {
  event.preventDefault();
  elements.deleteButton.classList.remove('drop-target');
  if (nativeDragPayload?.type === 'event') deleteEvent(nativeDragPayload.eventId);
  nativeDragPayload = null;
});
elements.undoButton.addEventListener('click', undoDelete);
elements.exportButton.addEventListener('click', openCalendarDialog);
elements.closeCalendarDialog.addEventListener('click', closeCalendarDialog);
elements.doneCalendarDialog.addEventListener('click', closeCalendarDialog);
elements.shareCalendarButton.addEventListener('click', shareCalendarFile);
elements.downloadCalendarButton.addEventListener('click', downloadCalendarFile);
elements.date.addEventListener('change', changeDate);
elements.customName.addEventListener('input', updateCustomPreview);
elements.customColor.addEventListener('input', updateCustomPreview);
elements.customForm.addEventListener('submit', saveCustomAction);
elements.closeCustomAction.addEventListener('click', closeCustomActionEditor);
elements.cancelCustomAction.addEventListener('click', closeCustomActionEditor);
elements.deleteCustomAction.addEventListener('click', deleteCustomAction);
elements.openPalette.addEventListener('click', () => {
  elements.palettePanel.classList.add('open');
  requestAnimationFrame(() => paletteScrollControl?.sync());
});
elements.closePalette.addEventListener('click', () => elements.palettePanel.classList.remove('open'));
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    elements.palettePanel.classList.remove('open');
    selectedCategory = null;
    selectedEventId = null;
    renderPalette();
    renderEvents();
  }
});

function initialize() {
  const today = localDateString(new Date());
  elements.date.min = today;
  elements.date.value = today;
  selectedDate = today;
  events = loadDay(selectedDate);
  customCategories = loadCustomCategories();
  paletteScrollControl = wireVisibleScrollbar(elements.paletteContent, elements.paletteScrollbar);
  timelineScrollControl = wireVisibleScrollbar(elements.timelineWrap, elements.timelineScrollbar);
  renderPalette();
  renderTimeline();
  renderEvents();
  updateDateHeading();
  requestAnimationFrame(() => {
    scrollTimelineToStart(selectedDate);
    paletteScrollControl.sync();
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

initialize();
