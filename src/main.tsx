import { createRoot } from 'react-dom/client'
import App from './App'
import { GameProvider } from './game/store'
import { captureUtm } from './game/social'
import './styles.css'

captureUtm()

createRoot(document.getElementById('root')!).render(
  <GameProvider>
    <App />
  </GameProvider>,
)
