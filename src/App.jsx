import { AuthProvider } from './auth/AuthProvider.jsx'
import { AppShell } from './components/AppShell.jsx'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

export default App
