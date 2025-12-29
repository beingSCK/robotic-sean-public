/**
 * Popup UI Controller for Calendar Transit Robot
 */

import type { UserSettings, TransitEvent } from '../src/types.ts';
import { DEFAULT_SETTINGS } from '../src/config.ts';
import { fetchEvents, insertTransitEvents } from '../src/calendarService.ts';
import { calculateTransitEvents } from '../src/eventProcessor.ts';
import {
  hasTokens,
  onAuthComplete,
  clearAuthCompleteFlag,
  clearAuth,
  getAccessToken,
} from '../src/authManager.ts';

// DOM Elements
let homeAddressInput: HTMLInputElement;
let daysForwardInput: HTMLInputElement;
let saveSettingsBtn: HTMLButtonElement;
let scanBtn: HTMLButtonElement;
let statusMessage: HTMLDivElement;
let settingsSection: HTMLDetailsElement;
let actionSection: HTMLDivElement;
let resultsSection: HTMLDivElement;
let transitList: HTMLDivElement;
let createBtn: HTMLButtonElement;
let cancelBtn: HTMLButtonElement;
let successSection: HTMLDivElement;
let successCount: HTMLSpanElement;
let doneBtn: HTMLButtonElement;
let disconnectBtn: HTMLButtonElement;

// State
let currentTransitEvents: TransitEvent[] = [];
let currentSettings: UserSettings = { ...DEFAULT_SETTINGS };

/**
 * Load settings from Chrome storage.
 */
async function loadSettings(): Promise<UserSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
      resolve(result as UserSettings);
    });
  });
}

/**
 * Save settings to Chrome storage.
 */
async function saveSettings(settings: Partial<UserSettings>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, resolve);
  });
}

/**
 * Update status message.
 */
function setStatus(message: string, isError = false, isScanning = false) {
  statusMessage.textContent = message;
  statusMessage.className = 'status';
  if (isError) statusMessage.classList.add('error');
  if (isScanning) statusMessage.classList.add('scanning');
}

/**
 * Show the results section with transit events.
 */
function showResults(events: TransitEvent[]) {
  currentTransitEvents = events;

  transitList.innerHTML = '';

  if (events.length === 0) {
    transitList.innerHTML = '<div class="empty-state">No transit events to create</div>';
    createBtn.disabled = true;
  } else {
    createBtn.disabled = false;

    for (const event of events) {
      const item = document.createElement('div');
      item.className = 'transit-item';
      if (event.summary.startsWith('DRIVE:')) {
        item.classList.add('driving');
      }

      // Extract time from the event
      const startTime = new Date(event.start.dateTime);
      const timeStr = startTime.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const dateStr = startTime.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

      item.innerHTML = `
        <div class="summary">${escapeHtml(event.summary)}</div>
        <div class="details">${dateStr} at ${timeStr}</div>
      `;

      transitList.appendChild(item);
    }
  }

  resultsSection.hidden = false;
  scanBtn.disabled = false;
}

/**
 * Show the success section.
 */
function showSuccess(count: number) {
  resultsSection.hidden = true;
  successCount.textContent = count.toString();
  successSection.hidden = false;
  setStatus(''); // Clear status message
}

/**
 * Reset to initial state.
 */
function resetUI() {
  resultsSection.hidden = true;
  successSection.hidden = true;
  scanBtn.disabled = false;
  setStatus('');
  currentTransitEvents = [];
}

/**
 * Escape HTML to prevent XSS.
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


/**
 * Update the scan button based on auth state.
 */
function updateScanButton(isAuthenticated: boolean) {
  if (isAuthenticated) {
    scanBtn.textContent = 'Scan Calendar';
  } else {
    scanBtn.textContent = 'Connect to Google Calendar';
  }
}

/**
 * Handle scan button click.
 */
async function handleScan() {
  console.log('handleScan called');

  // Validate settings
  if (!currentSettings.homeAddress.trim()) {
    settingsSection.open = true;
    homeAddressInput.focus();
    setStatus('Please enter your home address first', true);
    return;
  }

  // Check if we need to authorize first
  const isAuthenticated = await hasTokens();

  if (!isAuthenticated) {
    // First time - need to authorize
    scanBtn.disabled = true;
    setStatus('Opening Google sign-in... (click extension again after signing in)', false, true);

    try {
      // This will trigger OAuth via background worker
      // The popup will close during OAuth, so we show a helpful message
      await fetchEvents(1, getAccessToken); // Just trigger auth, don't care about result
    } catch (error) {
      // This is expected - popup closes during OAuth
      // User will click extension again and oauthJustCompleted will be true
      console.log('Auth flow started, popup may close');
    }
    return;
  }

  // We have tokens - proceed with scan
  scanBtn.disabled = true;
  setStatus('Fetching calendar events...', false, true);

  try {
    console.log('Fetching events...');
    const events = await fetchEvents(currentSettings.daysForward, getAccessToken);
    console.log('Fetched events:', events.length);

    if (events.length === 0) {
      setStatus('No events found in the next ' + currentSettings.daysForward + ' days');
      scanBtn.disabled = false;
      return;
    }

    setStatus(`Found ${events.length} events. Calculating transit times...`, false, true);

    // Calculate transit events
    const transitEvents = await calculateTransitEvents(
      events,
      currentSettings,
      (message) => setStatus(message, false, true)
    );

    setStatus(`Found ${transitEvents.length} transit events to create`);
    showResults(transitEvents);
  } catch (error) {
    console.error('Scan error:', error);
    setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, true);
    scanBtn.disabled = false;
  }
}

/**
 * Handle create button click.
 */
async function handleCreate() {
  if (currentTransitEvents.length === 0) return;

  createBtn.disabled = true;
  cancelBtn.disabled = true;
  setStatus('Creating transit events...', false, true);

  try {
    const count = await insertTransitEvents(currentTransitEvents, getAccessToken);
    showSuccess(count);
  } catch (error) {
    console.error('Create error:', error);
    setStatus(`Error creating events: ${error instanceof Error ? error.message : 'Unknown error'}`, true);
    createBtn.disabled = false;
    cancelBtn.disabled = false;
  }
}

/**
 * Handle disconnect button click.
 */
async function handleDisconnect() {
  await clearAuth();
  updateScanButton(false);
  disconnectBtn.hidden = true;
  setStatus('Disconnected from Google Calendar');
}

/**
 * Handle save settings button click.
 */
async function handleSaveSettings() {
  const homeAddress = homeAddressInput.value.trim();
  const daysForward = parseInt(daysForwardInput.value, 10) || 7;

  currentSettings = {
    ...currentSettings,
    homeAddress,
    daysForward,
  };

  await saveSettings(currentSettings);
  setStatus('Settings saved!');

  // Auto-close settings if home address is set
  if (homeAddress) {
    setTimeout(() => {
      settingsSection.open = false;
    }, 500);
  }
}

/**
 * Initialize the popup.
 */
async function init() {
  // Get DOM elements
  homeAddressInput = document.getElementById('home-address') as HTMLInputElement;
  daysForwardInput = document.getElementById('days-forward') as HTMLInputElement;
  saveSettingsBtn = document.getElementById('save-settings') as HTMLButtonElement;
  scanBtn = document.getElementById('scan-btn') as HTMLButtonElement;
  statusMessage = document.getElementById('status-message') as HTMLDivElement;
  settingsSection = document.getElementById('settings-section') as HTMLDetailsElement;
  actionSection = document.getElementById('action-section') as HTMLDivElement;
  resultsSection = document.getElementById('results-section') as HTMLDivElement;
  transitList = document.getElementById('transit-list') as HTMLDivElement;
  createBtn = document.getElementById('create-btn') as HTMLButtonElement;
  cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;
  successSection = document.getElementById('success-section') as HTMLDivElement;
  successCount = document.getElementById('success-count') as HTMLSpanElement;
  doneBtn = document.getElementById('done-btn') as HTMLButtonElement;
  disconnectBtn = document.getElementById('disconnect-btn') as HTMLButtonElement;

  // Load settings
  currentSettings = await loadSettings();
  homeAddressInput.value = currentSettings.homeAddress;
  daysForwardInput.value = currentSettings.daysForward.toString();

  // Open settings if home address is not set
  if (!currentSettings.homeAddress) {
    settingsSection.open = true;
  }

  // Check auth state and update button
  const isAuthenticated = await hasTokens();
  updateScanButton(isAuthenticated);
  disconnectBtn.hidden = !isAuthenticated;

  // Add event listeners
  saveSettingsBtn.addEventListener('click', handleSaveSettings);
  scanBtn.addEventListener('click', handleScan);
  createBtn.addEventListener('click', handleCreate);
  cancelBtn.addEventListener('click', resetUI);
  doneBtn.addEventListener('click', resetUI);
  disconnectBtn.addEventListener('click', handleDisconnect);

  // Save settings on input change (debounced via blur)
  homeAddressInput.addEventListener('blur', handleSaveSettings);
  daysForwardInput.addEventListener('blur', handleSaveSettings);

  // Check if OAuth just completed (background worker sets this flag)
  const oauthJustCompleted = await onAuthComplete();
  console.log('Init check - oauthJustCompleted:', oauthJustCompleted, 'homeAddress:', currentSettings.homeAddress);
  if (oauthJustCompleted) {
    await clearAuthCompleteFlag();
    updateScanButton(true); // We now have tokens

    if (currentSettings.homeAddress) {
      console.log('OAuth just completed, auto-scanning...');
      setStatus('Connected! Scanning calendar...', false, true);
      // Small delay to ensure popup is fully rendered
      setTimeout(() => handleScan(), 100);
    } else {
      setStatus('Connected! Enter your home address to continue.');
    }
  }
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
