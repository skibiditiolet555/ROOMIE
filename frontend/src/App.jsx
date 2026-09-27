import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { RoomsProvider } from './context/RoomsContext'
import AuthLayout from './layouts/AuthLayout'
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute'
import LandingPage from './pages/LandingPage/LandingPage'
import LoginPage from './pages/LoginPage/LoginPage'
import RegisterPage from './pages/RegisterPage/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage/ForgotPasswordPage'
import MyRoomsPage from './pages/MyRoomsPage/MyRoomsPage'
import RoomUploadPage from './pages/RoomUploadPage/RoomUploadPage'
import RoomDesignSetupPage from './pages/RoomDesignSetupPage/RoomDesignSetupPage'
import RoomComparePage from './pages/RoomComparePage/RoomComparePage'
import RoomFurniturePage from './pages/RoomFurniturePage/RoomFurniturePage'
import DecisionPage from './pages/DecisionPage/DecisionPage'
import ProductsPage from './pages/ProductsPage/ProductsPage'
import ProjectSummaryPage from './pages/ProjectSummaryPage/ProjectSummaryPage'
import PrefsSwitch from './components/PrefsSwitch/PrefsSwitch'

function App() {
  return (
    <AuthProvider>
      <RoomsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />

            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route path="/home" element={<MyRoomsPage />} />
              <Route path="/room/:id" element={<RoomUploadPage />} />
              <Route path="/room/:id/design" element={<RoomDesignSetupPage />} />
              <Route path="/room/:id/compare" element={<RoomComparePage />} />
              <Route path="/room/:id/furniture" element={<RoomFurniturePage />} />
              <Route path="/room/:id/decision" element={<><PrefsSwitch floating /><DecisionPage /></>} />
              <Route path="/room/:id/products" element={<><PrefsSwitch floating /><ProductsPage /></>} />
              <Route path="/room/:id/summary" element={<><PrefsSwitch floating /><ProjectSummaryPage /></>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </RoomsProvider>
    </AuthProvider>
  )
}

export default App
