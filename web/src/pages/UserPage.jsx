import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Navigate } from "react-router-dom";

export default function UserPage() {
  const [user, setUser] = useState(null);
  const [restaurants, setRestaurants] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (user) {
      (async () => {
        const snap = await getDocs(collection(db, "restaurants"));
        setRestaurants(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })();
    }
  }, [user]);

  if (!user) return <Navigate to="/login" />;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Welcome, {user.displayName} (User)</h1>
      <h2 className="mt-4 text-xl">Nearby Restaurants</h2>
      <ul className="mt-2 space-y-2">
        {restaurants.map((r) => (
          <li key={r.id} className="border p-2 rounded shadow">
            <h3 className="font-semibold">{r.name}</h3>
            <p>{r.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
