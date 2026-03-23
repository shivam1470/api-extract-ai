import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.js'
import './App.css'

// Boots the React application into the root DOM node.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
