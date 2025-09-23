import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase";
import Logo from "../components/Logo"; // Import the logo component
import "../index.css";

export default function NavBar({ onSelectRole }) {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(null);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const roles = [
    { label: "User", value: "user" },
    { label: "Restaurant Manager", value: "restaurant" },
    { label: "Courier", value: "courier" },
  ];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("selectedRole");
      onSelectRole(null);
      setUser(null);
      navigate("/");
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const toggleDropdown = () => setIsOpen((prev) => !prev);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRoleClick = (value) => {
    onSelectRole(value);
    navigate("/login");
    setIsOpen(false);
  };

  return (
    <div className="navbar">
      <div className="nav-left">
        {user ? (
          <div className="nav-user-info">
            <span className="user-display-name">
              👤 {user.displayName || user.email}
            </span>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        ) : (
          <div className="dropdown" ref={dropdownRef}>
            <button className="dropdown-button" onClick={toggleDropdown}>
              Login as: <span className="arrow">▾</span>
            </button>
            {isOpen && (
              <ul className="dropdown-menu">
                {roles.map((role) => (
                  <li
                    key={role.value}
                    className="dropdown-item"
                    onClick={() => handleRoleClick(role.value)}
                  >
                    {role.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="nav-right">
        <Logo width={100} />
      </div>
    </div>
  );
}
