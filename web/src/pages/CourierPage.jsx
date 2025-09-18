import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { Navigate } from "react-router-dom";

export default function CourierPage() {
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
      <h1 className="text-2xl font-bold">Welcome, {user.displayName} (Courier)</h1>
    </div>
  );
}
