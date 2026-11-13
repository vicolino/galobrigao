import { createRoot } from 'react-dom/client'
import App from './App'
import { GameProvider } from './game/store'
import { captureInvite, captureUtm } from './game/social'
import './styles.css'

captureUtm()
captureInvite()

createRoot(document.getElementById('root')!).render(
  <GameProvider>
    <App />
  </GameProvider>,
)
