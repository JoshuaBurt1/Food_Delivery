import { useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Navbar from "./components/NavBar";
import Home from "./pages/Home";
import Login from "./pages/Login";
import UserPage from "./pages/UserPage";
import RestaurantPage from "./pages/RestaurantPage";
import CourierPage from "./pages/CourierPage";
import AdminPage from "./pages/AdminPage";
import OrderPage from "./pages/OrderPage";

import 'leaflet/dist/leaflet.css';

function App() {
  const [role, setRole] = useState(() => localStorage.getItem("selectedRole") || null);

  return (
    <Router>
      <div className="flex flex-col min-h-screen">
        <Navbar onSelectRole={setRole} />
          <div className="page-container">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login role={role} />} />
              <Route path="/user" element={<UserPage />} />
              <Route path="/restaurant" element={<RestaurantPage />} />
              <Route path="/courier" element={<CourierPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/user/:restaurantName/order" element={<OrderPage />} />
            </Routes>
          </div>
      </div>
    </Router>
  );
}

export default App;
