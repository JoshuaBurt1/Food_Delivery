import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { Navigate } from "react-router-dom";

export default function RestaurantPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // ✅ Add loading state

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false); // ✅ Stop loading once auth is checked
    });
    return () => unsub();
  }, []);

  if (loading) return <div>Loading...</div>; // ✅ Prevent redirect flicker

  if (!user) return <Navigate to="/login" />;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">
        Welcome, {user.displayName} (Restaurant Manager)
      </h1>
    </div>
  );
}
