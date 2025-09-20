import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Navigate } from "react-router-dom";

export default function UserPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);  // new loading state
  const [restaurants, setRestaurants] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);  // done loading once auth state known
    });
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

  if (loading) {
    return <div>Loading...</div>;  // show loading UI until auth is known
  }

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

/* 
User can select multiple restaurants.
On restaurant selection, food item choice selection

Message system to admin team if excessive wait time
Status updates from system (admin has contacted courier, admin has changed courier, estimated wait time)
System updates from courier (waiting for restaurant, assistance button pressed)
*/