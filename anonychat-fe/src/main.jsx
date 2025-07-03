import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AnonyChat from './AnonyChat.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AnonyChat />
  </StrictMode>,
)
