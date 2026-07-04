import { HomeView } from './components/HomeView.jsx'
import { WelcomeView } from './components/WelcomeView.jsx'
import { useTifoController } from './hooks/useTifoController.js'

export function App() {
  const controller = useTifoController()

  return (
    <div className='app-shell'>
      {controller.state.view === 'welcome' ? (
        <WelcomeView actions={controller.actions} state={controller.state} />
      ) : (
        <HomeView controller={controller} />
      )}
    </div>
  )
}
