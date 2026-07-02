import { HomeView } from './components/HomeView.jsx'
import { RoomView } from './components/RoomView.jsx'
import { WelcomeView } from './components/WelcomeView.jsx'
import { useTifoController } from './hooks/useTifoController.js'

export function App() {
  const controller = useTifoController()

  return (
    <div className='app-shell'>
      {controller.state.view === 'welcome' ? (
        <WelcomeView actions={controller.actions} state={controller.state} />
      ) : controller.state.view === 'room' ? (
        <RoomView controller={controller} />
      ) : (
        <HomeView actions={controller.actions} state={controller.state} />
      )}
    </div>
  )
}
