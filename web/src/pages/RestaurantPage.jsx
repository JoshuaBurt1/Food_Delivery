import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { Navigate } from "react-router-dom";

export default function RestaurantPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return <div>Loading...</div>;

  if (!user) return <Navigate to="/login" />;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">
        Welcome, {user.displayName} (Restaurant Manager)
      </h1>
    </div>
  );
}

/*
* Restaurant manager logs in and updates menu.
* Can view collection systemFiles, restaurantOrders for their restaurantId only (to make food)
* Can view collection systemFiles, enrouteOrders for their restaurantId only (to confirm courierId on pick-up)
*/