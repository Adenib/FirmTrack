const { app, Tray, Menu, BrowserWindow, ipcMain, shell, nativeImage, safeStorage } = require('electron')
const path = require('path')
const Store = require('electron-store')
const tracker = require('./tracker')

// Set before any app.getPath() calls so userData resolves to
// %APPDATA%/FirmTrack instead of the package name "firmtrack-tracker".
app.setName('FirmTrack')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  return // CommonJS module body — a bare return here is valid and skips the rest of this file.
}

const settingsStore = new Store({
  name: 'settings',
  defaults: {
    serverUrl: 'https://firmtrack.example.com',
    apiKey: '',
    interval: 30,
    startOnLogin: false,
    tracking: true,
  },
})

let tray = null
let settingsWindow = null
let lastTrayState = null
let isQuitting = false

const ICONS = {
  active: path.join(__dirname, 'assets', 'tray-icon.png'),
  paused: path.join(__dirname, 'assets', 'tray-icon-paused.png'),
}

// The API key is encrypted at rest with the OS keychain (DPAPI on Windows)
// via Electron's safeStorage, not stored in plain text in settings.json.
function encryptApiKey(plainKey) {
  if (!plainKey) return ''
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(plainKey).toString('base64')
  }
  console.warn('[main] OS encryption unavailable — storing API key unencrypted')
  return plainKey
}

function decryptApiKey(storedKey) {
  if (!storedKey) return ''
  if (storedKey.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(storedKey.slice(4), 'base64'))
    } catch {
      return ''
    }
  }
  return storedKey // legacy/plaintext fallback (encryption was unavailable when saved)
}

function getSettings() {
  const raw = settingsStore.store
  return { ...raw, apiKey: decryptApiKey(raw.apiKey) }
}

function saveSettings(patch) {
  const next = { ...settingsStore.store, ...patch }
  if (patch.apiKey !== undefined) next.apiKey = encryptApiKey(patch.apiKey)
  settingsStore.set(next)
}

function buildMenu() {
  const settings = getSettings()
  return Menu.buildFromTemplate([
    {
      label: settings.tracking ? 'FirmTrack Tracker — Active' : 'FirmTrack Tracker — Paused',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: settings.tracking ? 'Tracking: ON' : 'Tracking: OFF',
      type: 'checkbox',
      checked: settings.tracking,
      click: (item) => {
        saveSettings({ tracking: item.checked })
        tracker.restart()
        refreshTray()
      },
    },
    {
      label: 'View Activity Today',
      click: () => shell.openExternal(`${settings.serverUrl.replace(/\/+$/, '')}/timetrack/activity`),
    },
    { label: 'Settings', click: () => openSettingsWindow() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
}

function refreshTray() {
  if (!tray) return
  tray.setContextMenu(buildMenu())
  const settings = getSettings()
  tray.setToolTip(settings.tracking ? 'FirmTrack Tracker — tracking' : 'FirmTrack Tracker — paused')
}

// Called by tracker.js on every tick; only touches the icon when the
// active/paused state actually flips, to avoid redundant native calls.
function onTrackerState(state) {
  if (state === lastTrayState) return
  lastTrayState = state
  if (!tray) return
  tray.setImage(nativeImage.createFromPath(state === 'active' ? ICONS.active : ICONS.paused))
}

function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 400,
    height: 500,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'FirmTrack Tracker Settings',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  settingsWindow.setMenuBarVisibility(false)
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'))

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

ipcMain.handle('get-settings', () => getSettings())

ipcMain.handle('save-settings', (_event, patch) => {
  saveSettings(patch)
  app.setLoginItemSettings({ openAtLogin: !!getSettings().startOnLogin })
  tracker.restart()
  refreshTray()
  return { ok: true }
})

ipcMain.handle('get-queue-length', () => tracker.queueLength())

app.on('second-instance', () => {
  openSettingsWindow()
})

app.on('window-all-closed', () => {
  // Tray-only app: closing the settings window must not quit the app.
})

app.on('before-quit', (event) => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true
  tracker.stop().finally(() => app.quit())
})

app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: !!getSettings().startOnLogin })

  tray = new Tray(nativeImage.createFromPath(ICONS.active))
  refreshTray()

  tray.on('click', () => openSettingsWindow())

  tracker.start({
    settingsGetter: getSettings,
    onState: onTrackerState,
  })
})
