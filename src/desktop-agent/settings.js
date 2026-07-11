const serverUrlInput = document.getElementById('serverUrl')
const apiKeyInput = document.getElementById('apiKey')
const toggleKeyButton = document.getElementById('toggle-key')
const intervalSelect = document.getElementById('interval')
const startOnLoginInput = document.getElementById('startOnLogin')
const saveButton = document.getElementById('save')
const statusEl = document.getElementById('status')
const queueNoteEl = document.getElementById('queue-note')

async function load() {
  const settings = await window.firmtrack.getSettings()
  serverUrlInput.value = settings.serverUrl || ''
  apiKeyInput.value = settings.apiKey || ''
  intervalSelect.value = String(settings.interval || 30)
  startOnLoginInput.checked = !!settings.startOnLogin
  await refreshQueueNote()
}

async function refreshQueueNote() {
  const length = await window.firmtrack.getQueueLength()
  queueNoteEl.textContent = length > 0 ? `${length} activity entr${length === 1 ? 'y' : 'ies'} queued offline` : ''
}

toggleKeyButton.addEventListener('click', () => {
  const isHidden = apiKeyInput.type === 'password'
  apiKeyInput.type = isHidden ? 'text' : 'password'
  toggleKeyButton.textContent = isHidden ? 'Hide' : 'Show'
})

saveButton.addEventListener('click', async () => {
  saveButton.disabled = true
  statusEl.textContent = ''
  statusEl.className = ''

  try {
    await window.firmtrack.saveSettings({
      serverUrl: serverUrlInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      interval: Number(intervalSelect.value),
      startOnLogin: startOnLoginInput.checked,
    })
    statusEl.textContent = 'Saved.'
    statusEl.className = 'ok'
  } catch (err) {
    statusEl.textContent = `Could not save settings: ${err.message}`
    statusEl.className = 'err'
  } finally {
    saveButton.disabled = false
  }
})

load()
setInterval(refreshQueueNote, 5000)
